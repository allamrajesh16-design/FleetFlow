from django.contrib import admin
from .models import Trip, TripLocation


class TripLocationInline(admin.TabularInline):
    model = TripLocation
    extra = 0
    readonly_fields = ("latitude", "longitude", "recorded_at")
    can_delete = False


@admin.register(Trip)
class TripAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "vehicle",
        "driver",
        "status",
        "source",
        "destination",
        "scheduled_datetime",
        "start_odometer",
        "end_odometer",
        "distance_display",
        "total_fare",
        "created_at",
    )
    list_filter = ("status", "scheduled_datetime", "vehicle__vehicle_type")
    search_fields = (
        "source",
        "destination",
        "vehicle__registration_number",
        "driver__user__full_name",
        "driver__license_number",
    )
    ordering = ("-created_at",)
    inlines = [TripLocationInline]

    @admin.display(description="Distance (km)")
    def distance_display(self, obj):
        return obj.distance_km


@admin.register(TripLocation)
class TripLocationAdmin(admin.ModelAdmin):
    list_display = ("id", "trip", "latitude", "longitude", "recorded_at")
    list_filter = ("recorded_at",)
    search_fields = ("trip__id", "trip__vehicle__registration_number")
    ordering = ("-recorded_at",)
