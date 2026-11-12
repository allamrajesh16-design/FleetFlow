from datetime import timedelta
import random
from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from rest_framework import status
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken
from drf_spectacular.utils import extend_schema, extend_schema_view, OpenApiResponse

import logging
from django.conf import settings
from django.core.exceptions import ValidationError
from notifications.models import Notification, notify
from .emails import (
    send_email,
    send_otp_email,
    send_password_reset_otp_email,
    send_password_changed_email,
    send_approval_email,
    send_rejection_email,
    EmailDeliveryError,
    EmailRecipientRefusedError,
)
from .email_validation import validate_real_email, EmailValidationError
from .models import User, EmailOTP, PasswordResetSession, PasswordResetToken

logger = logging.getLogger(__name__)
from .serializers import (
    UserSerializer,
    RegisterSerializer,
    VerifyOTPSerializer,
    ResendOTPSerializer,
    ApprovalActionSerializer,
    LoginSerializer,
    ForgotPasswordSerializer,
    VerifyResetOTPSerializer,
    ResetPasswordConfirmSerializer,
    ResetPasswordSerializer,
    UserProfileSerializer,
    ChangePasswordSerializer,
    LogoutSerializer,
    CheckEmailSerializer,
)
from .throttles import (
    LoginRateThrottle,
    RegisterRateThrottle,
    OTPRateThrottle,
    PasswordResetRateThrottle,
    CheckEmailRateThrottle,
    ForgotPasswordEmailRateThrottle,
    ForgotPasswordIPRateThrottle,
    VerifyResetOTPRateThrottle,
)


import secrets


def generate_and_send_otp(user: User, purpose: str = EmailOTP.Purpose.REGISTER):
    """Generates a cryptographically secure 6-digit OTP, stores its SHA-256 hash in EmailOTP, and sends an email."""
    otp_code = f"{secrets.randbelow(900000) + 100000}"
    otp_hash = EmailOTP.hash_otp(otp_code)
    expires_at = timezone.now() + timedelta(minutes=5)

    # Invalidate previous unused OTPs for this user and purpose
    EmailOTP.objects.filter(user=user, purpose=purpose, is_used=False).update(is_used=True)

    # Create new record
    EmailOTP.objects.create(
        user=user,
        purpose=purpose,
        otp_hash=otp_hash,
        expires_at=expires_at,
        attempts=0,
    )

    if purpose == EmailOTP.Purpose.PASSWORD_RESET:
        send_password_reset_otp_email(user, otp_code)
    else:
        # Send plain text & styled HTML registration OTP email
        send_otp_email(user, otp_code)
    return otp_code


class RegisterOptionsView(APIView):
    """Returns currently available roles for public registration."""

    permission_classes = [AllowAny]

    @extend_schema(
        tags=["Auth"],
        summary="Get registration role options",
        description="Returns list of roles allowed for registration. ADMIN is only included if no active admin exists.",
        responses={200: OpenApiResponse(description="List of allowed roles")},
    )
    def get(self, request):
        has_admin = User.objects.filter(role=User.Role.ADMIN, is_active=True).exists()
        roles = [
            {"value": User.Role.CUSTOMER, "label": "Customer"},
            {"value": User.Role.DRIVER, "label": "Driver"},
            {"value": User.Role.FLEET_MANAGER, "label": "Fleet Manager"},
        ]
        if not has_admin:
            roles.insert(0, {"value": User.Role.ADMIN, "label": "Admin"})

        return Response({"roles": roles}, status=status.HTTP_200_OK)


