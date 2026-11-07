from django.contrib import admin
from .models import Payment, Receipt, PaymentQRSetting


class ReceiptInline(admin.StackedInline):
    model = Receipt
    extra = 0
    readonly_fields = ("receipt_number", "issued_at", "data")
    can_delete = False


@admin.register(Payment)
class PaymentAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "booking",
        "trip",
        "customer",
        "amount",
        "status",
        "payment_method",
        "gateway_reference",
        "qr_used",
        "paid_at",
        "created_at",
    )
    list_filter = ("status", "payment_method", "qr_used", "created_at")
    search_fields = (
        "customer__email",
        "customer__full_name",
        "gateway_reference",
        "trip__source",
        "trip__destination",
    )
    exclude = ("qr_token",)
    ordering = ("-created_at",)
    inlines = [ReceiptInline]


@admin.register(PaymentQRSetting)
class PaymentQRSettingAdmin(admin.ModelAdmin):
    list_display = ("id", "title", "upi_id", "is_active", "updated_by", "updated_at")
    list_filter = ("is_active", "updated_at")
    search_fields = ("title", "upi_id")

    def save_model(self, request, obj, form, change):
        obj.updated_by = request.user
        super().save_model(request, obj, form, change)


@admin.register(Receipt)
class ReceiptAdmin(admin.ModelAdmin):
    list_display = ("id", "receipt_number", "payment", "issued_at")
    search_fields = ("receipt_number", "payment__id", "payment__customer__email")
    readonly_fields = ("receipt_number", "payment", "issued_at", "data")
    ordering = ("-issued_at",)

