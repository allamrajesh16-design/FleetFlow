from django_filters.rest_framework import DjangoFilterBackend
from drf_spectacular.utils import extend_schema, extend_schema_view, OpenApiParameter
from rest_framework import viewsets, serializers
from rest_framework.filters import SearchFilter, OrderingFilter
import django_filters
from django.db.models import Q
from django.utils import timezone

from accounts.models import User
from .models import Vehicle, Maintenance
from .permissions import VehiclePermission
from .serializers import VehicleSerializer


class VehicleFilter(django_filters.FilterSet):
    vehicle_type = django_filters.CharFilter(field_name="vehicle_type")
    status = django_filters.CharFilter(method="filter_status")
    operational_status = django_filters.CharFilter(method="filter_status")

    class Meta:
        model = Vehicle
        fields = ["vehicle_type", "status", "operational_status"]

    def filter_status(self, queryset, name, value):
        if not value:
            return queryset
        val_upper = value.upper()
        today = timezone.localdate()
        today_start = timezone.make_aware(timezone.datetime.combine(today, timezone.datetime.min.time()))
        today_end = timezone.make_aware(timezone.datetime.combine(today, timezone.datetime.max.time()))
        from trips.models import Trip

        if val_upper == "MAINTENANCE":
            return queryset.filter(status=Vehicle.Status.MAINTENANCE)
        elif val_upper == "INACTIVE":
            return queryset.filter(status=Vehicle.Status.INACTIVE)
        elif val_upper == "ON_TRIP":
            trip_vids = Trip.objects.filter(status=Trip.Status.IN_PROGRESS).values_list("vehicle_id", flat=True)
            return queryset.filter(Q(status=Vehicle.Status.ON_TRIP) | Q(id__in=trip_vids))
        elif val_upper == "ASSIGNED_TODAY":
            trip_vids = Trip.objects.filter(
                scheduled_datetime__range=(today_start, today_end),
                status=Trip.Status.SCHEDULED,
            ).values_list("vehicle_id", flat=True)
            return queryset.filter(id__in=trip_vids)
        elif val_upper in ("AVAILABLE", "ACTIVE"):
            busy_vids = Trip.objects.filter(
                Q(status=Trip.Status.IN_PROGRESS) |
                Q(scheduled_datetime__range=(today_start, today_end), status=Trip.Status.SCHEDULED)
            ).values_list("vehicle_id", flat=True)
            maint_vids = Maintenance.objects.filter(
                status__in=[Maintenance.Status.SCHEDULED, Maintenance.Status.IN_PROGRESS]
            ).values_list("vehicle_id", flat=True)
            return queryset.filter(status=Vehicle.Status.ACTIVE).exclude(id__in=busy_vids).exclude(id__in=maint_vids)
        return queryset.filter(status=value)


@extend_schema_view(
    list=extend_schema(
        tags=["Vehicles"],
        summary="List vehicles",
        description="List vehicles with pagination (10/page), filters, and search. Customers only see ACTIVE vehicles.",
    ),
    create=extend_schema(
        tags=["Vehicles"],
        summary="Create vehicle",
        description="Add a new vehicle (Admin and Fleet Manager only).",
    ),
    retrieve=extend_schema(
        tags=["Vehicles"],
        summary="Retrieve vehicle details",
        description="Get detailed information of a specific vehicle.",
    ),
    update=extend_schema(
        tags=["Vehicles"],
        summary="Update vehicle",
        description="Update all vehicle details (Admin and Fleet Manager only).",
    ),
    partial_update=extend_schema(
        tags=["Vehicles"],
        summary="Partial update vehicle",
        description="Update specific fields of a vehicle (Admin and Fleet Manager only).",
    ),
    destroy=extend_schema(
        tags=["Vehicles"],
        summary="Delete vehicle",
        description="Delete a vehicle. Vehicles with status ON_TRIP cannot be deleted.",
    ),
)
class VehicleViewSet(viewsets.ModelViewSet):
    """ViewSet for managing vehicles."""

    queryset = Vehicle.objects.all()
    serializer_class = VehicleSerializer
    permission_classes = [VehiclePermission]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_class = VehicleFilter
    search_fields = ["registration_number", "brand", "model"]
    ordering_fields = ["created_at", "rate_per_km", "seating_capacity", "brand", "model"]
    ordering = ["-created_at"]

    def get_queryset(self):
        user = self.request.user
        if user.is_authenticated and user.role == User.Role.CUSTOMER:
            return Vehicle.objects.filter(status=Vehicle.Status.ACTIVE)
        return Vehicle.objects.all()

    def perform_destroy(self, instance):
        if instance.status == Vehicle.Status.ON_TRIP:
            raise serializers.ValidationError(
                {"error": "A vehicle with status ON_TRIP cannot be deleted."}
            )
        instance.delete()


import django_filters
from accounts.permissions import IsAdminOrFleetManager
from .models import Maintenance
from .serializers import MaintenanceSerializer


class MaintenanceFilter(django_filters.FilterSet):
    status = django_filters.CharFilter(field_name="status")
    vehicle = django_filters.NumberFilter(field_name="vehicle_id")
    date_from = django_filters.DateFilter(field_name="scheduled_date", lookup_expr="gte")
    date_to = django_filters.DateFilter(field_name="scheduled_date", lookup_expr="lte")
    scheduled_date = django_filters.DateFilter(field_name="scheduled_date")

    class Meta:
        model = Maintenance
        fields = ["status", "vehicle", "scheduled_date"]


@extend_schema_view(
    list=extend_schema(
        tags=["Maintenance"],
        summary="List maintenance records",
        description="Admin and Fleet Manager view maintenance records with filters (status, vehicle, date range).",
    ),
    create=extend_schema(
        tags=["Maintenance"],
        summary="Create maintenance record",
        description="Schedule vehicle maintenance (Admin and Fleet Manager only).",
    ),
    retrieve=extend_schema(
        tags=["Maintenance"],
        summary="Retrieve maintenance record",
        description="Get specific maintenance details.",
    ),
    update=extend_schema(
        tags=["Maintenance"],
        summary="Update maintenance record",
        description="Update maintenance details and status (Admin and Fleet Manager only).",
    ),
    partial_update=extend_schema(
        tags=["Maintenance"],
        summary="Partial update maintenance",
        description="Update specific maintenance fields.",
    ),
    destroy=extend_schema(
        tags=["Maintenance"],
        summary="Delete maintenance",
        description="Delete a maintenance record.",
    ),
)
class MaintenanceViewSet(viewsets.ModelViewSet):
    """ViewSet for vehicle maintenance management (Admin and Fleet Manager only)."""

    queryset = Maintenance.objects.all().select_related("vehicle", "created_by")
    serializer_class = MaintenanceSerializer
    permission_classes = [IsAdminOrFleetManager]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_class = MaintenanceFilter
    search_fields = ["title", "description", "vehicle__registration_number"]
    ordering_fields = ["scheduled_date", "created_at", "cost"]
    ordering = ["-scheduled_date"]

