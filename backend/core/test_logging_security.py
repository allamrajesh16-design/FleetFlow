import logging
from django.test import TestCase, Client
from rest_framework import status
from accounts.models import User
from core.middleware import SensitiveDataLoggingFilter, get_current_request_id


class LoggingAndSecurityTests(TestCase):
    """
    Validates Essential #27 requirements:
    1. Request-ID Middleware attaches X-Request-ID to responses.
    2. /api/health/ returns HTTP 200 and reports database status.
    3. Passwords, OTP codes, and Bearer tokens are scrubbed from log outputs.
    4. Failed logins trigger security warnings without exposing credentials.
    """

    def setUp(self):
        self.client = Client()
        self.user = User.objects.create_user(
            email="logging.test@fleetflow.local",
            password="StrongPassword@123",
            phone="9123456780",
            full_name="Logging Tester",
            is_email_verified=True,
            approval_status=User.ApprovalStatus.APPROVED,
        )

    def test_request_id_middleware(self):
        """Ensure X-Request-ID is present in API response."""
        res = self.client.get('/api/health/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIn('X-Request-ID', res.headers)
        self.assertTrue(len(res.headers['X-Request-ID']) > 10)

    def test_health_check_endpoint(self):
        """Ensure /api/health/ returns status ok and database connected."""
        res = self.client.get('/api/health/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        data = res.json()
        self.assertEqual(data.get('status'), 'ok')
        self.assertEqual(data.get('database'), 'connected')
        self.assertEqual(data.get('version'), '1.0.0')
        self.assertIn('timestamp', data)

    def test_sensitive_data_filter_scrubs_secrets(self):
        """Verify SensitiveDataLoggingFilter redacts passwords, OTPs, and tokens."""
        filt = SensitiveDataLoggingFilter()

        # Test password scrubbing
        record_pwd = logging.LogRecord(
            name="test", level=logging.INFO, pathname=__file__, lineno=1,
            msg='Attempted login with data {"password": "SuperSecretPassword123", "email": "user@test.com"}',
            args=(), exc_info=None
        )
        filt.filter(record_pwd)
        self.assertNotIn("SuperSecretPassword123", record_pwd.msg)
        self.assertIn("[REDACTED_PASSWORD]", record_pwd.msg)

        # Test OTP scrubbing
        record_otp = logging.LogRecord(
            name="test", level=logging.INFO, pathname=__file__, lineno=1,
            msg='Verification payload: {"otp": "849201", "email": "user@test.com"}',
            args=(), exc_info=None
        )
        filt.filter(record_otp)
        self.assertNotIn("849201", record_otp.msg)
        self.assertIn("[REDACTED_OTP]", record_otp.msg)

        # Test Bearer token scrubbing
        record_token = logging.LogRecord(
            name="test", level=logging.INFO, pathname=__file__, lineno=1,
            msg='Authorization header passed: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoxfQ.mock_signature',
            args=(), exc_info=None
        )
        filt.filter(record_token)
        self.assertNotIn("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9", record_token.msg)
        self.assertIn("Bearer [REDACTED_TOKEN]", record_token.msg)

    def test_failed_login_logs_security_warning_without_password(self):
        """Verify failed login logs security alert without exposing entered password."""
        with self.assertLogs("fleetflow.security", level="WARNING") as cm:
            res = self.client.post('/api/auth/login/', {
                'identifier': self.user.email,
                'password': 'WrongPassword@999'
            }, content_type='application/json')
            self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

        # Check logs
        log_output = "\n".join(cm.output)
        self.assertIn(self.user.email, log_output)
        self.assertNotIn("WrongPassword@999", log_output)

