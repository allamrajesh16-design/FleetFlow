import mimetypes
import os
from decimal import Decimal
from django.db.models import Avg, Count, Sum
from django.http import FileResponse, Http404
from django.utils import timezone
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

from .filters import FuelLogFilter
from .models import FuelLog
from .permissions import FuelPermission
from .serializers import FuelLogSerializer, FuelRejectSerializer


class StandardPagination(PageNumberPagination):
    page_size = 10
    page_size_query_param = "page_size"
    max_page_size = 100


@extend_schema_view(
    list=extend_schema(
        tags=["Fuel"],
        summary="List fuel logs",
        description="List fuel records with filtering, searching, and pagination.",
    ),
    create=extend_schema(
        tags=["Fuel"],
        summary="Create fuel log",
        description="Record vehicle fueling event. Total cost is calculated server-side.",
    ),
    retrieve=extend_schema(
        tags=["Fuel"],
        summary="Retrieve fuel log",
        description="Get specific fuel log details.",
    ),
    update=extend_schema(
        tags=["Fuel"],
        summary="Update fuel log",
        description="Update fuel log details (Admin/Manager or Driver own log).",
    ),
    partial_update=extend_schema(
        tags=["Fuel"],
        summary="Partial update fuel log",
        description="Partially update fuel log fields.",
    ),
    destroy=extend_schema(
        tags=["Fuel"],
        summary="Delete fuel log",
        description="Delete a fuel log (Admin only).",
    ),
)
class FuelLogViewSet(viewsets.ModelViewSet):
    """ViewSet for managing Fuel Logs."""

    queryset = (
        FuelLog.objects.all()
        .select_related("vehicle", "driver", "driver__user", "trip", "created_by")
    )
    serializer_class = FuelLogSerializer
    permission_classes = [FuelPermission]
    pagination_class = StandardPagination
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_class = FuelLogFilter
    search_fields = ["vehicle__registration_number", "station_name", "driver__user__full_name"]
    ordering_fields = ["date", "odometer_km", "total_cost", "quantity", "created_at"]
    ordering = ["-date", "-created_at"]

    def get_queryset(self):
        user = self.request.user
        if not user.is_authenticated:
            return FuelLog.objects.none()

        if user.role in [User.Role.ADMIN, User.Role.FLEET_MANAGER] or user.is_superuser:
            return self.queryset

        if user.role == User.Role.DRIVER:
            driver_profile = getattr(user, "driver_profile", None)
            from django.db.models import Q
            q_filter = Q(created_by=user)
            if driver_profile:
                q_filter |= Q(driver=driver_profile)
            return self.queryset.filter(q_filter)

        return FuelLog.objects.none()

    @extend_schema(
        tags=["Fuel"],
        summary="Approve fuel log",
        description="Approve a pending fuel log (Admin and Fleet Manager only).",
    )
    @action(detail=True, methods=["post"], url_path="approve")
    def approve(self, request, pk=None):
        if not (request.user.role in [User.Role.ADMIN, User.Role.FLEET_MANAGER] or request.user.is_superuser):
            return Response(
                {"detail": "Only Admin and Fleet Manager can approve fuel logs."},
                status=status.HTTP_403_FORBIDDEN,
            )
        fuel_log = self.get_object()
        fuel_log.review_status = FuelLog.ReviewStatus.APPROVED
        fuel_log.reviewed_by = request.user
        fuel_log.reviewed_at = timezone.now()
        fuel_log.rejection_reason = ""
        fuel_log.save(update_fields=["review_status", "reviewed_by", "reviewed_at", "rejection_reason"])

        # Notify driver
        target_user = fuel_log.created_by or (fuel_log.driver.user if fuel_log.driver else None)
        if target_user:
            notify(
                user=target_user,
                title="Fuel Log Approved",
                message=f"Your fuel log #{fuel_log.id} ({fuel_log.vehicle.registration_number}) has been approved.",
                type=Notification.NotificationType.SYSTEM,
                item_type="fuel",
                item_id=fuel_log.id,
            )

        return Response(FuelLogSerializer(fuel_log).data)

    @extend_schema(
        tags=["Fuel"],
        summary="Reject fuel log",
        description="Reject a pending fuel log with a required reason (Admin and Fleet Manager only).",
        request=FuelRejectSerializer,
    )
    @action(detail=True, methods=["post"], url_path="reject")
    def reject(self, request, pk=None):
        if not (request.user.role in [User.Role.ADMIN, User.Role.FLEET_MANAGER] or request.user.is_superuser):
            return Response(
                {"detail": "Only Admin and Fleet Manager can reject fuel logs."},
                status=status.HTTP_403_FORBIDDEN,
            )
        serializer = FuelRejectSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        reason = serializer.validated_data["rejection_reason"]

        fuel_log = self.get_object()
        fuel_log.review_status = FuelLog.ReviewStatus.REJECTED
        fuel_log.reviewed_by = request.user
        fuel_log.reviewed_at = timezone.now()
        fuel_log.rejection_reason = reason
        fuel_log.save(update_fields=["review_status", "reviewed_by", "reviewed_at", "rejection_reason"])

        # Notify driver
        target_user = fuel_log.created_by or (fuel_log.driver.user if fuel_log.driver else None)
        if target_user:
            notify(
                user=target_user,
                title="Fuel Log Rejected",
                message=f"Your fuel log #{fuel_log.id} was rejected: {reason}",
                type=Notification.NotificationType.SYSTEM,
                item_type="fuel",
                item_id=fuel_log.id,
            )

        return Response(FuelLogSerializer(fuel_log).data)

    @extend_schema(
        tags=["Fuel"],
        summary="Download fuel receipt",
        description="Securely download receipt file stored in private storage (Admin, Fleet Manager, or creator Driver).",
    )
    @action(detail=True, methods=["get"], url_path="download")
    def download(self, request, pk=None):
        fuel_log = self.get_object()
        if not fuel_log.receipt_image:
            raise Http404("No receipt file attached to this fuel log.")

        try:
            file_handle = private_file_storage.open(fuel_log.receipt_image.name, "rb")
        except Exception:
            raise Http404("Receipt file not found on disk.")

        filename = os.path.basename(fuel_log.receipt_image.name)
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
        tags=["Fuel"],
        summary="Fuel summary",
        description="Aggregated fuel totals, average price, mileage, and per-vehicle breakdown (Admin and Fleet Manager only).",
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
                {"detail": "You do not have permission to access fuel summary."},
                status=status.HTTP_403_FORBIDDEN,
            )

        qs = self.filter_queryset(self.get_queryset())
        pending_review_count = qs.filter(review_status=FuelLog.ReviewStatus.PENDING).count()
        # Summaries and reports count only APPROVED logs
        approved_qs = qs.filter(review_status=FuelLog.ReviewStatus.APPROVED)

        agg = approved_qs.aggregate(
            total_quantity=Sum("quantity"),
            total_cost=Sum("total_cost"),
            avg_price=Avg("price_per_unit"),
        )

        total_qty = agg["total_quantity"] or Decimal("0.00")
        total_cost = agg["total_cost"] or Decimal("0.00")
        avg_price = (
            round(total_cost / total_qty, 2)
            if total_qty > 0
            else (round(agg["avg_price"], 2) if agg["avg_price"] else Decimal("0.00"))
        )

        # Compute average mileage across full-tank logs in the filtered set
        mileages = [log.mileage_kmpl for log in approved_qs if log.is_full_tank and log.mileage_kmpl is not None]
        avg_mileage = round(sum(mileages) / len(mileages), 2) if mileages else None

        # Per vehicle breakdown
        vehicles_qs = Vehicle.objects.filter(fuel_logs__in=approved_qs).distinct()
        per_vehicle = []
        for veh in vehicles_qs:
            veh_logs = approved_qs.filter(vehicle=veh)
            v_agg = veh_logs.aggregate(
                tot_qty=Sum("quantity"),
                tot_cost=Sum("total_cost"),
                cnt=Count("id"),
            )
            v_mileages = [l.mileage_kmpl for l in veh_logs if l.is_full_tank and l.mileage_kmpl is not None]
            v_avg_mileage = round(sum(v_mileages) / len(v_mileages), 2) if v_mileages else None
            per_vehicle.append({
                "vehicle_id": veh.id,
                "registration_number": veh.registration_number,
                "brand": veh.brand,
                "model": veh.model,
                "total_quantity": v_agg["tot_qty"] or Decimal("0.00"),
                "total_cost": v_agg["tot_cost"] or Decimal("0.00"),
                "log_count": v_agg["cnt"] or 0,
                "average_mileage": v_avg_mileage,
            })

        return Response({
            "total_quantity": total_qty,
            "total_cost": total_cost,
            "average_price": avg_price,
            "average_mileage": avg_mileage,
            "pending_review_count": pending_review_count,
            "per_vehicle": per_vehicle,
        })
