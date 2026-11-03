from pydantic import BaseModel, Field, ConfigDict
from typing import Any, Dict, List, Optional
from datetime import datetime


class EventCreate(BaseModel):
    event_type: str = Field(..., json_schema_extra={"example": "payment.succeeded"}, description="Type of event occurred")
    payload: Dict[str, Any] = Field(..., json_schema_extra={"example": {"order_id": "ord_12345", "amount": 5000, "currency": "USD"}})
    idempotency_key: Optional[str] = Field(
        None,
        json_schema_extra={"example": "idem_9876543210"},
        description="Unique key to prevent duplicate event ingestion. Can also be supplied in Idempotency-Key header."
    )


class DeliveryAttemptSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    subscription_id: str
    attempt_number: int
    status_code: Optional[int]
    status: str
    execution_time_ms: float
    error_message: Optional[str]
    created_at: datetime


class EventResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    event_type: str
    idempotency_key: str
    status: str
    created_at: datetime


class EventDetailResponse(EventResponse):
    payload: Dict[str, Any]
    delivery_attempts: List[DeliveryAttemptSummary] = []
