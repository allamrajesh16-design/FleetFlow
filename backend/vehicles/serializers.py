from rest_framework import serializers
from .models import Vehicle


class VehicleSerializer(serializers.ModelSerializer):
    """Serializer for Vehicle model with seating and bus validation."""

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
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def validate(self, attrs):
        # Support partial updates by falling back to instance values
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

