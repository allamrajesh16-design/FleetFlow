from datetime import date
from decimal import Decimal
from django.db import models
from django.utils import timezone
from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from accounts.models import User
from bookings.models import Booking, BusSchedule
from drivers.models import Driver
from vehicles.models import Vehicle
from .models import Trip, TripLocation


class TripLocationSerializer(serializers.ModelSerializer):
    """Serializer for Trip Location coordinates."""

    class Meta:
        model = TripLocation
        fields = ["id", "latitude", "longitude", "recorded_at"]
        read_only_fields = ["id", "recorded_at"]


class TripSerializer(serializers.ModelSerializer):
    """Serializer for Trip details."""

    vehicle_registration = serializers.CharField(
        source="vehicle.registration_number", read_only=True, default=None, allow_null=True
    )
    vehicle_type = serializers.CharField(
        source="vehicle.vehicle_type", read_only=True, default=None, allow_null=True
    )
    vehicle_brand_model = serializers.SerializerMethodField(read_only=True)
    driver_name = serializers.CharField(
        source="driver.user.full_name", read_only=True, default=None, allow_null=True
    )
    driver_license = serializers.CharField(
        source="driver.license_number", read_only=True, default=None, allow_null=True
    )
    assigned_by_name = serializers.CharField(
        source="assigned_by.full_name", read_only=True, default=None, allow_null=True
    )
    distance_km = serializers.IntegerField(read_only=True)
    last_known_location = serializers.SerializerMethodField(read_only=True)
    customer_name = serializers.SerializerMethodField(read_only=True)
    customer_email = serializers.SerializerMethodField(read_only=True)
    passengers = serializers.SerializerMethodField(read_only=True)
    pickup_location = serializers.CharField(source="source", read_only=True, default="")
    drop_location = serializers.CharField(source="destination", read_only=True, default="")

    class Meta:
        model = Trip
        fields = [
            "id",
            "booking",
            "bus_schedule",
            "vehicle",
            "vehicle_registration",
            "vehicle_type",
            "vehicle_brand_model",
            "driver",
            "driver_name",
            "driver_license",
            "source",
            "destination",
            "pickup_location",
            "drop_location",
            "customer_name",
            "customer_email",
            "passengers",
            "scheduled_datetime",
            "status",
            "start_odometer",
            "end_odometer",
            "distance_km",
            "started_at",
            "completed_at",
            "total_fare",
            "last_known_location",
            "assigned_by",
            "assigned_by_name",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "distance_km",
            "started_at",
            "completed_at",
            "total_fare",
            "assigned_by",
            "created_at",
            "updated_at",
        ]

    @extend_schema_field(serializers.CharField(allow_null=True))
    def get_customer_name(self, obj):
        if obj.booking and obj.booking.customer:
            return obj.booking.customer.full_name or obj.booking.customer.email
        if obj.bus_schedule:
            return "Bus Passengers"
        return None

    @extend_schema_field(serializers.EmailField(allow_null=True))
    def get_customer_email(self, obj):
        if obj.booking and obj.booking.customer:
            return obj.booking.customer.email
        return None

    @extend_schema_field(serializers.IntegerField())
    def get_passengers(self, obj):
        if obj.booking:
            return obj.booking.passengers
        if obj.bus_schedule:
            return obj.bus_schedule.booked_seats
        return 1

    @extend_schema_field(serializers.CharField())
    def get_vehicle_brand_model(self, obj) -> str:
        if obj.vehicle:
            return f"{obj.vehicle.brand} {obj.vehicle.model}".strip()
        return ""

    def to_representation(self, instance):
        ret = super().to_representation(instance)
        # Ensure source and destination are always non-empty strings
        if not ret.get("source"):
            if instance.booking and instance.booking.pickup_location:
                ret["source"] = instance.booking.pickup_location
            elif instance.bus_schedule and instance.bus_schedule.source:
                ret["source"] = instance.bus_schedule.source
            else:
                ret["source"] = ""

        if not ret.get("destination"):
            if instance.booking and instance.booking.drop_location:
                ret["destination"] = instance.booking.drop_location
            elif instance.bus_schedule and instance.bus_schedule.destination:
                ret["destination"] = instance.bus_schedule.destination
            else:
                ret["destination"] = ""

        ret["pickup_location"] = ret["source"]
        ret["drop_location"] = ret["destination"]
        return ret

    @extend_schema_field(TripLocationSerializer)
    def get_last_known_location(self, obj):
        latest = obj.locations.order_by("-recorded_at").first()
        if latest:
            return TripLocationSerializer(latest).data
        return None


