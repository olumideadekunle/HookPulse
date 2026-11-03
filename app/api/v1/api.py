from fastapi import APIRouter
from app.api.v1.endpoints import events, subscriptions, health

api_router = APIRouter()

api_router.include_router(health.router, prefix="/health", tags=["Health"])
api_router.include_router(events.router, prefix="/events", tags=["Events"])
api_router.include_router(subscriptions.router, prefix="/subscriptions", tags=["Subscriptions"])