class RegisterView(APIView):
    """Register a new account (Customer, Driver, Fleet Manager, or initial Admin)."""

    permission_classes = [AllowAny]
    throttle_classes = [RegisterRateThrottle]

    @extend_schema(
        tags=["Auth"],
        summary="User Registration",
        description="Public registration for Customer, Fleet Manager, Driver, and initial Admin. Sends an OTP to email.",
        request=RegisterSerializer,
        responses={
            201: OpenApiResponse(description="OTP sent to your email"),
            400: OpenApiResponse(description="Validation error"),
        },
    )
    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        role = data.get("role", User.Role.CUSTOMER)
        email = data["email"]
        full_name = data["full_name"]
        phone = data.get("phone")
        password = data["password"]

        try:
            with transaction.atomic():
                # If role is ADMIN, use database lock to ensure only one initial Admin can register
                if role == User.Role.ADMIN:
                    admin_exists = User.objects.select_for_update().filter(role=User.Role.ADMIN, is_active=True).exists()
                    if admin_exists:
                        return Response(
                            {"role": ["Admin registration is not allowed because an admin account already exists."]},
                            status=status.HTTP_400_BAD_REQUEST,
                        )

                # Check for existing unverified user to replace
                existing_unverified = User.objects.select_for_update().filter(email__iexact=email, is_email_verified=False).first()
                if existing_unverified:
                    user = existing_unverified
                    user.set_password(password)
                    user.full_name = full_name
                    user.phone = phone
                    user.role = role
                    user.is_active = True
                    user.approval_status = User.ApprovalStatus.NOT_REQUIRED
                    user.save()

                    if role == User.Role.DRIVER:
                        from drivers.models import Driver
                        Driver.objects.update_or_create(
                            user=user,
                            defaults={
                                "license_number": data.get("license_number", ""),
                                "license_expiry": data.get("license_expiry"),
                                "status": Driver.Status.INACTIVE,
                            },
                        )
                else:
                    # Determine initial approval status
                    # Approval is NOT_REQUIRED initially; after OTP verification it becomes PENDING for Fleet Manager & Driver
                    user = User.objects.create_user(
                        email=email,
                        password=password,
                        full_name=full_name,
                        phone=phone,
                        role=role,
                        is_active=True,
                        is_email_verified=False,
                        approval_status=User.ApprovalStatus.NOT_REQUIRED,
                    )

                    # For DRIVER, create Driver profile with INACTIVE status
                    if role == User.Role.DRIVER:
                        from drivers.models import Driver
                        Driver.objects.create(
                            user=user,
                            license_number=data["license_number"],
                            license_expiry=data["license_expiry"],
                            status=Driver.Status.INACTIVE,
                        )

                # Generate and send 6-digit OTP (rolls back transaction if email fails)
                generate_and_send_otp(user)
        except EmailRecipientRefusedError:
            return Response(
                {"detail": "We could not deliver to this email. Please check the spelling."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        except EmailDeliveryError:
            return Response(
                {"detail": "We could not send the email. Please try again."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        resp_data = {
            "message": "OTP sent to your email",
            "user_id": user.id,
            "email": user.email,
        }
        if settings.DEBUG and "console" in getattr(settings, "EMAIL_BACKEND", "").lower():
            resp_data["email_mode"] = "console"

        return Response(resp_data, status=status.HTTP_201_CREATED)


class VerifyOTPView(APIView):
    """Verify 6-digit email OTP to complete registration or submit for approval."""

    permission_classes = [AllowAny]
    throttle_classes = [OTPRateThrottle]

    @extend_schema(
        tags=["Auth"],
        summary="Verify Email OTP",
        description="Verify OTP received on registered email. Activates Customer/Admin or queues Fleet Manager/Driver for approval.",
        request=VerifyOTPSerializer,
        responses={
            200: OpenApiResponse(description="Verification result"),
            400: OpenApiResponse(description="Invalid or expired OTP"),
        },
    )
    def post(self, request):
        serializer = VerifyOTPSerializer(data=request.data)
        if not serializer.is_valid():
            errors = serializer.errors
            if "otp" in errors:
                return Response(
                    {
                        "code": "INVALID_OTP_FORMAT",
                        "message": "Please enter a valid 6-digit verification code.",
                        "detail": "Please enter a valid 6-digit verification code.",
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if "email" in errors:
                return Response(
                    {
                        "code": "INVALID_EMAIL",
                        "message": "Please provide a valid registered email address.",
                        "detail": "Please provide a valid registered email address.",
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )
            first_err = list(errors.values())[0]
            msg = first_err[0] if isinstance(first_err, list) else str(first_err)
            return Response(
                {"code": "VALIDATION_ERROR", "message": msg, "detail": msg},
                status=status.HTTP_400_BAD_REQUEST,
            )

        email = serializer.validated_data["email"]
        otp_input = serializer.validated_data["otp"]

        try:
            user = User.objects.get(email__iexact=email)
        except User.DoesNotExist:
            return Response(
                {
                    "code": "NO_OTP_FOUND",
                    "message": "No account or OTP found for this email address.",
                    "detail": "No account or OTP found for this email address.",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        if user.is_email_verified:
            return Response(
                {
                    "code": "ALREADY_VERIFIED",
                    "message": "Email is already verified. You can login.",
                    "detail": "Email is already verified. You can login.",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Get latest registration OTP
        otp_record = user.email_otps.filter(
            purpose=EmailOTP.Purpose.REGISTER,
            is_used=False,
        ).order_by("-created_at").first()
        if not otp_record:
            return Response(
                {
                    "code": "NO_OTP_FOUND",
                    "message": "No active OTP found. Please request a new OTP.",
                    "detail": "No active OTP found. Please request a new OTP.",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        success, err_code, err_msg, attempts_left = otp_record.verify_otp(otp_input)
        if not success:
            resp_data = {
                "code": err_code,
                "message": err_msg,
                "detail": err_msg,
            }
            if attempts_left is not None:
                resp_data["attempts_left"] = attempts_left
            return Response(resp_data, status=status.HTTP_400_BAD_REQUEST)

        # Mark user email as verified
        user.is_email_verified = True

        if user.role in [User.Role.CUSTOMER, User.Role.ADMIN]:
            user.approval_status = User.ApprovalStatus.APPROVED
            user.save(update_fields=["is_email_verified", "approval_status", "updated_at"])

            notify(
                user=user,
                title="Welcome to FleetFlow",
                message=f"Welcome {user.full_name}! Your account is verified and ready to use.",
                type=Notification.NotificationType.SYSTEM,
            )
            return Response(
                {
                    "message": "Email verified successfully. Registration complete. You can login now.",
                    "role": user.role,
                    "approval_status": user.approval_status,
                },
                status=status.HTTP_200_OK,
            )

        elif user.role == User.Role.FLEET_MANAGER:
            user.approval_status = User.ApprovalStatus.PENDING
            user.save(update_fields=["is_email_verified", "approval_status", "updated_at"])

            # Notify all active Admins
            admins = User.objects.filter(role=User.Role.ADMIN, is_active=True)
            for admin_user in admins:
                notify(
                    user=admin_user,
                    title="New Fleet Manager Request",
                    message=f"New Fleet Manager request from {user.full_name} ({user.email}).",
                    type=Notification.NotificationType.SYSTEM,
                )
                send_email(
                    admin_user.email,
                    "FleetFlow - New Fleet Manager Approval Request",
                    f"Admin Alert:\n\nA new Fleet Manager registration request has been submitted by {user.full_name} ({user.email}). Please review and approve or reject it from your dashboard.",
                )

            return Response(
                {
                    "message": "Email verified. Your request is waiting for Admin approval.",
                    "role": user.role,
                    "approval_status": user.approval_status,
                },
                status=status.HTTP_200_OK,
            )

        elif user.role == User.Role.DRIVER:
            user.approval_status = User.ApprovalStatus.PENDING
            user.save(update_fields=["is_email_verified", "approval_status", "updated_at"])

            # Notify all active Fleet Managers and Admins
            managers_and_admins = User.objects.filter(
                role__in=[User.Role.FLEET_MANAGER, User.Role.ADMIN],
                is_active=True,
            )
            for staff in managers_and_admins:
                notify(
                    user=staff,
                    title="New Driver Request",
                    message=f"New Driver request from {user.full_name} ({user.email}).",
                    type=Notification.NotificationType.SYSTEM,
                )
                send_email(
                    staff.email,
                    "FleetFlow - New Driver Approval Request",
                    f"Manager Alert:\n\nA new Driver registration request has been submitted by {user.full_name} ({user.email}). Please review and approve or reject it from your dashboard.",
                )

            return Response(
                {
                    "message": "Email verified. Your request is waiting for Fleet Manager approval.",
                    "role": user.role,
                    "approval_status": user.approval_status,
                },
                status=status.HTTP_200_OK,
            )

        user.save(update_fields=["is_email_verified", "updated_at"])
        return Response(
            {
                "message": "Email verified successfully.",
                "role": user.role,
                "approval_status": user.approval_status,
            },
            status=status.HTTP_200_OK,
        )


class ResendOTPView(APIView):
    """Resend 6-digit email OTP (respects 60-second cooldown)."""

    permission_classes = [AllowAny]
    throttle_classes = [OTPRateThrottle]

    @extend_schema(
        tags=["Auth"],
        summary="Resend Email OTP",
        description="Resend a fresh OTP to user's email. Requires at least 60 seconds since the last OTP was sent.",
        request=ResendOTPSerializer,
        responses={
            200: OpenApiResponse(description="OTP resent"),
            400: OpenApiResponse(description="Rate limited or already verified"),
        },
    )
    def post(self, request):
        serializer = ResendOTPSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data["email"]

        try:
            user = User.objects.get(email__iexact=email)
        except User.DoesNotExist:
            return Response({"detail": "User not found."}, status=status.HTTP_404_NOT_FOUND)

        if user.is_email_verified:
            return Response(
                {
                    "code": "ALREADY_VERIFIED",
                    "message": "Email is already verified. You can login.",
                    "detail": "Email is already verified. You can login.",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        last_otp = user.email_otps.filter(purpose=EmailOTP.Purpose.REGISTER).order_by("-created_at").first()
        if last_otp:
            seconds_elapsed = (timezone.now() - last_otp.last_sent_at).total_seconds()
            if seconds_elapsed < 60:
                wait_time = int(60 - seconds_elapsed)
                return Response(
                    {"detail": f"Please wait {wait_time} seconds before requesting a new OTP."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        try:
            generate_and_send_otp(user, purpose=EmailOTP.Purpose.REGISTER)
        except EmailDeliveryError:
            return Response(
                {"detail": "We could not send the email. Please try again."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        resp_data = {"message": "A new OTP has been sent to your email."}
        if settings.DEBUG and "console" in getattr(settings, "EMAIL_BACKEND", "").lower():
            resp_data["email_mode"] = "console"

        return Response(resp_data, status=status.HTTP_200_OK)


class ApprovalsListView(APIView):
    """List pending registration requests for Admin and Fleet Manager."""

    permission_classes = [IsAuthenticated]

    @extend_schema(
        tags=["Auth Approvals"],
        summary="List Pending Approvals",
        description="Admin sees pending FLEET_MANAGER and DRIVER requests. Fleet Manager sees only pending DRIVER requests.",
        responses={200: UserSerializer(many=True)},
    )
    def get(self, request):
        user = request.user
        if not (user.role in [User.Role.ADMIN, User.Role.FLEET_MANAGER] or user.is_superuser):
            return Response({"detail": "You do not have permission to access approvals."}, status=status.HTTP_403_FORBIDDEN)

        qs = User.objects.filter(is_email_verified=True, approval_status=User.ApprovalStatus.PENDING)

        role_param = request.query_params.get("role")
        if role_param and role_param.upper() in [User.Role.FLEET_MANAGER, User.Role.DRIVER]:
            # Fleet manager cannot query fleet manager requests
            if user.role == User.Role.FLEET_MANAGER and not user.is_superuser:
                qs = qs.filter(role=User.Role.DRIVER)
            else:
                qs = qs.filter(role=role_param.upper())
        elif user.role == User.Role.FLEET_MANAGER and not user.is_superuser:
            # Fleet Manager can ONLY view DRIVER requests
            qs = qs.filter(role=User.Role.DRIVER)
        else:
            # Admin can view FLEET_MANAGER and DRIVER requests
            qs = qs.filter(role__in=[User.Role.FLEET_MANAGER, User.Role.DRIVER])

        search_query = request.query_params.get("search")
        if search_query and search_query.strip():
            term = search_query.strip()
            qs = qs.filter(
                Q(full_name__icontains=term) |
                Q(email__icontains=term) |
                Q(phone__icontains=term)
            )

        qs = qs.order_by("-created_at")

        paginator = PageNumberPagination()
        paginator.page_size = 10
        page = paginator.paginate_queryset(qs, request)
        if page is not None:
            serializer = UserSerializer(page, many=True)
            return paginator.get_paginated_response(serializer.data)

        serializer = UserSerializer(qs, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)


class ApproveUserView(APIView):
    """Approve a pending registration request."""

    permission_classes = [IsAuthenticated]

    @extend_schema(
        tags=["Auth Approvals"],
        summary="Approve User Request",
        description="Admin can approve Fleet Manager or Driver. Fleet Manager can approve only Driver.",
        request=None,
        responses={200: UserSerializer},
    )
    def post(self, request, user_id):
        actor = request.user
        if not (actor.role in [User.Role.ADMIN, User.Role.FLEET_MANAGER] or actor.is_superuser):
            return Response({"detail": "You do not have permission to approve requests."}, status=status.HTTP_403_FORBIDDEN)

        try:
            target_user = User.objects.get(id=user_id)
        except User.DoesNotExist:
            return Response({"detail": "User not found."}, status=status.HTTP_404_NOT_FOUND)

        if not target_user.is_email_verified or target_user.approval_status != User.ApprovalStatus.PENDING:
            return Response(
                {"detail": "Only email-verified users with PENDING status can be approved."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Fleet Manager cannot approve Fleet Manager
        if actor.role == User.Role.FLEET_MANAGER and not actor.is_superuser:
            if target_user.role != User.Role.DRIVER:
                return Response(
                    {"detail": "Fleet Managers can only approve Driver requests."},
                    status=status.HTTP_403_FORBIDDEN,
                )

        # Apply approval
        with transaction.atomic():
            target_user.approval_status = User.ApprovalStatus.APPROVED
            target_user.is_active = True
            target_user.approved_by = actor
            target_user.approved_at = timezone.now()
            target_user.save(update_fields=["approval_status", "is_active", "approved_by", "approved_at", "updated_at"])

            # If DRIVER, set driver profile status to ACTIVE
            if target_user.role == User.Role.DRIVER and hasattr(target_user, "driver_profile"):
                driver_profile = target_user.driver_profile
                driver_profile.status = "ACTIVE"
                driver_profile.save(update_fields=["status", "updated_at"])

        # Notify user (in-app and email)
        notify(
            user=target_user,
            title="Registration Approved",
            message="Your registration is accepted. You can login now.",
            type=Notification.NotificationType.SYSTEM,
        )
        email_sent = True
        try:
            send_approval_email(target_user)
        except Exception as e:
            logger.error("Failed to send approval email: %s", e)
            email_sent = False

        resp_data = UserSerializer(target_user).data
        resp_data["email_sent"] = email_sent
        if not email_sent:
            resp_data["warning"] = "Decision saved, but the email could not be sent."
        return Response(resp_data, status=status.HTTP_200_OK)


class RejectUserView(APIView):
    """Reject a pending registration request with a reason."""

    permission_classes = [IsAuthenticated]

    @extend_schema(
        tags=["Auth Approvals"],
        summary="Reject User Request",
        description="Admin can reject Fleet Manager or Driver. Fleet Manager can reject only Driver.",
        request=ApprovalActionSerializer,
        responses={200: UserSerializer},
    )
    def post(self, request, user_id):
        actor = request.user
        if not (actor.role in [User.Role.ADMIN, User.Role.FLEET_MANAGER] or actor.is_superuser):
            return Response({"detail": "You do not have permission to reject requests."}, status=status.HTTP_403_FORBIDDEN)

        try:
            target_user = User.objects.get(id=user_id)
        except User.DoesNotExist:
            return Response({"detail": "User not found."}, status=status.HTTP_404_NOT_FOUND)

        if not target_user.is_email_verified or target_user.approval_status != User.ApprovalStatus.PENDING:
            return Response(
                {"detail": "Only email-verified users with PENDING status can be rejected."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if actor.role == User.Role.FLEET_MANAGER and not actor.is_superuser:
            if target_user.role != User.Role.DRIVER:
                return Response(
                    {"detail": "Fleet Managers can only reject Driver requests."},
                    status=status.HTTP_403_FORBIDDEN,
                )

        serializer = ApprovalActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        reason = serializer.validated_data["reason"]

        target_user.approval_status = User.ApprovalStatus.REJECTED
        target_user.approved_by = actor
        target_user.approved_at = timezone.now()
        target_user.rejection_reason = reason
        target_user.save(update_fields=["approval_status", "approved_by", "approved_at", "rejection_reason", "updated_at"])

        # Notify user (in-app and email)
        notify(
            user=target_user,
            title="Registration Request Rejected",
            message=f"Your registration request was rejected. Reason: {reason}",
            type=Notification.NotificationType.SYSTEM,
        )
        email_sent = True
        try:
            send_rejection_email(target_user, reason)
        except Exception as e:
            logger.error("Failed to send rejection email: %s", e)
            email_sent = False

        resp_data = UserSerializer(target_user).data
        resp_data["email_sent"] = email_sent
        if not email_sent:
            resp_data["warning"] = "Decision saved, but the email could not be sent."
        return Response(resp_data, status=status.HTTP_200_OK)


class ResendDecisionEmailView(APIView):
    """Resend registration approval or rejection decision email."""

    permission_classes = [IsAuthenticated]

    @extend_schema(
        tags=["Auth Approvals"],
        summary="Resend Decision Email",
        description="Admin can resend decision email for Fleet Manager or Driver. Fleet Manager can resend only for Driver.",
        request=None,
        responses={200: dict},
    )
    def post(self, request, user_id):
        actor = request.user
        if not (actor.role in [User.Role.ADMIN, User.Role.FLEET_MANAGER] or actor.is_superuser):
            return Response({"detail": "You do not have permission to resend decision emails."}, status=status.HTTP_403_FORBIDDEN)

        try:
            target_user = User.objects.get(id=user_id)
        except User.DoesNotExist:
            return Response({"detail": "User not found."}, status=status.HTTP_404_NOT_FOUND)

        if target_user.approval_status not in [User.ApprovalStatus.APPROVED, User.ApprovalStatus.REJECTED]:
            return Response(
                {"detail": "Decision email can only be resent for APPROVED or REJECTED accounts."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if actor.role == User.Role.FLEET_MANAGER and not actor.is_superuser:
            if target_user.role != User.Role.DRIVER:
                return Response(
                    {"detail": "Fleet Managers can only resend decision emails for Driver requests."},
                    status=status.HTTP_403_FORBIDDEN,
                )

        try:
            if target_user.approval_status == User.ApprovalStatus.APPROVED:
                send_approval_email(target_user)
            else:
                send_rejection_email(target_user, target_user.rejection_reason or "Registration criteria not met.")
        except Exception as e:
            logger.error("Failed to resend decision email: %s", e)
            return Response(
                {"detail": "Failed to dispatch email. Please check mail backend configuration."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        return Response(
            {"message": f"Decision email dispatched successfully to {target_user.email}."},
            status=status.HTTP_200_OK,
        )


class LoginView(APIView):
    """Authenticate user with email or phone + password with verification and approval checks."""

    permission_classes = [AllowAny]
    throttle_classes = [LoginRateThrottle]

    @extend_schema(
        tags=["Auth"],
        summary="User Login",
        description="Login with registered email or phone and password. Verifies email verification and approval status.",
        request=LoginSerializer,
        responses={
            200: OpenApiResponse(description="JWT token pair and user profile details"),
            400: OpenApiResponse(description="Invalid credentials"),
            403: OpenApiResponse(description="Unverified or Pending/Rejected status"),
        },
    )
    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.validated_data["user"]

        # Check 1: Email verification
        if not user.is_email_verified:
            return Response(
                {
                    "code": "EMAIL_NOT_VERIFIED",
                    "message": "Please verify your email with the OTP.",
                    "detail": "Please verify your email with the OTP.",
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        # Check 2: Approval status PENDING
        if user.approval_status == User.ApprovalStatus.PENDING:
            return Response(
                {
                    "code": "APPROVAL_PENDING",
                    "message": "Your request is waiting for approval.",
                    "detail": "Your request is waiting for approval.",
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        # Check 3: Approval status REJECTED
        if user.approval_status == User.ApprovalStatus.REJECTED:
            reason = user.rejection_reason or "Registration criteria not met."
            return Response(
                {
                    "code": "APPROVAL_REJECTED",
                    "message": f"Your request was rejected: {reason}",
                    "detail": f"Your request was rejected: {reason}",
                    "rejection_reason": reason,
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        if not user.is_active:
            return Response(
                {
                    "non_field_errors": ["Invalid email/phone or password."],
                    "detail": "Invalid email/phone or password.",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        refresh = RefreshToken.for_user(user)
        return Response(
            {
                "access": str(refresh.access_token),
                "refresh": str(refresh),
                "user": {
                    "id": user.id,
                    "full_name": user.full_name,
                    "email": user.email,
                    "phone": user.phone,
                    "role": user.role,
                },
            },
            status=status.HTTP_200_OK,
        )


class ForgotPasswordView(APIView):
    """
    Request a 6-digit OTP code to reset password.
    Always returns the identical 200 response to prevent email enumeration.
    """

    permission_classes = [AllowAny]
    throttle_classes = [ForgotPasswordEmailRateThrottle, ForgotPasswordIPRateThrottle]

    @extend_schema(
        tags=["Auth"],
        summary="Forgot Password - Request Reset Code",
        description=(
            "Send a 6-digit password reset code to the user's email. "
            "Returns a consistent 200 response with seconds_left for cooldown."
        ),
        request=ForgotPasswordSerializer,
        responses={
            200: OpenApiResponse(description="Generic confirmation response"),
            429: OpenApiResponse(description="Rate limit exceeded"),
        },
    )
    def post(self, request):
        serializer = ForgotPasswordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data["email"]

        generic_message = "If this email is registered, a code has been sent."
        target_user = None

        try:
            user = User.objects.get(email__iexact=email)
            # Only send OTP if user is active, verified, and approved
            if (
                user.is_active
                and user.is_email_verified
                and user.approval_status == User.ApprovalStatus.APPROVED
            ):
                target_user = user
        except User.DoesNotExist:
            target_user = None

        if target_user:
            # Check 60-second resend cooldown on PASSWORD_RESET OTPs
            last_otp = target_user.email_otps.filter(
                purpose=EmailOTP.Purpose.PASSWORD_RESET
            ).order_by("-created_at").first()

            if last_otp:
                seconds_elapsed = (timezone.now() - last_otp.last_sent_at).total_seconds()
                if seconds_elapsed < 60:
                    wait_time = int(60 - seconds_elapsed)
                    return Response(
                        {
                            "message": generic_message,
                            "seconds_left": wait_time,
                        },
                        status=status.HTTP_200_OK,
                    )

            try:
                generate_and_send_otp(target_user, purpose=EmailOTP.Purpose.PASSWORD_RESET)
            except EmailDeliveryError:
                # Do not leak delivery failure or account existence, log safely
                logger.warning("Failed to send password reset OTP to %s", email)

            return Response(
                {
                    "message": generic_message,
                    "seconds_left": 60,
                },
                status=status.HTTP_200_OK,
            )

        # For unknown or ineligible accounts, keep response time similar and return plausible seconds_left
        return Response(
            {
                "message": generic_message,
                "seconds_left": 60,
            },
            status=status.HTTP_200_OK,
        )


class VerifyResetOTPView(APIView):
    """
    Verify 6-digit OTP code for password reset.
    On success, creates and returns a single-use short-lived reset_token.
    """

    permission_classes = [AllowAny]
    throttle_classes = [VerifyResetOTPRateThrottle]

    @extend_schema(
        tags=["Auth"],
        summary="Forgot Password - Verify Reset Code",
        description="Verify the 6-digit reset code and obtain a single-use short-lived reset session token.",
        request=VerifyResetOTPSerializer,
        responses={
            200: OpenApiResponse(description="Reset token issued"),
            400: OpenApiResponse(description="Invalid or expired code"),
        },
    )
    def post(self, request):
        serializer = VerifyResetOTPSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        email = serializer.validated_data["email"]
        input_otp = serializer.validated_data["otp"]

        target_user = None
        try:
            target_user = User.objects.get(email__iexact=email)
        except User.DoesNotExist:
            target_user = None

        if not target_user:
            # Plausible error response for non-existent email without leaking existence
            return Response(
                {
                    "detail": "Invalid or expired code.",
                    "attempts_left": 4,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Retrieve latest unused PASSWORD_RESET OTP
        otp_record = target_user.email_otps.filter(
            purpose=EmailOTP.Purpose.PASSWORD_RESET,
            is_used=False,
        ).order_by("-created_at").first()

        if not otp_record:
            return Response(
                {
                    "detail": "Invalid or expired code.",
                    "attempts_left": 0,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        success, err_code, err_msg, attempts_left = otp_record.verify_otp(input_otp)
        if not success:
            resp_data = {
                "detail": "Invalid or expired code.",
            }
            if attempts_left is not None:
                resp_data["attempts_left"] = attempts_left
            elif err_code == "TOO_MANY_ATTEMPTS":
                resp_data["attempts_left"] = 0
            return Response(resp_data, status=status.HTTP_400_BAD_REQUEST)

        # OTP verified successfully! Create a 10-minute single-use PasswordResetSession
        session, raw_token = PasswordResetSession.create_session(target_user, expires_in_minutes=10)

        return Response(
            {
                "message": "Code verified successfully.",
                "reset_token": raw_token,
            },
            status=status.HTTP_200_OK,
        )


class ResetPasswordView(APIView):
    """
    Reset password using a valid short-lived reset token.
    Blacklists all outstanding refresh tokens and notifies the user.
    """

    permission_classes = [AllowAny]
    throttle_classes = [PasswordResetRateThrottle]

    @extend_schema(
        tags=["Auth"],
        summary="Forgot Password - Reset Password",
        description="Set new password using single-use reset token. Invalidates all active sessions.",
        request=ResetPasswordConfirmSerializer,
        responses={
            200: OpenApiResponse(description="Password successfully updated"),
            400: OpenApiResponse(description="Invalid or expired reset token"),
        },
    )
    def post(self, request):
        serializer = ResetPasswordConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        session = serializer.validated_data["session"]
        user = serializer.validated_data["user"]
        new_password = serializer.validated_data["new_password"]

        with transaction.atomic():
            # 1. Update password
            user.set_password(new_password)
            user.save(update_fields=["password", "updated_at"])

            # 2. Mark this session and all open reset sessions and OTPs as used
            session.is_used = True
            session.save(update_fields=["is_used"])
            PasswordResetSession.objects.filter(user=user, is_used=False).update(is_used=True)
            EmailOTP.objects.filter(user=user, is_used=False).update(is_used=True)

            # 3. Blacklist all outstanding refresh tokens for this user
            from rest_framework_simplejwt.token_blacklist.models import OutstandingToken, BlacklistedToken
            outstanding_tokens = OutstandingToken.objects.filter(user=user)
            for ot in outstanding_tokens:
                try:
                    BlacklistedToken.objects.get_or_create(token=ot)
                except Exception:
                    pass

            # 4. In-app notification
            notify(
                user=user,
                title="Security Alert: Password Changed",
                message="Your FleetFlow account password was recently changed. If this wasn't you, contact support immediately.",
                type=Notification.NotificationType.SYSTEM,
            )

        # 5. Send notification email with timestamp
        now_time_str = timezone.now().strftime("%Y-%m-%d %H:%M:%S UTC")
        try:
            send_password_changed_email(user, now_time_str)
        except Exception:
            logger.warning("Failed to send password changed alert email to %s", user.email)

        return Response(
            {"message": "Password updated successfully. Please login with your new password."},
            status=status.HTTP_200_OK,
        )


class LegacyResetPasswordView(APIView):
    """
    Deprecated legacy reset password endpoint.
    Friendly response informing users that password resets now use a code.
    """

    permission_classes = [AllowAny]

    @extend_schema(
        tags=["Auth"],
        summary="Reset Password (Deprecated)",
        description="Deprecated endpoint. Informs users that link-based reset is replaced by email OTP.",
        request=None,
        responses={400: OpenApiResponse(description="Deprecated reset link")},
    )
    def post(self, request):
        return Response(
            {
                "detail": "Email-link password reset is no longer supported. Please request a 6-digit code on the Forgot Password screen."
            },
            status=status.HTTP_400_BAD_REQUEST,
        )


class ProfileView(APIView):
    """Get and update current authenticated user profile."""

    permission_classes = [IsAuthenticated]

    @extend_schema(
        tags=["Auth"],
        summary="Get User Profile",
        description="Retrieve profile details for current logged-in user.",
        responses={200: UserProfileSerializer},
    )
    def get(self, request):
        serializer = UserProfileSerializer(request.user)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @extend_schema(
        tags=["Auth"],
        summary="Update User Profile",
        description="Update profile details (full_name and phone only) for current logged-in user.",
        request=UserProfileSerializer,
        responses={
            200: UserProfileSerializer,
            400: OpenApiResponse(description="Validation error"),
        },
    )
    def put(self, request):
        return self._update(request, partial=False)

    @extend_schema(
        tags=["Auth"],
        summary="Patch User Profile",
        description="Patch profile details (full_name and phone only) for current logged-in user.",
        request=UserProfileSerializer,
        responses={
            200: UserProfileSerializer,
            400: OpenApiResponse(description="Validation error"),
        },
    )
    def patch(self, request):
        return self._update(request, partial=True)

    def _update(self, request, partial=True):
        serializer = UserProfileSerializer(request.user, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data, status=status.HTTP_200_OK)


class ChangePasswordView(APIView):
    """Change password for current authenticated user."""

    permission_classes = [IsAuthenticated]

    @extend_schema(
        tags=["Auth"],
        summary="Change Password",
        description="Change password for current logged-in user with old password verification.",
        request=ChangePasswordSerializer,
        responses={
            200: OpenApiResponse(description="Password changed successfully"),
            400: OpenApiResponse(description="Validation error"),
        },
    )
    def post(self, request):
        serializer = ChangePasswordSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)

        user = request.user
        user.set_password(serializer.validated_data["new_password"])
        user.save()

        return Response({"message": "Password changed successfully."}, status=status.HTTP_200_OK)


from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.filters import SearchFilter, OrderingFilter
from django_filters.rest_framework import DjangoFilterBackend
from .permissions import IsAdmin
from .serializers import UserAdminCreateSerializer, UserAdminUpdateSerializer


@extend_schema_view(
    list=extend_schema(
        tags=["User Management"],
        summary="List users",
        description="Admin lists users with search (name, email, phone) and filters (role, is_active).",
    ),
    create=extend_schema(
        tags=["User Management"],
        summary="Create user",
        description="Admin creates user with role ADMIN, FLEET_MANAGER, or CUSTOMER.",
        request=UserAdminCreateSerializer,
        responses={201: UserSerializer},
    ),
    retrieve=extend_schema(
        tags=["User Management"],
        summary="Retrieve user",
        description="Admin retrieves user details.",
        responses={200: UserSerializer},
    ),
    update=extend_schema(
        tags=["User Management"],
        summary="Update user",
        description="Admin updates user details.",
        request=UserAdminUpdateSerializer,
        responses={200: UserSerializer},
    ),
    partial_update=extend_schema(
        tags=["User Management"],
        summary="Partial update user",
        description="Admin updates partial user details.",
        request=UserAdminUpdateSerializer,
        responses={200: UserSerializer},
    ),
)
class UserViewSet(viewsets.ModelViewSet):
    """Admin-only ViewSet for full User and Role management."""

    queryset = User.objects.all().order_by("-created_at")
    permission_classes = [IsAdmin]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ["role", "is_active", "approval_status"]
    search_fields = ["full_name", "email", "phone"]
    ordering_fields = ["created_at", "full_name", "email"]
    ordering = ["-created_at"]
    http_method_names = ["get", "post", "put", "patch", "head", "options"]

    def get_serializer_class(self):
        if self.action == "create":
            return UserAdminCreateSerializer
        elif self.action in ["update", "partial_update"]:
            return UserAdminUpdateSerializer
        return UserSerializer

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        return Response(UserSerializer(user).data, status=status.HTTP_201_CREATED)

    def update(self, request, *args, **kwargs):
        user_to_edit = self.get_object()
        # Admin cannot change their own role or deactivate self
        if user_to_edit.pk == request.user.pk:
            if "role" in request.data and request.data.get("role") != request.user.role:
                return Response(
                    {"detail": "Admins cannot change their own role."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if "is_active" in request.data and request.data.get("is_active") in [False, "false", "False", 0, "0"]:
                return Response(
                    {"detail": "Admins cannot deactivate their own account."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        partial = kwargs.pop("partial", False)
        serializer = self.get_serializer(user_to_edit, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        return Response(UserSerializer(user).data, status=status.HTTP_200_OK)

    def destroy(self, request, *args, **kwargs):
        return Response(
            {"detail": "User deletion is not allowed. Use deactivate instead."},
            status=status.HTTP_405_METHOD_NOT_ALLOWED,
        )

    @extend_schema(
        tags=["User Management"],
        summary="Deactivate user",
        description="Admin deactivates user account. Admin cannot deactivate own account.",
        request=None,
        responses={200: UserSerializer},
    )
    @action(detail=True, methods=["post"], url_path="deactivate")
    def deactivate(self, request, pk=None):
        user_to_deactivate = self.get_object()
        if user_to_deactivate.pk == request.user.pk:
            return Response(
                {"detail": "Admins cannot deactivate their own account."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        user_to_deactivate.is_active = False
        user_to_deactivate.save(update_fields=["is_active", "updated_at"])
        return Response(UserSerializer(user_to_deactivate).data, status=status.HTTP_200_OK)

    @extend_schema(
        tags=["User Management"],
        summary="Activate user",
        description="Admin activates user account.",
        request=None,
        responses={200: UserSerializer},
    )
    @action(detail=True, methods=["post"], url_path="activate")
    def activate(self, request, pk=None):
        user_to_activate = self.get_object()
        user_to_activate.is_active = True
        user_to_activate.save(update_fields=["is_active", "updated_at"])
        return Response(UserSerializer(user_to_activate).data, status=status.HTTP_200_OK)


class LogoutView(APIView):
    """
    Log out the current user and blacklist their refresh token.
    Returns 200 even if the token is already invalid, expired, or missing.
    """
    permission_classes = [IsAuthenticated]

    @extend_schema(
        tags=["Auth"],
        summary="User Logout",
        description="Blacklists the provided refresh token and invalidates the session. Always returns HTTP 200.",
        request=LogoutSerializer,
        responses={200: OpenApiResponse(description="Logged out successfully")},
    )
    def post(self, request):
        refresh_token = request.data.get("refresh")
        if refresh_token:
            try:
                token = RefreshToken(refresh_token)
                token.blacklist()
            except Exception:
                # Always returns 200 even if token is already invalid, blacklisted, or expired
                pass
        return Response({"message": "Logged out successfully."}, status=status.HTTP_200_OK)


class CheckEmailView(APIView):
    """
    Validate an email for correct format, non-disposable domain, and active DNS MX/A records.
    Public endpoint throttled to 20 requests per minute per IP.
    """
    permission_classes = [AllowAny]
    throttle_classes = [CheckEmailRateThrottle]

    @extend_schema(
        tags=["Auth"],
        summary="Check Email Validity",
        description="Checks if an email is properly formatted, not a temporary/disposable domain, and exists via DNS MX/A lookup.",
        request=CheckEmailSerializer,
        responses={200: OpenApiResponse(description="Returns {valid: true} or {valid: false, message: ...}")},
    )
    def post(self, request):
        email = request.data.get("email", "").strip()
        if not email:
            return Response({"valid": False, "code": "FORMAT", "message": "Email is required."}, status=status.HTTP_200_OK)

        try:
            normalized = validate_real_email(email)

            # Check if an account already exists with this email that is VERIFIED
            existing_verified = User.objects.filter(email__iexact=normalized, is_email_verified=True).exists()
            if existing_verified:
                return Response(
                    {
                        "valid": False,
                        "code": "ALREADY_REGISTERED",
                        "message": "A user with this email already exists.",
                    },
                    status=status.HTTP_200_OK,
                )

            return Response(
                {
                    "valid": True,
                    "message": "Looks fine. We will send a code to confirm it.",
                },
                status=status.HTTP_200_OK,
            )
        except EmailValidationError as e:
            resp_data = {
                "valid": False,
                "code": e.code,
                "message": e.message,
            }
            if e.suggestion:
                resp_data["suggestion"] = e.suggestion
            return Response(resp_data, status=status.HTTP_200_OK)
        except ValidationError as e:
            msg = e.message if hasattr(e, "message") else str(e)
            return Response(
                {"valid": False, "code": "FORMAT", "message": msg},
                status=status.HTTP_200_OK,
            )
        except Exception as e:
            return Response(
                {"valid": False, "code": "FORMAT", "message": str(e)},
                status=status.HTTP_200_OK,
            )



