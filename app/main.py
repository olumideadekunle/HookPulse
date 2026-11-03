from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.redis import idempotency_manager
from app.db.session import init_db
from app.api.v1.api import api_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup lifecycle
    await init_db()
    await idempotency_manager.connect()
    yield
    # Shutdown lifecycle
    await idempotency_manager.disconnect()


app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="High-Throughput Distributed Event Ingestion & Webhook Delivery Engine",
    lifespan=lifespan,
)

# Cross-Origin Resource Sharing (CORS) setup for local Frontend interaction
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix=settings.API_V1_STR)

