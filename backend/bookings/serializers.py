from decimal import Decimal
from django.db import transaction
from django.db.models import Max, Min
from django.utils import timezone
from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from accounts.models import User
from notifications.models import Notification, notify
from vehicles.models import Vehicle
from .models import BusSchedule, Booking


class BusScheduleSerializer(serializers.ModelSerializer):
    """Serializer for Bus Schedules."""

    total_seats = serializers.IntegerField(read_only=True)
    booked_seats = serializers.IntegerField(read_only=True)
    current_passengers = serializers.IntegerField(read_only=True)
    available_seats = serializers.IntegerField(read_only=True)
    min_passengers = serializers.IntegerField(read_only=True)
    booking_deadline = serializers.DateTimeField(read_only=True)
    vehicle_registration = serializers.CharField(
        source="vehicle.registration_number", read_only=True, default=None, allow_null=True
    )

    class Meta:
        model = BusSchedule
        fields = [
            "id",
            "vehicle",
            "vehicle_registration",
            "source",
            "destination",
            "departure_datetime",
            "fare_per_seat",
            "status",
            "created_by",
            "created_at",
            "total_seats",
            "booked_seats",
            "current_passengers",
            "available_seats",
            "min_passengers",
            "booking_deadline",
        ]
        read_only_fields = [
            "id",
            "created_by",
            "created_at",
            "total_seats",
            "booked_seats",
            "current_passengers",
            "available_seats",
            "min_passengers",
            "booking_deadline",
        ]

    def validate_vehicle(self, vehicle):
        if vehicle.vehicle_type != Vehicle.VehicleType.BUS:
            raise serializers.ValidationError("Assigned vehicle must be of type BUS.")
        return vehicle

    def validate_departure_datetime(self, departure_datetime):
        if self.instance is None and departure_datetime <= timezone.now():
            raise serializers.ValidationError("departure_datetime must be in the future.")
        return departure_datetime

    def validate_fare_per_seat(self, fare_per_seat):
        if fare_per_seat < Decimal("0.00"):
            raise serializers.ValidationError("fare_per_seat cannot be negative.")
        return fare_per_seat

    def create(self, validated_data):
        request = self.context.get("request")
        if request and request.user.is_authenticated:
            validated_data["created_by"] = request.user
        return super().create(validated_data)


