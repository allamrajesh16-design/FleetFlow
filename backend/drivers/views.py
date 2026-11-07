from django_filters.rest_framework import DjangoFilterBackend
from drf_spectacular.utils import extend_schema, extend_schema_view
from rest_framework import viewsets, status, serializers
from rest_framework.decorators import action
from rest_framework.filters import SearchFilter, OrderingFilter
from rest_framework.response import Response

from .models import Driver
from .permissions import DriverPermission
from .serializers import (
    DriverSerializer,
    DriverCreateSerializer,
    DriverUpdateSerializer,
)


@extend_schema_view(
    list=extend_schema(
        tags=["Drivers"],
        summary="List drivers",
        description="List drivers with pagination (10/page), filters (status), and search (name, email, phone, license).",
    ),
    create=extend_schema(
        tags=["Drivers"],
        summary="Create driver",
        description="Creates a DRIVER User and Driver profile together (Admin and Fleet Manager only).",
        request=DriverCreateSerializer,
        responses={201: DriverSerializer},
    ),
    retrieve=extend_schema(
        tags=["Drivers"],
        summary="Retrieve driver",
        description="Retrieve driver details by ID.",
    ),
    update=extend_schema(
        tags=["Drivers"],
        summary="Update driver",
        description="Update driver profile and user details.",
        request=DriverUpdateSerializer,
        responses={200: DriverSerializer},
    ),
    partial_update=extend_schema(
        tags=["Drivers"],
        summary="Partial update driver",
        description="Partially update driver profile and user details.",
        request=DriverUpdateSerializer,
        responses={200: DriverSerializer},
    ),
    destroy=extend_schema(
        tags=["Drivers"],
        summary="Delete driver",
        description="Delete driver profile. Drivers with status ON_TRIP cannot be deleted.",
    ),
)
class DriverViewSet(viewsets.ModelViewSet):
    """ViewSet for managing drivers."""

    queryset = Driver.objects.select_related("user").all()
    permission_classes = [DriverPermission]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ["status"]
    search_fields = ["user__full_name", "license_number", "user__email", "user__phone"]
    ordering_fields = ["created_at", "license_expiry", "status"]
    ordering = ["-created_at"]

    def get_serializer_class(self):
        if self.action == "create":
            return DriverCreateSerializer
        elif self.action in ["update", "partial_update"]:
            return DriverUpdateSerializer
        return DriverSerializer

    def perform_destroy(self, instance):
        if instance.status == Driver.Status.ON_TRIP:
            raise serializers.ValidationError(
                {"error": "A driver with status ON_TRIP cannot be deleted."}
            )
        # Also clean up the associated driver user account when deleting driver
        user = instance.user
        instance.delete()
        if user:
            user.delete()

    @extend_schema(
        tags=["Drivers"],
        summary="Current driver profile",
        description="Retrieve the profile of the currently logged-in driver.",
        responses={200: DriverSerializer},
    )
    @action(detail=False, methods=["get"], url_path="me")
    def me(self, request):
        if not hasattr(request.user, "driver_profile"):
            return Response(
                {"detail": "No driver profile found for this user."},
                status=status.HTTP_404_NOT_FOUND,
            )
        serializer = DriverSerializer(request.user.driver_profile)
        return Response(serializer.data, status=status.HTTP_200_OK)
