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
    'PAYMENT_GATEWAY_SECRET',
]

REQUIRED_DB_VARS_INDIVIDUAL = [
    'DB_NAME',
    'DB_USER',
    'DB_PASSWORD',
    'DB_HOST',
]


def validate_environment():
    """
    Validates required environment variables on startup.
    Fails fast with detailed messages.
    Supports either DATABASE_URL (standard for Render, Heroku, Railway)
    or individual DB_* variables (local / custom PostgreSQL setups).
    """
    debug_mode = os.getenv('DEBUG', 'False').lower() in ('true', '1', 't')
    app_env = os.getenv('APP_ENV', 'development' if debug_mode else 'production').lower()
    is_prod_settings = os.getenv('DJANGO_SETTINGS_MODULE', '').endswith('settings_prod')
    is_production = not debug_mode or app_env == 'production' or is_prod_settings

    # Check base required variables
    missing_vars = [var for var in REQUIRED_VARS_BASE if not os.getenv(var)]

    # If running in production mode, enforce full production variables
    if is_production:
        prod_missing = [var for var in REQUIRED_VARS_PRODUCTION if not os.getenv(var)]
        for v in prod_missing:
            if v not in missing_vars:
                missing_vars.append(v)

        # Database configuration check:
        # Accept DATABASE_URL if set; otherwise require DB_* vars
        has_db_url = bool(os.getenv('DATABASE_URL', '').strip())
        if not has_db_url:
            db_missing = [var for var in REQUIRED_DB_VARS_INDIVIDUAL if not os.getenv(var)]
            if db_missing:
                missing_vars.append("DATABASE_URL (or complete DB_NAME, DB_USER, DB_PASSWORD, DB_HOST)")

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
    if is_production and len(secret_key) < 50:
        msg = (
            "\n" + "=" * 80 + "\n"
            " FLEETFLOW SECURITY ERROR: INSUFFICIENT SECRET_KEY IN PRODUCTION\n"
            "=" * 80 + "\n"
            "SECRET_KEY in production must be at least 50 characters long.\n"
            "=" * 80 + "\n"
        )
        raise ImproperlyConfigured(msg)

    # In production, ensure PAYMENT_GATEWAY_SECRET is strong and not default/insecure
    gw_secret = os.getenv('PAYMENT_GATEWAY_SECRET', '')
    if is_production:
        INSECURE_GATEWAY_SECRETS = {
            'fleetflow_secure_gateway_secret_key_2026',
        }
        if gw_secret in INSECURE_GATEWAY_SECRETS or len(gw_secret) < 50:
            msg = (
                "\n" + "=" * 80 + "\n"
                " FLEETFLOW SECURITY ERROR: INSUFFICIENT OR INSECURE PAYMENT_GATEWAY_SECRET IN PRODUCTION\n"
                "=" * 80 + "\n"
                "PAYMENT_GATEWAY_SECRET in production must be at least 50 characters long and cannot use hardcoded default values.\n"
                "=" * 80 + "\n"
            )
            raise ImproperlyConfigured(msg)

