from django.test import TestCase
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework import status

User = get_user_model()

class ProfileUpdateAPITests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            email="primary@example.com",
            password="StrongPassword123!",
            full_name="Original Name",
            phone="9876543210",
            role=User.Role.CUSTOMER,
            is_email_verified=True,
            approval_status=User.ApprovalStatus.NOT_REQUIRED,
        )
        self.other_user = User.objects.create_user(
            email="other@example.com",
            password="StrongPassword123!",
            full_name="Other User",
            phone="9123456789",
            role=User.Role.DRIVER,
            is_email_verified=True,
            approval_status=User.ApprovalStatus.APPROVED,
        )
        self.client.force_authenticate(user=self.user)

    def test_get_profile_returns_details_without_secrets(self):
        response = self.client.get("/api/auth/profile/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.data
        self.assertEqual(data["email"], "primary@example.com")
        self.assertEqual(data["full_name"], "Original Name")
        self.assertNotIn("password", data)
        self.assertNotIn("token", data)

    def test_valid_profile_update(self):
        response = self.client.patch("/api/auth/profile/", {
            "full_name": "Updated Name",
            "phone": "9988776655"
        })
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertEqual(self.user.full_name, "Updated Name")
        # Validator normalizes to +91 E.164 format
        self.assertEqual(self.user.phone, "+919988776655")

    def test_invalid_phone_rejected(self):
        response = self.client.patch("/api/auth/profile/", {
            "phone": "123"
        })
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("phone", response.data)

    def test_duplicate_phone_rejected(self):
        response = self.client.patch("/api/auth/profile/", {
            "phone": self.other_user.phone
        })
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("phone", response.data)

    def test_attempt_to_change_email_or_role_or_status_ignored_or_rejected(self):
        response = self.client.patch("/api/auth/profile/", {
            "email": "hacked@example.com",
            "role": "ADMIN",
            "approval_status": "APPROVED",
            "full_name": "New Safe Name"
        })
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertEqual(self.user.email, "primary@example.com")
        self.assertEqual(self.user.role, User.Role.CUSTOMER)
        self.assertEqual(self.user.full_name, "New Safe Name")

    def test_another_users_data_cannot_be_changed(self):
        # A user cannot pass another id to change that user's record
        response = self.client.patch("/api/auth/profile/", {
            "id": self.other_user.id,
            "full_name": "Attempt Hack"
        })
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.other_user.refresh_from_db()
        self.assertEqual(self.other_user.full_name, "Other User")
        self.user.refresh_from_db()
        self.assertEqual(self.user.full_name, "Attempt Hack")
