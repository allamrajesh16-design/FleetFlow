from rest_framework import serializers
from .models import Vehicle


class VehicleSerializer(serializers.ModelSerializer):
    """Serializer for Vehicle model with seating and bus validation."""

    operational_status = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = Vehicle
        fields = [
            "id",
            "registration_number",
            "vehicle_type",
            "brand",
            "model",
            "seating_capacity",
            "min_passengers",
            "rate_per_km",
            "status",
            "operational_status",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "operational_status", "created_at", "updated_at"]

    def get_operational_status(self, obj) -> str:
        """
        Operational status definitions:
        - MAINTENANCE: Under active/scheduled maintenance or status is MAINTENANCE
        - INACTIVE: Status is INACTIVE
        - ON_TRIP: Status is ON_TRIP or has an active IN_PROGRESS trip
        - ASSIGNED_TODAY: Scheduled assignment today, not yet started
        - AVAILABLE: Eligible for assignment
        """
        if obj.status == Vehicle.Status.MAINTENANCE:
            return "MAINTENANCE"
        if obj.status == Vehicle.Status.INACTIVE:
            return "INACTIVE"

        from django.utils import timezone
        from trips.models import Trip

        # Check if currently associated with an active trip
        if obj.status == Vehicle.Status.ON_TRIP or Trip.objects.filter(vehicle=obj, status=Trip.Status.IN_PROGRESS).exists():
            return "ON_TRIP"

        # Check if scheduled for today (assigned today)
        today = timezone.localdate()
        today_start = timezone.make_aware(timezone.datetime.combine(today, timezone.datetime.min.time()))
        today_end = timezone.make_aware(timezone.datetime.combine(today, timezone.datetime.max.time()))

        has_assigned_today = Trip.objects.filter(
            vehicle=obj,
            status=Trip.Status.SCHEDULED,
            scheduled_datetime__range=(today_start, today_end),
        ).exists()
        if has_assigned_today:
            return "ASSIGNED_TODAY"

        return "AVAILABLE"

    def validate(self, attrs):
        # Support partial updates by falling back to instance values
        target_status = attrs.get("status")
        if target_status == Vehicle.Status.ACTIVE and self.instance:
            from trips.models import Trip
            if Trip.objects.filter(vehicle=self.instance, status=Trip.Status.IN_PROGRESS).exists():
                raise serializers.ValidationError({
                    "status": "Vehicle has an active trip in progress and cannot be marked Available."
                })
            from vehicles.models import Maintenance
            if Maintenance.objects.filter(
                vehicle=self.instance,
                status=Maintenance.Status.IN_PROGRESS,
            ).exists():
                raise serializers.ValidationError({
                    "status": "Vehicle is currently undergoing maintenance and cannot be marked Available."
                })
        vehicle_type = attrs.get(
            "vehicle_type",
            getattr(self.instance, "vehicle_type", None)
        )
        seating_capacity = attrs.get(
            "seating_capacity",
            getattr(self.instance, "seating_capacity", None)
        )
        min_passengers = attrs.get(
            "min_passengers",
            getattr(self.instance, "min_passengers", None)
        )

        if vehicle_type == Vehicle.VehicleType.BUS:
            if min_passengers is None or min_passengers < 1:
                raise serializers.ValidationError({
                    "min_passengers": "Bus min_passengers is required and must be at least 1."
                })
            if seating_capacity is not None and min_passengers >= seating_capacity:
                raise serializers.ValidationError({
                    "min_passengers": "Bus min_passengers must be strictly less than seating_capacity."
                })
        else:
            # For CAR and BIKE, min_passengers is not used
            attrs["min_passengers"] = None

        return attrs

    def validate_rate_per_km(self, value):
        if value <= 0:
            raise serializers.ValidationError("Rate per km must be greater than zero.")
        return value


from .models import Maintenance


class MaintenanceSerializer(serializers.ModelSerializer):
    """Serializer for Vehicle Maintenance."""

    vehicle_registration = serializers.CharField(source="vehicle.registration_number", read_only=True)
    vehicle_brand_model = serializers.SerializerMethodField(read_only=True)
    created_by_name = serializers.CharField(source="created_by.full_name", read_only=True, default=None)

    class Meta:
        model = Maintenance
        fields = [
            "id",
            "vehicle",
            "vehicle_registration",
            "vehicle_brand_model",
            "title",
            "description",
            "scheduled_date",
            "cost",
            "status",
            "created_by",
            "created_by_name",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_by", "created_by_name", "created_at", "updated_at"]

    def get_vehicle_brand_model(self, obj) -> str:
        return f"{obj.vehicle.brand} {obj.vehicle.model}" if obj.vehicle else ""

    def validate(self, attrs):
        vehicle = attrs.get("vehicle", getattr(self.instance, "vehicle", None))
        status_val = attrs.get("status", getattr(self.instance, "status", None))

        if status_val == Maintenance.Status.IN_PROGRESS:
            if vehicle and vehicle.status == Vehicle.Status.ON_TRIP:
                raise serializers.ValidationError(
                    {"vehicle": "A vehicle that is ON_TRIP cannot start maintenance."}
                )

        return attrs

    def create(self, validated_data):
        request = self.context.get("request")
        if request and request.user.is_authenticated:
            validated_data["created_by"] = request.user
        instance = super().create(validated_data)
        # Update vehicle status if IN_PROGRESS
        if instance.status == Maintenance.Status.IN_PROGRESS:
            instance.vehicle.status = Vehicle.Status.MAINTENANCE
            instance.vehicle.save(update_fields=["status"])
        elif instance.status == Maintenance.Status.COMPLETED:
            instance.vehicle.status = Vehicle.Status.ACTIVE
            instance.vehicle.save(update_fields=["status"])
        return instance

    def update(self, instance, validated_data):
        old_status = instance.status
        instance = super().update(instance, validated_data)
        new_status = instance.status

        if new_status == Maintenance.Status.IN_PROGRESS and old_status != Maintenance.Status.IN_PROGRESS:
            instance.vehicle.status = Vehicle.Status.MAINTENANCE
            instance.vehicle.save(update_fields=["status"])
        elif new_status == Maintenance.Status.COMPLETED:
            instance.vehicle.status = Vehicle.Status.ACTIVE
            instance.vehicle.save(update_fields=["status"])
        return instance

