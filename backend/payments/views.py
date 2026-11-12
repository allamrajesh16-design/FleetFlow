import base64
import io
import logging
import secrets

logger = logging.getLogger("fleetflow.payments")
from datetime import timedelta
from decimal import Decimal
from django.conf import settings
from django.db import models, transaction
from django.http import HttpResponse
from django.utils import timezone
from django_filters.rest_framework import DjangoFilterBackend
from drf_spectacular.utils import extend_schema, extend_schema_view, OpenApiResponse
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.filters import OrderingFilter, SearchFilter
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

import qrcode
import qrcode.image.pil

from accounts.models import User
from bookings.models import Booking
from notifications.models import Notification, notify

from .filters import PaymentFilter
from .gateway import process_payment, verify_gateway_signature
from .models import Payment, Receipt, PaymentQRSetting
from .pdf import generate_receipt_pdf
from .permissions import IsAdminUserOnly, PaymentPermission
from .serializers import (
    PaymentCollectSerializer,
    PaymentPayInfoSerializer,
    PaymentPaySerializer,
    PaymentQRGenerateResponseSerializer,
    PaymentQRSettingSerializer,
    PaymentScanResponseSerializer,
    PaymentScanSerializer,
    PaymentSerializer,
    PaymentSummarySerializer,
    PaymentVerifySerializer,
    ReceiptSerializer,
    RejectProofSerializer,
    SubmitProofSerializer,
)
from .services import create_payment_receipt