class TripAssignSerializer(serializers.Serializer):
    """Payload for assigning a vehicle and driver to a trip."""

    booking = serializers.PrimaryKeyRelatedField(
        queryset=Booking.objects.all(),
        required=False,
        allow_null=True,
    )
    bus_schedule = serializers.PrimaryKeyRelatedField(
        queryset=BusSchedule.objects.all(),
        required=False,
        allow_null=True,
    )
    vehicle = serializers.PrimaryKeyRelatedField(
        queryset=Vehicle.objects.all(),
        required=True,
    )
    driver = serializers.PrimaryKeyRelatedField(
        queryset=Driver.objects.all(),
        required=True,
    )
    source = serializers.CharField(required=False, allow_blank=True)
    destination = serializers.CharField(required=False, allow_blank=True)
    scheduled_datetime = serializers.DateTimeField(required=False)

    def validate(self, attrs):
        booking = attrs.get("booking")
        bus_schedule = attrs.get("bus_schedule")
        vehicle = attrs.get("vehicle")
        driver = attrs.get("driver")

        if not booking and not bus_schedule:
            raise serializers.ValidationError(
                "Either booking or bus_schedule must be specified for trip assignment."
            )
        if booking and bus_schedule:
            raise serializers.ValidationError(
                "Specify either booking or bus_schedule, not both."
            )

        # Vehicle & Driver active check
        if vehicle.status != Vehicle.Status.ACTIVE:
            raise serializers.ValidationError(
                {"vehicle": f"Vehicle is not active (current status: {vehicle.status})."}
            )
        if driver.status != Driver.Status.ACTIVE:
            raise serializers.ValidationError(
                {"driver": f"Driver is not active (current status: {driver.status})."}
            )

        # Driver license expiry check
        if driver.license_expiry < date.today():
            raise serializers.ValidationError(
                {"driver": f"Driver license expired on {driver.license_expiry}."}
            )

        # Car or Bike Booking rules
        if booking:
            if booking.status != Booking.Status.APPROVED:
                raise serializers.ValidationError(
                    {"booking": f"Booking must be APPROVED before assigning a trip (current status: {booking.status})."}
                )
            if vehicle.vehicle_type != booking.vehicle_type:
                raise serializers.ValidationError(
                    {"vehicle": f"Vehicle type {vehicle.vehicle_type} does not match booking vehicle type {booking.vehicle_type}."}
                )
            if vehicle.seating_capacity < booking.passengers:
                raise serializers.ValidationError(
                    {"vehicle": f"Vehicle capacity ({vehicle.seating_capacity}) cannot accommodate booking passengers ({booking.passengers})."}
                )
            if Trip.objects.filter(
                booking=booking,
                status__in=[Trip.Status.SCHEDULED, Trip.Status.IN_PROGRESS],
            ).exists():
                raise serializers.ValidationError(
                    {"booking": "This booking already has an active or scheduled trip."}
                )

            # Auto-fill defaults
            if not attrs.get("source"):
                attrs["source"] = booking.pickup_location
            if not attrs.get("destination"):
                attrs["destination"] = booking.drop_location
            if not attrs.get("scheduled_datetime"):
                attrs["scheduled_datetime"] = booking.travel_datetime

        # Bus Schedule rules
        if bus_schedule:
            if bus_schedule.status != BusSchedule.Status.CONFIRMED:
                raise serializers.ValidationError(
                    {"bus_schedule": f"Bus schedule must be CONFIRMED before assigning a trip (current status: {bus_schedule.status})."}
                )
            if vehicle != bus_schedule.vehicle:
                raise serializers.ValidationError(
                    {"vehicle": "Vehicle must match the vehicle assigned to the bus schedule."}
                )
            if Trip.objects.filter(
                bus_schedule=bus_schedule,
                status__in=[Trip.Status.SCHEDULED, Trip.Status.IN_PROGRESS],
            ).exists():
                raise serializers.ValidationError(
                    {"bus_schedule": "This bus schedule already has an active or scheduled trip."}
                )

            # Auto-fill defaults
            if not attrs.get("source"):
                attrs["source"] = bus_schedule.source
            if not attrs.get("destination"):
                attrs["destination"] = bus_schedule.destination
            if not attrs.get("scheduled_datetime"):
                attrs["scheduled_datetime"] = bus_schedule.departure_datetime

        # Title-case and trim places
        if attrs.get("source"):
            attrs["source"] = " ".join(str(attrs["source"]).split()).title()
        if attrs.get("destination"):
            attrs["destination"] = " ".join(str(attrs["destination"]).split()).title()

        sched_dt = attrs.get("scheduled_datetime")
        # Past scheduled datetime check
        if sched_dt and sched_dt < timezone.now():
            raise serializers.ValidationError(
                {"scheduled_datetime": "Scheduled date and time cannot be in the past."}
            )

        # Overlapping trip check
        if Trip.objects.filter(
            status__in=[Trip.Status.SCHEDULED, Trip.Status.IN_PROGRESS],
            scheduled_datetime=sched_dt,
        ).filter(models.Q(vehicle=vehicle) | models.Q(driver=driver)).exists():
            raise serializers.ValidationError(
                "The vehicle or driver is already assigned to a trip at this scheduled time."
            )

        if Trip.objects.filter(
            status=Trip.Status.IN_PROGRESS,
        ).filter(models.Q(vehicle=vehicle) | models.Q(driver=driver)).exists():
            raise serializers.ValidationError(
                "The vehicle or driver currently has an in-progress trip."
            )

        return attrs


class TripStartSerializer(serializers.Serializer):
    """Payload for starting a trip with initial odometer reading."""

    start_odometer = serializers.IntegerField(required=True, min_value=1)


class TripLocationUpdateSerializer(serializers.Serializer):
    """Payload for driver live location updates."""

    latitude = serializers.DecimalField(max_digits=9, decimal_places=6, required=True)
    longitude = serializers.DecimalField(max_digits=9, decimal_places=6, required=True)


class TripCompleteSerializer(serializers.Serializer):
    """Payload for completing a trip with final odometer reading."""

    end_odometer = serializers.IntegerField(required=True, min_value=1)


class TripSummarySerializer(serializers.Serializer):
    """Overall trips summary for dashboard."""

    total_trips = serializers.IntegerField()
    active_trips = serializers.IntegerField()
    scheduled_trips = serializers.IntegerField()
    completed_trips = serializers.IntegerField()
    cancelled_trips = serializers.IntegerField()


class DriverTripSummarySerializer(serializers.Serializer):
    """Driver-specific trip summary."""

    todays_trips_count = serializers.IntegerField()
    upcoming_trips_count = serializers.IntegerField()
    completed_trips_count = serializers.IntegerField()
    upcoming_trip = TripSerializer(allow_null=True)
