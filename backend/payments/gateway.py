import hashlib
import hmac
import secrets
from decimal import Decimal
from django.conf import settings

# Global test switch to simulate gateway failures
_FORCE_GATEWAY_FAILURE = False


def set_force_gateway_failure(force: bool):
    """Enable or disable simulated gateway failure for automated testing."""
    global _FORCE_GATEWAY_FAILURE
    _FORCE_GATEWAY_FAILURE = force


def get_force_gateway_failure() -> bool:
    global _FORCE_GATEWAY_FAILURE
    return _FORCE_GATEWAY_FAILURE


def generate_gateway_signature(payment_id: int, gateway_reference: str, amount, gateway_status: str) -> str:
    """Generate HMAC SHA-256 signature for verification."""
    secret = getattr(settings, "PAYMENT_GATEWAY_SECRET", "")
    if not secret:
        from django.core.exceptions import ImproperlyConfigured
        raise ImproperlyConfigured("PAYMENT_GATEWAY_SECRET is not configured.")
    formatted_amount = f"{Decimal(str(amount)):.2f}"
    payload = f"{payment_id}|{gateway_reference}|{formatted_amount}|{gateway_status}"
    return hmac.new(secret.encode("utf-8"), payload.encode("utf-8"), hashlib.sha256).hexdigest()


def verify_gateway_signature(payment_id: int, gateway_reference: str, amount, gateway_status: str, signature: str) -> bool:
    """Verify incoming gateway signature securely against timing attacks."""
    expected_sig = generate_gateway_signature(payment_id, gateway_reference, amount, gateway_status)
    return hmac.compare_digest(expected_sig, signature)


def process_payment(payment, method: str) -> dict:
    """
    Mock payment processing interface.
    Can be seamlessly substituted with Razorpay/Stripe API calls.
    Returns: {gateway_reference, gateway_status, signature, failure_reason}
    """
    gateway_reference = f"TXN{secrets.token_hex(6).upper()}"

    if get_force_gateway_failure():
        gateway_status = "FAILED"
        failure_reason = "Transaction declined by simulated issuer bank."
    else:
        gateway_status = "SUCCESS"
        failure_reason = None

    signature = generate_gateway_signature(
        payment_id=payment.id,
        gateway_reference=gateway_reference,
        amount=payment.amount,
        gateway_status=gateway_status,
    )

    return {
        "gateway_reference": gateway_reference,
        "gateway_status": gateway_status,
        "signature": signature,
        "failure_reason": failure_reason,
    }
