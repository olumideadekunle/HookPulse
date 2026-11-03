import time
import logging
from typing import Optional, Dict, Tuple
import redis.asyncio as aioredis
from app.core.config import settings

logger = logging.getLogger(__name__)

# In-memory fallback cache for development/testing when Redis is not active
_in_memory_idempotency_store: Dict[str, float] = {}


class IdempotencyManager:
    def __init__(self):
        self.redis_client: Optional[aioredis.Redis] = None
        self._connected: bool = False

    async def connect(self):
        """Initialize Redis connection if enabled in settings."""
        if settings.USE_REDIS_IDEMPOTENCY:
            try:
                self.redis_client = aioredis.from_url(
                    settings.REDIS_URL,
                    decode_responses=True,
                    socket_connect_timeout=2.0
                )
                await self.redis_client.ping()
                self._connected = True
                logger.info("Connected to Redis successfully for idempotency management.")
            except Exception as e:
                logger.warning(f"Could not connect to Redis: {e}. Falling back to in-memory idempotency store.")
                self._connected = False

    async def disconnect(self):
        """Close Redis connection."""
        if self.redis_client:
            await self.redis_client.close()
            self._connected = False

    async def acquire_lock(self, key: str, ttl_seconds: Optional[int] = None) -> bool:
        """
        Atomically acquire an idempotency lock for the given key.
        Returns:
            True if the key is new and acquired (proceed with processing)
            False if the key was already present (duplicate request!)
        """
        ttl = ttl_seconds or settings.IDEMPOTENCY_TTL_SECONDS

        if self._connected and self.redis_client:
            try:
                # Redis SET with NX (only if Not eXists) and EX (expire in seconds)
                is_set = await self.redis_client.set(f"idemp:{key}", "1", nx=True, ex=ttl)
                return bool(is_set)
            except Exception as e:
                logger.error(f"Redis error during idempotency check: {e}. Falling back to memory.")

        # In-memory fallback
        now = time.time()
        # Clean expired keys lazily
        expired_keys = [k for k, exp in _in_memory_idempotency_store.items() if exp < now]
        for k in expired_keys:
            del _in_memory_idempotency_store[k]

        if key in _in_memory_idempotency_store:
            return False  # Duplicate!

        _in_memory_idempotency_store[key] = now + ttl
        return True


idempotency_manager = IdempotencyManager()

