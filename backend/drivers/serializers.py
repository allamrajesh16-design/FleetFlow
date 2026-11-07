from datetime import date
from django.db import transaction
from rest_framework import serializers

from accounts.models import User
from accounts.serializers import UserSerializer
from accounts.phone_validation import validate_and_normalize_phone
from .models import Driver


class DriverSerializer(serializers.ModelSerializer):
    """Serializer for Driver representation."""

    user = UserSerializer(read_only=True)
    has_active_trip = serializers.SerializerMethodField()

    class Meta:
        model = Driver
        fields = [
            "id",
            "user",
            "license_number",
            "license_expiry",
            "status",
            "has_active_trip",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "has_active_trip", "created_at", "updated_at"]

    def get_has_active_trip(self, obj) -> bool:
        return obj.trips.filter(status__in=["SCHEDULED", "IN_PROGRESS"]).exists()


class DriverCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating Driver and associated User (role DRIVER) together."""

    full_name = serializers.CharField(max_length=150, write_only=True)
    email = serializers.EmailField(write_only=True)
    phone = serializers.CharField(max_length=20, required=False, allow_blank=True, allow_null=True, write_only=True)
    password = serializers.CharField(min_length=6, write_only=True)

    class Meta:
        model = Driver
        fields = [
            "id",
            "full_name",
            "email",
            "phone",
            "password",
            "license_number",
            "license_expiry",
            "status",
        ]
        read_only_fields = ["id"]

    def validate_email(self, value):
        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError("A user with this email already exists.")
        return value.lower()

    def validate_phone(self, value):
        return validate_and_normalize_phone(value)

    def validate_license_number(self, value):
        if Driver.objects.filter(license_number__iexact=value).exists():
            raise serializers.ValidationError("A driver with this license number already exists.")
        return value.upper()

    def validate_license_expiry(self, value):
        if value < date.today():
            raise serializers.ValidationError("Driver license expiry date must not be in the past.")
        return value

    def create(self, validated_data):
        full_name = validated_data.pop("full_name")
        email = validated_data.pop("email")
        phone = validated_data.pop("phone", None)
        password = validated_data.pop("password")

        with transaction.atomic():
            user = User.objects.create_user(
                email=email,
                password=password,
                full_name=full_name,
                phone=phone,
                role=User.Role.DRIVER,
                is_email_verified=True,
                approval_status=User.ApprovalStatus.APPROVED,
            )
            driver = Driver.objects.create(user=user, **validated_data)
        return driver

    def to_representation(self, instance):
        return DriverSerializer(instance, context=self.context).data


class DriverUpdateSerializer(serializers.ModelSerializer):
    """Serializer for updating Driver profile and linked User information."""

    full_name = serializers.CharField(max_length=150, required=False)
    email = serializers.EmailField(required=False)
    phone = serializers.CharField(max_length=20, required=False, allow_blank=True, allow_null=True)

    class Meta:
        model = Driver
        fields = [
            "full_name",
            "email",
            "phone",
            "license_number",
            "license_expiry",
            "status",
        ]

    def validate_email(self, value):
        driver = self.instance
        if User.objects.filter(email__iexact=value).exclude(pk=driver.user.pk).exists():
            raise serializers.ValidationError("A user with this email already exists.")
        return value.lower()

    def validate_phone(self, value):
        driver = self.instance
        user = driver.user if driver else None
        return validate_and_normalize_phone(
            value,
            existing_user_pk=user.pk if user else None,
            current_stored_value=user.phone if user else None,
        )

    def validate_license_number(self, value):
        driver = self.instance
        if Driver.objects.filter(license_number__iexact=value).exclude(pk=driver.pk).exists():
            raise serializers.ValidationError("A driver with this license number already exists.")
        return value.upper()

    def validate_license_expiry(self, value):
        if value < date.today():
            raise serializers.ValidationError("Driver license expiry date must not be in the past.")
        return value

    def update(self, instance, validated_data):
        user = instance.user
        user_modified = False

        if "full_name" in validated_data:
            user.full_name = validated_data.pop("full_name")
            user_modified = True
        if "email" in validated_data:
            user.email = validated_data.pop("email")
            user_modified = True
        if "phone" in validated_data:
            user.phone = validated_data.pop("phone")
            user_modified = True

        if user_modified:
            user.save()

        return super().update(instance, validated_data)

    def to_representation(self, instance):
        return DriverSerializer(instance, context=self.context).data
