"""
Django settings for config project.

FleetFlow - Smart Vehicle Fleet & Trip Management Platform
"""

import os
from datetime import timedelta
from pathlib import Path
from dotenv import load_dotenv

# Build paths inside the project like this: BASE_DIR / 'subdir'.
BASE_DIR = Path(__file__).resolve().parent.parent

# Load environment variables from .env
load_dotenv(BASE_DIR / '.env')

from config.env_check import validate_environment
validate_environment()

# Quick-start development settings - unsuitable for production
SECRET_KEY = os.getenv('SECRET_KEY')
if not SECRET_KEY:
    raise ValueError("SECRET_KEY environment variable is required and must be set in .env")

DEBUG = os.getenv('DEBUG', 'False').lower() in ('true', '1', 't')

hosts_env = os.getenv('ALLOWED_HOSTS', 'localhost,127.0.0.1,testserver')
ALLOWED_HOSTS = [host.strip() for host in hosts_env.split(',') if host.strip()]
if 'testserver' not in ALLOWED_HOSTS:
    ALLOWED_HOSTS.append('testserver')


# Application definition

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',

    # Third-party apps
    'corsheaders',
    'rest_framework',
    'rest_framework_simplejwt',
    'rest_framework_simplejwt.token_blacklist',
    'drf_spectacular',
    'django_filters',

    # Local apps
    'accounts',
    'vehicles',
    'drivers',
    'notifications',
    'bookings',
    'trips',
    'payments',
    'reports',
    'fuel',
    'expenses',
    'documents',
    'core',
]

AUTH_USER_MODEL = 'accounts.User'

MIDDLEWARE = [
    'core.middleware.RequestIDMiddleware',
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.security.SecurityMiddleware',

    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'config.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'config.wsgi.application'


# Database
# https://docs.djangoproject.com/en/6.1/ref/settings/#databases

DATABASE_URL = os.getenv('DATABASE_URL', '').strip()

if DATABASE_URL:
    try:
        import dj_database_url
        DATABASES = {
            'default': dj_database_url.config(
                default=DATABASE_URL,
                conn_max_age=600,
                conn_health_checks=True,
            )
        }
    except ImportError:
        from urllib.parse import urlparse
        parsed = urlparse(DATABASE_URL)
        DATABASES = {
            'default': {
                'ENGINE': 'django.db.backends.postgresql',
                'NAME': parsed.path.lstrip('/'),
                'USER': parsed.username or 'postgres',
                'PASSWORD': parsed.password or '',
                'HOST': parsed.hostname or 'localhost',
                'PORT': parsed.port or 5432,
            }
        }
else:
    DB_ENGINE = os.getenv('DB_ENGINE', 'django.db.backends.postgresql')

    if DB_ENGINE == 'django.db.backends.sqlite3':
        DATABASES = {
            'default': {
                'ENGINE': 'django.db.backends.sqlite3',
                'NAME': BASE_DIR / 'db.sqlite3',
            }
        }
    else:
        DATABASES = {
            'default': {
                'ENGINE': 'django.db.backends.postgresql',
                'NAME': os.getenv('DB_NAME', 'fleetflow_db'),
                'USER': os.getenv('DB_USER', 'postgres'),
                'PASSWORD': os.getenv('DB_PASSWORD', 'postgres'),
                'HOST': os.getenv('DB_HOST', 'localhost'),
                'PORT': os.getenv('DB_PORT', '5432'),
            }
        }

if 'postgresql' in DATABASES.get('default', {}).get('ENGINE', ''):
    DATABASES['default'].setdefault('OPTIONS', {})['connect_timeout'] = 10



# Password validation
# https://docs.djangoproject.com/en/6.1/ref/settings/#auth-password-validators

AUTH_PASSWORD_VALIDATORS = [
    {
        'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator',
    },
]


# Internationalization
# https://docs.djangoproject.com/en/6.1/topics/i18n/

LANGUAGE_CODE = 'en-us'

TIME_ZONE = 'Asia/Kolkata'

USE_I18N = True

USE_TZ = True


# Static files (CSS, JavaScript, Images)
# https://docs.djangoproject.com/en/6.1/howto/static-files/

STATIC_URL = 'static/'

# Directory where collectstatic will gather static files
STATIC_ROOT = BASE_DIR / 'staticfiles'

# Private media files – used for documents, driver licences, etc.
# Render will set the environment variable PRIVATE_MEDIA_ROOT to the persistent‑disk mount point (e.g. /var/data).
# If it is not set we fall back to the existing local path for local development.
PRIVATE_MEDIA_ROOT = Path(
    os.getenv(
        "PRIVATE_MEDIA_ROOT",
        str(BASE_DIR / "private_media")
    )
)

# Ensure the directory exists at startup (no‑op if it already does)
os.makedirs(PRIVATE_MEDIA_ROOT, exist_ok=True)


DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'


# Trip Execution Rules
TRIP_START_RULE = os.getenv("TRIP_START_RULE", "same_day")

REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': (
        'rest_framework_simplejwt.authentication.JWTAuthentication',
    ),
    'DEFAULT_PERMISSION_CLASSES': (
        'rest_framework.permissions.IsAuthenticated',
    ),
    'DEFAULT_SCHEMA_CLASS': 'drf_spectacular.openapi.AutoSchema',
    'DEFAULT_FILTER_BACKENDS': (
        'django_filters.rest_framework.DjangoFilterBackend',
        'rest_framework.filters.SearchFilter',
        'rest_framework.filters.OrderingFilter',
    ),
    'DEFAULT_PAGINATION_CLASS': 'rest_framework.pagination.PageNumberPagination',
    'PAGE_SIZE': 10,
    'DEFAULT_THROTTLE_RATES': {
        'login': '10/minute',
        'register': '10/minute',
        'otp': '5/minute',
        'password_reset': '5/minute',
        'check_email': '20/minute',
        'forgot_password_email': '5/hour',
        'forgot_password_ip': '10/hour',
        'verify_reset_otp': '15/hour',
    },
}

