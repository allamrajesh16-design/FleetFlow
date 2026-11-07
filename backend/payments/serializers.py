from decimal import Decimal
from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from .models import Payment, Receipt, PaymentQRSetting


class ReceiptSerializer(serializers.ModelSerializer):
    """Serializer for Receipt."""

    class Meta:
        model = Receipt
        fields = [
            "id",
            "receipt_number",
            "issued_at",
            "data",
        ]
        read_only_fields = ["id", "receipt_number", "issued_at", "data"]


class PaymentSerializer(serializers.ModelSerializer):
    """Serializer for Payment details."""

    customer_name = serializers.CharField(
        source="customer.full_name", read_only=True, default=None, allow_null=True
    )
    customer_email = serializers.EmailField(
        source="customer.email", read_only=True, default=None, allow_null=True
    )
    trip_source = serializers.CharField(
        source="trip.source", read_only=True, default=None, allow_null=True
    )
    trip_destination = serializers.CharField(
        source="trip.destination", read_only=True, default=None, allow_null=True
    )
    vehicle_registration = serializers.CharField(
        source="trip.vehicle.registration_number", read_only=True, default=None, allow_null=True
    )
    driver_name = serializers.CharField(
        source="trip.driver.user.full_name", read_only=True, default=None, allow_null=True
    )
    receipt_number = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = Payment
        fields = [
            "id",
            "booking",
            "trip",
            "customer",
            "customer_name",
            "customer_email",
            "trip_source",
            "trip_destination",
            "vehicle_registration",
            "driver_name",
            "amount",
            "status",
            "payment_method",
            "qr_token",
            "qr_expires_at",
            "qr_used",
            "gateway_reference",
            "transaction_reference",
            "proof_screenshot",
            "failure_reason",
            "paid_at",
            "refunded_at",
            "receipt_number",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "booking",
            "trip",
            "customer",
            "customer_name",
            "customer_email",
            "trip_source",
            "trip_destination",
            "vehicle_registration",
            "driver_name",
            "amount",
            "status",
            "qr_token",
            "qr_expires_at",
            "qr_used",
            "gateway_reference",
            "transaction_reference",
            "proof_screenshot",
            "failure_reason",
            "paid_at",
            "refunded_at",
            "receipt_number",
            "created_at",
            "updated_at",
        ]

    @extend_schema_field(serializers.CharField(allow_null=True))
    def get_receipt_number(self, obj):
        if hasattr(obj, "receipt") and obj.receipt:
            return obj.receipt.receipt_number
        return None


class PaymentQRGenerateResponseSerializer(serializers.Serializer):
    """Response serializer for generated QR code."""

    qr_token = serializers.CharField()
    expires_at = serializers.DateTimeField()
    amount = serializers.DecimalField(max_digits=10, decimal_places=2)
    qr_image_base64 = serializers.CharField()


class PaymentScanSerializer(serializers.Serializer):
    """Payload for customer scanning QR code."""

    qr_token = serializers.CharField(required=True)


class PaymentScanResponseSerializer(serializers.Serializer):
    """Response returned upon scanning QR code."""

    payment_id = serializers.IntegerField()
    amount = serializers.DecimalField(max_digits=10, decimal_places=2)
    source = serializers.CharField()
    destination = serializers.CharField()
    vehicle = serializers.CharField()
    driver_name = serializers.CharField()
    status = serializers.CharField()


class PaymentPaySerializer(serializers.Serializer):
    """Payload for initiating mock payment."""

    payment_method = serializers.ChoiceField(choices=Payment.PaymentMethod.choices, required=True)


class PaymentVerifySerializer(serializers.Serializer):
    """Payload for backend signature verification."""

    payment_id = serializers.IntegerField(required=True)
    gateway_reference = serializers.CharField(required=True)
    gateway_status = serializers.CharField(required=True)
    signature = serializers.CharField(required=True)


class PaymentSummarySerializer(serializers.Serializer):
    """Summary metrics of all payments."""

    total_collected = serializers.DecimalField(max_digits=12, decimal_places=2)
    pending_amount = serializers.DecimalField(max_digits=12, decimal_places=2)
    failed_count = serializers.IntegerField()
    refunded_amount = serializers.DecimalField(max_digits=12, decimal_places=2)


class PaymentQRSettingSerializer(serializers.ModelSerializer):
    """Serializer for active or managed Payment QR Settings."""

    qr_image_url = serializers.SerializerMethodField()

    class Meta:
        model = PaymentQRSetting
        fields = [
            "id",
            "title",
            "qr_image",
            "qr_image_url",
            "upi_id",
            "is_active",
            "updated_at",
        ]
        read_only_fields = ["id", "qr_image_url", "updated_at"]
        extra_kwargs = {
            "qr_image": {"write_only": False, "required": True},
        }

    @extend_schema_field(serializers.CharField(allow_null=True))
    def get_qr_image_url(self, obj):
        if obj.qr_image:
            request = self.context.get("request")
            if request:
                return request.build_absolute_uri(obj.qr_image.url)
            return obj.qr_image.url
        return None

    def validate_qr_image(self, value):
        if not value:
            raise serializers.ValidationError("An image file is required.")

        # Max file size 2 MB
        max_bytes = 2 * 1024 * 1024
        if value.size > max_bytes:
            raise serializers.ValidationError("QR image file size cannot exceed 2 MB.")

        # Allowed extensions / formats: png, jpg, jpeg, webp
        allowed_extensions = ["png", "jpg", "jpeg", "webp"]
        name_lower = value.name.lower()
        if not any(name_lower.endswith(f".{ext}") for ext in allowed_extensions):
            raise serializers.ValidationError(
                "Unsupported file format. Allowed formats are PNG, JPG, JPEG, WEBP."
            )

        return value


class PaymentPayInfoSerializer(serializers.Serializer):
    """Details for customer payment page under static QR flow."""

    payment_id = serializers.IntegerField()
    amount = serializers.DecimalField(max_digits=10, decimal_places=2)
    route = serializers.CharField()
    vehicle = serializers.CharField()
    driver_name = serializers.CharField()
    status = serializers.CharField()
    qr_image_url = serializers.CharField(allow_null=True)
    upi_id = serializers.CharField(allow_null=True)
    qr_title = serializers.CharField(allow_null=True)


class SubmitProofSerializer(serializers.Serializer):
    """Payload for customer submitting payment transaction reference and proof."""

    transaction_reference = serializers.RegexField(
        regex=r"^[A-Za-z0-9]{6,30}$",
        required=True,
        error_messages={
            "invalid": "Transaction reference must be 6 to 30 alphanumeric characters (letters and numbers only)."
        },
    )
    proof_screenshot = serializers.ImageField(required=False, allow_null=True)

    def validate_proof_screenshot(self, value):
        if value:
            from core.upload_security import validate_image_file
            from django.core.exceptions import ValidationError as DjangoValidationError
            try:
                validate_image_file(value)
            except DjangoValidationError as e:
                raise serializers.ValidationError(e.message)
        return value


class RejectProofSerializer(serializers.Serializer):
    """Payload for rejecting submitted payment proof."""

    reason = serializers.CharField(required=True, allow_blank=False)

