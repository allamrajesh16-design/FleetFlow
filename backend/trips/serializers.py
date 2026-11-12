from datetime import date
from decimal import Decimal
from django.conf import settings
from django.db import models
from django.utils import timezone
from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from accounts.models import User
from bookings.models import Booking, BusSchedule
from drivers.models import Driver
from vehicles.models import Vehicle
from .models import Trip, TripLocation, TripAssignmentLog


class TripLocationSerializer(serializers.ModelSerializer):
    """Serializer for Trip Location coordinates and telemetry."""

    class Meta:
        model = TripLocation
        fields = [
            "id",
            "latitude",
            "longitude",
            "speed_kmh",
            "heading",
            "accuracy_m",
            "is_simulated",
            "recorded_at",
        ]
        read_only_fields = ["id", "recorded_at"]


class TripAssignmentLogSerializer(serializers.ModelSerializer):
    """Serializer for Trip Assignment History Log."""

    performed_by_name = serializers.CharField(source="performed_by.full_name", read_only=True, default=None)
    old_vehicle_plate = serializers.CharField(source="old_vehicle.registration_number", read_only=True, default=None)
    new_vehicle_plate = serializers.CharField(source="new_vehicle.registration_number", read_only=True, default=None)
    old_driver_name = serializers.CharField(source="old_driver.user.full_name", read_only=True, default=None)
    new_driver_name = serializers.CharField(source="new_driver.user.full_name", read_only=True, default=None)

    class Meta:
        model = TripAssignmentLog
        fields = [
            "id",
            "action",
            "performed_by",
            "performed_by_name",
            "timestamp",
            "old_vehicle",
            "old_vehicle_plate",
            "new_vehicle",
            "new_vehicle_plate",
            "old_driver",
            "old_driver_name",
            "new_driver",
            "new_driver_name",
            "reason",
        ]
        read_only_fields = ["id", "timestamp"]


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
    customer_phone = serializers.SerializerMethodField(read_only=True)
    booking_amount = serializers.SerializerMethodField(read_only=True)
    passengers = serializers.SerializerMethodField(read_only=True)
    pickup_location = serializers.CharField(source="source", read_only=True, default="")
    drop_location = serializers.CharField(source="destination", read_only=True, default="")
    rate_per_km = serializers.SerializerMethodField(read_only=True)
    unpaid_payment_id = serializers.SerializerMethodField(read_only=True)
    payment_status = serializers.SerializerMethodField(read_only=True)
    can_start = serializers.SerializerMethodField(read_only=True)
    start_date_status = serializers.SerializerMethodField(read_only=True)
    start_date_label = serializers.SerializerMethodField(read_only=True)
    scheduled_date_formatted = serializers.SerializerMethodField(read_only=True)
    trip_start_rule = serializers.SerializerMethodField(read_only=True)
    booking_id = serializers.SerializerMethodField(read_only=True)
    vehicle_previous_odometer = serializers.SerializerMethodField(read_only=True)
    receipt_data = serializers.SerializerMethodField(read_only=True)
    assignment_logs = TripAssignmentLogSerializer(many=True, read_only=True)

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
            "customer_phone",
            "booking_amount",
            "passengers",
            "scheduled_datetime",
            "status",
            "dispatch_note",
            "assignment_logs",
            "pickup_lat",
            "pickup_lng",
            "drop_lat",
            "drop_lng",
            "route_geojson",
            "route_distance_km",
            "route_duration_min",
            "geo_status",
            "route_source",
            "start_odometer",
            "end_odometer",
            "distance_km",
            "started_at",
            "completed_at",
            "total_fare",
            "last_known_location",
            "assigned_by",
            "assigned_by_name",
            "rate_per_km",
            "unpaid_payment_id",
            "payment_status",
            "can_start",
            "start_date_status",
            "start_date_label",
            "scheduled_date_formatted",
            "trip_start_rule",
            "booking_id",
            "vehicle_previous_odometer",
            "receipt_data",
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

    @extend_schema_field(serializers.CharField(allow_null=True))
    def get_customer_phone(self, obj):
        if obj.booking and obj.booking.customer:
            return getattr(obj.booking.customer, "phone", None) or getattr(obj.booking.customer, "phone_number", None) or "N/A"
        return "N/A"

    @extend_schema_field(serializers.DecimalField(max_digits=10, decimal_places=2, allow_null=True))
    def get_booking_amount(self, obj):
        if obj.booking:
            return obj.booking.final_fare or obj.booking.estimated_fare or getattr(obj.booking, "base_fare", None) or obj.total_fare
        return obj.total_fare

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

    @extend_schema_field(serializers.DecimalField(max_digits=10, decimal_places=2, allow_null=True))
    def get_rate_per_km(self, obj):
        if obj.vehicle and obj.vehicle.rate_per_km:
            return obj.vehicle.rate_per_km
        return None

    @extend_schema_field(serializers.IntegerField(allow_null=True))
    def get_unpaid_payment_id(self, obj):
        unpaid = obj.payments.filter(status__in=["UNPAID", "PAYMENT_INITIATED"]).first()
        return unpaid.id if unpaid else None

    @extend_schema_field(serializers.CharField(allow_null=True))
    def get_payment_status(self, obj):
        first_p = obj.payments.first()
        if first_p:
            return first_p.status
        if obj.status == Trip.Status.COMPLETED:
            return "UNPAID"
        return "PENDING"

    @extend_schema_field(serializers.BooleanField())
    def get_can_start(self, obj):
        rule = getattr(settings, "TRIP_START_RULE", "same_day")
        if rule == "any":
            return True
        if not obj.scheduled_datetime:
            return True
        today = timezone.localdate()
        trip_date = timezone.localdate(obj.scheduled_datetime)
        return today == trip_date

    @extend_schema_field(serializers.CharField())
    def get_start_date_status(self, obj):
        if not obj.scheduled_datetime:
            return "TODAY"
        today = timezone.localdate()
        trip_date = timezone.localdate(obj.scheduled_datetime)
        diff = (trip_date - today).days
        if diff == 0:
            return "TODAY"
        elif diff == 1:
            return "TOMORROW"
        elif diff > 1:
            return "FUTURE"
        else:
            return "PASSED"

    @extend_schema_field(serializers.CharField())
    def get_start_date_label(self, obj):
        if not obj.scheduled_datetime:
            return "Today"
        today = timezone.localdate()
        trip_date = timezone.localdate(obj.scheduled_datetime)
        diff = (trip_date - today).days
        if diff == 0:
            return "Today"
        elif diff == 1:
            return "Tomorrow"
        elif diff > 1:
            return f"in {diff} days"
        else:
            return "Date passed"

    @extend_schema_field(serializers.CharField())
    def get_scheduled_date_formatted(self, obj):
        if not obj.scheduled_datetime:
            return ""
        trip_date = timezone.localdate(obj.scheduled_datetime)
        return f"{trip_date.day} {trip_date.strftime('%b %Y')}"

    @extend_schema_field(serializers.CharField())
    def get_trip_start_rule(self, obj):
        return getattr(settings, "TRIP_START_RULE", "same_day")

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

    @extend_schema_field(serializers.IntegerField(allow_null=True))
    def get_booking_id(self, obj):
        return obj.booking_id if obj.booking_id else None

    @extend_schema_field(serializers.IntegerField())
    def get_vehicle_previous_odometer(self, obj):
        if not obj.vehicle:
            return 0
        last_trip = (
            Trip.objects.filter(
                vehicle=obj.vehicle,
                end_odometer__isnull=False,
                status=Trip.Status.COMPLETED,
            )
            .exclude(id=obj.id)
            .order_by("-completed_at", "-id")
            .first()
        )
        return last_trip.end_odometer if (last_trip and last_trip.end_odometer) else 0

    @extend_schema_field(serializers.DictField(allow_null=True))
    def get_receipt_data(self, obj):
        payment = obj.payments.first()
        receipt = getattr(payment, "receipt", None) if payment else None

        if receipt and receipt.receipt_number:
            receipt_number = receipt.receipt_number
        elif payment:
            receipt_number = f"FF-{timezone.now().year}-{payment.id:06d}"
        else:
            receipt_number = f"FF-{timezone.now().year}-T{obj.id:05d}"

        booking_id_str = f"#{obj.booking_id}" if obj.booking_id else (f"Bus Schedule #{obj.bus_schedule_id}" if obj.bus_schedule_id else "Direct Dispatch")

        payment_method = "N/A"
        payment_status = "PENDING"
        txn_ref = None
        payment_id = None
        if payment:
            payment_id = payment.id
            payment_status = payment.status
            payment_method = "Cash" if payment.payment_method == "CASH" else ("UPI (Static QR)" if payment.payment_method == "ONLINE" else str(payment.payment_method))
            txn_ref = payment.transaction_reference or payment.gateway_reference or None
        elif obj.bus_schedule:
            payment_method = "Bus Bookings"
            payment_status = "COMPLETED"

        fare_amt = str(obj.total_fare) if obj.total_fare is not None else ("0.00" if not payment else str(payment.amount))

        dist_val = obj.distance_km
        if dist_val is None and obj.start_odometer and obj.end_odometer:
            dist_val = max(0, obj.end_odometer - obj.start_odometer)

        return {
            "receipt_number": receipt_number,
            "trip_id": obj.id,
            "booking_id": booking_id_str,
            "customer_name": self.get_customer_name(obj) or "Valued Customer",
            "driver_name": obj.driver.user.full_name if (obj.driver and obj.driver.user) else "Assigned Driver",
            "vehicle_registration": obj.vehicle.registration_number if obj.vehicle else "N/A",
            "vehicle_brand_model": self.get_vehicle_brand_model(obj),
            "pickup_location": obj.source or (f"{obj.pickup_lat},{obj.pickup_lng}" if obj.pickup_lat else "Pickup"),
            "drop_location": obj.destination or (f"{obj.drop_lat},{obj.drop_lng}" if obj.drop_lat else "Drop"),
            "started_at": obj.started_at.isoformat() if obj.started_at else None,
            "completed_at": obj.completed_at.isoformat() if obj.completed_at else None,
            "start_odometer": obj.start_odometer,
            "end_odometer": obj.end_odometer,
            "distance_km": dist_val,
            "base_fare": fare_amt,
            "additional_charges": "0.00",
            "total_fare": fare_amt,
            "payment_id": payment_id,
            "payment_method": payment_method,
            "payment_status": payment_status,
            "transaction_reference": txn_ref or ("CASH-SETTLED" if payment_method == "Cash" else "N/A"),
        }


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
    dispatch_note = serializers.CharField(max_length=300, required=False, allow_blank=True, default="")

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


