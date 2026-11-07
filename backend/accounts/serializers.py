import logging
from datetime import date
from django.contrib.auth import authenticate
from django.contrib.auth.password_validation import validate_password
from django.db import models, transaction
from django.db.models import Q
from rest_framework import serializers
from .models import User, EmailOTP, PasswordResetSession, PasswordResetToken
from .phone_validation import validate_and_normalize_phone, get_phone_lookup_candidates

sec_logger = logging.getLogger("fleetflow.security")


class UserSerializer(serializers.ModelSerializer):
    """Serializer for User representation."""

    class Meta:
        model = User
        fields = [
            "id",
            "full_name",
            "email",
            "phone",
            "role",
            "is_active",
            "is_email_verified",
            "approval_status",
            "rejection_reason",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "role",
            "is_active",
            "is_email_verified",
            "approval_status",
            "rejection_reason",
            "created_at",
            "updated_at",
        ]


class RegisterSerializer(serializers.Serializer):
    """Serializer for public user registration across allowed roles."""

    full_name = serializers.CharField(max_length=150, required=True)
    email = serializers.EmailField(required=True)
    phone = serializers.CharField(max_length=20, required=False, allow_blank=True, allow_null=True)
    password = serializers.CharField(write_only=True, required=True, min_length=6)
    role = serializers.ChoiceField(choices=User.Role.choices, default=User.Role.CUSTOMER)

    # Driver-specific fields
    license_number = serializers.CharField(max_length=50, required=False, allow_blank=True)
    license_expiry = serializers.DateField(required=False, allow_null=True)

    def validate_email(self, value):
        from .email_validation import validate_real_email
        from django.core.exceptions import ValidationError as DjangoValidationError

        try:
            normalized = validate_real_email(value)
        except DjangoValidationError as err:
            raise serializers.ValidationError(err.message)

        if User.objects.filter(email__iexact=normalized).exists():
            raise serializers.ValidationError("A user with this email already exists.")
        return normalized

    def validate_phone(self, value):
        return validate_and_normalize_phone(value)

    def validate(self, attrs):
        role = attrs.get("role", User.Role.CUSTOMER)
        phone = attrs.get("phone")

        # Phone is required for Driver and Fleet Manager roles on Register, optional for Customers
        if role in (User.Role.DRIVER, User.Role.FLEET_MANAGER) and not phone:
            raise serializers.ValidationError({"phone": "Phone number is required for Driver and Fleet Manager registration."})

        # Check ADMIN restriction
        if role == User.Role.ADMIN:
            # Check if any active Admin already exists
            if User.objects.filter(role=User.Role.ADMIN, is_active=True).exists():
                raise serializers.ValidationError({"role": "Admin registration is not allowed because an admin account already exists."})

        # Check DRIVER requirements
        if role == User.Role.DRIVER:
            lic_num = attrs.get("license_number")
            lic_exp = attrs.get("license_expiry")
            if not lic_num:
                raise serializers.ValidationError({"license_number": "License number is required for Driver registration."})
            if not lic_exp:
                raise serializers.ValidationError({"license_expiry": "License expiry date is required for Driver registration."})
            if lic_exp < date.today():
                raise serializers.ValidationError({"license_expiry": "Driver license expiry date must not be in the past."})

            from drivers.models import Driver
            if Driver.objects.filter(license_number=lic_num).exists():
                raise serializers.ValidationError({"license_number": "A driver with this license number already exists."})

        return attrs


class VerifyOTPSerializer(serializers.Serializer):
    """Serializer for verifying 6-digit email OTP."""

    email = serializers.EmailField(required=True)
    otp = serializers.CharField(required=True, min_length=6, max_length=6)

    def validate_email(self, value):
        return value.lower()


class ResendOTPSerializer(serializers.Serializer):
    """Serializer for resending email OTP."""

    email = serializers.EmailField(required=True)

    def validate_email(self, value):
        return value.lower()


class ApprovalActionSerializer(serializers.Serializer):
    """Serializer for rejecting a user request with a required reason."""

    reason = serializers.CharField(required=True, allow_blank=False)



