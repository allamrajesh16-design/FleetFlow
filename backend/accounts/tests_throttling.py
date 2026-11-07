from django.core.cache import cache
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import User


class ThrottlingTests(APITestCase):
    """Automated tests for DRF authentication throttling."""

    def setUp(self):
        cache.clear()
        self.user = User.objects.create_user(
            email="throttle_test@example.com",
            password="Password@123",
            full_name="Throttle Tester",
            is_email_verified=True,
            approval_status=User.ApprovalStatus.APPROVED,
        )

    def tearDown(self):
        cache.clear()

    def test_login_throttling_exceeded(self):
        """Verifies that exceeding 10 login requests in a minute returns HTTP 429."""
        url = "/api/auth/login/"
        payload = {"email": "throttle_test@example.com", "password": "WrongPassword@123"}

        for i in range(10):
            resp = self.client.post(url, payload, format="json")
            self.assertIn(resp.status_code, [status.HTTP_400_BAD_REQUEST, status.HTTP_200_OK])

        # 11th request must be throttled
        resp11 = self.client.post(url, payload, format="json")
        self.assertEqual(resp11.status_code, status.HTTP_429_TOO_MANY_REQUESTS)
        self.assertIn("detail", resp11.data)
        self.assertIn("Too many requests", resp11.data["detail"])

    def test_verify_otp_throttling_exceeded(self):
        """Verifies that exceeding 5 OTP verification attempts returns HTTP 429."""
        url = "/api/auth/verify-otp/"
        payload = {"email": "throttle_test@example.com", "otp": "123456"}

        for i in range(5):
            resp = self.client.post(url, payload, format="json")
            self.assertIn(resp.status_code, [status.HTTP_400_BAD_REQUEST, status.HTTP_200_OK, status.HTTP_404_NOT_FOUND])

        # 6th request must be throttled
        resp6 = self.client.post(url, payload, format="json")
        self.assertEqual(resp6.status_code, status.HTTP_429_TOO_MANY_REQUESTS)
        self.assertIn("detail", resp6.data)
        self.assertIn("Too many requests", resp6.data["detail"])
