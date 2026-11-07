from datetime import timedelta
from unittest.mock import patch
import re
from django.conf import settings
from django.core import mail
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from accounts.models import User, EmailOTP
from accounts.emails import EmailDeliveryError


class EmailDeliveryAndOTPTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.register_url = "/api/auth/register/"
        self.verify_url = "/api/auth/verify-otp/"
        self.resend_url = "/api/auth/resend-otp/"

    @override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend", DEBUG=True)
    def test_register_sends_exactly_one_email_with_6_digit_otp(self):
        mail.outbox = []
        payload = {
            "email": "customer_test@example.com",
            "password": "SecurePassword123!",
            "password_confirm": "SecurePassword123!",
            "full_name": "Test Customer",
            "phone": "+919876543210",
            "role": "CUSTOMER",
        }
        res = self.client.post(self.register_url, payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)

        # Never return OTP in any API response
        self.assertNotIn("otp", res.data)
        self.assertNotIn("otp_code", res.data)

        # Sends exactly one email to the right address
        self.assertEqual(len(mail.outbox), 1)
        sent_email = mail.outbox[0]
        self.assertIn("customer_test@example.com", sent_email.to)
        self.assertIn("FleetFlow - Verify Your Email", sent_email.subject)

        # Contains 6-digit OTP
        otp_match = re.search(r"\b\d{6}\b", sent_email.body)
        self.assertIsNotNone(otp_match, "Email body must contain a 6-digit OTP code")

    @override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
    @patch("accounts.views.generate_and_send_otp")
    def test_register_send_failure_returns_503_and_rolls_back(self, mock_send):
        mock_send.side_effect = EmailDeliveryError("SMTP connection failed")
        payload = {
            "email": "rollback_test@example.com",
            "password": "SecurePassword123!",
            "password_confirm": "SecurePassword123!",
            "full_name": "Rollback User",
            "phone": "+919876543211",
            "role": "CUSTOMER",
        }
        res = self.client.post(self.register_url, payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)
        self.assertIn("We could not send the email. Please try again.", res.data.get("detail", ""))

        # Verify user is completely rolled back so same email can register again
        self.assertFalse(User.objects.filter(email="rollback_test@example.com").exists())

    @override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
    def test_resend_works_after_60_seconds(self):
        user = User.objects.create_user(
            email="resend_test@example.com",
            password="SecurePassword123!",
            full_name="Resend User",
            is_email_verified=False,
        )
        # Create OTP sent 10 seconds ago (cooling down)
        EmailOTP.objects.create(
            user=user,
            otp_hash=EmailOTP.hash_otp("123456"),
            expires_at=timezone.now() + timedelta(minutes=10),
            last_sent_at=timezone.now() - timedelta(seconds=10),
        )

        # Attempt immediate resend -> should be rate limited with wait time
        res = self.client.post(self.resend_url, {"email": user.email}, format="json")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("wait", res.data.get("detail", "").lower())

        # Fast forward time to 65 seconds ago
        otp_rec = user.email_otps.first()
        otp_rec.last_sent_at = timezone.now() - timedelta(seconds=65)
        otp_rec.save()

        # Now resend succeeds
        mail.outbox = []
        res = self.client.post(self.resend_url, {"email": user.email}, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn("resend_test@example.com", mail.outbox[0].to)

    @override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
    def test_verify_otp_all_error_cases(self):
        user = User.objects.create_user(
            email="verify_test@example.com",
            password="SecurePassword123!",
            full_name="Verify User",
            is_email_verified=False,
        )
        otp_rec = EmailOTP.objects.create(
            user=user,
            otp_hash=EmailOTP.hash_otp("654321"),
            expires_at=timezone.now() + timedelta(minutes=10),
            attempts=0,
        )

        # 1. Wrong OTP (with attempts left)
        res = self.client.post(self.verify_url, {"email": user.email, "otp": "000000"}, format="json")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(res.data.get("code"), "WRONG_OTP")
        self.assertEqual(res.data.get("attempts_left"), 4)
        self.assertIn("4 attempt(s) remaining", res.data.get("message", ""))

        # 2. Too many attempts (exceed 5 attempts)
        otp_rec.attempts = 5
        otp_rec.save()
        res = self.client.post(self.verify_url, {"email": user.email, "otp": "000000"}, format="json")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(res.data.get("code"), "TOO_MANY_ATTEMPTS")

        # 3. Expired OTP
        otp_rec.attempts = 0
        otp_rec.expires_at = timezone.now() - timedelta(minutes=5)
        otp_rec.save()
        res = self.client.post(self.verify_url, {"email": user.email, "otp": "654321"}, format="json")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(res.data.get("code"), "OTP_EXPIRED")

        # 4. No OTP for this email
        res = self.client.post(self.verify_url, {"email": "unknown_email@example.com", "otp": "123456"}, format="json")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(res.data.get("code"), "NO_OTP_FOUND")

        # 5. Already verified
        user.is_email_verified = True
        user.save()
        res = self.client.post(self.verify_url, {"email": user.email, "otp": "654321"}, format="json")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(res.data.get("code"), "ALREADY_VERIFIED")

    @override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
    def test_approval_and_rejection_emails(self):
        admin = User.objects.create_superuser(
            email="admin_approver@example.com",
            password="AdminPassword123!",
            full_name="Admin Approver",
        )
        self.client.force_authenticate(user=admin)

        # Create unverified user awaiting approval
        pending_fm = User.objects.create_user(
            email="fm_candidate@example.com",
            password="SecurePassword123!",
            full_name="FM Candidate",
            role=User.Role.FLEET_MANAGER,
            is_email_verified=True,
            approval_status=User.ApprovalStatus.PENDING,
        )

        mail.outbox = []
        # Approve user
        res = self.client.post(f"/api/auth/approvals/{pending_fm.id}/approve/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertTrue("approved" in mail.outbox[0].subject.lower())

        # Create driver candidate for rejection
        pending_driver = User.objects.create_user(
            email="driver_candidate@example.com",
            password="SecurePassword123!",
            full_name="Driver Candidate",
            role=User.Role.DRIVER,
            is_email_verified=True,
            approval_status=User.ApprovalStatus.PENDING,
        )

        mail.outbox = []
        res = self.client.post(
            f"/api/auth/approvals/{pending_driver.id}/reject/",
            {"reason": "Driver license expired in 2024"},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn("driver_candidate@example.com", mail.outbox[0].to)
        self.assertIn("Driver license expired in 2024", mail.outbox[0].body)

    def test_console_mode_flag_only_when_debug_true(self):
        payload = {
            "email": "flag_test@example.com",
            "password": "SecurePassword123!",
            "password_confirm": "SecurePassword123!",
            "full_name": "Flag User",
            "role": "CUSTOMER",
        }

        # Case 1: DEBUG=True and console backend -> includes email_mode="console"
        with override_settings(DEBUG=True, EMAIL_BACKEND="django.core.mail.backends.console.EmailBackend"):
            res = self.client.post(self.register_url, payload, format="json")
            self.assertEqual(res.status_code, status.HTTP_201_CREATED)
            self.assertEqual(res.data.get("email_mode"), "console")

        User.objects.filter(email=payload["email"]).delete()

        # Case 2: DEBUG=False and console backend -> does NOT include email_mode
        with override_settings(DEBUG=False, EMAIL_BACKEND="django.core.mail.backends.console.EmailBackend"):
            res = self.client.post(self.register_url, payload, format="json")
            self.assertEqual(res.status_code, status.HTTP_201_CREATED)
            self.assertNotIn("email_mode", res.data)

        User.objects.filter(email=payload["email"]).delete()

        # Case 3: DEBUG=True and SMTP backend -> does NOT include email_mode="console"
        with override_settings(DEBUG=True, EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend"):
            res = self.client.post(self.register_url, payload, format="json")
            self.assertEqual(res.status_code, status.HTTP_201_CREATED)
            self.assertNotIn("email_mode", res.data)
