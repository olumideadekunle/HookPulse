import json
import uuid
from typing import List, Optional
from fastapi import APIRouter, Depends, Header, HTTPException, status, BackgroundTasks, Query
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.redis import idempotency_manager
from app.db.session import get_db
from app.models.event import Event, DeliveryAttempt
from app.schemas.event import EventCreate, EventResponse, EventDetailResponse
from app.workers.dispatcher import dispatch_event_to_all_subscribers

router = APIRouter()


@router.post(
    "",
    response_model=EventResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Ingest an Event for Webhook Delivery",
    description="Ingests an event with an Idempotency-Key. If the key was already used, returns 409 Conflict.",
)
async def ingest_event(
    event_in: EventCreate,
    background_tasks: BackgroundTasks,
    idempotency_key_header: Optional[str] = Header(None, alias="Idempotency-Key"),
    db: AsyncSession = Depends(get_db),
):
    # Resolve idempotency key from header or payload
    idemp_key = idempotency_key_header or event_in.idempotency_key
    if not idemp_key:
        idemp_key = f"auto_{uuid.uuid4()}"

    # 1. Acquire Idempotency Lock
    acquired = await idempotency_manager.acquire_lock(idemp_key)
    if not acquired:
        # Check if already saved in database
        existing = await db.execute(select(Event).where(Event.idempotency_key == idemp_key))
        existing_event = existing.scalar_one_or_none()
        if existing_event:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Duplicate request detected for idempotency key '{idemp_key}'. Event ID: {existing_event.id}",
            )
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Conflict: Idempotency key '{idemp_key}' is currently being processed.",
        )

    # 2. Persist Event to Database
    payload_str = json.dumps(event_in.payload)
    new_event = Event(
        event_type=event_in.event_type,
        idempotency_key=idemp_key,
        payload=payload_str,
        status="PENDING",
    )
    db.add(new_event)
    await db.commit()
    await db.refresh(new_event)

    # 3. Enqueue background delivery task
    background_tasks.add_task(dispatch_event_to_all_subscribers, new_event.id)

    return new_event


@router.get(
    "",
    response_model=List[EventResponse],
    summary="List Ingested Events",
)
async def list_events(
    status_filter: Optional[str] = Query(None, alias="status"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    query = select(Event).order_by(desc(Event.created_at)).offset(offset).limit(limit)
    if status_filter:
        query = query.where(Event.status == status_filter.upper())

    result = await db.execute(query)
    return result.scalars().all()


@router.get(
    "/{event_id}",
    response_model=EventDetailResponse,
    summary="Get Detailed Event Status & Audit Trail",
)
async def get_event_detail(
    event_id: str,
    db: AsyncSession = Depends(get_db),
):
    query = (
        select(Event)
        .options(selectinload(Event.delivery_attempts))
        .where(Event.id == event_id)
    )
    result = await db.execute(query)
    event = result.scalar_one_or_none()

    if not event:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Event with ID '{event_id}' not found.",
        )

    return EventDetailResponse(
        id=event.id,
        event_type=event.event_type,
        idempotency_key=event.idempotency_key,
        status=event.status,
        created_at=event.created_at,
        payload=json.loads(event.payload),
        delivery_attempts=event.delivery_attempts,
    )


@router.post(
    "/{event_id}/retry",
    response_model=EventResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Manual Retry for Dead-Lettered / Failed Event",
)
async def retry_failed_event(
    event_id: str,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Event).where(Event.id == event_id))
    event = result.scalar_one_or_none()

    if not event:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Event '{event_id}' not found.",
        )

    event.status = "PENDING"
    await db.commit()
    await db.refresh(event)

    background_tasks.add_task(dispatch_event_to_all_subscribers, event.id)
    return event