class TripReassignSerializer(serializers.Serializer):
    """Payload for reassigning a scheduled trip's vehicle or driver."""

    vehicle_id = serializers.IntegerField(required=False, allow_null=True)
    driver_id = serializers.IntegerField(required=False, allow_null=True)
    reason = serializers.CharField(required=False, allow_blank=True, default="")

    def validate(self, attrs):
        v_id = attrs.get("vehicle_id")
        d_id = attrs.get("driver_id")
        if not v_id and not d_id:
            raise serializers.ValidationError("Either vehicle_id or driver_id must be provided.")
        return attrs


class TripStartSerializer(serializers.Serializer):
    """Payload for starting a trip with initial odometer reading."""

    start_odometer = serializers.IntegerField(required=False, allow_null=True, min_value=0)


class TripLocationUpdateSerializer(serializers.Serializer):
    """Payload for driver live location updates."""

    latitude = serializers.DecimalField(max_digits=9, decimal_places=6, required=True)
    longitude = serializers.DecimalField(max_digits=9, decimal_places=6, required=True)
    speed_kmh = serializers.FloatField(required=False, allow_null=True)
    heading = serializers.FloatField(required=False, allow_null=True)
    accuracy_m = serializers.FloatField(required=False, allow_null=True)
    is_simulated = serializers.BooleanField(required=False, default=False)


