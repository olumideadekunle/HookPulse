import json
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import generate_webhook_secret
from app.db.session import get_db
from app.models.event import Subscription
from app.schemas.subscription import SubscriptionCreate, SubscriptionResponse

router = APIRouter()


@router.post(
    "",
    response_model=SubscriptionResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Register a New Webhook Destination",
)
async def create_subscription(
    sub_in: SubscriptionCreate,
    db: AsyncSession = Depends(get_db),
):
    # If no secret provided, generate a secure cryptographic secret
    secret = sub_in.secret_key or generate_webhook_secret()

    new_sub = Subscription(
        name=sub_in.name,
        target_url=str(sub_in.target_url),
        subscribed_events=json.dumps(sub_in.subscribed_events),
        secret_key=secret,
        is_active=True,
    )
    db.add(new_sub)
    await db.commit()
    await db.refresh(new_sub)

    return SubscriptionResponse(
        id=new_sub.id,
        name=new_sub.name,
        target_url=new_sub.target_url,
        subscribed_events=json.loads(new_sub.subscribed_events),
        secret_key=new_sub.secret_key,
        is_active=new_sub.is_active,
        created_at=new_sub.created_at,
    )


@router.get(
    "",
    response_model=List[SubscriptionResponse],
    summary="List All Webhook Subscriptions",
)
async def list_subscriptions(
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Subscription).where(Subscription.is_active == True))
    subs = result.scalars().all()

    return [
        SubscriptionResponse(
            id=s.id,
            name=s.name,
            target_url=s.target_url,
            subscribed_events=json.loads(s.subscribed_events),
            secret_key=s.secret_key,
            is_active=s.is_active,
            created_at=s.created_at,
        )
        for s in subs
    ]


@router.delete(
    "/{subscription_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Deactivate a Webhook Subscription",
)
async def delete_subscription(
    subscription_id: str,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Subscription).where(Subscription.id == subscription_id))
    sub = result.scalar_one_or_none()
    if not sub:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Subscription '{subscription_id}' not found.",
        )

    sub.is_active = False
    await db.commit()
    return None

