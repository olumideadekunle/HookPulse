import pytest
import uuid


@pytest.mark.asyncio
async def test_health_check(client):
    response = await client.get("/v1/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert data["service"] == "HookPulse"


@pytest.mark.asyncio
async def test_event_ingestion_and_idempotency(client):
    idempotency_key = f"test_key_{uuid.uuid4()}"
    event_payload = {
        "event_type": "invoice.paid",
        "payload": {"invoice_id": "inv_123", "amount": 25000},
        "idempotency_key": idempotency_key,
    }

    # First request: should be accepted (HTTP 202)
    res1 = await client.post("/v1/events", json=event_payload)
    assert res1.status_code == 202
    body1 = res1.json()
    assert body1["idempotency_key"] == idempotency_key
    assert body1["status"] == "PENDING"
    assert "id" in body1

    # Second request with the same idempotency key: should return HTTP 409 Conflict
    res2 = await client.post("/v1/events", json=event_payload)
    assert res2.status_code == 409
    assert "Duplicate request detected" in res2.json()["detail"]


@pytest.mark.asyncio
async def test_subscription_creation_and_listing(client):
    sub_data = {
        "name": "Audit Service",
        "target_url": "https://httpbin.org/post",
        "subscribed_events": ["invoice.*"],
    }

    create_res = await client.post("/v1/subscriptions", json=sub_data)
    assert create_res.status_code == 201
    created_sub = create_res.json()
    assert created_sub["name"] == "Audit Service"
    assert created_sub["secret_key"].startswith("hp_sec_")
    assert created_sub["is_active"] is True

    # List subscriptions
    list_res = await client.get("/v1/subscriptions")
    assert list_res.status_code == 200
    subs = list_res.json()
    assert len(subs) >= 1
    assert any(s["id"] == created_sub["id"] for s in subs)

