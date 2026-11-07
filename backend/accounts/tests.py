from datetime import date, timedelta
from unittest.mock import patch, MagicMock
import dns.resolver
from django.core import mail
from django.core.exceptions import ValidationError
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from notifications.models import Notification
from accounts.email_validation import validate_real_email
from .models import User, EmailOTP


class RegistrationAndApprovalFlowTests(APITestCase):
    def setUp(self):
        # Clear outbox and cache before each test
        mail.outbox = []
        from django.core.cache import cache
        cache.clear()
        # Mock DNS resolver so tests never hit the real internet and run fast
        self.dns_patcher = patch("dns.resolver.Resolver.resolve")
        self.mock_dns_resolve = self.dns_patcher.start()
        self.mock_dns_resolve.return_value = [MagicMock()]

    def tearDown(self):
        self.dns_patcher.stop()

    # 1. register-options shows ADMIN only when no active Admin exists
    def test_register_options_shows_admin_only_when_no_active_admin_exists(self):
        # No admin exists initially
        res = self.client.get("/api/auth/register-options/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        role_values = [r["value"] for r in res.data["roles"]]
        self.assertIn("ADMIN", role_values)
        self.assertIn("CUSTOMER", role_values)
        self.assertIn("DRIVER", role_values)
        self.assertIn("FLEET_MANAGER", role_values)

        # Create an active Admin
        admin = User.objects.create_superuser(
            email="existing_admin@fleetflow.com",
            password="Password123!",
            full_name="Existing Admin",
        )

        res_after = self.client.get("/api/auth/register-options/")
        self.assertEqual(res_after.status_code, status.HTTP_200_OK)
        role_values_after = [r["value"] for r in res_after.data["roles"]]
        self.assertNotIn("ADMIN", role_values_after)

    # 2. Registering as ADMIN is rejected when an Admin exists
    def test_registering_as_admin_rejected_when_admin_exists(self):
        # Create an existing active Admin
        User.objects.create_superuser(
            email="superadmin@fleetflow.com",
            password="Password123!",
            full_name="Super Admin",
        )

        # Attempt to register another ADMIN
        payload = {
            "email": "another_admin@fleetflow.com",
            "full_name": "Another Admin",
            "phone": "+919111111111",
            "password": "Password123!",
            "role": "ADMIN",
        }
        res = self.client.post("/api/auth/register/", payload)
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("role", res.data)

    # 3. Customer: register, OTP, verify, login works. Login before verify is blocked.
    def test_customer_registration_otp_verification_and_login_flow(self):
        payload = {
            "email": "newcustomer@fleetflow.com",
            "full_name": "New Customer",
            "phone": "+919222222222",
            "password": "Password123!",
            "role": "CUSTOMER",
        }
        res_reg = self.client.post("/api/auth/register/", payload)
        self.assertEqual(res_reg.status_code, status.HTTP_201_CREATED)
        self.assertIn("OTP sent to your email", res_reg.data["message"])

        user = User.objects.get(email="newcustomer@fleetflow.com")
        self.assertFalse(user.is_email_verified)
        self.assertTrue(user.is_active)

        # Verify email was sent
        self.assertTrue(len(mail.outbox) >= 1)
        email_content = mail.outbox[-1].body

        # Try to login BEFORE OTP verification -> must be blocked with 403 & EMAIL_NOT_VERIFIED
        res_login_early = self.client.post("/api/auth/login/", {
            "email": "newcustomer@fleetflow.com",
            "password": "Password123!",
        })
        self.assertEqual(res_login_early.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(res_login_early.data["code"], "EMAIL_NOT_VERIFIED")

        # Extract 6-digit OTP from sent email
        otp_rec = user.email_otps.filter(is_used=False).first()
        self.assertIsNotNone(otp_rec)

        import re
        match = re.search(r"\b(\d{6})\b", email_content)
        found_code = match.group(1) if match else None
        self.assertIsNotNone(found_code)

        # Verify OTP
        res_verify = self.client.post("/api/auth/verify-otp/", {
            "email": "newcustomer@fleetflow.com",
            "otp": found_code,
        })
        self.assertEqual(res_verify.status_code, status.HTTP_200_OK)

        user.refresh_from_db()
        self.assertTrue(user.is_email_verified)
        self.assertEqual(user.approval_status, User.ApprovalStatus.APPROVED)

        # Login now succeeds
        res_login_success = self.client.post("/api/auth/login/", {
            "email": "newcustomer@fleetflow.com",
            "password": "Password123!",
        })
        self.assertEqual(res_login_success.status_code, status.HTTP_200_OK)
        self.assertIn("access", res_login_success.data)
        self.assertIn("refresh", res_login_success.data)

    # 4. Wrong OTP is rejected, expired OTP is rejected, 5 wrong attempts lock the OTP, resend within 60 seconds is rejected
    def test_otp_rules_and_restrictions(self):
        user = User.objects.create_user(
            email="otptester@fleetflow.com",
            password="Password123!",
            full_name="OTP Tester",
            is_email_verified=False,
        )

        from accounts.views import generate_and_send_otp
        valid_otp = generate_and_send_otp(user)

        # Wrong OTP is rejected
        res_wrong = self.client.post("/api/auth/verify-otp/", {
            "email": "otptester@fleetflow.com",
            "otp": "000000" if valid_otp != "000000" else "111111",
        })
        self.assertEqual(res_wrong.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("Invalid OTP", res_wrong.data["detail"])

        # Resend within 60 seconds is rejected
        res_resend_early = self.client.post("/api/auth/resend-otp/", {"email": "otptester@fleetflow.com"})
        self.assertEqual(res_resend_early.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("Please wait", res_resend_early.data["detail"])

        # Expired OTP is rejected
        otp_rec = user.email_otps.filter(is_used=False).first()
        otp_rec.expires_at = timezone.now() - timedelta(minutes=1)
        otp_rec.save()

        res_expired = self.client.post("/api/auth/verify-otp/", {
            "email": "otptester@fleetflow.com",
            "otp": valid_otp,
        })
        self.assertEqual(res_expired.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("expired", res_expired.data["detail"])

        # Generate a new fresh OTP and test 5 wrong attempts
        # Manually backdate last_sent_at to allow resend
        otp_rec.last_sent_at = timezone.now() - timedelta(seconds=70)
        otp_rec.save()

        res_resend_ok = self.client.post("/api/auth/resend-otp/", {"email": "otptester@fleetflow.com"})
        self.assertEqual(res_resend_ok.status_code, status.HTTP_200_OK)

        fresh_otp_rec = user.email_otps.filter(is_used=False).first()
        dummy_wrong = "999999"

        # 5 wrong attempts (clearing cache so IP rate-limit doesn't mask OTP-attempt locking)
        from django.core.cache import cache
        for attempt_i in range(5):
            cache.clear()
            res_wrong_i = self.client.post("/api/auth/verify-otp/", {
                "email": "otptester@fleetflow.com",
                "otp": dummy_wrong,
            })
            self.assertEqual(res_wrong_i.status_code, status.HTTP_400_BAD_REQUEST)

        # 6th attempt should state locked/exceeded
        cache.clear()
        res_lock = self.client.post("/api/auth/verify-otp/", {
            "email": "otptester@fleetflow.com",
            "otp": dummy_wrong,
        })
        self.assertEqual(res_lock.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("Maximum wrong attempts exceeded", res_lock.data["detail"])

    # 5. Fleet Manager: register, verify, Admin gets a notification, login is blocked until approval, Admin approves, user gets a notification, login works
    def test_fleet_manager_registration_and_approval_flow(self):
        admin = User.objects.create_superuser(
            email="head_admin@fleetflow.com",
            password="Password123!",
            full_name="Head Admin",
        )

        res_reg = self.client.post("/api/auth/register/", {
            "email": "applicant_fm@fleetflow.com",
            "full_name": "Applicant Manager",
            "phone": "+919333333333",
            "password": "Password123!",
            "role": "FLEET_MANAGER",
        })
        self.assertEqual(res_reg.status_code, status.HTTP_201_CREATED)

        fm_user = User.objects.get(email="applicant_fm@fleetflow.com")
        otp_rec = fm_user.email_otps.filter(is_used=False).first()

        # Find OTP code from email
        import re
        match = re.search(r"\b(\d{6})\b", mail.outbox[-1].body)
        otp_code = match.group(1) if match else None

        # Verify OTP
        res_ver = self.client.post("/api/auth/verify-otp/", {
            "email": "applicant_fm@fleetflow.com",
            "otp": otp_code,
        })
        self.assertEqual(res_ver.status_code, status.HTTP_200_OK)
        self.assertIn("waiting for Admin approval", res_ver.data["message"])

        fm_user.refresh_from_db()
        self.assertTrue(fm_user.is_email_verified)
        self.assertEqual(fm_user.approval_status, User.ApprovalStatus.PENDING)

        # Admin received in-app notification
        admin_notifications = Notification.objects.filter(user=admin, type=Notification.NotificationType.SYSTEM)
        self.assertTrue(admin_notifications.filter(title="New Fleet Manager Request").exists())

        # Login is blocked with APPROVAL_PENDING
        res_login_blocked = self.client.post("/api/auth/login/", {
            "email": "applicant_fm@fleetflow.com",
            "password": "Password123!",
        })
        self.assertEqual(res_login_blocked.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(res_login_blocked.data["code"], "APPROVAL_PENDING")

        # Admin approves
        self.client.force_authenticate(user=admin)
        res_appr = self.client.post(f"/api/auth/approvals/{fm_user.id}/approve/")
        self.assertEqual(res_appr.status_code, status.HTTP_200_OK)

        fm_user.refresh_from_db()
        self.assertEqual(fm_user.approval_status, User.ApprovalStatus.APPROVED)
        self.assertEqual(fm_user.approved_by, admin)

        # User got notification
        fm_notifications = Notification.objects.filter(user=fm_user, title="Registration Approved")
        self.assertTrue(fm_notifications.exists())

        # Login now succeeds
        self.client.logout()
        res_login_ok = self.client.post("/api/auth/login/", {
            "email": "applicant_fm@fleetflow.com",
            "password": "Password123!",
        })
        self.assertEqual(res_login_ok.status_code, status.HTTP_200_OK)

    # 6. Driver: register, verify, Fleet Manager gets a notification, Fleet Manager approves, Driver profile becomes ACTIVE, login works
    def test_driver_registration_and_approval_flow(self):
        fm = User.objects.create_user(
            email="station_manager@fleetflow.com",
            password="Password123!",
            full_name="Station Manager",
            role=User.Role.FLEET_MANAGER,
            is_email_verified=True,
            approval_status=User.ApprovalStatus.APPROVED,
        )

        res_reg = self.client.post("/api/auth/register/", {
            "email": "applicant_driver@fleetflow.com",
            "full_name": "Applicant Driver",
            "phone": "+919444444444",
            "password": "Password123!",
            "role": "DRIVER",
            "license_number": "AP05-DRV-9999",
            "license_expiry": (date.today() + timedelta(days=300)).isoformat(),
        })
        self.assertEqual(res_reg.status_code, status.HTTP_201_CREATED)

        driver_user = User.objects.get(email="applicant_driver@fleetflow.com")
        self.assertTrue(hasattr(driver_user, "driver_profile"))
        self.assertEqual(driver_user.driver_profile.status, "INACTIVE")

        # Verify OTP
        import re
        match = re.search(r"\b(\d{6})\b", mail.outbox[-1].body)
        otp_code = match.group(1) if match else None

        res_ver = self.client.post("/api/auth/verify-otp/", {
            "email": "applicant_driver@fleetflow.com",
            "otp": otp_code,
        })
        self.assertEqual(res_ver.status_code, status.HTTP_200_OK)
        self.assertIn("waiting for Fleet Manager approval", res_ver.data["message"])

        # FM received notification
        fm_notifications = Notification.objects.filter(user=fm, title="New Driver Request")
        self.assertTrue(fm_notifications.exists())

        # Fleet Manager approves Driver
        self.client.force_authenticate(user=fm)
        res_appr = self.client.post(f"/api/auth/approvals/{driver_user.id}/approve/")
        self.assertEqual(res_appr.status_code, status.HTTP_200_OK)

        driver_user.refresh_from_db()
        self.assertEqual(driver_user.approval_status, User.ApprovalStatus.APPROVED)
        self.assertEqual(driver_user.driver_profile.status, "ACTIVE")

        # Driver can now login
        self.client.logout()
        res_login_ok = self.client.post("/api/auth/login/", {
            "email": "applicant_driver@fleetflow.com",
            "password": "Password123!",
        })
        self.assertEqual(res_login_ok.status_code, status.HTTP_200_OK)

    # 7. Fleet Manager cannot approve a Fleet Manager request (403), a Customer cannot call approvals (403)
    def test_approval_permissions(self):
        fm = User.objects.create_user(
            email="fm_perm@fleetflow.com",
            password="Password123!",
            full_name="FM Perm",
            role=User.Role.FLEET_MANAGER,
            is_email_verified=True,
            approval_status=User.ApprovalStatus.APPROVED,
        )
        customer = User.objects.create_user(
            email="cust_perm@fleetflow.com",
            password="Password123!",
            full_name="Cust Perm",
            role=User.Role.CUSTOMER,
            is_email_verified=True,
            approval_status=User.ApprovalStatus.APPROVED,
        )
        target_fm = User.objects.create_user(
            email="target_fm@fleetflow.com",
            password="Password123!",
            full_name="Target FM",
            role=User.Role.FLEET_MANAGER,
            is_email_verified=True,
            approval_status=User.ApprovalStatus.PENDING,
        )

        # Customer gets 403 on approvals list
        self.client.force_authenticate(user=customer)
        res_list = self.client.get("/api/auth/approvals/")
        self.assertEqual(res_list.status_code, status.HTTP_403_FORBIDDEN)

        # FM cannot approve another FM request (403)
        self.client.force_authenticate(user=fm)
        res_fm_appr = self.client.post(f"/api/auth/approvals/{target_fm.id}/approve/")
        self.assertEqual(res_fm_appr.status_code, status.HTTP_403_FORBIDDEN)

    # 8. Reject with a reason works and login shows the reason
    def test_reject_request_with_reason_and_login_error(self):
        admin = User.objects.create_superuser(
            email="admin_rejector@fleetflow.com",
            password="Password123!",
            full_name="Admin Rejector",
        )
        target_fm = User.objects.create_user(
            email="rejected_fm@fleetflow.com",
            password="Password123!",
            full_name="Rejected FM",
            role=User.Role.FLEET_MANAGER,
            is_email_verified=True,
            approval_status=User.ApprovalStatus.PENDING,
        )

        self.client.force_authenticate(user=admin)
        res_rej = self.client.post(f"/api/auth/approvals/{target_fm.id}/reject/", {
            "reason": "Incomplete verification documents provided."
        })
        self.assertEqual(res_rej.status_code, status.HTTP_200_OK)

        target_fm.refresh_from_db()
        self.assertEqual(target_fm.approval_status, User.ApprovalStatus.REJECTED)
        self.assertEqual(target_fm.rejection_reason, "Incomplete verification documents provided.")

        # Login shows the reason
        self.client.logout()
        res_login_rej = self.client.post("/api/auth/login/", {
            "email": "rejected_fm@fleetflow.com",
            "password": "Password123!",
        })
        self.assertEqual(res_login_rej.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(res_login_rej.data["code"], "APPROVAL_REJECTED")
        self.assertIn("Incomplete verification documents provided.", res_login_rej.data["detail"])

    # 9. Old users and the superuser can still login
    def test_old_users_and_superuser_can_still_login(self):
        # Create an existing user simulating pre-migration state with True/APPROVED
        old_user = User.objects.create_user(
            email="olduser@fleetflow.com",
            password="Password123!",
            full_name="Old User",
            role=User.Role.CUSTOMER,
            is_email_verified=True,
            approval_status=User.ApprovalStatus.APPROVED,
        )
        superuser = User.objects.create_superuser(
            email="oldsup@fleetflow.com",
            password="Password123!",
            full_name="Old Superuser",
        )

        res_old = self.client.post("/api/auth/login/", {
            "email": "olduser@fleetflow.com",
            "password": "Password123!",
        })
        self.assertEqual(res_old.status_code, status.HTTP_200_OK)
        self.assertIn("access", res_old.data)

        res_sup = self.client.post("/api/auth/login/", {
            "email": "oldsup@fleetflow.com",
            "password": "Password123!",
        })
        self.assertEqual(res_sup.status_code, status.HTTP_200_OK)
        self.assertIn("access", res_sup.data)

    # 10. Fake or invalid emails are rejected and DNS cases are verified with mocks
    def test_fake_or_invalid_email_rejected_on_registration(self):
        # Case 1: Valid MX -> allowed
        self.mock_dns_resolve.side_effect = None
        self.mock_dns_resolve.return_value = [MagicMock()]
        self.assertEqual(validate_real_email("user@validmx.com"), "user@validmx.com")

        # Case 2: Only A record (No MX, but A record resolves) -> allowed
        def only_a_side_effect(qname, rdtype, **kwargs):
            if rdtype == "MX":
                raise dns.resolver.NoAnswer()
            return [MagicMock()]

        self.mock_dns_resolve.side_effect = only_a_side_effect
        self.assertEqual(validate_real_email("user@onlyarecord.com"), "user@onlyarecord.com")

        # Case 3: NXDOMAIN -> blocked
        self.mock_dns_resolve.side_effect = dns.resolver.NXDOMAIN()
        with self.assertRaises(ValidationError) as ctx_nx:
            validate_real_email("test@nonexistentfakeemaildomain98765.com")
        self.assertIn("does not exist", ctx_nx.exception.message)

        res_fake_domain = self.client.post("/api/auth/register/", {
            "email": "test@nonexistentfakeemaildomain98765.com",
            "full_name": "Test User",
            "phone": "+919555555553",
            "password": "Password123!",
            "role": "CUSTOMER",
        })
        self.assertEqual(res_fake_domain.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("does not exist", str(res_fake_domain.data))

        # Case 4: Timeout or network error -> allowed (rely on OTP verification)
        self.mock_dns_resolve.side_effect = dns.resolver.LifetimeTimeout()
        self.assertEqual(validate_real_email("user@timeoutdomain.com"), "user@timeoutdomain.com")

        # Case 5: Disposable / temporary email domain -> blocked
        self.mock_dns_resolve.side_effect = None
        self.mock_dns_resolve.return_value = [MagicMock()]
        with self.assertRaises(ValidationError) as ctx_disp:
            validate_real_email("test@mailinator.com")
        self.assertIn("Temporary or disposable email", ctx_disp.exception.message)

        res_disposable = self.client.post("/api/auth/register/", {
            "email": "test@mailinator.com",
            "full_name": "Test User",
            "phone": "+919555555552",
            "password": "Password123!",
            "role": "CUSTOMER",
        })
        self.assertEqual(res_disposable.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("Temporary or disposable email", str(res_disposable.data))

        # Case 6: Wrong / invalid email format -> blocked
        with self.assertRaises(ValidationError):
            validate_real_email("notanemail")
        with self.assertRaises(ValidationError):
            validate_real_email("user@invalid")

        res_bad_fmt = self.client.post("/api/auth/register/", {
            "email": "notanemail",
            "full_name": "Test User",
            "phone": "+919555555551",
            "password": "Password123!",
            "role": "CUSTOMER",
        })
        self.assertEqual(res_bad_fmt.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("email", res_bad_fmt.data)


class LogoutAndBlacklistTests(APITestCase):
    def setUp(self):
        super().setUp()
        self.user = User.objects.create_user(
            email="logoutuser@example.com",
            full_name="Logout User",
            password="SecurePassword123!",
            role=User.Role.CUSTOMER,
            is_email_verified=True,
            approval_status=User.ApprovalStatus.APPROVED,
        )

    def test_logout_blacklists_refresh_token(self):
        # 1. Login to get access & refresh tokens
        login_res = self.client.post("/api/auth/login/", {
            "email": "logoutuser@example.com",
            "password": "SecurePassword123!",
        })
        self.assertEqual(login_res.status_code, status.HTTP_200_OK)
        refresh_token = login_res.data["refresh"]
        access_token = login_res.data["access"]

        # 2. Authenticate client and call POST /api/auth/logout/
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access_token}")
        logout_res = self.client.post("/api/auth/logout/", {"refresh": refresh_token})
        self.assertEqual(logout_res.status_code, status.HTTP_200_OK)
        self.assertEqual(logout_res.data["message"], "Logged out successfully.")

        # 3. Test: Blacklisted refresh token CANNOT get a new access token
        refresh_res = self.client.post("/api/auth/token/refresh/", {"refresh": refresh_token})
        self.assertEqual(refresh_res.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_logout_with_invalid_or_already_blacklisted_token_returns_200(self):
        login_res = self.client.post("/api/auth/login/", {
            "email": "logoutuser@example.com",
            "password": "SecurePassword123!",
        })
        access_token = login_res.data["access"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access_token}")

        # Call with garbage token -> must return 200
        res = self.client.post("/api/auth/logout/", {"refresh": "invalid_or_garbage_token"})
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        # Call with empty body -> must return 200
        res_empty = self.client.post("/api/auth/logout/", {})
        self.assertEqual(res_empty.status_code, status.HTTP_200_OK)

    @patch("dns.resolver.Resolver.resolve")
    def test_check_email_endpoint(self, mock_resolve):
        mock_resolve.return_value = [MagicMock()]

        # Valid email
        res_valid = self.client.post("/api/auth/check-email/", {"email": "validuser@example.com"})
        self.assertEqual(res_valid.status_code, status.HTTP_200_OK)
        self.assertTrue(res_valid.data["valid"])

        # Disposable domain email
        res_disp = self.client.post("/api/auth/check-email/", {"email": "user@mailinator.com"})
        self.assertEqual(res_disp.status_code, status.HTTP_200_OK)
        self.assertFalse(res_disp.data["valid"])
        self.assertIn("message", res_disp.data)

        # Non-existent domain (NXDOMAIN)
        mock_resolve.side_effect = dns.resolver.NXDOMAIN()
        res_nx = self.client.post("/api/auth/check-email/", {"email": "user@nonexistentdomain12345.com"})
        self.assertEqual(res_nx.status_code, status.HTTP_200_OK)
        self.assertFalse(res_nx.data["valid"])
        self.assertIn("message", res_nx.data)

        # Invalid format
        res_fmt = self.client.post("/api/auth/check-email/", {"email": "not-an-email"})
        self.assertEqual(res_fmt.status_code, status.HTTP_200_OK)
        self.assertFalse(res_fmt.data["valid"])


class ResendDecisionEmailTests(APITestCase):
    def setUp(self):
        super().setUp()
        self.admin = User.objects.create_superuser(
            email="resend_admin@example.com",
            full_name="Admin Resend",
            password="AdminPassword123!",
            is_email_verified=True,
            approval_status=User.ApprovalStatus.APPROVED,
        )
        self.manager = User.objects.create_user(
            email="resend_fm@example.com",
            full_name="Manager Resend",
            password="ManagerPassword123!",
            role=User.Role.FLEET_MANAGER,
            is_email_verified=True,
            approval_status=User.ApprovalStatus.APPROVED,
        )
        self.customer = User.objects.create_user(
            email="resend_cust@example.com",
            full_name="Customer Resend",
            password="CustomerPassword123!",
            role=User.Role.CUSTOMER,
            is_email_verified=True,
            approval_status=User.ApprovalStatus.APPROVED,
        )
        self.approved_fm = User.objects.create_user(
            email="approved_fm@example.com",
            full_name="Approved FM",
            password="Password123!",
            role=User.Role.FLEET_MANAGER,
            is_email_verified=True,
            approval_status=User.ApprovalStatus.APPROVED,
        )
        self.rejected_driver = User.objects.create_user(
            email="rejected_driver@example.com",
            full_name="Rejected Driver",
            password="Password123!",
            role=User.Role.DRIVER,
            is_email_verified=True,
            approval_status=User.ApprovalStatus.REJECTED,
            rejection_reason="Invalid driver license document.",
        )
        self.pending_driver = User.objects.create_user(
            email="pending_driver@example.com",
            full_name="Pending Driver",
            password="Password123!",
            role=User.Role.DRIVER,
            is_email_verified=True,
            approval_status=User.ApprovalStatus.PENDING,
        )

    @patch("accounts.views.send_approval_email")
    def test_admin_resend_approval_email(self, mock_send_approval):
        mock_send_approval.return_value = True
        self.client.force_authenticate(user=self.admin)
        res = self.client.post(f"/api/auth/approvals/{self.approved_fm.id}/resend-decision-email/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        mock_send_approval.assert_called_once_with(self.approved_fm)

    @patch("accounts.views.send_rejection_email")
    def test_admin_resend_rejection_email(self, mock_send_rejection):
        mock_send_rejection.return_value = True
        self.client.force_authenticate(user=self.admin)
        res = self.client.post(f"/api/auth/approvals/{self.rejected_driver.id}/resend-decision-email/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        mock_send_rejection.assert_called_once_with(self.rejected_driver, "Invalid driver license document.")

    @patch("accounts.views.send_rejection_email")
    def test_manager_resend_driver_decision_email(self, mock_send_rejection):
        mock_send_rejection.return_value = True
        self.client.force_authenticate(user=self.manager)
        res = self.client.post(f"/api/auth/approvals/{self.rejected_driver.id}/resend-decision-email/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        mock_send_rejection.assert_called_once()

    def test_manager_cannot_resend_fleet_manager_email(self):
        self.client.force_authenticate(user=self.manager)
        res = self.client.post(f"/api/auth/approvals/{self.approved_fm.id}/resend-decision-email/")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_resend_decision_email_for_pending_account_fails(self):
        self.client.force_authenticate(user=self.admin)
        res = self.client.post(f"/api/auth/approvals/{self.pending_driver.id}/resend-decision-email/")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_customer_cannot_resend_decision_email(self):
        self.client.force_authenticate(user=self.customer)
        res = self.client.post(f"/api/auth/approvals/{self.approved_fm.id}/resend-decision-email/")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)




