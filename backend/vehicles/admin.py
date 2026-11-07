from django.contrib import admin
from .models import Vehicle


@admin.register(Vehicle)
class VehicleAdmin(admin.ModelAdmin):
    list_display = (
        "registration_number",
        "vehicle_type",
        "brand",
        "model",
        "seating_capacity",
        "min_passengers",
        "rate_per_km",
        "status",
        "created_at",
    )
    list_filter = ("vehicle_type", "status", "created_at")
    search_fields = ("registration_number", "brand", "model")
    ordering = ("-created_at",)


from .models import Maintenance


@admin.register(Maintenance)
class MaintenanceAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "vehicle",
        "title",
        "scheduled_date",
        "status",
        "cost",
        "created_by",
        "created_at",
    )
    list_filter = ("status", "scheduled_date", "vehicle__vehicle_type")
    search_fields = ("title", "description", "vehicle__registration_number")
    ordering = ("-scheduled_date",)

