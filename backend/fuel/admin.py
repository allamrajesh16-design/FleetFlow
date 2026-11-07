from django.contrib import admin
from django.utils.html import format_html
from .models import FuelLog


@admin.register(FuelLog)
class FuelLogAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "vehicle",
        "fuel_type",
        "quantity",
        "price_per_unit",
        "total_cost",
        "odometer_km",
        "is_full_tank",
        "date",
        "created_by",
    )
    list_filter = ("fuel_type", "is_full_tank", "date", "vehicle")
    search_fields = ("vehicle__registration_number", "station_name", "driver__user__full_name")
    readonly_fields = ("total_cost", "receipt_image_preview", "created_at", "updated_at")

    def receipt_image_preview(self, obj):
        if obj.receipt_image:
            return format_html(
                "<span>Receipt securely stored (ID: {}). Access via secure download API.</span>",
                obj.id,
            )
        return "No receipt uploaded"

    receipt_image_preview.short_description = "Receipt File (Private)"
