import logging
import re
import threading
import uuid

_thread_locals = threading.local()

def get_current_request_id():
    """Retrieve current request ID from thread-local storage."""
    return getattr(_thread_locals, "request_id", "-")


class RequestIDMiddleware:
    """
    Middleware that assigns a unique Request ID to each incoming request.
    Injects request_id into thread-local storage for logging and returns
    X-Request-ID in the response headers.
    """
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        request_id = request.headers.get("X-Request-ID")
        if not request_id:
            request_id = str(uuid.uuid4())

        request.id = request_id
        _thread_locals.request_id = request_id

        response = self.get_response(request)
        response["X-Request-ID"] = request_id
        return response


class SensitiveDataLoggingFilter(logging.Filter):
    """
    Security filter that intercepts log records and scrubs any sensitive credentials:
    - Raw Passwords
    - 6-digit OTP codes
    - Bearer / JWT Tokens
    """
    PATTERNS = [
        (re.compile(r"Bearer\s+[A-Za-z0-9\-_\.]+", re.IGNORECASE), "Bearer [REDACTED_TOKEN]"),
        (re.compile(r"('password'|\"password\"):\s*('[^']+'|\"[^\"]+\")", re.IGNORECASE), r'\1: "[REDACTED_PASSWORD]"'),
        (re.compile(r"('otp'|\"otp\"):\s*('[^']+'|\"[^\"]+\"|\d{6})", re.IGNORECASE), r'\1: "[REDACTED_OTP]"'),
        (re.compile(r"(password|pwd)=([^\s&]+)", re.IGNORECASE), r"\1=[REDACTED]"),
        (re.compile(r"(otp|token)=([^\s&]+)", re.IGNORECASE), r"\1=[REDACTED]"),
    ]

    def filter(self, record):
        record.request_id = get_current_request_id()
        if isinstance(record.msg, str):
            for pattern, replacement in self.PATTERNS:
                record.msg = pattern.sub(replacement, record.msg)
        return True
