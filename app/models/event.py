import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Integer, Float, Text, Boolean, DateTime, ForeignKey, Index
from sqlalchemy.orm import relationship
from app.db.session import Base


def utc_now():
    return datetime.now(timezone.utc)


class Event(Base):
    __tablename__ = "events"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    event_type = Column(String(100), nullable=False, index=True)
    idempotency_key = Column(String(255), unique=True, nullable=False, index=True)
    payload = Column(Text, nullable=False)  # JSON serialized string
    status = Column(String(50), default="PENDING", nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)

    delivery_attempts = relationship("DeliveryAttempt", back_populates="event", cascade="all, delete-orphan")


class Subscription(Base):
    __tablename__ = "subscriptions"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String(100), nullable=False)
    target_url = Column(String(500), nullable=False)
    subscribed_events = Column(Text, default='["*"]', nullable=False)  # JSON list of event types
    secret_key = Column(String(100), nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)

    delivery_attempts = relationship("DeliveryAttempt", back_populates="subscription")


class DeliveryAttempt(Base):
    __tablename__ = "delivery_attempts"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    event_id = Column(String(36), ForeignKey("events.id", ondelete="CASCADE"), nullable=False, index=True)
    subscription_id = Column(String(36), ForeignKey("subscriptions.id", ondelete="CASCADE"), nullable=False, index=True)
    attempt_number = Column(Integer, nullable=False, default=1)
    status_code = Column(Integer, nullable=True)
    response_body = Column(Text, nullable=True)
    execution_time_ms = Column(Float, nullable=False, default=0.0)
    error_message = Column(Text, nullable=True)
    status = Column(String(50), nullable=False, default="PENDING")  # SUCCESS, RETRYING, DEAD_LETTER
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)

    event = relationship("Event", back_populates="delivery_attempts")
    subscription = relationship("Subscription", back_populates="delivery_attempts")


# Composite indexes for fast query lookups
Index("ix_event_status_created", Event.status, Event.created_at)
Index("ix_delivery_event_sub", DeliveryAttempt.event_id, DeliveryAttempt.subscription_id)

