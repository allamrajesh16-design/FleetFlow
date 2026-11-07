from django.contrib import admin
from django.utils.html import format_html
from .models import Expense


@admin.register(Expense)
class ExpenseAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "category",
        "vehicle",
        "trip",
        "amount",
        "date",
        "status",
        "submitted_by",
        "reviewed_by",
    )
    list_filter = ("category", "status", "date")
    search_fields = ("description", "rejection_reason", "vehicle__registration_number", "submitted_by__full_name")
    readonly_fields = ("receipt_image_preview", "reviewed_by", "reviewed_at", "created_at", "updated_at")

    def receipt_image_preview(self, obj):
        if obj.receipt_image:
            return format_html(
                "<span>Receipt securely stored (ID: {}). Access via secure download API.</span>",
                obj.id,
            )
        return "No receipt uploaded"

    receipt_image_preview.short_description = "Receipt File (Private)"
