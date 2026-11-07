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
            'DB_NAME': '',
            'DB_USER': 'postgres',
            'DB_PASSWORD': 'password',
            'DB_HOST': 'localhost',
        }
        with mock.patch.dict(os.environ, env):
            with self.assertRaises(ImproperlyConfigured) as ctx:
                validate_environment()
            self.assertIn("DB_NAME", str(ctx.exception))

    def test_valid_environment_passes(self):
        env = {
            'SECRET_KEY': 'a' * 60,
            'DEBUG': 'True',
            'ALLOWED_HOSTS': 'localhost',
        }
        with mock.patch.dict(os.environ, env):
            # Should not raise
            validate_environment()
