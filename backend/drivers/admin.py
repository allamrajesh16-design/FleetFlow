from django.contrib import admin
from .models import Driver


@admin.register(Driver)
class DriverAdmin(admin.ModelAdmin):
    list_display = (
        "get_driver_name",
        "license_number",
        "license_expiry",
        "status",
        "created_at",
    )
    list_filter = ("status", "created_at")
    search_fields = ("user__full_name", "user__email", "license_number")
    ordering = ("-created_at",)

    def get_driver_name(self, obj):
        return obj.user.full_name

    get_driver_name.short_description = "Driver Name"
