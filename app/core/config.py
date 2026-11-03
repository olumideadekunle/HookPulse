from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import Optional


class Settings(BaseSettings):
    PROJECT_NAME: str = "HookPulse"
    VERSION: str = "0.1.0"
    API_V1_STR: str = "/v1"
    
    # Environment
    ENVIRONMENT: str = "development"
    DEBUG: bool = True
    
    # Security
    WEBHOOK_SECRET_KEY: str = "hookpulse_default_secret_key_change_in_production_32b"
    
    # Database
    DATABASE_URL: str = "sqlite+aiosqlite:///./hookpulse.db"
    
    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"
    USE_REDIS_IDEMPOTENCY: bool = False  # Falls back to in-memory/DB if Redis is not running locally
    
    # Retry & Delivery Policies
    MAX_RETRIES: int = 4
    INITIAL_BACKOFF_SECONDS: float = 1.0
    BACKOFF_FACTOR: float = 2.0
    REQUEST_TIMEOUT_SECONDS: float = 10.0
    IDEMPOTENCY_TTL_SECONDS: int = 86400  # 24 hours
    
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )


settings = Settings()

