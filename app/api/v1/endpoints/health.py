from fastapi import APIRouter
from app.core.config import settings

router = APIRouter()


@router.get("", summary="Service Health Check")
async def health_check():
    """Returns the operational status of the service."""
    return {
        "status": "healthy",
        "service": settings.PROJECT_NAME,
        "version": settings.VERSION,
    }

