import asyncio
import fnmatch
import json
import logging
import random
import time
from typing import List, Optional
import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.security import generate_signature
from app.db.session import AsyncSessionLocal
from app.models.event import Event, Subscription, DeliveryAttempt

logger = logging.getLogger(__name__)


def matches_event_pattern(pattern: str, event_type: str) -> bool:
    """Check if an event type matches a subscription wildcard or exact pattern."""
    if pattern == "*" or pattern == event_type:
        return True
    return fnmatch.fnmatch(event_type, pattern)


async def dispatch_event_to_all_subscribers(event_id: str):
    """
    Entrypoint to find all matching subscribers and trigger deliveries.
    Runs asynchronously in the background.
    """
    async with AsyncSessionLocal() as session:
        # Fetch event
        result = await session.execute(select(Event).where(Event.id == event_id))
        event = result.scalar_one_or_none()
        if not event:
            logger.error(f"Event {event_id} not found for dispatch.")
            return

        # Fetch active subscriptions
        sub_result = await session.execute(
            select(Subscription).where(Subscription.is_active == True)
        )
        subscriptions = sub_result.scalars().all()

        matching_subs: List[Subscription] = []
        for sub in subscriptions:
            try:
                patterns = json.loads(sub.subscribed_events)
            except Exception:
                patterns = ["*"]
            
            if any(matches_event_pattern(pat, event.event_type) for pat in patterns):
                matching_subs.append(sub)

        if not matching_subs:
            event.status = "NO_SUBSCRIBERS"
            await session.commit()
            logger.info(f"Event {event_id} has no matching active subscribers.")
            return

        event.status = "PROCESSING"
        await session.commit()

    # Dispatch to all matching subscribers concurrently
    tasks = [
        deliver_to_subscription(event_id=event_id, subscription_id=sub.id)
        for sub in matching_subs
    ]
    await asyncio.gather(*tasks)

    # Evaluate final event state
    async with AsyncSessionLocal() as session:
        result = await session.execute(select(Event).where(Event.id == event_id))
        event = result.scalar_one_or_none()
        if not event:
            return

        attempts_result = await session.execute(
            select(DeliveryAttempt).where(DeliveryAttempt.event_id == event_id)
        )
        all_attempts = attempts_result.scalars().all()

        # Group by subscription to see final status per subscriber
        subs_status = {}
        for att in all_attempts:
            subs_status[att.subscription_id] = att.status

        if all(s == "SUCCESS" for s in subs_status.values()):
            event.status = "DELIVERED"
        elif any(s == "SUCCESS" for s in subs_status.values()):
            event.status = "PARTIALLY_DELIVERED"
        else:
            event.status = "DEAD_LETTER"

        await session.commit()


async def deliver_to_subscription(event_id: str, subscription_id: str):
    """
    Deliver an event to a single subscription endpoint with exponential backoff retries.
    """
    async with AsyncSessionLocal() as session:
        event = (await session.execute(select(Event).where(Event.id == event_id))).scalar_one_or_none()
        subscription = (await session.execute(select(Subscription).where(Subscription.id == subscription_id))).scalar_one_or_none()
        
        if not event or not subscription:
            return

        target_url = subscription.target_url
        secret_key = subscription.secret_key
        event_type = event.event_type
        payload_bytes = event.payload.encode("utf-8")

    async with httpx.AsyncClient(timeout=settings.REQUEST_TIMEOUT_SECONDS) as client:
        for attempt in range(1, settings.MAX_RETRIES + 1):
            start_time = time.perf_counter()
            status_code: Optional[int] = None
            response_text: Optional[str] = None
            error_msg: Optional[str] = None
            is_success = False

            # Generate HMAC-SHA256 signature
            signature = generate_signature(payload_bytes, secret_key)
            headers = {
                "Content-Type": "application/json",
                "User-Agent": f"HookPulse/{settings.VERSION}",
                "X-HookPulse-Signature": signature,
                "X-HookPulse-Event": event_type,
                "X-HookPulse-Event-ID": event_id,
                "X-HookPulse-Attempt": str(attempt),
            }

            try:
                response = await client.post(
                    target_url,
                    content=payload_bytes,
                    headers=headers,
                )
                duration_ms = (time.perf_counter() - start_time) * 1000.0
                status_code = response.status_code
                response_text = response.text[:1000]  # Cap at 1000 chars to prevent storage explosion

                if 200 <= response.status_code < 300:
                    is_success = True
                else:
                    error_msg = f"HTTP {response.status_code} received from destination."

            except httpx.TimeoutException as exc:
                duration_ms = (time.perf_counter() - start_time) * 1000.0
                error_msg = f"Request timed out: {str(exc)}"
            except Exception as exc:
                duration_ms = (time.perf_counter() - start_time) * 1000.0
                error_msg = f"Delivery failed: {str(exc)}"

            # Save attempt record
            delivery_status = "SUCCESS" if is_success else ("DEAD_LETTER" if attempt == settings.MAX_RETRIES else "RETRYING")
            
            async with AsyncSessionLocal() as session:
                attempt_record = DeliveryAttempt(
                    event_id=event_id,
                    subscription_id=subscription_id,
                    attempt_number=attempt,
                    status_code=status_code,
                    response_body=response_text,
                    execution_time_ms=round(duration_ms, 2),
                    error_message=error_msg,
                    status=delivery_status,
                )
                session.add(attempt_record)
                await session.commit()

            if is_success:
                logger.info(f"Webhook {event_id} successfully delivered to {target_url} on attempt {attempt}.")
                return

            if attempt < settings.MAX_RETRIES:
                # Exponential backoff with full jitter: delay = uniform(0, initial * (factor ** (attempt - 1)))
                base_delay = settings.INITIAL_BACKOFF_SECONDS * (settings.BACKOFF_FACTOR ** (attempt - 1))
                jittered_delay = random.uniform(0.5 * base_delay, 1.2 * base_delay)
                logger.warning(
                    f"Delivery attempt {attempt} failed for {target_url}. Retrying in {jittered_delay:.2f}s... Error: {error_msg}"
                )
                await asyncio.sleep(jittered_delay)
            else:
                logger.error(
                    f"Exhausted all {settings.MAX_RETRIES} delivery attempts for {target_url}. Moved to Dead-Letter Queue (DLQ)."
                )