class TripPlacesUpdateSerializer(serializers.Serializer):
    """Payload for manually setting trip pickup and drop coordinates."""

    pickup_lat = serializers.DecimalField(max_digits=9, decimal_places=6, required=False, allow_null=True)
    pickup_lng = serializers.DecimalField(max_digits=9, decimal_places=6, required=False, allow_null=True)
    drop_lat = serializers.DecimalField(max_digits=9, decimal_places=6, required=False, allow_null=True)
    drop_lng = serializers.DecimalField(max_digits=9, decimal_places=6, required=False, allow_null=True)


class TripCompleteSerializer(serializers.Serializer):
    """Payload for completing a trip with final odometer reading and/or distance and actual trip details."""

    end_odometer = serializers.IntegerField(required=False, allow_null=True, min_value=1)
    distance_km = serializers.DecimalField(
        max_digits=10, decimal_places=2, required=False, allow_null=True, min_value=Decimal("0.01")
    )
    actual_pickup = serializers.CharField(required=False, allow_blank=True, max_length=255)
    actual_drop = serializers.CharField(required=False, allow_blank=True, max_length=255)
    additional_charges = serializers.DecimalField(
        max_digits=10, decimal_places=2, required=False, default=Decimal("0.00"), min_value=Decimal("0.00")
    )
    remarks = serializers.CharField(required=False, allow_blank=True, max_length=500)
    actual_start_time = serializers.DateTimeField(required=False, allow_null=True)
    actual_end_time = serializers.DateTimeField(required=False, allow_null=True)


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