class LoginSerializer(serializers.Serializer):
    """Serializer for authentication via email OR phone + password."""

    identifier = serializers.CharField(
        help_text="Registered email address or phone number",
        required=False,
    )
    email = serializers.CharField(
        help_text="Registered email address",
        required=False,
    )
    password = serializers.CharField(
        write_only=True,
        required=True,
    )

    def validate(self, attrs):
        raw_identifier = attrs.get("identifier") or attrs.get("email")
        if not raw_identifier:
            raise serializers.ValidationError("Email or phone number is required.")
        identifier = raw_identifier.strip()
        password = attrs.get("password")

        # Find user by email (case-insensitive) or phone in any accepted format
        candidates = get_phone_lookup_candidates(identifier)
        user = User.objects.filter(
            Q(email__iexact=identifier) | Q(phone__in=candidates)
        ).first()

        if not user or not user.check_password(password):
            sec_logger.warning(f"Failed login attempt for identifier: {identifier}")
            raise serializers.ValidationError("Invalid email/phone or password.")

        if not user.is_active and user.approval_status not in [
            User.ApprovalStatus.PENDING,
            User.ApprovalStatus.REJECTED,
        ]:
            raise serializers.ValidationError("Invalid email/phone or password.")

        attrs["user"] = user
        return attrs


class ForgotPasswordSerializer(serializers.Serializer):
    """Serializer to request password reset OTP code."""

    email = serializers.EmailField(required=True)

    def validate_email(self, value):
        return value.lower().strip()


class VerifyResetOTPSerializer(serializers.Serializer):
    """Serializer to verify password reset OTP code."""

    email = serializers.EmailField(required=True)
    otp = serializers.CharField(required=True, min_length=6, max_length=6)

    def validate_email(self, value):
        return value.lower().strip()

    def validate_otp(self, value):
        v = value.strip()
        if not v.isdigit() or len(v) != 6:
            raise serializers.ValidationError("OTP must be a 6-digit number.")
        return v


class ResetPasswordConfirmSerializer(serializers.Serializer):
    """Serializer to reset password using short-lived reset session token."""

    reset_token = serializers.CharField(required=True)
    new_password = serializers.CharField(required=True, min_length=6, write_only=True)
    confirm_password = serializers.CharField(required=True, min_length=6, write_only=True)

    def validate(self, attrs):
        new_password = attrs.get("new_password")
        confirm_password = attrs.get("confirm_password")
        reset_token = attrs.get("reset_token", "").strip()

        if new_password != confirm_password:
            raise serializers.ValidationError({"confirm_password": "Passwords do not match."})

        # Validate token against PasswordResetSession using hash
        token_hash = PasswordResetSession.hash_token(reset_token)
        try:
            session = PasswordResetSession.objects.get(token_hash=token_hash)
        except PasswordResetSession.DoesNotExist:
            raise serializers.ValidationError({"reset_token": "Invalid or expired reset token."})

        if not session.is_valid():
            raise serializers.ValidationError({"reset_token": "Reset token has already been used or has expired."})

        user = session.user

        # Password rules validation:
        # 1. Complexity (Django auth password validators)
        from django.core.exceptions import ValidationError as DjangoValidationError
        try:
            validate_password(new_password, user=user)
        except DjangoValidationError as exc:
            raise serializers.ValidationError({"new_password": list(exc.messages)})

        # 2. Cannot equal old password
        if user.check_password(new_password):
            raise serializers.ValidationError({"new_password": "New password cannot be the same as your current password."})

        # 3. Cannot contain email
        email_local = user.email.split("@")[0].lower()
        if email_local and email_local in new_password.lower():
            raise serializers.ValidationError({"new_password": "Password cannot contain parts of your email address."})
        if user.email.lower() in new_password.lower():
            raise serializers.ValidationError({"new_password": "Password cannot contain your email address."})

        attrs["session"] = session
        attrs["user"] = user
        return attrs


class ResetPasswordSerializer(serializers.Serializer):
    """Deprecated: Legacy serializer for link-based reset."""

    token = serializers.CharField(required=True)
    new_password = serializers.CharField(required=True, min_length=6, write_only=True)
    confirm_password = serializers.CharField(required=True, min_length=6, write_only=True)

    def validate(self, attrs):
        raise serializers.ValidationError({
            "detail": "Email-link password reset is no longer supported. Please request a password reset code."
        })


class UserProfileSerializer(serializers.ModelSerializer):
    """Serializer to view and update user profile."""

    class Meta:
        model = User
        fields = ["id", "full_name", "email", "phone", "role", "is_email_verified", "approval_status", "created_at", "updated_at"]
        read_only_fields = ["id", "email", "role", "is_email_verified", "approval_status", "created_at", "updated_at"]

    def validate_phone(self, value):
        user = self.instance
        return validate_and_normalize_phone(
            value,
            existing_user_pk=user.pk if user else None,
            current_stored_value=user.phone if user else None,
        )


