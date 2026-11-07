from decimal import Decimal
from django.utils import timezone
from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from accounts.models import User
from core.upload_security import validate_private_document_file
from trips.models import Trip
from vehicles.models import Vehicle

from .models import Expense


class ExpenseSerializer(serializers.ModelSerializer):
    vehicle_registration = serializers.CharField(source="vehicle.registration_number", read_only=True)
    submitted_by_name = serializers.CharField(source="submitted_by.full_name", read_only=True)
    reviewed_by_name = serializers.CharField(source="reviewed_by.full_name", read_only=True)
    has_receipt = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = Expense
        fields = [
            "id",
            "category",
            "vehicle",
            "vehicle_registration",
            "trip",
            "amount",
            "date",
            "description",
            "receipt_image",
            "has_receipt",
            "status",
            "submitted_by",
            "submitted_by_name",
            "reviewed_by",
            "reviewed_by_name",
            "reviewed_at",
            "rejection_reason",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "status",
            "submitted_by",
            "reviewed_by",
            "reviewed_at",
            "rejection_reason",
            "created_at",
            "updated_at",
        ]

    @extend_schema_field(serializers.BooleanField)
    def get_has_receipt(self, obj):
        return bool(obj.receipt_image)

    def validate_category(self, value):
        if str(value).upper() == "FUEL":
            raise serializers.ValidationError(
                "Fuel is not an expense category. Please use the Fuel Management module to record fuel."
            )
        return value

    def validate_amount(self, value):
        if value <= 0:
            raise serializers.ValidationError("Expense amount must be greater than zero.")
        return value

    def validate_date(self, value):
        if value > timezone.localdate():
            raise serializers.ValidationError("Expense date cannot be in the future.")
        return value

    def validate_receipt_image(self, value):
        if value:
            validate_private_document_file(value)
        return value

    def validate(self, attrs):
        request = self.context.get("request")
        user = request.user if request else None

        if self.instance and self.instance.status == Expense.Status.APPROVED:
            if user and user.role == User.Role.DRIVER:
                raise serializers.ValidationError("An approved expense cannot be modified by a driver.")

        trip = attrs.get("trip") or (self.instance.trip if self.instance else None)
        vehicle = attrs.get("vehicle") or (self.instance.vehicle if self.instance else None)

        if user and user.role == User.Role.DRIVER:
            driver_profile = getattr(user, "driver_profile", None)
            if not driver_profile:
                raise serializers.ValidationError("Driver profile not found.")

            # Driver expenses must be tied to their own trips
            if not trip and not vehicle:
                raise serializers.ValidationError({"trip": "Drivers must specify a trip or vehicle for expenses."})

            if trip:
                if trip.driver != driver_profile:
                    raise serializers.ValidationError({"trip": "You can only submit expenses for your own assigned trips."})
                if vehicle and trip.vehicle != vehicle:
                    raise serializers.ValidationError({"vehicle": "Selected vehicle does not match the trip's vehicle."})
                if not vehicle:
                    attrs["vehicle"] = trip.vehicle
            elif vehicle:
                # If vehicle supplied without trip, find driver's trip for this vehicle
                driver_trip = Trip.objects.filter(driver=driver_profile, vehicle=vehicle).order_by("-scheduled_datetime").first()
                if not driver_trip:
                    raise serializers.ValidationError({"trip": "You have no trips associated with this vehicle."})
                attrs["trip"] = driver_trip

        return attrs

    def create(self, validated_data):
        request = self.context.get("request")
        user = request.user if request else None

        if user and (user.role in [User.Role.ADMIN, User.Role.FLEET_MANAGER] or user.is_superuser):
            # Expenses created by Admin or Fleet Manager are APPROVED automatically
            validated_data["status"] = Expense.Status.APPROVED
            validated_data["submitted_by"] = user
            validated_data["reviewed_by"] = user
            validated_data["reviewed_at"] = timezone.now()
        else:
            # Expenses created by Driver start as PENDING
            validated_data["status"] = Expense.Status.PENDING
            validated_data["submitted_by"] = user

        return super().create(validated_data)


class ExpenseRejectSerializer(serializers.Serializer):
    reason = serializers.CharField(required=True, min_length=3, help_text="Reason for rejecting the expense.")
