"""
FleetFlow Environment Validation
Fails fast on startup with clear, actionable error messages if required
environment variables are missing or misconfigured.
"""
import os
import sys
from django.core.exceptions import ImproperlyConfigured

REQUIRED_VARS_BASE = [
    'SECRET_KEY',
]

REQUIRED_VARS_PRODUCTION = [
    'SECRET_KEY',
    'ALLOWED_HOSTS',
    'DB_NAME',
    'DB_USER',
    'DB_PASSWORD',
    'DB_HOST',
]


def validate_environment():
    """
    Validates required environment variables on startup.
    Fails fast with detailed messages.
    """
    debug_mode = os.getenv('DEBUG', 'False').lower() in ('true', '1', 't')
    app_env = os.getenv('APP_ENV', 'development' if debug_mode else 'production').lower()

    # Check base required variables
    missing_vars = [var for var in REQUIRED_VARS_BASE if not os.getenv(var)]

    # If running in production mode, enforce full production variables
    if not debug_mode or app_env == 'production':
        prod_missing = [var for var in REQUIRED_VARS_PRODUCTION if not os.getenv(var)]
        for v in prod_missing:
            if v not in missing_vars:
                missing_vars.append(v)

    if missing_vars:
        msg = (
            "\n" + "=" * 80 + "\n"
            " FLEETFLOW STARTUP ERROR: MISSING REQUIRED ENVIRONMENT VARIABLES\n"
            "=" * 80 + "\n"
            "The following required environment variable(s) are missing or empty:\n"
            + "\n".join(f"  - {var}" for var in missing_vars) + "\n\n"
            "Action required:\n"
            "  1. Copy backend/.env.example to backend/.env (if not already done).\n"
            "  2. Populate the required variables listed above with valid values.\n"
            "  3. Restart the FleetFlow backend server.\n"
            "=" * 80 + "\n"
        )
        raise ImproperlyConfigured(msg)

    # In production, ensure SECRET_KEY is strong and not default/insecure
    secret_key = os.getenv('SECRET_KEY', '')
    if (not debug_mode or app_env == 'production') and len(secret_key) < 50:
        msg = (
            "\n" + "=" * 80 + "\n"
            " FLEETFLOW SECURITY ERROR: INSUFFICIENT SECRET_KEY IN PRODUCTION\n"
            "=" * 80 + "\n"
            "SECRET_KEY in production must be at least 50 characters long.\n"
            "=" * 80 + "\n"
        )
        raise ImproperlyConfigured(msg)