def verify_payment_transaction(payment_id: int, gateway_reference: str, gateway_status: str, signature: str, failure_reason: str = None):
    """
    Core backend verification logic used by both /pay/ and /verify/ endpoints.
    - Validates HMAC SHA-256 signature
    - Handles idempotency (no duplicate receipts)
    - Updates payment status and sends notifications
    """
    try:
        payment = (
            Payment.objects.select_related(
                "trip",
                "trip__vehicle",
                "trip__driver",
                "trip__driver__user",
                "customer",
                "booking",
            )
            .get(id=payment_id)
        )
    except Payment.DoesNotExist:
        return Response({"detail": "Payment not found."}, status=status.HTTP_404_NOT_FOUND)

    # 1. Verify HMAC SHA-256 signature against database amount
    is_valid_sig = verify_gateway_signature(
        payment_id=payment.id,
        gateway_reference=gateway_reference,
        amount=payment.amount,
        gateway_status=gateway_status,
        signature=signature,
    )
    if not is_valid_sig:
        return Response(
            {"detail": "Invalid signature. Payment verification failed."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # 2. Idempotent check: if already PAID, return receipt directly
    if payment.status == Payment.Status.PAID:
        receipt = create_payment_receipt(payment)
        return Response(
            {
                "status": "PAID",
                "message": "Payment has already been confirmed.",
                "payment_id": payment.id,
                "receipt_number": receipt.receipt_number,
            },
            status=status.HTTP_200_OK,
        )

    # 3. Status handling
    if gateway_status == "SUCCESS":
        with transaction.atomic():
            payment.status = Payment.Status.PAID
            payment.paid_at = timezone.now()
            payment.qr_used = True
            payment.gateway_reference = gateway_reference
            payment.save()

            receipt = create_payment_receipt(payment)
            logger.info(f"Payment #{payment.id} verified as PAID. Amount: Rs. {payment.amount}, Ref: {gateway_reference}")

            # Notify customer and driver
            notify(
                user=payment.customer,
                title="Payment Successful",
                message=(
                    f"Payment of Rs. {payment.amount} successful for trip #{payment.trip_id}. "
                    f"Receipt #{receipt.receipt_number}"
                ),
                type=Notification.NotificationType.PAYMENT,
                item_type="payment",
                item_id=payment.id,
            )
            notify(
                user=payment.trip.driver.user,
                title="Payment Received",
                message=f"Customer has paid Rs. {payment.amount} for trip #{payment.trip_id}.",
                type=Notification.NotificationType.PAYMENT,
                item_type="trip",
                item_id=payment.trip_id,
            )

        return Response(
            {
                "status": "PAID",
                "message": "Payment verified and recorded successfully.",
                "payment_id": payment.id,
                "receipt_number": receipt.receipt_number,
            },
            status=status.HTTP_200_OK,
        )
    else:
        with transaction.atomic():
            payment.status = Payment.Status.FAILED
            payment.gateway_reference = gateway_reference
            payment.failure_reason = failure_reason or "Payment declined by payment gateway."
            payment.save()
            logger.warning(f"Payment #{payment.id} failed. Reason: {payment.failure_reason}")

        return Response(
            {
                "status": "FAILED",
                "detail": "Payment was declined by gateway.",
                "failure_reason": payment.failure_reason,
                "payment_id": payment.id,
            },
            status=status.HTTP_400_BAD_REQUEST,
        )


@extend_schema_view(
    list=extend_schema(
        tags=["Payments"],
        summary="List payments",
        description="Customers see own payments; Drivers see trip payments; Admin/Managers see all.",
    ),
    retrieve=extend_schema(
        tags=["Payments"],
        summary="Retrieve payment",
        description="Get specific payment details.",
    ),
)
class PaymentViewSet(viewsets.ReadOnlyModelViewSet):
    """ViewSet for managing payments, QR generation, payment flow, and receipts."""

    queryset = Payment.objects.all()
    serializer_class = PaymentSerializer
    permission_classes = [PaymentPermission]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_class = PaymentFilter
    search_fields = [
        "customer__full_name",
        "customer__email",
        "gateway_reference",
        "trip__source",
        "trip__destination",
        "trip__vehicle__registration_number",
    ]
    ordering_fields = ["created_at", "amount", "paid_at"]
    ordering = ["-created_at"]

    def get_queryset(self):
        user = self.request.user
        if not user.is_authenticated:
            return Payment.objects.none()

        if getattr(self, "action", None) in ["collect", "settle_cash"]:
            return Payment.objects.all().select_related("customer", "trip", "trip__vehicle", "trip__driver", "booking")

        if user.role in [User.Role.ADMIN, User.Role.FLEET_MANAGER] or user.is_superuser:
            return Payment.objects.all().select_related("customer", "trip", "trip__vehicle", "trip__driver", "booking")

        if user.role == User.Role.DRIVER:
            return Payment.objects.filter(trip__driver__user=user).select_related(
                "customer", "trip", "trip__vehicle", "trip__driver", "booking"
            )

        if user.role == User.Role.CUSTOMER:
            return Payment.objects.filter(customer=user).select_related(
                "customer", "trip", "trip__vehicle", "trip__driver", "booking"
            )

        return Payment.objects.none()

    @extend_schema(
        tags=["Payments"],
        summary="Generate Payment QR Code",
        description="Driver, Fleet Manager or Admin generates a secure 10-minute QR code for an unpaid or expired trip fare.",
        request=None,
        responses={200: PaymentQRGenerateResponseSerializer},
    )
    @action(detail=True, methods=["post"], url_path="generate-qr")
    def generate_qr(self, request, pk=None):
        if getattr(settings, "PAYMENT_MODE", "STATIC_QR") == "STATIC_QR":
            return Response(
                {"detail": "Not available in this payment mode."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        payment = self.get_object()

        # Authorization: assigned driver of trip, Admin, Fleet Manager
        is_assigned_driver = (
            request.user.role == User.Role.DRIVER
            and payment.trip.driver.user_id == request.user.id
        )
        is_staff = request.user.role in [User.Role.ADMIN, User.Role.FLEET_MANAGER] or request.user.is_superuser

        if not (is_assigned_driver or is_staff):
            return Response(
                {"detail": "Only the assigned driver or staff can generate payment QR."},
                status=status.HTTP_403_FORBIDDEN,
            )

        if payment.status == Payment.Status.PAID:
            return Response(
                {"detail": "This payment has already been PAID."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if payment.status not in [Payment.Status.UNPAID, Payment.Status.EXPIRED, Payment.Status.FAILED]:
            return Response(
                {"detail": f"QR code can only be generated for UNPAID, EXPIRED, or FAILED payments (current: {payment.status})."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Generate unique token and 10 minute expiry
        token = secrets.token_urlsafe(32)
        expires_at = timezone.now() + timedelta(minutes=10)

        payment.qr_token = token
        payment.qr_expires_at = expires_at
        payment.qr_used = False
        if payment.status in [Payment.Status.EXPIRED, Payment.Status.FAILED]:
            payment.status = Payment.Status.UNPAID
        payment.save()

        # Generate base64 PNG QR code containing ONLY the scheme URL
        qr_content = f"fleetflow://pay?token={token}"
        qr = qrcode.QRCode(
            version=1,
            box_size=10,
            border=4,
            image_factory=qrcode.image.pil.PilImage,
        )
        qr.add_data(qr_content)
        qr.make(fit=True)
        img = qr.make_image(fill_color="black", back_color="white")

        buf = io.BytesIO()
        img.save(buf)
        b64_qr = base64.b64encode(buf.getvalue()).decode("utf-8")

        return Response(
            {
                "qr_token": token,
                "expires_at": expires_at,
                "amount": payment.amount,
                "qr_image_base64": f"data:image/png;base64,{b64_qr}",
            },
            status=status.HTTP_200_OK,
        )

    @extend_schema(
        tags=["Payments"],
        summary="Scan QR Code",
        description="Customer scans the driver's QR code. Validates token and transitions status to PAYMENT_INITIATED.",
        request=PaymentScanSerializer,
        responses={200: PaymentScanResponseSerializer},
    )
    @action(detail=False, methods=["post"], url_path="scan")
    def scan(self, request):
        if getattr(settings, "PAYMENT_MODE", "STATIC_QR") == "STATIC_QR":
            return Response(
                {"detail": "Not available in this payment mode."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if request.user.role != User.Role.CUSTOMER:
            return Response(
                {"detail": "Only customers can scan payment QR codes."},
                status=status.HTTP_403_FORBIDDEN,
            )

        serializer = PaymentScanSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        token = serializer.validated_data["qr_token"]

        try:
            payment = Payment.objects.select_related(
                "trip", "trip__vehicle", "trip__driver", "trip__driver__user", "customer"
            ).get(qr_token=token)
        except Payment.DoesNotExist:
            return Response(
                {"detail": "Invalid QR token."},
                status=status.HTTP_404_NOT_FOUND,
            )

        # Check customer ownership
        if payment.customer_id != request.user.id:
            return Response(
                {"detail": "You are not authorized to scan this payment QR code."},
                status=status.HTTP_403_FORBIDDEN,
            )

        # Check if already used
        if payment.qr_used:
            return Response(
                {"detail": "This QR code has already been used."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Check expiry
        if payment.qr_expires_at and timezone.now() >= payment.qr_expires_at:
            payment.status = Payment.Status.EXPIRED
            payment.save(update_fields=["status"])
            return Response(
                {"detail": "This QR code has expired."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Check if already paid
        if payment.status == Payment.Status.PAID:
            return Response(
                {"detail": "This payment has already been completed."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Transition to PAYMENT_INITIATED
        payment.status = Payment.Status.PAYMENT_INITIATED
        payment.save(update_fields=["status", "updated_at"])

        return Response(
            {
                "payment_id": payment.id,
                "amount": payment.amount,
                "source": payment.trip.source,
                "destination": payment.trip.destination,
                "vehicle": f"{payment.trip.vehicle.brand} {payment.trip.vehicle.model} ({payment.trip.vehicle.registration_number})",
                "driver_name": payment.trip.driver.user.full_name,
                "status": payment.status,
            },
            status=status.HTTP_200_OK,
        )

    @extend_schema(
        tags=["Payments"],
        summary="Submit Payment",
        description="Customer chooses payment method (UPI, CARD, WALLET) and processes transaction through gateway.",
        request=PaymentPaySerializer,
        responses={200: OpenApiResponse(description="Payment processing result")},
    )
    @action(detail=True, methods=["post"], url_path="pay")
    def pay(self, request, pk=None):
        if getattr(settings, "PAYMENT_MODE", "STATIC_QR") == "STATIC_QR":
            return Response(
                {"detail": "Not available in this payment mode."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        payment = self.get_object()

        if request.user.role != User.Role.CUSTOMER or payment.customer_id != request.user.id:
            return Response(
                {"detail": "You can only pay for your own booking."},
                status=status.HTTP_403_FORBIDDEN,
            )

        if payment.status == Payment.Status.PAID:
            return Response(
                {"detail": "This payment has already been completed."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = PaymentPaySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        method = serializer.validated_data["payment_method"]

        payment.payment_method = method
        payment.save(update_fields=["payment_method"])

        # Call mock gateway
        gw_result = process_payment(payment, method)

        # Call centralized backend verification logic
        return verify_payment_transaction(
            payment_id=payment.id,
            gateway_reference=gw_result["gateway_reference"],
            gateway_status=gw_result["gateway_status"],
            signature=gw_result["signature"],
            failure_reason=gw_result.get("failure_reason"),
        )

    @extend_schema(
        tags=["Payments"],
        summary="Backend Verification",
        description="Verify incoming gateway webhook or payment signature using HMAC SHA-256.",
        request=PaymentVerifySerializer,
        responses={200: OpenApiResponse(description="Verification result")},
    )
    @action(detail=False, methods=["post"], url_path="verify")
    def verify(self, request):
        serializer = PaymentVerifySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        return verify_payment_transaction(
            payment_id=data["payment_id"],
            gateway_reference=data["gateway_reference"],
            gateway_status=data["gateway_status"],
            signature=data["signature"],
        )

    @extend_schema(
        tags=["Payments"],
        summary="Get Payment Information for Customer",
        description="Customer retrieves payment details including route, vehicle, driver name, amount, and active static QR image URL.",
        responses={200: PaymentPayInfoSerializer},
    )
    @action(detail=True, methods=["get"], url_path="pay-info")
    def pay_info(self, request, pk=None):
        try:
            payment = Payment.objects.select_related(
                "trip", "trip__vehicle", "trip__driver", "trip__driver__user", "customer"
            ).get(pk=pk)
        except Payment.DoesNotExist:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

        # Only the owning customer (or admin/fleet manager) can view pay-info
        if request.user.role == User.Role.CUSTOMER and payment.customer_id != request.user.id:
            return Response(
                {"detail": "You can only view payment information for your own booking."},
                status=status.HTTP_403_FORBIDDEN,
            )

        # Retrieve active static QR setting
        active_setting = PaymentQRSetting.objects.filter(is_active=True).first()
        qr_url = None
        upi_id = None
        qr_title = None
        if active_setting and active_setting.qr_image:
            qr_url = request.build_absolute_uri(active_setting.qr_image.url)
            upi_id = active_setting.upi_id
            qr_title = active_setting.title

        vehicle_desc = f"{payment.trip.vehicle.brand} {payment.trip.vehicle.model} ({payment.trip.vehicle.registration_number})"
        driver_name = payment.trip.driver.user.full_name if payment.trip.driver else "N/A"

        data = {
            "payment_id": payment.id,
            "amount": payment.amount,
            "route": f"{payment.trip.source} to {payment.trip.destination}",
            "vehicle": vehicle_desc,
            "driver_name": driver_name,
            "status": payment.status,
            "qr_image_url": qr_url,
            "upi_id": upi_id,
            "qr_title": qr_title,
        }
        return Response(data, status=status.HTTP_200_OK)

    @extend_schema(
        tags=["Payments"],
        summary="Submit Payment Proof",
        description="Customer submits transaction reference (6-30 alphanumeric) and optional screenshot proof. Sets status to PAYMENT_INITIATED.",
        request=SubmitProofSerializer,
        responses={200: PaymentSerializer},
    )
    @action(
        detail=True,
        methods=["post"],
        url_path="submit-proof",
        parser_classes=[MultiPartParser, FormParser],
    )
    def submit_proof(self, request, pk=None):
        try:
            payment = Payment.objects.select_related(
                "trip", "trip__vehicle", "trip__driver", "trip__driver__user", "customer"
            ).get(pk=pk)
        except Payment.DoesNotExist:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

        # Customer only, own payment
        if request.user.role != User.Role.CUSTOMER or payment.customer_id != request.user.id:
            return Response(
                {"detail": "You can only submit payment proof for your own booking."},
                status=status.HTTP_403_FORBIDDEN,
            )

        if payment.status == Payment.Status.PAID:
            return Response(
                {"detail": "This payment has already been completed."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = SubmitProofSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        tx_ref = serializer.validated_data["transaction_reference"].strip()
        proof_img = serializer.validated_data.get("proof_screenshot")

        # Unique check: transaction reference cannot be reused across payments
        if Payment.objects.exclude(id=payment.id).filter(transaction_reference=tx_ref).exists():
            return Response(
                {"detail": "This transaction reference has already been used for another payment."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Update payment
        payment.transaction_reference = tx_ref
        if proof_img:
            payment.proof_screenshot = proof_img
        payment.status = Payment.Status.PAYMENT_INITIATED
        payment.payment_method = Payment.PaymentMethod.UPI
        payment.failure_reason = None
        payment.save()

        # Notify assigned Driver, Fleet Managers, and Admins
        recipients = set()
        if payment.trip and payment.trip.driver and payment.trip.driver.user:
            recipients.add(payment.trip.driver.user)

        staff_users = User.objects.filter(
            role__in=[User.Role.ADMIN, User.Role.FLEET_MANAGER],
            is_active=True,
        )
        for s in staff_users:
            recipients.add(s)

        for u in recipients:
            notify(
                user=u,
                title="Payment Proof Submitted",
                message=f"Payment proof submitted for booking #{payment.booking_id} (Rs. {payment.amount}), please confirm.",
                type=Notification.NotificationType.PAYMENT,
                item_type="payment",
                item_id=payment.id,
            )

        return Response(PaymentSerializer(payment, context={"request": request}).data, status=status.HTTP_200_OK)

    @extend_schema(
        tags=["Payments"],
        summary="Confirm Payment Proof",
        description="Assigned Driver, Fleet Manager or Admin confirms payment proof. Sets status to PAID and creates receipt.",
        request=None,
        responses={200: ReceiptSerializer},
    )
    @action(detail=True, methods=["post"], url_path="confirm")
    def confirm(self, request, pk=None):
        payment = self.get_object()

        # Authorization: assigned driver of trip, Admin, Fleet Manager
        is_assigned_driver = (
            request.user.role == User.Role.DRIVER
            and payment.trip.driver.user_id == request.user.id
        )
        is_staff = request.user.role in [User.Role.ADMIN, User.Role.FLEET_MANAGER] or request.user.is_superuser

        if not (is_assigned_driver or is_staff):
            return Response(
                {"detail": "Only the assigned driver, Fleet Manager or Admin can confirm payment proof."},
                status=status.HTTP_403_FORBIDDEN,
            )

        # Idempotent check: if already PAID, return receipt directly
        if payment.status == Payment.Status.PAID:
            receipt = create_payment_receipt(payment)
            logger.info(f"Payment #{payment.id} already PAID. Amount: Rs. {payment.amount}, Ref: {payment.transaction_reference or payment.gateway_reference}")
            return Response(ReceiptSerializer(receipt).data, status=status.HTTP_200_OK)

        if payment.status != Payment.Status.PAYMENT_INITIATED:
            return Response(
                {"detail": f"Payment can only be confirmed when status is PAYMENT_INITIATED (current: {payment.status})."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        with transaction.atomic():
            payment.status = Payment.Status.PAID
            payment.paid_at = timezone.now()
            payment.save(update_fields=["status", "paid_at", "updated_at"])

            # Create immutable receipt
            receipt = create_payment_receipt(payment)
            logger.info(f"Payment #{payment.id} confirmed as PAID. Amount: Rs. {payment.amount}, Ref: {payment.transaction_reference or payment.gateway_reference}")

            # Notify customer
            notify(
                user=payment.customer,
                title="Payment Received",
                message=f"Payment received, receipt generated ({receipt.receipt_number}).",
                type=Notification.NotificationType.PAYMENT,
                item_type="payment",
                item_id=payment.id,
            )

        return Response(ReceiptSerializer(receipt).data, status=status.HTTP_200_OK)

    @extend_schema(
        tags=["Payments"],
        summary="Reject Payment Proof",
        description="Assigned Driver, Fleet Manager or Admin rejects payment proof. Reverts status to UNPAID with reason.",
        request=RejectProofSerializer,
        responses={200: PaymentSerializer},
    )
    @action(detail=True, methods=["post"], url_path="reject-proof")
    def reject_proof(self, request, pk=None):
        payment = self.get_object()

        # Authorization: assigned driver of trip, Admin, Fleet Manager
        is_assigned_driver = (
            request.user.role == User.Role.DRIVER
            and payment.trip.driver.user_id == request.user.id
        )
        is_staff = request.user.role in [User.Role.ADMIN, User.Role.FLEET_MANAGER] or request.user.is_superuser

        if not (is_assigned_driver or is_staff):
            return Response(
                {"detail": "Only the assigned driver, Fleet Manager or Admin can reject payment proof."},
                status=status.HTTP_403_FORBIDDEN,
            )

        if payment.status == Payment.Status.PAID:
            return Response(
                {"detail": "This payment has already been completed."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = RejectProofSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        reason = serializer.validated_data["reason"]

        with transaction.atomic():
            payment.status = Payment.Status.UNPAID
            payment.failure_reason = reason
            payment.save(update_fields=["status", "failure_reason", "updated_at"])

            # Notify customer
            notify(
                user=payment.customer,
                title="Payment Not Received",
                message=f"Payment not received, please try again: {reason}",
                type=Notification.NotificationType.PAYMENT,
            )

        return Response(PaymentSerializer(payment, context={"request": request}).data, status=status.HTTP_200_OK)


    @extend_schema(
        tags=["Payments"],
        summary="Get Receipt JSON",
        description="Get receipt details for a paid payment.",
        responses={200: ReceiptSerializer},
    )
    @action(detail=True, methods=["get"], url_path="receipt")
    def receipt(self, request, pk=None):
        payment = self.get_object()

        if not hasattr(payment, "receipt") or not payment.receipt:
            return Response(
                {"detail": "Receipt has not been issued for this payment yet."},
                status=status.HTTP_404_NOT_FOUND,
            )

        return Response(ReceiptSerializer(payment.receipt).data)

    @extend_schema(
        tags=["Payments"],
        summary="Download PDF Receipt",
        description="Download formatted PDF receipt for a paid payment.",
        responses={200: OpenApiResponse(description="PDF file")},
    )
    @action(detail=True, methods=["get"], url_path="receipt/pdf")
    def receipt_pdf(self, request, pk=None):
        payment = self.get_object()

        if not hasattr(payment, "receipt") or not payment.receipt:
            return Response(
                {"detail": "Receipt has not been issued for this payment yet."},
                status=status.HTTP_404_NOT_FOUND,
            )

        pdf_bytes = generate_receipt_pdf(payment.receipt)
        response = HttpResponse(pdf_bytes, content_type="application/pdf")
        filename = f"receipt_{payment.receipt.receipt_number}.pdf"
        response["Content-Disposition"] = f'attachment; filename="{filename}"'
        return response

    @extend_schema(
        tags=["Payments"],
        summary="Payment History",
        description="View payment history with pagination and status filters (Customer sees own; Staff sees all).",
        responses={200: PaymentSerializer(many=True)},
    )
    @action(detail=False, methods=["get"], url_path="history")
    def history(self, request):
        qs = self.filter_queryset(self.get_queryset())
        page = self.paginate_queryset(qs)
        if page is not None:
            return self.get_paginated_response(PaymentSerializer(page, many=True).data)
        return Response(PaymentSerializer(qs, many=True).data)

    @extend_schema(
        tags=["Payments"],
        summary="Refund Payment",
        description="Process refund for a paid payment (Admin only).",
        responses={200: OpenApiResponse(description="Refund outcome")},
    )
    @action(detail=True, methods=["post"], url_path="refund", permission_classes=[IsAdminUserOnly])
    def refund(self, request, pk=None):
        payment = self.get_object()

        if payment.status == Payment.Status.PAID:
            with transaction.atomic():
                payment.status = Payment.Status.REFUNDED
                payment.refunded_at = timezone.now()
                payment.save(update_fields=["status", "refunded_at", "updated_at"])

                # Update booking refund_status
                payment.booking.refund_status = Booking.RefundStatus.REFUNDED
                payment.booking.save(update_fields=["refund_status", "updated_at"])

                notify(
                    user=payment.customer,
                    title="Payment Refunded",
                    message=f"Your payment of Rs. {payment.amount} for booking #{payment.booking_id} has been refunded.",
                    type=Notification.NotificationType.PAYMENT,
                )

            return Response(PaymentSerializer(payment).data, status=status.HTTP_200_OK)

        # Check if booking had refund pending but payment was never completed
        if payment.booking.refund_status == Booking.RefundStatus.REFUND_PENDING:
            payment.booking.refund_status = Booking.RefundStatus.NONE
            payment.booking.save(update_fields=["refund_status", "updated_at"])
            return Response(
                {
                    "message": "Nothing was paid, so no refund is needed",
                    "payment": PaymentSerializer(payment).data,
                },
                status=status.HTTP_200_OK,
            )

        return Response(
            {"detail": f"Cannot refund payment with status {payment.status}."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    @extend_schema(
        tags=["Payments"],
        summary="Payments Summary",
        description="Aggregated totals for admin and manager dashboards.",
        responses={200: PaymentSummarySerializer},
    )
    @action(detail=False, methods=["get"], url_path="summary")
    def summary(self, request):
        if not (request.user.role in [User.Role.ADMIN, User.Role.FLEET_MANAGER] or request.user.is_superuser):
            return Response(
                {"detail": "Only Admin and Fleet Manager can view payment summary."},
                status=status.HTTP_403_FORBIDDEN,
            )

        all_payments = Payment.objects.all()

        total_collected = all_payments.filter(status=Payment.Status.PAID).aggregate(
            total=models.Sum("amount")
        )["total"] or Decimal("0.00")

        pending_amount = all_payments.filter(
            status__in=[Payment.Status.UNPAID, Payment.Status.PAYMENT_INITIATED]
        ).aggregate(total=models.Sum("amount"))["total"] or Decimal("0.00")

        failed_count = all_payments.filter(status=Payment.Status.FAILED).count()

        refunded_amount = all_payments.filter(status=Payment.Status.REFUNDED).aggregate(
            total=models.Sum("amount")
        )["total"] or Decimal("0.00")

        cash_collected = all_payments.filter(
            status=Payment.Status.PAID, payment_method=Payment.PaymentMethod.CASH
        ).aggregate(total=models.Sum("amount"))["total"] or Decimal("0.00")

        online_collected = all_payments.filter(status=Payment.Status.PAID).exclude(
            payment_method=Payment.PaymentMethod.CASH
        ).aggregate(total=models.Sum("amount"))["total"] or Decimal("0.00")

        cash_waiting_settlement = all_payments.filter(
            status=Payment.Status.PAID, payment_method=Payment.PaymentMethod.CASH, cash_settled=False
        ).aggregate(total=models.Sum("amount"))["total"] or Decimal("0.00")

        unsettled_cash_by_driver = list(
            all_payments.filter(
                status=Payment.Status.PAID,
                payment_method=Payment.PaymentMethod.CASH,
                cash_settled=False,
            )
            .values("collected_by__id", "collected_by__full_name")
            .annotate(total_cash=models.Sum("amount"), count=models.Count("id"))
            .order_by("-total_cash")
        )

        data = {
            "total_collected": total_collected,
            "pending_amount": pending_amount,
            "failed_count": failed_count,
            "refunded_amount": refunded_amount,
            "cash_collected": cash_collected,
            "online_collected": online_collected,
            "cash_waiting_settlement": cash_waiting_settlement,
            "cash_by_driver": [
                {
                    "driver_id": r["collected_by__id"],
                    "driver_name": r["collected_by__full_name"] or "Unknown Driver",
                    "total_cash": str(r["total_cash"]),
                    "count": r["count"],
                }
                for r in unsettled_cash_by_driver
            ],
        }
        return Response(data)

    @extend_schema(
        tags=["Payments"],
        summary="Collect Payment",
        description="Assigned driver collects CASH or ONLINE payment for completed trip.",
        request=PaymentCollectSerializer,
        responses={200: PaymentSerializer},
    )
    @action(detail=True, methods=["post"], url_path="collect")
    def collect(self, request, pk=None):
        payment = self.get_object()

        # Only assigned driver can collect
        if not (payment.trip and payment.trip.driver and payment.trip.driver.user_id == request.user.id):
            return Response(
                {"detail": "Only the assigned driver can collect payment for this trip."},
                status=status.HTTP_403_FORBIDDEN,
            )

        # Idempotent: a second call returns 400 "Already paid"
        if payment.status == Payment.Status.PAID:
            return Response(
                {"detail": "Already paid"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if payment.status not in [Payment.Status.UNPAID, Payment.Status.PAYMENT_INITIATED]:
            return Response(
                {"detail": f"Payment cannot be collected in status {payment.status}."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = PaymentCollectSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        method = serializer.validated_data["method"]
        tx_ref = serializer.validated_data.get("transaction_reference") or None

        with transaction.atomic():
            payment.status = Payment.Status.PAID
            payment.paid_at = timezone.now()
            payment.collected_by = request.user

            if method == "CASH":
                payment.payment_method = Payment.PaymentMethod.CASH
                payment.needs_verification = False
                payment.cash_settled = False
                method_label = "cash"
            else:  # ONLINE
                payment.payment_method = Payment.PaymentMethod.UPI
                payment.transaction_reference = tx_ref
                payment.needs_verification = bool(not tx_ref)
                method_label = "online transfer"

            payment.save(
                update_fields=[
                    "status",
                    "paid_at",
                    "collected_by",
                    "payment_method",
                    "transaction_reference",
                    "needs_verification",
                    "cash_settled",
                    "updated_at",
                ]
            )

            receipt = create_payment_receipt(payment)
            receipt_no = receipt.receipt_number if receipt else "N/A"

            # Notify customer
            msg = f"Payment received Rs. {payment.amount} by {method_label}, receipt {receipt_no}."
            notify(
                user=payment.customer,
                title="Payment Received",
                message=msg,
                type=Notification.NotificationType.PAYMENT,
                item_type="payment",
                item_id=payment.id,
            )

            # If ONLINE without reference, notify Fleet Managers and Admins
            if method == "ONLINE" and not tx_ref:
                managers = User.objects.filter(
                    role__in=[User.Role.ADMIN, User.Role.FLEET_MANAGER],
                    is_active=True,
                )
                for m in managers:
                    notify(
                        user=m,
                        title="Payment Needs Verification",
                        message=f"Payment #{payment.id} for Trip #{payment.trip_id} received via online transfer without reference number. Needs manual verification.",
                        type=Notification.NotificationType.PAYMENT,
                        item_type="payment",
                        item_id=payment.id,
                    )

        return Response(PaymentSerializer(payment, context={"request": request}).data, status=status.HTTP_200_OK)

    @extend_schema(
        tags=["Payments"],
        summary="Settle Cash Payment",
        description="Admin or Fleet Manager marks cash payment as settled with driver.",
        responses={200: PaymentSerializer},
    )
    @action(detail=True, methods=["post"], url_path="settle-cash")
    def settle_cash(self, request, pk=None):
        if not (request.user.role in [User.Role.ADMIN, User.Role.FLEET_MANAGER] or request.user.is_superuser):
            return Response(
                {"detail": "Only Admin and Fleet Manager can settle cash payments."},
                status=status.HTTP_403_FORBIDDEN,
            )

        payment = self.get_object()

        if payment.payment_method != Payment.PaymentMethod.CASH or payment.status != Payment.Status.PAID:
            return Response(
                {"detail": "Only paid cash payments can be settled."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if payment.cash_settled:
            return Response(
                {"detail": "Payment is already marked as cash settled."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        payment.cash_settled = True
        payment.cash_settled_at = timezone.now()
        payment.cash_settled_by = request.user
        payment.save(update_fields=["cash_settled", "cash_settled_at", "cash_settled_by", "updated_at"])

        return Response(PaymentSerializer(payment, context={"request": request}).data, status=status.HTTP_200_OK)


class PaymentQRSettingView(APIView):
    """
    Endpoint for managing active static QR settings:
    - GET: Any logged-in user retrieves the active QR image URL, title, and UPI ID.
    - POST / PUT: Admin uploads or updates the QR setting (multipart form).
    """

    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    @extend_schema(
        tags=["Payments"],
        summary="Get Active QR Setting",
        description="Any logged-in user retrieves the active payment QR setting and image URL.",
        responses={200: PaymentQRSettingSerializer},
    )
    def get(self, request):
        setting = PaymentQRSetting.objects.filter(is_active=True).first()
        if not setting:
            return Response(
                {"detail": "No active payment QR code is currently configured by admin."},
                status=status.HTTP_404_NOT_FOUND,
            )
        serializer = PaymentQRSettingSerializer(setting, context={"request": request})
        return Response(serializer.data, status=status.HTTP_200_OK)

    @extend_schema(
        tags=["Payments"],
        summary="Create Active QR Setting",
        description="Admin uploads new QR code image and sets UPI ID.",
        request=PaymentQRSettingSerializer,
        responses={201: PaymentQRSettingSerializer},
    )
    def post(self, request):
        if not (request.user.role == User.Role.ADMIN or request.user.is_superuser):
            return Response(
                {"detail": "Only Admin can upload or configure payment QR settings."},
                status=status.HTTP_403_FORBIDDEN,
            )

        serializer = PaymentQRSettingSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        setting = serializer.save(updated_by=request.user, is_active=True)
        return Response(
            PaymentQRSettingSerializer(setting, context={"request": request}).data,
            status=status.HTTP_201_CREATED,
        )

    @extend_schema(
        tags=["Payments"],
        summary="Update Active QR Setting",
        description="Admin updates existing active QR code image or UPI ID.",
        request=PaymentQRSettingSerializer,
        responses={200: PaymentQRSettingSerializer},
    )
    def put(self, request):
        if not (request.user.role == User.Role.ADMIN or request.user.is_superuser):
            return Response(
                {"detail": "Only Admin can upload or configure payment QR settings."},
                status=status.HTTP_403_FORBIDDEN,
            )

        setting = PaymentQRSetting.objects.filter(is_active=True).first()
        if not setting:
            # If none exists yet, create one
            serializer = PaymentQRSettingSerializer(data=request.data, context={"request": request})
            serializer.is_valid(raise_exception=True)
            new_setting = serializer.save(updated_by=request.user, is_active=True)
            return Response(
                PaymentQRSettingSerializer(new_setting, context={"request": request}).data,
                status=status.HTTP_201_CREATED,
            )

        serializer = PaymentQRSettingSerializer(setting, data=request.data, partial=True, context={"request": request})
        serializer.is_valid(raise_exception=True)
        updated_setting = serializer.save(updated_by=request.user, is_active=True)
        return Response(
            PaymentQRSettingSerializer(updated_setting, context={"request": request}).data,
            status=status.HTTP_200_OK,
        )

