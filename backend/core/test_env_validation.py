import os
from unittest import mock
from django.test import SimpleTestCase
from django.core.exceptions import ImproperlyConfigured
from config.env_check import validate_environment


class EnvironmentValidationTests(SimpleTestCase):
    def test_missing_secret_key_fails_fast(self):
        with mock.patch.dict(os.environ, {'SECRET_KEY': '', 'DEBUG': 'True'}):
            with self.assertRaises(ImproperlyConfigured) as ctx:
                validate_environment()
            self.assertIn("FLEETFLOW STARTUP ERROR", str(ctx.exception))
            self.assertIn("SECRET_KEY", str(ctx.exception))

    def test_missing_prod_database_in_production_fails_fast(self):
        env = {
            'SECRET_KEY': 'a' * 60,
            'DEBUG': 'False',
            'APP_ENV': 'production',
            'ALLOWED_HOSTS': 'fleetflow.com',
            'PAYMENT_GATEWAY_SECRET': 'b' * 60,
            'DB_NAME': '',
            'DB_USER': 'postgres',
            'DB_PASSWORD': 'password',
            'DB_HOST': 'localhost',
        }
        with mock.patch.dict(os.environ, env):
            with self.assertRaises(ImproperlyConfigured) as ctx:
                validate_environment()
            self.assertIn("DB_NAME", str(ctx.exception))

    def test_missing_payment_gateway_secret_in_production_fails_fast(self):
        env = {
            'SECRET_KEY': 'a' * 60,
            'DEBUG': 'False',
            'APP_ENV': 'production',
            'ALLOWED_HOSTS': 'fleetflow.com',
            'DATABASE_URL': 'postgres://user:pass@localhost:5432/fleetflow',
            'PAYMENT_GATEWAY_SECRET': '',
        }
        with mock.patch.dict(os.environ, env):
            with self.assertRaises(ImproperlyConfigured) as ctx:
                validate_environment()
            self.assertIn("FLEETFLOW STARTUP ERROR", str(ctx.exception))
            self.assertIn("PAYMENT_GATEWAY_SECRET", str(ctx.exception))

    def test_hardcoded_fallback_payment_gateway_secret_rejected_in_production(self):
        env = {
            'SECRET_KEY': 'a' * 60,
            'DEBUG': 'False',
            'APP_ENV': 'production',
            'ALLOWED_HOSTS': 'fleetflow.com',
            'DATABASE_URL': 'postgres://user:pass@localhost:5432/fleetflow',
            'PAYMENT_GATEWAY_SECRET': 'fleetflow_secure_gateway_secret_key_2026',
        }
        with mock.patch.dict(os.environ, env):
            with self.assertRaises(ImproperlyConfigured) as ctx:
                validate_environment()
            self.assertIn("FLEETFLOW SECURITY ERROR", str(ctx.exception))
            self.assertIn("PAYMENT_GATEWAY_SECRET in production must be at least 50 characters", str(ctx.exception))

    def test_short_payment_gateway_secret_in_production_fails_fast(self):
        env = {
            'SECRET_KEY': 'a' * 60,
            'DEBUG': 'False',
            'APP_ENV': 'production',
            'ALLOWED_HOSTS': 'fleetflow.com',
            'DATABASE_URL': 'postgres://user:pass@localhost:5432/fleetflow',
            'PAYMENT_GATEWAY_SECRET': 'short_secret_under_50_chars',
        }
        with mock.patch.dict(os.environ, env):
            with self.assertRaises(ImproperlyConfigured) as ctx:
                validate_environment()
            self.assertIn("FLEETFLOW SECURITY ERROR", str(ctx.exception))
            self.assertIn("PAYMENT_GATEWAY_SECRET in production must be at least 50 characters", str(ctx.exception))

    def test_valid_production_environment_passes(self):
        env = {
            'SECRET_KEY': 'a' * 60,
            'DEBUG': 'False',
            'APP_ENV': 'production',
            'ALLOWED_HOSTS': 'fleetflow.com',
            'DATABASE_URL': 'postgres://user:pass@localhost:5432/fleetflow',
            'PAYMENT_GATEWAY_SECRET': 'c' * 60,
        }
        with mock.patch.dict(os.environ, env):
            # Should not raise
            validate_environment()

    def test_valid_environment_passes(self):
        env = {
            'SECRET_KEY': 'a' * 60,
            'DEBUG': 'True',
            'ALLOWED_HOSTS': 'localhost',
        }
        with mock.patch.dict(os.environ, env):
            # Should not raise
            validate_environment()