class ChangePasswordSerializer(serializers.Serializer):
    """Serializer to change authenticated user password."""

    old_password = serializers.CharField(required=True, write_only=True)
    new_password = serializers.CharField(required=True, min_length=6, write_only=True)
    confirm_password = serializers.CharField(required=True, min_length=6, write_only=True)

    def validate(self, attrs):
        user = self.context["request"].user
        if not user.check_password(attrs["old_password"]):
            raise serializers.ValidationError({"old_password": "Old password is not correct."})

        if attrs["new_password"] != attrs["confirm_password"]:
            raise serializers.ValidationError({"confirm_password": "New passwords do not match."})

        if attrs["old_password"] == attrs["new_password"]:
            raise serializers.ValidationError({"new_password": "New password cannot be the same as old password."})

        return attrs


class UserAdminCreateSerializer(serializers.ModelSerializer):
    """Serializer for Admin creating a user (ADMIN, FLEET_MANAGER, CUSTOMER)."""

    password = serializers.CharField(write_only=True, required=True, min_length=6)
    name = serializers.CharField(source="full_name", required=False)

    is_active = serializers.BooleanField(default=True, required=False)

    class Meta:
        model = User
        fields = ["id", "full_name", "name", "email", "phone", "role", "password", "is_active", "created_at"]
        read_only_fields = ["id", "created_at"]
        extra_kwargs = {
            "full_name": {"required": False},
        }

    def to_internal_value(self, data):
        data = data.copy() if hasattr(data, "copy") else dict(data)
        if "name" in data and "full_name" not in data:
            data["full_name"] = data["name"]
        return super().to_internal_value(data)

    def validate(self, attrs):
        if not attrs.get("full_name"):
            raise serializers.ValidationError({"name": "Name is required."})
        return attrs

    def validate_role(self, value):
        if value == User.Role.DRIVER:
            raise serializers.ValidationError("Drivers must be created via /api/drivers/ so the driver profile is created.")
        return value

    def validate_email(self, value):
        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError("A user with this email already exists.")
        return value.lower()

    def validate_phone(self, value):
        return validate_and_normalize_phone(value)

    def create(self, validated_data):
        password = validated_data.pop("password")
        validated_data["is_email_verified"] = True
        validated_data["approval_status"] = User.ApprovalStatus.APPROVED
        if validated_data.get("is_active") is None:
            validated_data["is_active"] = True
        return User.objects.create_user(password=password, **validated_data)



class UserAdminUpdateSerializer(serializers.ModelSerializer):
    """Serializer for Admin updating user details, phone, role, is_active."""

    name = serializers.CharField(source="full_name", required=False)
    password = serializers.CharField(required=False, write_only=True, allow_blank=True, min_length=6)

    class Meta:
        model = User
        fields = ["id", "full_name", "name", "email", "phone", "role", "is_active", "password", "created_at", "updated_at"]
        read_only_fields = ["id", "email", "created_at", "updated_at"]
        extra_kwargs = {
            "full_name": {"required": False},
            "phone": {"required": False},
            "role": {"required": False},
            "is_active": {"required": False},
        }

    def to_internal_value(self, data):
        data = data.copy() if hasattr(data, "copy") else dict(data)
        if "name" in data and "full_name" not in data:
            data["full_name"] = data["name"]
        return super().to_internal_value(data)

    def validate_role(self, value):
        if value == User.Role.DRIVER:
            raise serializers.ValidationError("Cannot change user role to DRIVER directly without driver profile.")
        return value

    def validate_phone(self, value):
        user = self.instance
        return validate_and_normalize_phone(
            value,
            existing_user_pk=user.pk if user else None,
            current_stored_value=user.phone if user else None,
        )

    def update(self, instance, validated_data):
        password = validated_data.pop("password", None)
        if password:
            instance.set_password(password)
        return super().update(instance, validated_data)


class LogoutSerializer(serializers.Serializer):
    refresh = serializers.CharField(required=False, allow_blank=True, help_text="Refresh token to blacklist")


class CheckEmailSerializer(serializers.Serializer):
    email = serializers.CharField(required=True, help_text="Email address to validate")



