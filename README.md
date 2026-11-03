# HookPulse ⚡

> **High-Throughput Distributed Event Ingestion & Webhook Delivery Engine**

HookPulse is an asynchronous event distribution and webhook delivery system designed to handle high-frequency events with guaranteed delivery, sub-millisecond idempotency locks, cryptographic payload verification (HMAC-SHA256), exponential backoff retries with jitter, and dead-letter queue (DLQ) routing.

---

## 🏛️ Architecture Overview

```
                      POST /v1/events
                             │ (with Idempotency-Key & JSON payload)
                             ▼
              ┌─────────────────────────────┐
              │      FastAPI Gateway        │
              └──────────────┬──────────────┘
                             │
            ┌────────────────┴────────────────┐
            ▼                                 ▼
   [Redis Idempotency Lock]           [SQLite / Postgres DB]
   - O(1) duplicate filter            - Persists event record
   - Returns 409 if duplicate         - Status: PENDING
            │                                 │
            └────────────────┬────────────────┘
                             │ Returns 202 Accepted (<15ms)
                             ▼
              ┌─────────────────────────────┐
              │  Async Dispatcher & Worker  │
              └──────────────┬──────────────┘
                             │ Matches subscriptions (wildcards supported)
                             ▼
        ┌────────────────────────────────────────┐
        │  HTTP Client Delivery Loop (httpx)     │
        │  - HMAC-SHA256 signature header        │
        │  - Exponential backoff + full jitter   │
        │  - Dead-Letter Queue (DLQ) on limit    │
        └────────────────────────────────────────┘
```

---

## 🚀 Key Features

* **Sub-Millisecond Idempotency**: Redis `SET NX EX` distributed lock prevents duplicate webhook delivery and race conditions. Gracefully falls back to thread-safe memory storage if Redis is offline.
* **Cryptographic Signatures**: Computes `X-HookPulse-Signature` with HMAC-SHA256 and validates with constant-time comparisons (`hmac.compare_digest`) to prevent timing attacks.
* **Smart Exponential Backoff & Jitter**: Failed deliveries retry using truncated exponential backoff with full jitter to avoid thundering-herd issues on downstream receivers.
* **Dead-Letter Queue (DLQ)**: Events exceeding max retry thresholds (`MAX_RETRIES`) transition to `DEAD_LETTER` with exact error logs and status codes for manual re-triggering.
* **Wildcard Event Subscriptions**: Subscriptions can match exact events (`order.created`) or wildcard patterns (`order.*`, `*`).
* **Dual Database Support**: Fully asynchronous SQLAlchemy 2.0 with zero-configuration SQLite for local dev/testing and PostgreSQL for production.

---

## 🛠️ Tech Stack

* **Language**: Python 3.12
* **API Framework**: FastAPI & Uvicorn
* **Database & ORM**: SQLAlchemy 2.0 (Async), aiosqlite, asyncpg
* **Cache & Locks**: Redis (asyncio)
* **HTTP Client**: HTTPX (Asynchronous with connection pooling)
* **Testing**: Pytest & Pytest-asyncio
* **Containerization**: Docker & Docker Compose

---

## 📦 Getting Started (Manual Setup)

### 1. Clone & Enter Directory
```bash
git clone https://github.com/your-username/HookPulse.git
cd HookPulse
```

### 2. Set Up Virtual Environment
```bash
# Windows (PowerShell)
python -m venv .venv
.\.venv\Scripts\Activate.ps1

# Linux / macOS
python3 -m venv .venv
source .venv/bin/activate
```

### 3. Install Dependencies
```bash
pip install -r requirements.txt
```

### 4. Run Automated Tests
```bash
pytest -v
```

### 5. Run the Local Development Server
```bash
uvicorn app.main:app --reload --port 8000
```

* Interactive OpenAPI Docs: [http://localhost:8000/docs](http://localhost:8000/docs)
* Alternative ReDoc: [http://localhost:8000/redoc](http://localhost:8000/redoc)

---

## 🐳 Running with Docker Compose

To run the complete production stack (FastAPI + PostgreSQL + Redis):

```bash
docker compose up --build
```

---

## 📡 API Reference

### 1. Register a Webhook Subscriber
```http
POST /v1/subscriptions
Content-Type: application/json

{
  "name": "Payment Service Subscriber",
  "target_url": "https://webhook.site/your-id",
  "subscribed_events": ["payment.*"]
}
```

### 2. Ingest an Event
```http
POST /v1/events
Content-Type: application/json
Idempotency-Key: pay_order_987654

{
  "event_type": "payment.succeeded",
  "payload": {
    "order_id": "ord_1001",
    "amount": 4900,
    "currency": "USD"
  }
}
```

### 3. Re-trigger a Dead-Lettered Event
```http
POST /v1/events/{event_id}/retry
```

---

## 📄 License
MIT License. Built by [Olumide](https://github.com/your-username).

