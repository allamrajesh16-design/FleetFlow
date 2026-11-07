"""
Custom DRF Throttle classes for FleetFlow Authentication endpoints.

Enforces per-IP and per-account rate limits with clean, human-readable 429 messages:
- Login: 10 requests / minute
- Register: 10 requests / minute
- OTP (Verify / Resend): 5 requests / minute
- Password Reset: 5 requests / minute
"""

from rest_framework.throttling import SimpleRateThrottle
from rest_framework.exceptions import Throttled


class FleetFlowRateThrottle(SimpleRateThrottle):
    """Base throttle class that returns a clear, helpful 429 message."""

    def throttle_failure(self):
        wait = self.wait()
        wait_seconds = int(wait) if wait else 60
        raise Throttled(
            wait=wait,
            detail=f"Too many requests from your IP or account. Please wait {wait_seconds} seconds before trying again."
        )


class LoginRateThrottle(FleetFlowRateThrottle):
    """Throttles login attempts by IP and email (10/min)."""
    scope = "login"

    def get_cache_key(self, request, view):
        ident = self.get_ident(request)
        email = ""
        if hasattr(request, "data") and isinstance(request.data, dict):
            email = str(
                request.data.get("identifier")
                or request.data.get("email")
                or request.data.get("username")
                or ""
            ).strip().lower()
        if email:
            return f"throttle_{self.scope}_{ident}_{email}"
        return f"throttle_{self.scope}_{ident}"


class RegisterRateThrottle(FleetFlowRateThrottle):
    """Throttles registration attempts by IP (10/min)."""
    scope = "register"

    def get_cache_key(self, request, view):
        ident = self.get_ident(request)
        return f"throttle_{self.scope}_{ident}"


class OTPRateThrottle(FleetFlowRateThrottle):
    """Throttles OTP verification and resend attempts by IP and email (5/min)."""
    scope = "otp"

    def get_cache_key(self, request, view):
        ident = self.get_ident(request)
        email = ""
        if hasattr(request, "data") and isinstance(request.data, dict):
            email = str(request.data.get("email") or "").strip().lower()
        if email:
            return f"throttle_{self.scope}_{ident}_{email}"
        return f"throttle_{self.scope}_{ident}"


class PasswordResetRateThrottle(FleetFlowRateThrottle):
    """Throttles password reset requests by IP and email (5/min)."""
    scope = "password_reset"

    def get_cache_key(self, request, view):
        ident = self.get_ident(request)
        email = ""
        if hasattr(request, "data") and isinstance(request.data, dict):
            email = str(request.data.get("email") or "").strip().lower()
        if email:
            return f"throttle_{self.scope}_{ident}_{email}"
        return f"throttle_{self.scope}_{ident}"


class ForgotPasswordEmailRateThrottle(FleetFlowRateThrottle):
    """Throttles password reset requests per email: 5 requests per hour."""
    scope = "forgot_password_email"

    def get_cache_key(self, request, view):
        email = ""
        if hasattr(request, "data") and isinstance(request.data, dict):
            email = str(request.data.get("email") or "").strip().lower()
        if email:
            return f"throttle_{self.scope}_{email}"
        return None


class ForgotPasswordIPRateThrottle(FleetFlowRateThrottle):
    """Throttles password reset requests per IP: 10 requests per hour."""
    scope = "forgot_password_ip"

    def get_cache_key(self, request, view):
        ident = self.get_ident(request)
        return f"throttle_{self.scope}_{ident}"


class VerifyResetOTPRateThrottle(FleetFlowRateThrottle):
    """Throttles OTP verification attempts on password reset: 15 per hour per IP/email."""
    scope = "verify_reset_otp"

    def get_cache_key(self, request, view):
        ident = self.get_ident(request)
        email = ""
        if hasattr(request, "data") and isinstance(request.data, dict):
            email = str(request.data.get("email") or "").strip().lower()
        if email:
            return f"throttle_{self.scope}_{ident}_{email}"
        return f"throttle_{self.scope}_{ident}"


class CheckEmailRateThrottle(FleetFlowRateThrottle):
    """Throttles email validation check requests by IP (20/min)."""
    scope = "check_email"

    def get_cache_key(self, request, view):
        ident = self.get_ident(request)
        return f"throttle_{self.scope}_{ident}"

