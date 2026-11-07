from django.test import TestCase
from rest_framework.exceptions import ValidationError
from accounts.models import User
from accounts.phone_validation import (
    clean_indian_phone,
    validate_and_normalize_phone,
    get_phone_lookup_candidates,
)
from accounts.serializers import (
    RegisterSerializer,
    LoginSerializer,
    UserProfileSerializer,
    UserAdminCreateSerializer,
    UserAdminUpdateSerializer,
)


class PhoneValidationTests(TestCase):
    def setUp(self):
        self.user1 = User.objects.create_user(
            email="existing_user@fleetflow.com",
            phone="+919876543210",
            full_name="Existing User",
            role=User.Role.CUSTOMER,
            is_email_verified=True,
        )

    def test_valid_numbers_all_accepted_formats(self):
        # 10 digits starting with 6, 7, 8, 9
        self.assertEqual(clean_indian_phone("9876543210"), "9876543210")
        self.assertEqual(clean_indian_phone("+919876543210"), "9876543210")
        self.assertEqual(clean_indian_phone("919876543210"), "9876543210")
        self.assertEqual(clean_indian_phone("09876543210"), "9876543210")
        self.assertEqual(clean_indian_phone("+91 98765 43210"), "9876543210")
        self.assertEqual(clean_indian_phone("98765-43210"), "9876543210")
        self.assertEqual(clean_indian_phone("6123456789"), "6123456789")
        self.assertEqual(clean_indian_phone("7123456789"), "7123456789")
        self.assertEqual(clean_indian_phone("8123456789"), "8123456789")

    def test_invalid_too_short(self):
        with self.assertRaises(ValidationError):
            clean_indian_phone("987654321")

    def test_invalid_too_long(self):
        with self.assertRaises(ValidationError):
            clean_indian_phone("98765432101")

    def test_invalid_starts_with_1_to_5(self):
        for start_digit in ("1", "2", "3", "4", "5"):
            with self.assertRaises(ValidationError):
                clean_indian_phone(f"{start_digit}876543210")

    def test_invalid_letters_or_symbols(self):
        with self.assertRaises(ValidationError):
            clean_indian_phone("98765abcde")
        with self.assertRaises(ValidationError):
            clean_indian_phone("98765@4321")

    def test_invalid_repeated_digits(self):
        with self.assertRaises(ValidationError):
            clean_indian_phone("9999999999")
        with self.assertRaises(ValidationError):
            clean_indian_phone("0000000000")
        with self.assertRaises(ValidationError):
            clean_indian_phone("8888888888")

    def test_normalizing_to_plus_91(self):
        normalized = validate_and_normalize_phone("9876543219")
        self.assertEqual(normalized, "+919876543219")

        normalized2 = validate_and_normalize_phone("09876543219")
        self.assertEqual(normalized2, "+919876543219")

        normalized3 = validate_and_normalize_phone("91 98765-43219")
        self.assertEqual(normalized3, "+919876543219")

    def test_duplicate_phone_returns_exact_message(self):
        with self.assertRaises(ValidationError) as ctx:
            validate_and_normalize_phone("9876543210")
        self.assertIn("This mobile number is already registered", str(ctx.exception))

    def test_login_by_phone_in_accepted_formats(self):
        self.user1.set_password("Secret@123")
        self.user1.save()

        # Login with +91 format
        s1 = LoginSerializer(data={"identifier": "+919876543210", "password": "Secret@123"})
        self.assertTrue(s1.is_valid())
        self.assertEqual(s1.validated_data["user"], self.user1)

        # Login with 10 digits
        s2 = LoginSerializer(data={"identifier": "9876543210", "password": "Secret@123"})
        self.assertTrue(s2.is_valid())
        self.assertEqual(s2.validated_data["user"], self.user1)

        # Login with spaces and 91
        s3 = LoginSerializer(data={"identifier": "91 98765 43210", "password": "Secret@123"})
        self.assertTrue(s3.is_valid())
        self.assertEqual(s3.validated_data["user"], self.user1)

        # Login with 0 prefix
        s4 = LoginSerializer(data={"identifier": "09876543210", "password": "Secret@123"})
        self.assertTrue(s4.is_valid())
        self.assertEqual(s4.validated_data["user"], self.user1)

    def test_old_invalid_number_does_not_block_unrelated_profile_update(self):
        # Create user with an old invalid phone format (e.g. 1234567890)
        old_user = User.objects.create_user(
            email="old_user@fleetflow.com",
            phone="1234567890",
            full_name="Old User",
            role=User.Role.CUSTOMER,
            is_email_verified=True,
        )

        # Update full_name without changing phone
        serializer = UserProfileSerializer(
            instance=old_user,
            data={"full_name": "Updated Name"},
            partial=True,
        )
        self.assertTrue(serializer.is_valid(), serializer.errors)
        updated = serializer.save()
        self.assertEqual(updated.full_name, "Updated Name")
        self.assertEqual(updated.phone, "1234567890")

    def test_register_role_requirement(self):
        # Customer without phone is allowed
        s_cust = RegisterSerializer(data={
            "full_name": "Cust Person",
            "email": "cust_new@fleetflow.com",
            "password": "Password@123",
            "role": User.Role.CUSTOMER,
        })
        self.assertTrue(s_cust.is_valid(), s_cust.errors)

        # Driver without phone is rejected
        s_driver = RegisterSerializer(data={
            "full_name": "Driver Person",
            "email": "driver_new@fleetflow.com",
            "password": "Password@123",
            "role": User.Role.DRIVER,
            "license_number": "AP05-2026-999",
            "license_expiry": "2030-01-01",
        })
        self.assertFalse(s_driver.is_valid())
        self.assertIn("phone", s_driver.errors)

        # Fleet Manager without phone is rejected
        s_mgr = RegisterSerializer(data={
            "full_name": "Manager Person",
            "email": "mgr_new@fleetflow.com",
            "password": "Password@123",
            "role": User.Role.FLEET_MANAGER,
        })
        self.assertFalse(s_mgr.is_valid())
        self.assertIn("phone", s_mgr.errors)