class BookingSerializer(serializers.ModelSerializer):
    """Serializer for Bookings."""

    customer_name = serializers.SerializerMethodField(read_only=True)
    customer_email = serializers.EmailField(source="customer.email", read_only=True, default=None, allow_null=True)
    vehicle_registration = serializers.CharField(
        source="vehicle.registration_number", read_only=True, default=None, allow_null=True
    )
    payment_id = serializers.SerializerMethodField()
    payment_status = serializers.SerializerMethodField()
    has_active_trip = serializers.SerializerMethodField()
    estimated_fare_basis = serializers.SerializerMethodField()
    estimated_fare_min = serializers.SerializerMethodField()
    estimated_fare_max = serializers.SerializerMethodField()

    class Meta:
        model = Booking
        fields = [
            "id",
            "customer",
            "customer_name",
            "customer_email",
            "booking_type",
            "vehicle_type",
            "vehicle",
            "vehicle_registration",
            "bus_schedule",
            "pickup_location",
            "drop_location",
            "travel_datetime",
            "passengers",
            "estimated_distance_km",
            "estimated_fare",
            "estimated_fare_basis",
            "estimated_fare_min",
            "estimated_fare_max",
            "has_active_trip",
            "final_fare",
            "status",
            "rejection_reason",
            "cancel_reason",
            "refund_status",
            "bus_option_choice",
            "payment_id",
            "payment_status",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "customer",
            "customer_name",
            "customer_email",
            "vehicle_registration",
            "estimated_fare",
            "estimated_fare_basis",
            "estimated_fare_min",
            "estimated_fare_max",
            "has_active_trip",
            "final_fare",
            "status",
            "rejection_reason",
            "cancel_reason",
            "refund_status",
            "bus_option_choice",
            "payment_id",
            "payment_status",
            "created_at",
            "updated_at",
        ]
        extra_kwargs = {
            "pickup_location": {"required": False},
            "drop_location": {"required": False},
            "travel_datetime": {"required": False},
            "vehicle_type": {"required": False},
        }

    @extend_schema_field(serializers.IntegerField(allow_null=True))
    def get_payment_id(self, obj) -> int:
        payments = list(obj.payments.all())
        return payments[0].id if payments else None

    @extend_schema_field(serializers.CharField(allow_null=True))
    def get_payment_status(self, obj) -> str:
        payments = list(obj.payments.all())
        return payments[0].status if payments else None

    @extend_schema_field(serializers.BooleanField())
    def get_has_active_trip(self, obj) -> bool:
        if hasattr(obj, "_has_active_trip"):
            return bool(obj._has_active_trip)
        return obj.trips.filter(status__in=["SCHEDULED", "IN_PROGRESS"]).exists()

    @extend_schema_field(serializers.CharField(allow_null=True))
    def get_estimated_fare_basis(self, obj) -> str:
        if obj.estimated_fare is None:
            return None
        if obj.vehicle_id:
            return "selected_vehicle"
        return "lowest_rate"

    @extend_schema_field(serializers.DecimalField(max_digits=10, decimal_places=2, allow_null=True))
    def get_estimated_fare_min(self, obj):
        if not obj.estimated_distance_km:
            return None
        if obj.vehicle:
            return Decimal(str(obj.estimated_distance_km)) * obj.vehicle.rate_per_km
        min_rate = Vehicle.objects.filter(
            vehicle_type=obj.vehicle_type,
            status=Vehicle.Status.ACTIVE
        ).aggregate(Min("rate_per_km"))["rate_per_km__min"]
        if min_rate is not None:
            return Decimal(str(obj.estimated_distance_km)) * min_rate
        return None

    @extend_schema_field(serializers.DecimalField(max_digits=10, decimal_places=2, allow_null=True))
    def get_estimated_fare_max(self, obj):
        if not obj.estimated_distance_km:
            return None
        if obj.vehicle:
            return Decimal(str(obj.estimated_distance_km)) * obj.vehicle.rate_per_km
        max_rate = Vehicle.objects.filter(
            vehicle_type=obj.vehicle_type,
            status=Vehicle.Status.ACTIVE
        ).aggregate(Max("rate_per_km"))["rate_per_km__max"]
        if max_rate is not None:
            return Decimal(str(obj.estimated_distance_km)) * max_rate
        return None

    @extend_schema_field(serializers.CharField())
    def get_customer_name(self, obj) -> str:
        return obj.customer.full_name or obj.customer.email

    def to_representation(self, instance):
        ret = super().to_representation(instance)
        if not ret.get("pickup_location") and instance.bus_schedule:
            ret["pickup_location"] = instance.bus_schedule.source
        if not ret.get("drop_location") and instance.bus_schedule:
            ret["drop_location"] = instance.bus_schedule.destination
        return ret

    def validate(self, attrs):
        booking_type = attrs.get("booking_type")
        passengers = attrs.get("passengers", 1)

        if passengers < 1:
            raise serializers.ValidationError({"passengers": "Passengers must be at least 1."})

        if booking_type == Booking.BookingType.BUS_SEAT:
            bus_schedule = attrs.get("bus_schedule")
            if not bus_schedule:
                raise serializers.ValidationError({"bus_schedule": "bus_schedule is required for BUS_SEAT."})

            # Check deadline and availability
            now = timezone.now()
            if now >= bus_schedule.booking_deadline:
                raise serializers.ValidationError(
                    {"bus_schedule": "Booking closed for this bus schedule (within 10 hours of departure)."}
                )

            if bus_schedule.status != BusSchedule.Status.OPEN:
                raise serializers.ValidationError(
                    {"bus_schedule": "Booking is not available as this bus schedule is not OPEN."}
                )

            if bus_schedule.available_seats < passengers:
                raise serializers.ValidationError(
                    {"passengers": f"Not enough seats available. Only {bus_schedule.available_seats} remaining."}
                )

            attrs["vehicle_type"] = Booking.VehicleType.BUS
            attrs["vehicle"] = bus_schedule.vehicle
            attrs["travel_datetime"] = bus_schedule.departure_datetime
            if not attrs.get("pickup_location"):
                attrs["pickup_location"] = bus_schedule.source
            if not attrs.get("drop_location"):
                attrs["drop_location"] = bus_schedule.destination

        elif booking_type == Booking.BookingType.VEHICLE:
            vehicle_type = attrs.get("vehicle_type")
            if not vehicle_type:
                raise serializers.ValidationError({"vehicle_type": "vehicle_type is required for VEHICLE booking."})
            if vehicle_type not in [Booking.VehicleType.CAR, Booking.VehicleType.BIKE]:
                raise serializers.ValidationError({"vehicle_type": "VEHICLE bookings must be CAR or BIKE."})

            travel_datetime = attrs.get("travel_datetime")
            if not travel_datetime:
                raise serializers.ValidationError({"travel_datetime": "travel_datetime is required for VEHICLE booking."})
            if travel_datetime <= timezone.now():
                raise serializers.ValidationError({"travel_datetime": "travel_datetime must be in the future."})

            if not attrs.get("pickup_location"):
                raise serializers.ValidationError({"pickup_location": "pickup_location is required."})
            attrs["pickup_location"] = " ".join(str(attrs["pickup_location"]).split()).title()

            if not attrs.get("drop_location"):
                raise serializers.ValidationError({"drop_location": "drop_location is required."})
            attrs["drop_location"] = " ".join(str(attrs["drop_location"]).split()).title()

            vehicle = attrs.get("vehicle")
            if vehicle:
                if vehicle.vehicle_type != vehicle_type:
                    raise serializers.ValidationError(
                        {"vehicle": f"Selected vehicle must be of type {vehicle_type}."}
                    )
                if vehicle.status != Vehicle.Status.ACTIVE:
                    raise serializers.ValidationError({"vehicle": "Selected vehicle is not active."})
                if vehicle.seating_capacity < passengers:
                    raise serializers.ValidationError(
                        {"passengers": f"Vehicle capacity ({vehicle.seating_capacity}) cannot accommodate {passengers} passengers."}
                    )
            else:
                if vehicle_type == Booking.VehicleType.BIKE and passengers > 1:
                    raise serializers.ValidationError({"passengers": "Bikes cannot carry more than 1 passenger."})
                elif vehicle_type == Booking.VehicleType.CAR:
                    max_capacity = Vehicle.objects.filter(
                        vehicle_type=Vehicle.VehicleType.CAR,
                        status=Vehicle.Status.ACTIVE
                    ).aggregate(Max("seating_capacity"))["seating_capacity__max"]
                    if not max_capacity or passengers > max_capacity:
                        raise serializers.ValidationError(
                            {"passengers": f"No active Car can accommodate {passengers} passengers."}
                        )
        else:
            raise serializers.ValidationError({"booking_type": "Invalid booking_type."})

        return attrs

    def create(self, validated_data):
        user = self.context["request"].user
        booking_type = validated_data["booking_type"]
        passengers = validated_data.get("passengers", 1)

        if booking_type == Booking.BookingType.BUS_SEAT:
            bus_schedule = validated_data["bus_schedule"]
            # Concurrency-safe check using select_for_update inside transaction
            with transaction.atomic():
                schedule = BusSchedule.objects.select_for_update().get(id=bus_schedule.id)
                now = timezone.now()
                if now >= schedule.booking_deadline:
                    raise serializers.ValidationError(
                        {"bus_schedule": "Booking closed for this bus schedule (within 10 hours of departure)."}
                    )
                if schedule.status != BusSchedule.Status.OPEN:
                    raise serializers.ValidationError(
                        {"bus_schedule": "Bus schedule is not open for booking."}
                    )
                if schedule.available_seats < passengers:
                    raise serializers.ValidationError(
                        {"passengers": f"Not enough seats available. Only {schedule.available_seats} remaining."}
                    )

                estimated_fare = schedule.fare_per_seat * Decimal(str(passengers))

                booking = Booking.objects.create(
                    customer=user,
                    booking_type=Booking.BookingType.BUS_SEAT,
                    vehicle_type=Booking.VehicleType.BUS,
                    vehicle=schedule.vehicle,
                    bus_schedule=schedule,
                    pickup_location=validated_data.get("pickup_location") or schedule.source,
                    drop_location=validated_data.get("drop_location") or schedule.destination,
                    travel_datetime=schedule.departure_datetime,
                    passengers=passengers,
                    estimated_fare=estimated_fare,
                    status=Booking.Status.APPROVED,
                )

                notify(
                    user=user,
                    title="Bus Seat Booking Confirmed",
                    message=(
                        f"Your booking #{booking.id} for {passengers} seat(s) on bus schedule #{schedule.id} "
                        f"({schedule.source} to {schedule.destination}) is confirmed."
                    ),
                    type=Notification.NotificationType.BOOKING,
                    item_type="booking",
                    item_id=booking.id,
                )
                return booking

        else:
            # VEHICLE booking
            vehicle = validated_data.get("vehicle")
            vehicle_type = validated_data["vehicle_type"]
            estimated_distance = validated_data.get("estimated_distance_km")

            if estimated_distance:
                if vehicle:
                    estimated_fare = Decimal(str(estimated_distance)) * vehicle.rate_per_km
                else:
                    lowest_rate = Vehicle.objects.filter(
                        vehicle_type=vehicle_type,
                        status=Vehicle.Status.ACTIVE
                    ).aggregate(Min("rate_per_km"))["rate_per_km__min"]
                    if lowest_rate is not None:
                        estimated_fare = Decimal(str(estimated_distance)) * lowest_rate
                    else:
                        estimated_fare = None
            else:
                estimated_fare = None

            booking = Booking.objects.create(
                customer=user,
                booking_type=Booking.BookingType.VEHICLE,
                vehicle_type=validated_data["vehicle_type"],
                vehicle=vehicle,
                pickup_location=validated_data["pickup_location"],
                drop_location=validated_data["drop_location"],
                travel_datetime=validated_data["travel_datetime"],
                passengers=passengers,
                estimated_distance_km=estimated_distance,
                estimated_fare=estimated_fare,
                status=Booking.Status.PENDING,
            )

            # Notify customer
            notify(
                user=user,
                title="Booking Request Submitted",
                message=f"Your {booking.vehicle_type} booking request #{booking.id} has been submitted and is pending approval.",
                type=Notification.NotificationType.BOOKING,
                item_type="booking",
                item_id=booking.id,
            )

            # Notify fleet managers and admins
            for staff in User.objects.filter(role__in=[User.Role.ADMIN, User.Role.FLEET_MANAGER]):
                notify(
                    user=staff,
                    title="New Booking Awaiting Approval",
                    message=f"New {booking.vehicle_type} booking #{booking.id} from {user.email} is waiting for approval.",
                    type=Notification.NotificationType.BOOKING,
                    item_type="booking",
                    item_id=booking.id,
                )

            return booking


