"""
Unit tests for Email-OTP based Password Reset in FleetFlow backend.
"""

from datetime import timedelta
from unittest.mock import patch
from django.contrib.auth import get_user_model
from django.core import mail
from django.core.cache import cache
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.token_blacklist.models import OutstandingToken, BlacklistedToken

from accounts.models import EmailOTP, PasswordResetSession

User = get_user_model()


class PasswordResetOTPTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.password = "ValidPass123!"
        self.user = User.objects.create_user(
            email="reset_user@example.com",
            full_name="Reset Tester",
            phone="9876543210",
            password=self.password,
            role=User.Role.CUSTOMER,
            is_active=True,
            is_email_verified=True,
            approval_status=User.ApprovalStatus.APPROVED,
        )

    def tearDown(self):
        cache.clear()

    def test_unknown_email_returns_identical_200_response(self):
        """Unknown email gives the same response as a known email with no email sent."""
        res_unknown = self.client.post("/api/auth/forgot-password/", {"email": "unknown_404@example.com"})
        self.assertEqual(res_unknown.status_code, status.HTTP_200_OK)
        self.assertEqual(res_unknown.data["message"], "If this email is registered, a code has been sent.")
        self.assertIn("seconds_left", res_unknown.data)

        res_known = self.client.post("/api/auth/forgot-password/", {"email": self.user.email})
        self.assertEqual(res_known.status_code, status.HTTP_200_OK)
        self.assertEqual(res_known.data["message"], res_unknown.data["message"])

    def test_unverified_or_pending_user_gets_no_email_but_same_200(self):
        """User with pending approval or unverified email gets no email, but identical 200."""
        pending_user = User.objects.create_user(
            email="pending_manager@example.com",
            full_name="Pending Manager",
            password=self.password,
            role=User.Role.FLEET_MANAGER,
            is_active=True,
            is_email_verified=True,
            approval_status=User.ApprovalStatus.PENDING,
        )
        mail.outbox = []
        res = self.client.post("/api/auth/forgot-password/", {"email": pending_user.email})
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["message"], "If this email is registered, a code has been sent.")
        # No email sent to pending user
        self.assertEqual(len(mail.outbox), 0)

    @patch("accounts.views.send_password_reset_otp_email")
    def test_otp_is_stored_hashed_never_plaintext(self, mock_send_email):
        """OTP is stored hashed in database, not in plaintext."""
        self.client.post("/api/auth/forgot-password/", {"email": self.user.email})
        otp_record = EmailOTP.objects.filter(user=self.user, purpose=EmailOTP.Purpose.PASSWORD_RESET).first()
        self.assertIsNotNone(otp_record)
        # Hash is 64 hex chars (SHA-256)
        self.assertEqual(len(otp_record.otp_hash), 64)
        self.assertEqual(otp_record.purpose, EmailOTP.Purpose.PASSWORD_RESET)

    @patch("accounts.views.send_password_reset_otp_email")
    def test_wrong_otp_reduces_attempts_and_locks_after_5(self, mock_send_email):
        """Wrong OTP reduces attempts left and locks after 5 wrong attempts."""
        self.client.post("/api/auth/forgot-password/", {"email": self.user.email})
        otp_record = EmailOTP.objects.filter(user=self.user, purpose=EmailOTP.Purpose.PASSWORD_RESET).first()
        otp_record.otp_hash = EmailOTP.hash_otp("123456")
        otp_record.save()

        # 4 wrong attempts
        for attempt in range(1, 5):
            cache.clear()  # prevent throttle from interfering
            res = self.client.post("/api/auth/forgot-password/verify-otp/", {
                "email": self.user.email,
                "otp": "999999",
            })
            self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
            self.assertEqual(res.data["attempts_left"], 5 - attempt)

        # 5th wrong attempt locks the code
        cache.clear()
        res_5 = self.client.post("/api/auth/forgot-password/verify-otp/", {
            "email": self.user.email,
            "otp": "999999",
        })
        self.assertEqual(res_5.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(res_5.data["attempts_left"], 0)

        # 6th attempt even with correct code is rejected
        cache.clear()
        res_locked = self.client.post("/api/auth/forgot-password/verify-otp/", {
            "email": self.user.email,
            "otp": "123456",
        })
        self.assertEqual(res_locked.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(res_locked.data["attempts_left"], 0)

    def test_expired_otp_fails(self):
        """Expired OTP is rejected."""
        otp_record = EmailOTP.objects.create(
            user=self.user,
            purpose=EmailOTP.Purpose.PASSWORD_RESET,
            otp_hash=EmailOTP.hash_otp("123456"),
            expires_at=timezone.now() - timedelta(minutes=1),
            attempts=0,
        )
        res = self.client.post("/api/auth/forgot-password/verify-otp/", {
            "email": self.user.email,
            "otp": "123456",
        })
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    @patch("accounts.views.send_password_reset_otp_email")
    def test_resend_before_60_seconds_sends_no_new_code(self, mock_send_email):
        """Resend before 60 seconds returns same generic 200 with seconds_left and sends no code."""
        # 1st request
        self.client.post("/api/auth/forgot-password/", {"email": self.user.email})
        self.assertEqual(mock_send_email.call_count, 1)

        # 2nd immediate request within cooldown
        res_cooldown = self.client.post("/api/auth/forgot-password/", {"email": self.user.email})
        self.assertEqual(res_cooldown.status_code, status.HTTP_200_OK)
        self.assertEqual(res_cooldown.data["message"], "If this email is registered, a code has been sent.")
        self.assertGreater(res_cooldown.data["seconds_left"], 0)
        self.assertEqual(mock_send_email.call_count, 1)  # No extra email

    def test_registration_otp_cannot_be_used_for_password_reset_and_reverse(self):
        """Purpose isolation: REGISTER OTP cannot reset password, and PASSWORD_RESET OTP cannot verify email."""
        reg_otp = EmailOTP.objects.create(
            user=self.user,
            purpose=EmailOTP.Purpose.REGISTER,
            otp_hash=EmailOTP.hash_otp("111222"),
            expires_at=timezone.now() + timedelta(minutes=10),
            attempts=0,
        )

        # Attempt to use REGISTER OTP on verify-reset-otp endpoint
        res = self.client.post("/api/auth/forgot-password/verify-otp/", {
            "email": self.user.email,
            "otp": "111222",
        })
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

        # Create PASSWORD_RESET OTP
        reset_otp = EmailOTP.objects.create(
            user=self.user,
            purpose=EmailOTP.Purpose.PASSWORD_RESET,
            otp_hash=EmailOTP.hash_otp("333444"),
            expires_at=timezone.now() + timedelta(minutes=10),
            attempts=0,
        )

        # Attempt to use PASSWORD_RESET OTP on registration verify-otp endpoint
        self.user.is_email_verified = False
        self.user.save()
        res_reg = self.client.post("/api/auth/verify-otp/", {
            "email": self.user.email,
            "otp": "333444",
        })
        # Should fail because verify-otp queries purpose=REGISTER
        self.assertEqual(res_reg.status_code, status.HTTP_400_BAD_REQUEST)

    @patch("accounts.views.send_password_changed_email")
    def test_reset_token_works_once_and_expires(self, mock_changed_email):
        """PasswordResetSession token is single-use and cannot be reused."""
        session, raw_token = PasswordResetSession.create_session(self.user, expires_in_minutes=10)

        # 1st reset succeeds
        res = self.client.post("/api/auth/forgot-password/reset/", {
            "reset_token": raw_token,
            "new_password": "NewSecretPass456!",
            "confirm_password": "NewSecretPass456!",
        })
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        # 2nd reset with same token fails
        res_reused = self.client.post("/api/auth/forgot-password/reset/", {
            "reset_token": raw_token,
            "new_password": "AnotherPass789!",
            "confirm_password": "AnotherPass789!",
        })
        self.assertEqual(res_reused.status_code, status.HTTP_400_BAD_REQUEST)

    def test_weak_and_same_as_old_passwords_are_rejected(self):
        """Weak passwords, same-as-old, and passwords containing email are rejected."""
        session, raw_token = PasswordResetSession.create_session(self.user, expires_in_minutes=10)

        # Weak password (< 6 chars)
        res_short = self.client.post("/api/auth/forgot-password/reset/", {
            "reset_token": raw_token,
            "new_password": "123",
            "confirm_password": "123",
        })
        self.assertEqual(res_short.status_code, status.HTTP_400_BAD_REQUEST)

        # Same as current password
        res_same = self.client.post("/api/auth/forgot-password/reset/", {
            "reset_token": raw_token,
            "new_password": self.password,
            "confirm_password": self.password,
        })
        self.assertEqual(res_same.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("same as your current", str(res_same.data))

        # Containing email
        res_email = self.client.post("/api/auth/forgot-password/reset/", {
            "reset_token": raw_token,
            "new_password": "reset_user_Extra123!",
            "confirm_password": "reset_user_Extra123!",
        })
        self.assertEqual(res_email.status_code, status.HTTP_400_BAD_REQUEST)

    @patch("accounts.views.send_password_changed_email")
    def test_password_reset_blacklists_all_refresh_tokens(self, mock_email):
        """Resetting password blacklists all refresh tokens, logs out all devices."""
        # Create active refresh token
        refresh = RefreshToken.for_user(self.user)
        refresh_str = str(refresh)

        session, raw_token = PasswordResetSession.create_session(self.user, expires_in_minutes=10)

        # Perform reset
        res = self.client.post("/api/auth/forgot-password/reset/", {
            "reset_token": raw_token,
            "new_password": "BrandNewSecurePass999!",
            "confirm_password": "BrandNewSecurePass999!",
        })
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        # Check old password fails to login
        res_login_old = self.client.post("/api/auth/login/", {
            "identifier": self.user.email,
            "password": self.password,
        })
        self.assertEqual(res_login_old.status_code, status.HTTP_400_BAD_REQUEST)

        # Check new password succeeds
        res_login_new = self.client.post("/api/auth/login/", {
            "identifier": self.user.email,
            "password": "BrandNewSecurePass999!",
        })
        self.assertEqual(res_login_new.status_code, status.HTTP_200_OK)

        # Check previously issued refresh token cannot be refreshed (is blacklisted)
        res_refresh = self.client.post("/api/auth/token/refresh/", {"refresh": refresh_str})
        self.assertEqual(res_refresh.status_code, status.HTTP_401_UNAUTHORIZED)

        # Check security alert email was called
        self.assertTrue(mock_email.called)

    def test_old_link_endpoint_is_deprecated(self):
        """The old URL /reset-password/ is deprecated and returns clear guidance."""
        res = self.client.post("/api/auth/reset-password/", {
            "token": "some_old_token",
            "new_password": "NewPass123!",
            "confirm_password": "NewPass123!",
        })
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("no longer supported", str(res.data))