# SimpleJWT configuration with Token Blacklisting
SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(minutes=30),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=7),
    'ROTATE_REFRESH_TOKENS': True,
    'BLACKLIST_AFTER_ROTATION': True,
    'UPDATE_LAST_LOGIN': True,
    'ALGORITHM': 'HS256',
    'SIGNING_KEY': SECRET_KEY,
    'AUTH_HEADER_TYPES': ('Bearer',),
    'AUTH_TOKEN_CLASSES': ('rest_framework_simplejwt.tokens.AccessToken',),
    'TOKEN_TYPE_CLAIM': 'token_type',
}

# drf-spectacular settings
SPECTACULAR_SETTINGS = {
    'TITLE': 'FleetFlow API',
    'DESCRIPTION': 'Smart Vehicle Fleet & Trip Management Platform API',
    'VERSION': '1.0.0',
    'SERVE_INCLUDE_SCHEMA': False,
    'ENUM_NAME_OVERRIDES': {
        'VehicleStatusEnum': 'vehicles.models.Vehicle.Status',
        'DriverStatusEnum': 'drivers.models.Driver.Status',
        'BusScheduleStatusEnum': 'bookings.models.BusSchedule.Status',
        'BookingStatusEnum': 'bookings.models.Booking.Status',
        'BookingTypeEnum': 'bookings.models.Booking.BookingType',
        'BookingVehicleTypeEnum': 'bookings.models.Booking.VehicleType',
        'BookingRefundStatusEnum': 'bookings.models.Booking.RefundStatus',
        'BusOptionChoiceEnum': 'bookings.models.Booking.BusOptionChoice',
        'NotificationTypeEnum': 'notifications.models.Notification.NotificationType',
        'FuelTypeEnum': 'fuel.models.FuelLog.FuelType',
        'ExpenseCategoryEnum': 'expenses.models.Expense.Category',
        'ExpenseStatusEnum': 'expenses.models.Expense.Status',
        'DocumentTypeEnum': 'documents.models.Document.DocType',
        'DocumentExpiryStatusEnum': 'documents.models.Document.ExpiryStatus',
    },
}

# CORS configuration from environment
cors_env = os.getenv('CORS_ALLOWED_ORIGINS', 'http://localhost:3000,http://127.0.0.1:3000')
CORS_ALLOWED_ORIGINS = [origin.strip() for origin in cors_env.split(',') if origin.strip()]

# Baseline Security Headers (Dev & Production)
SECURE_CONTENT_TYPE_NOSNIFF = True
X_FRAME_OPTIONS = 'DENY'
SECURE_REFERRER_POLICY = 'strict-origin-when-cross-origin'

# Media files configuration
MEDIA_URL = '/media/'
MEDIA_ROOT = Path(
    os.getenv("MEDIA_ROOT", str(BASE_DIR / "media"))
)
os.makedirs(MEDIA_ROOT, exist_ok=True)

# Private Media (Documents, Fuel receipts, Expense receipts stored outside public MEDIA_URL)


# Trip Assignment Document Expiry Enforcement
BLOCK_TRIPS_ON_EXPIRED_DOCUMENTS = os.getenv('BLOCK_TRIPS_ON_EXPIRED_DOCUMENTS', 'True').lower() in ('true', '1', 't')

# Payment Configuration
PAYMENT_MODE = os.getenv('PAYMENT_MODE', 'STATIC_QR')
if DEBUG:
    PAYMENT_GATEWAY_SECRET = os.getenv('PAYMENT_GATEWAY_SECRET', 'fleetflow_secure_gateway_secret_key_2026')
else:
    PAYMENT_GATEWAY_SECRET = os.getenv('PAYMENT_GATEWAY_SECRET', '')