class BookingApproveSerializer(serializers.Serializer):
    """Payload for approving a vehicle booking."""
    vehicle_id = serializers.IntegerField(required=False, allow_null=True)


class BookingRejectSerializer(serializers.Serializer):
    """Payload for rejecting a booking."""
    rejection_reason = serializers.CharField(required=True, min_length=1)


class BookingCancelSerializer(serializers.Serializer):
    """Payload for cancelling a booking."""
    cancel_reason = serializers.CharField(required=False, allow_blank=True, default="Cancelled by customer")


class BookingBusResponseSerializer(serializers.Serializer):
    """Payload for customer bus option response."""
    choice = serializers.ChoiceField(choices=Booking.BusOptionChoice.choices)


class TripLocationTrackingSerializer(serializers.Serializer):
    """Coordinates and timestamp of recorded driver GPS location."""
    latitude = serializers.DecimalField(max_digits=9, decimal_places=6)
    longitude = serializers.DecimalField(max_digits=9, decimal_places=6)
    recorded_at = serializers.DateTimeField()


class BookingTrackingSerializer(serializers.Serializer):
    """Live trip tracking payload for customer booking."""
    booking_id = serializers.IntegerField()
    booking_status = serializers.CharField()
    trip_status = serializers.CharField(allow_null=True)
    step = serializers.ChoiceField(choices=["BOOKED", "ASSIGNED", "IN_PROGRESS", "COMPLETED"])
    source = serializers.CharField()
    destination = serializers.CharField()
    scheduled_datetime = serializers.DateTimeField(allow_null=True)
    driver_name = serializers.CharField(allow_null=True)
    vehicle_registration = serializers.CharField(allow_null=True)
    last_known_location = TripLocationTrackingSerializer(allow_null=True)
