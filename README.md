# HookPulse ⚡

> **High-Throughput Distributed Event Ingestion & Webhook Delivery Engine with Real-Time Observability Studio**

HookPulse is an asynchronous event distribution and webhook delivery system designed to handle high-frequency events with guaranteed delivery, sub-millisecond idempotency locks, cryptographic payload verification (HMAC-SHA256), exponential backoff retries with jitter, and dead-letter queue (DLQ) routing.

It includes **HookPulse Studio**, a modern developer portal and observability dashboard built with Next.js 14, TypeScript, and Tailwind CSS.

---

## 🏛️ Architecture Overview

```
                      POST /v1/events
                             │ (with Idempotency-Key & JSON payload)
                             ▼
              ┌─────────────────────────────┐
              │      FastAPI Gateway        │◄──── HookPulse Studio (Next.js)
              └──────────────┬──────────────┘      - Live Delivery Stream
                             │                     - Event Test Bench
            ┌────────────────┴────────────────┐    - Subscription Manager
            ▼                                 ▼    - DLQ Re-queueing
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
* **HookPulse Studio (Frontend)**: Real-time event observability console, live audit log inspector, interactive webhook dispatcher test bench, and DLQ re-queue manager.
* **Dual Database Support**: Fully asynchronous SQLAlchemy 2.0 with zero-configuration SQLite for local dev/testing and PostgreSQL for production.

---

## 🛠️ Tech Stack

* **Backend**: Python 3.12, FastAPI, Uvicorn, SQLAlchemy 2.0 (Async), aiosqlite, asyncpg, Redis, HTTPX, Pytest
* **Frontend**: Next.js 14 (App Router), TypeScript, Tailwind CSS, Lucide Icons
* **Infrastructure**: Docker & Docker Compose (FastAPI + PostgreSQL + Redis + Next.js)

---

## 📦 Getting Started

### 1. Clone & Enter Directory
```bash
git clone https://github.com/olumideadekunle/HookPulse.git
cd HookPulse
```

### 2. Run the Backend (FastAPI)
```bash
# Windows (PowerShell)
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt

# Run automated tests
pytest -v

# Start development server
uvicorn app.main:app --reload --port 8000
```
* Interactive OpenAPI Docs: [http://localhost:8000/docs](http://localhost:8000/docs)

### 3. Run the Frontend (HookPulse Studio)
```bash
cd frontend
npm install
npm run dev
```
* Studio Dashboard: [http://localhost:3000](http://localhost:3000)

---

## 🐳 Running with Docker Compose

To spin up the complete end-to-end stack (Backend + Frontend + Postgres + Redis):

```bash
docker compose up --build
```

Access services:
* **HookPulse Studio**: [http://localhost:3000](http://localhost:3000)
* **Backend API Docs**: [http://localhost:8000/docs](http://localhost:8000/docs)

---

## 📡 API Reference

### 1. Register a Webhook Subscriber
```http
POST /v1/subscriptions
Content-Type: application/json

{
  "name": "Payment Service Subscriber",
  "target_url": "https://httpbin.org/post",
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
MIT License. Built by [Olumide Adekunle](https://github.com/olumideadekunle).
