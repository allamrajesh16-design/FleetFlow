from datetime import timedelta
from decimal import Decimal
from django.utils import timezone
from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from accounts.models import User
from core.upload_security import validate_private_document_file
from drivers.models import Driver
from trips.models import Trip
from vehicles.models import Vehicle

from .models import FuelLog


class FuelRejectSerializer(serializers.Serializer):
    rejection_reason = serializers.CharField(required=True, min_length=3)


class FuelLogSerializer(serializers.ModelSerializer):
    mileage_kmpl = serializers.FloatField(read_only=True)
    total_cost = serializers.DecimalField(max_digits=12, decimal_places=2, required=False)
    price_per_unit = serializers.DecimalField(max_digits=10, decimal_places=2, required=False)
    vehicle_registration = serializers.CharField(source="vehicle.registration_number", read_only=True)
    vehicle_name = serializers.SerializerMethodField(read_only=True)
    driver_name = serializers.SerializerMethodField(read_only=True)
    has_receipt = serializers.SerializerMethodField(read_only=True)

    reviewed_by_name = serializers.CharField(source="reviewed_by.full_name", read_only=True)

    class Meta:
        model = FuelLog
        fields = [
            "id",
            "vehicle",
            "vehicle_registration",
            "vehicle_name",
            "trip",
            "driver",
            "driver_name",
            "date",
            "fuel_type",
            "quantity",
            "price_per_unit",
            "total_cost",
            "odometer_km",
            "is_full_tank",
            "station_name",
            "receipt_image",
            "has_receipt",
            "mileage_kmpl",
            "review_status",
            "reviewed_by",
            "reviewed_by_name",
            "reviewed_at",
            "rejection_reason",
            "created_by",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "total_cost",
            "review_status",
            "reviewed_by",
            "reviewed_at",
            "rejection_reason",
            "created_by",
            "created_at",
            "updated_at",
            "mileage_kmpl",
        ]

    @extend_schema_field(serializers.CharField(allow_null=True))
    def get_vehicle_name(self, obj):
        if obj.vehicle:
            return f"{obj.vehicle.brand} {obj.vehicle.model}"
        return None

    @extend_schema_field(serializers.CharField(allow_null=True))
    def get_driver_name(self, obj):
        if obj.driver and obj.driver.user:
            return obj.driver.user.full_name
        return None

    @extend_schema_field(serializers.BooleanField)
    def get_has_receipt(self, obj):
        return bool(obj.receipt_image)

    def validate_quantity(self, value):
        if value <= 0:
            raise serializers.ValidationError("Quantity must be greater than zero.")
        return value

    def validate_price_per_unit(self, value):
        if value <= 0:
            raise serializers.ValidationError("Price per unit must be greater than zero.")
        return value

    def validate_date(self, value):
        if value > timezone.localdate():
            raise serializers.ValidationError("Date cannot be in the future.")
        return value

    def validate_receipt_image(self, value):
        if value:
            validate_private_document_file(value)
        return value

    def validate(self, attrs):
        request = self.context.get("request")
        user = request.user if request else None

        quantity = attrs.get("quantity") or (self.instance.quantity if self.instance else None)
        total_cost = attrs.get("total_cost") or (self.instance.total_cost if self.instance else None)
        price_per_unit = attrs.get("price_per_unit") or (self.instance.price_per_unit if self.instance else None)

        if quantity and total_cost and not price_per_unit:
            attrs["price_per_unit"] = round(Decimal(total_cost) / Decimal(quantity), 2)
        elif quantity and price_per_unit and not total_cost:
            attrs["total_cost"] = round(Decimal(quantity) * Decimal(price_per_unit), 2)
        elif not price_per_unit and not total_cost:
            raise serializers.ValidationError("Either total_cost or price_per_unit must be provided.")

        vehicle = attrs.get("vehicle") or (self.instance.vehicle if self.instance else None)
        odometer_km = attrs.get("odometer_km") if "odometer_km" in attrs else (self.instance.odometer_km if self.instance else None)
        trip = attrs.get("trip") or (self.instance.trip if self.instance else None)

        if not vehicle:
            raise serializers.ValidationError({"vehicle": "Vehicle is required."})

        # Validate odometer progression
        if odometer_km is not None and vehicle:
            last_log_query = FuelLog.objects.filter(vehicle=vehicle)
            if self.instance:
                last_log_query = last_log_query.exclude(pk=self.instance.pk)
            last_log = last_log_query.order_by("-odometer_km").first()
            if last_log and odometer_km < last_log.odometer_km:
                raise serializers.ValidationError({
                    "odometer_km": (
                        f"Odometer reading ({odometer_km} km) must be greater than or equal "
                        f"to the last recorded reading ({last_log.odometer_km} km)."
                    )
                })

        # Driver business rule:
        # A driver can add a fuel log only for a vehicle of their own trip (SCHEDULED, IN_PROGRESS, or COMPLETED within the last 24 hours).
        if user and user.role == User.Role.DRIVER:
            driver_profile = getattr(user, "driver_profile", None)
            if not driver_profile:
                raise serializers.ValidationError("No driver profile associated with this account.")

            attrs["driver"] = driver_profile

            cutoff = timezone.now() - timedelta(hours=24)
            from django.db.models import Q
            eligible_trips = Trip.objects.filter(
                driver=driver_profile,
                vehicle=vehicle,
            ).filter(
                Q(status__in=[Trip.Status.SCHEDULED, Trip.Status.IN_PROGRESS]) |
                Q(status=Trip.Status.COMPLETED, completed_at__gte=cutoff) |
                Q(status=Trip.Status.COMPLETED, completed_at__isnull=True, scheduled_datetime__gte=cutoff)
            )

            if trip:
                if not eligible_trips.filter(pk=trip.pk).exists():
                    raise serializers.ValidationError({
                        "trip": "Drivers can only log fuel for a trip assigned to them that is scheduled, in-progress, or completed within the last 24 hours."
                    })
            else:
                if not eligible_trips.exists():
                    raise serializers.ValidationError({
                        "vehicle": "You can only log fuel for a vehicle assigned to your scheduled, in-progress, or recently completed (last 24 hours) trip."
                    })
                # Auto-link to latest eligible trip if none explicitly provided
                attrs["trip"] = eligible_trips.order_by("-scheduled_datetime").first()

        return attrs

    def create(self, validated_data):
        request = self.context.get("request")
        if request and request.user.is_authenticated:
            validated_data["created_by"] = request.user
            if request.user.role == User.Role.DRIVER and not validated_data.get("driver"):
                validated_data["driver"] = getattr(request.user, "driver_profile", None)

        # Always store the driver from the trip if not provided
        if not validated_data.get("driver") and validated_data.get("trip") and validated_data["trip"].driver:
            validated_data["driver"] = validated_data["trip"].driver

        return super().create(validated_data)
