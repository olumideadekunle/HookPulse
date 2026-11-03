from app.core.security import generate_signature, verify_signature, generate_webhook_secret


def test_signature_generation_and_verification():
    secret = generate_webhook_secret()
    payload = b'{"event": "payment.succeeded", "amount": 1000}'

    sig = generate_signature(payload, secret)
    assert sig.startswith("sha256=")

    # Successful verification
    assert verify_signature(payload, sig, secret) is True

    # Tampered payload fails verification
    tampered_payload = b'{"event": "payment.succeeded", "amount": 9999}'
    assert verify_signature(tampered_payload, sig, secret) is False

    # Invalid secret fails verification
    wrong_secret = generate_webhook_secret()
    assert verify_signature(payload, sig, wrong_secret) is False

    # Malformed signature fails gracefully
    assert verify_signature(payload, "invalid_sig_format", secret) is False
    assert verify_signature(payload, "", secret) is False