# Email Configuration
raw_backend = os.getenv('EMAIL_BACKEND', '').strip()
if raw_backend:
    if raw_backend.lower() in ('smtp', 'smtp.emailbackend'):
        EMAIL_BACKEND = 'django.core.mail.backends.smtp.EmailBackend'
    elif raw_backend.lower() in ('console', 'console.emailbackend'):
        EMAIL_BACKEND = 'django.core.mail.backends.console.EmailBackend'
    elif raw_backend.lower() in ('filebased', 'filebased.emailbackend'):
        EMAIL_BACKEND = 'django.core.mail.backends.filebased.EmailBackend'
    else:
        EMAIL_BACKEND = raw_backend
else:
    # If empty or not set, check if SMTP credentials are provided; do not silently fall back to console
    if os.getenv('EMAIL_HOST_USER', '').strip():
        EMAIL_BACKEND = 'django.core.mail.backends.smtp.EmailBackend'
    else:
        EMAIL_BACKEND = 'django.core.mail.backends.console.EmailBackend'

EMAIL_FILE_PATH = os.getenv('EMAIL_FILE_PATH', str(BASE_DIR / 'tmp_emails'))

EMAIL_HOST = os.getenv('EMAIL_HOST', 'smtp.gmail.com').strip()
EMAIL_PORT = int(os.getenv('EMAIL_PORT', '587').strip())
EMAIL_USE_TLS = os.getenv('EMAIL_USE_TLS', 'True').strip().lower() in ('true', '1', 't')
EMAIL_USE_SSL = os.getenv('EMAIL_USE_SSL', 'False').strip().lower() in ('true', '1', 't')
EMAIL_HOST_USER = os.getenv('EMAIL_HOST_USER', '').strip()
EMAIL_HOST_PASSWORD = os.getenv('EMAIL_HOST_PASSWORD', '').strip().replace(' ', '')
EMAIL_TIMEOUT = int(os.getenv('EMAIL_TIMEOUT', '10').strip())

default_from = os.getenv('DEFAULT_FROM_EMAIL', '').strip()
if default_from:
    DEFAULT_FROM_EMAIL = default_from
elif EMAIL_HOST_USER:
    DEFAULT_FROM_EMAIL = f"FleetFlow <{EMAIL_HOST_USER}>"
else:
    DEFAULT_FROM_EMAIL = "FleetFlow <noreply@fleetflow.com>"


# Production Security Configuration (Active when DEBUG is False)
if not DEBUG:
    SECURE_SSL_REDIRECT = os.getenv('SECURE_SSL_REDIRECT', 'True').lower() in ('true', '1', 't')
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
    SECURE_HSTS_SECONDS = int(os.getenv('SECURE_HSTS_SECONDS', '31536000'))
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True
    SECURE_HSTS_PRELOAD = True
    SECURE_CONTENT_TYPE_NOSNIFF = True
    X_FRAME_OPTIONS = 'DENY'


# Logging & Monitoring Configuration
LOGS_DIR = BASE_DIR / 'logs'
LOGS_DIR.mkdir(parents=True, exist_ok=True)

LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'filters': {
        'sensitive_data_filter': {
            '()': 'core.middleware.SensitiveDataLoggingFilter',
        },
    },
    'formatters': {
        'standard': {
            'format': '[{asctime}] [{levelname}] [req:{request_id}] {name}: {message}',
            'style': '{',
        },
        'simple': {
            'format': '[{levelname}] {message}',
            'style': '{',
        },
    },
    'handlers': {
        'console': {
            'class': 'logging.StreamHandler',
            'formatter': 'simple',
            'filters': ['sensitive_data_filter'],
        },
        'file_app': {
            'class': 'logging.handlers.RotatingFileHandler',
            'filename': str(LOGS_DIR / 'fleetflow.log'),
            'maxBytes': 5 * 1024 * 1024,  # 5 MB
            'backupCount': 5,
            'formatter': 'standard',
            'filters': ['sensitive_data_filter'],
            'encoding': 'utf-8',
        },
        'file_security': {
            'class': 'logging.handlers.RotatingFileHandler',
            'filename': str(LOGS_DIR / 'security.log'),
            'maxBytes': 5 * 1024 * 1024,  # 5 MB
            'backupCount': 5,
            'formatter': 'standard',
            'filters': ['sensitive_data_filter'],
            'encoding': 'utf-8',
        },
    },
    'loggers': {
        'django': {
            'handlers': ['console', 'file_app'],
            'level': os.getenv('DJANGO_LOG_LEVEL', 'INFO'),
            'propagate': True,
        },
        'fleetflow': {
            'handlers': ['console', 'file_app'],
            'level': 'INFO',
            'propagate': False,
        },
        'fleetflow.security': {
            'handlers': ['console', 'file_security'],
            'level': 'INFO',
            'propagate': False,
        },
    },
}



