from django.contrib import admin
from django.utils.html import format_html
from .models import AlertLog, Document


@admin.register(Document)
class DocumentAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "doc_type",
        "vehicle",
        "driver",
        "document_number",
        "expiry_date",
        "expiry_status",
        "uploaded_by",
    )
    list_filter = ("doc_type", "expiry_date")
    search_fields = (
        "vehicle__registration_number",
        "driver__user__full_name",
        "document_number",
    )
    readonly_fields = ("file_preview", "days_left", "expiry_status", "created_at", "updated_at")

    def file_preview(self, obj):
        if obj.file:
            return format_html(
                "<span>Document securely stored (ID: {}). Access via secure download API.</span>",
                obj.id,
            )
        return "No file uploaded"

    file_preview.short_description = "Document File (Private)"


@admin.register(AlertLog)
class AlertLogAdmin(admin.ModelAdmin):
    list_display = ("id", "document", "driver", "threshold_days", "alert_type", "sent_at")
    list_filter = ("threshold_days", "alert_type", "sent_at")
    readonly_fields = ("sent_at",)
