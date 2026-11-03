from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional
from datetime import datetime


class SubscriptionCreate(BaseModel):
    name: str = Field(..., json_schema_extra={"example": "Stripe Integration Consumer"})
    target_url: str = Field(..., json_schema_extra={"example": "https://webhook.site/my-endpoint"})
    subscribed_events: List[str] = Field(default=["*"], json_schema_extra={"example": ["payment.succeeded", "order.*"]})
    secret_key: Optional[str] = Field(None, description="Optional custom signing secret. Generated if omitted.")


class SubscriptionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    target_url: str
    subscribed_events: List[str]
    secret_key: str
    is_active: bool
    created_at: datetime
