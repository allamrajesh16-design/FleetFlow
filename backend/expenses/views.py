import mimetypes
import os
from decimal import Decimal
from django.db.models import Count, Sum
from django.http import FileResponse, Http404
from django_filters.rest_framework import DjangoFilterBackend
from drf_spectacular.utils import extend_schema, extend_schema_view, OpenApiParameter
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.filters import OrderingFilter, SearchFilter
from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response

from accounts.models import User
from core.upload_security import private_file_storage
from notifications.models import Notification, notify
from vehicles.models import Vehicle

from .filters import ExpenseFilter
from .models import Expense
from .permissions import ExpensePermission
from .serializers import ExpenseRejectSerializer, ExpenseSerializer


class StandardPagination(PageNumberPagination):
    page_size = 10
    page_size_query_param = "page_size"
    max_page_size = 100


@extend_schema_view(
    list=extend_schema(
        tags=["Expenses"],
        summary="List expenses",
        description="List expense records with filtering, searching, and pagination.",
    ),
    create=extend_schema(
        tags=["Expenses"],
        summary="Create expense",
        description="Submit an expense. Driver expenses start as PENDING; Manager/Admin expenses are auto-approved.",
    ),
    retrieve=extend_schema(
        tags=["Expenses"],
        summary="Retrieve expense",
        description="Get specific expense details.",
    ),
    update=extend_schema(
        tags=["Expenses"],
        summary="Update expense",
        description="Update an expense. Approved expenses cannot be modified by drivers.",
    ),
    partial_update=extend_schema(
        tags=["Expenses"],
        summary="Partial update expense",
        description="Partially update expense fields.",
    ),
    destroy=extend_schema(
        tags=["Expenses"],
        summary="Delete expense",
        description="Delete an expense (Admin/Manager only).",
    ),
)
class ExpenseViewSet(viewsets.ModelViewSet):
    """ViewSet for managing Fleet Expenses."""

    queryset = (
        Expense.objects.all()
        .select_related("vehicle", "trip", "submitted_by", "reviewed_by")
    )
    serializer_class = ExpenseSerializer
    permission_classes = [ExpensePermission]
    pagination_class = StandardPagination
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_class = ExpenseFilter
    search_fields = ["description", "rejection_reason", "vehicle__registration_number"]
    ordering_fields = ["date", "amount", "status", "created_at"]
    ordering = ["-date", "-created_at"]

    def get_queryset(self):
        user = self.request.user
        if not user.is_authenticated:
            return Expense.objects.none()

        if user.role in [User.Role.ADMIN, User.Role.FLEET_MANAGER] or user.is_superuser:
            return self.queryset

        if user.role == User.Role.DRIVER:
            return self.queryset.filter(submitted_by=user)

        return Expense.objects.none()

    @extend_schema(
        tags=["Expenses"],
        summary="Approve expense",
        description="Approve a pending expense and notify the driver (Admin and Fleet Manager only).",
        request=None,
        responses={200: ExpenseSerializer},
    )
    @action(detail=True, methods=["post"], url_path="approve")
    def approve(self, request, pk=None):
        if not (request.user.role in [User.Role.ADMIN, User.Role.FLEET_MANAGER] or request.user.is_superuser):
            return Response(
                {"detail": "Only Admin and Fleet Manager can approve expenses."},
                status=status.HTTP_403_FORBIDDEN,
            )

        expense = self.get_object()
        expense.status = Expense.Status.APPROVED
        expense.reviewed_by = request.user
        from django.utils import timezone
        expense.reviewed_at = timezone.now()
        expense.rejection_reason = ""
        expense.save(update_fields=["status", "reviewed_by", "reviewed_at", "rejection_reason"])

        # Notify the submitting driver
        notify(
            user=expense.submitted_by,
            title="Expense Approved",
            message=(
                f"Your expense #{expense.id} for {expense.get_category_display()} "
                f"(₹{expense.amount}) has been approved."
            ),
            type=Notification.NotificationType.SYSTEM,
        )

        return Response(ExpenseSerializer(expense).data)

    @extend_schema(
        tags=["Expenses"],
        summary="Reject expense",
        description="Reject a pending expense with reason and notify the driver (Admin and Fleet Manager only).",
        request=ExpenseRejectSerializer,
        responses={200: ExpenseSerializer},
    )
    @action(detail=True, methods=["post"], url_path="reject")
    def reject(self, request, pk=None):
        if not (request.user.role in [User.Role.ADMIN, User.Role.FLEET_MANAGER] or request.user.is_superuser):
            return Response(
                {"detail": "Only Admin and Fleet Manager can reject expenses."},
                status=status.HTTP_403_FORBIDDEN,
            )

        serializer = ExpenseRejectSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        reason = serializer.validated_data["reason"]

        expense = self.get_object()
        expense.status = Expense.Status.REJECTED
        expense.reviewed_by = request.user
        from django.utils import timezone
        expense.reviewed_at = timezone.now()
        expense.rejection_reason = reason
        expense.save(update_fields=["status", "reviewed_by", "reviewed_at", "rejection_reason"])

        # Notify the submitting driver
        notify(
            user=expense.submitted_by,
            title="Expense Rejected",
            message=(
                f"Your expense #{expense.id} for {expense.get_category_display()} "
                f"(₹{expense.amount}) was rejected. Reason: {reason}"
            ),
            type=Notification.NotificationType.SYSTEM,
        )

        return Response(ExpenseSerializer(expense).data)

    @extend_schema(
        tags=["Expenses"],
        summary="Download expense receipt",
        description="Securely download receipt file from private storage (Admin, Fleet Manager, or submitting Driver).",
    )
    @action(detail=True, methods=["get"], url_path="download")
    def download(self, request, pk=None):
        expense = self.get_object()
        if not expense.receipt_image:
            raise Http404("No receipt file attached to this expense.")

        try:
            file_handle = private_file_storage.open(expense.receipt_image.name, "rb")
        except Exception:
            raise Http404("Receipt file not found on disk.")

        filename = os.path.basename(expense.receipt_image.name)
        content_type, _ = mimetypes.guess_type(filename)
        return FileResponse(
            file_handle,
            content_type=content_type or "application/octet-stream",
            as_attachment=True,
            filename=filename,
        )

    @action(detail=True, methods=["get"], url_path="receipt")
    def receipt(self, request, pk=None):
        return self.download(request, pk)

    @extend_schema(
        tags=["Expenses"],
        summary="Expense summary",
        description="Aggregated totals of approved expenses by category and vehicle (Admin and Fleet Manager only).",
        parameters=[
            OpenApiParameter("start_date", str, description="Filter from date (YYYY-MM-DD)"),
            OpenApiParameter("end_date", str, description="Filter to date (YYYY-MM-DD)"),
            OpenApiParameter("vehicle", int, description="Filter by Vehicle ID"),
        ],
    )
    @action(detail=False, methods=["get"], url_path="summary")
    def summary(self, request):
        if not (request.user.role in [User.Role.ADMIN, User.Role.FLEET_MANAGER] or request.user.is_superuser):
            return Response(
                {"detail": "You do not have permission to access expense summary."},
                status=status.HTTP_403_FORBIDDEN,
            )

        qs = self.filter_queryset(self.get_queryset())
        # Only consider approved expenses for financial summaries
        approved_qs = qs.filter(status=Expense.Status.APPROVED)

        total_approved = approved_qs.aggregate(total=Sum("amount"))["total"] or Decimal("0.00")

        # By category
        by_category_raw = (
            approved_qs.values("category")
            .annotate(total_amount=Sum("amount"), count=Count("id"))
            .order_by("-total_amount")
        )
        by_category = [
            {
                "category": item["category"],
                "total_amount": item["total_amount"],
                "count": item["count"],
            }
            for item in by_category_raw
        ]

        # By vehicle
        vehicles_qs = Vehicle.objects.filter(expenses__in=approved_qs).distinct()
        by_vehicle = []
        for veh in vehicles_qs:
            v_expenses = approved_qs.filter(vehicle=veh)
            v_agg = v_expenses.aggregate(tot=Sum("amount"), cnt=Count("id"))
            by_vehicle.append({
                "vehicle_id": veh.id,
                "registration_number": veh.registration_number,
                "brand": veh.brand,
                "model": veh.model,
                "total_amount": v_agg["tot"] or Decimal("0.00"),
                "count": v_agg["cnt"] or 0,
            })

        return Response({
            "total_approved_amount": total_approved,
            "by_category": by_category,
            "by_vehicle": by_vehicle,
        })
