"""
FleetFlow Production Settings (config/settings_prod.py)
Configured for hardened cloud deployment (Linux VPS, Docker, Render, Railway).
"""
import os
from .settings import *

# Strict production enforcement: DEBUG must never be True
DEBUG = False

# Host configuration from environment
ALLOWED_HOSTS = [h.strip() for h in os.getenv("ALLOWED_HOSTS", "").split(",") if h.strip()]
if not ALLOWED_HOSTS:
    raise RuntimeError("Production deployment requires non-empty ALLOWED_HOSTS environment variable.")

# CSRF Trusted Origins for reverse proxies and HTTPS
CSRF_TRUSTED_ORIGINS = [
    origin.strip()
    for origin in os.getenv("CSRF_TRUSTED_ORIGINS", "").split(",")
    if origin.strip()
]

# Static files management with WhiteNoise
MIDDLEWARE_LIST = list(MIDDLEWARE)
# Place WhiteNoise immediately following SecurityMiddleware
try:
    sec_idx = MIDDLEWARE_LIST.index('django.middleware.security.SecurityMiddleware')
    MIDDLEWARE_LIST.insert(sec_idx + 1, 'whitenoise.middleware.WhiteNoiseMiddleware')
except ValueError:
    MIDDLEWARE_LIST.insert(1, 'whitenoise.middleware.WhiteNoiseMiddleware')

MIDDLEWARE = MIDDLEWARE_LIST

STATICFILES_STORAGE = 'whitenoise.storage.CompressedManifestStaticFilesStorage'
STATIC_ROOT = BASE_DIR / 'staticfiles'

# Production Security Headers
SECURE_SSL_REDIRECT = os.getenv('SECURE_SSL_REDIRECT', 'True').lower() in ('true', '1', 't')
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
SECURE_HSTS_SECONDS = int(os.getenv('SECURE_HSTS_SECONDS', '31536000'))
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = True
SECURE_CONTENT_TYPE_NOSNIFF = True
X_FRAME_OPTIONS = 'DENY'
SECURE_REFERRER_POLICY = 'strict-origin-when-cross-origin'
SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
