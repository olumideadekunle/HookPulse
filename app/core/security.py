import hmac
import hashlib
import secrets


def generate_webhook_secret(prefix: str = "hp_sec_") -> str:
    """Generate a secure cryptographic secret for webhook signing."""
    return f"{prefix}{secrets.token_hex(24)}"


def generate_signature(payload: bytes, secret: str) -> str:
    """
    Generate an HMAC-SHA256 signature for a payload.
    Format: sha256=<hex_digest>
    """
    mac = hmac.new(secret.encode("utf-8"), payload, hashlib.sha256)
    return f"sha256={mac.hexdigest()}"


def verify_signature(payload: bytes, received_signature: str, secret: str) -> bool:
    """
    Verify that the received HMAC signature matches the computed signature.
    Uses hmac.compare_digest for constant-time comparison (prevents timing attacks).
    """
    if not received_signature or not received_signature.startswith("sha256="):
        return False
    
    expected_signature = generate_signature(payload, secret)
    return hmac.compare_digest(expected_signature, received_signature)

