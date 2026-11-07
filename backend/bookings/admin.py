from django.contrib import admin
from .models import BusSchedule, Booking


@admin.register(BusSchedule)
class BusScheduleAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "vehicle",
        "source",
        "destination",
        "departure_datetime",
        "fare_per_seat",
        "status",
        "total_seats_display",
        "booked_seats_display",
        "available_seats_display",
        "created_at",
    )
    list_filter = ("status", "departure_datetime", "source", "destination")
    search_fields = ("source", "destination", "vehicle__registration_number")
    ordering = ("departure_datetime",)

    @admin.display(description="Total Seats")
    def total_seats_display(self, obj):
        return obj.total_seats

    @admin.display(description="Booked Seats")
    def booked_seats_display(self, obj):
        return obj.booked_seats

    @admin.display(description="Available Seats")
    def available_seats_display(self, obj):
        return obj.available_seats


@admin.register(Booking)
class BookingAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "customer",
        "booking_type",
        "vehicle_type",
        "status",
        "travel_datetime",
        "passengers",
        "estimated_fare",
        "refund_status",
        "bus_option_choice",
        "created_at",
    )
    list_filter = (
        "status",
        "booking_type",
        "vehicle_type",
        "refund_status",
        "bus_option_choice",
        "travel_datetime",
    )
    search_fields = (
        "customer__email",
        "customer__first_name",
        "customer__last_name",
        "pickup_location",
        "drop_location",
    )
    ordering = ("-created_at",)
