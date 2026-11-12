from rest_framework.permissions import BasePermission
from accounts.models import User


from datetime import timedelta
from django.db import models
from django.utils import timezone
from rest_framework.permissions import BasePermission
from accounts.models import User


def get_driver_accessible_vehicle_ids(driver_profile):
    """
    Returns the set of vehicle IDs driven by the driver on trips:
    - Upcoming (SCHEDULED)
    - In progress (IN_PROGRESS)
    - Completed in the last 60 days (COMPLETED)
    """
    if not driver_profile:
        return set()
    from trips.models import Trip

    now = timezone.now()
    sixty_days_ago = now - timedelta(days=60)

    trip_filter = (
        models.Q(driver=driver_profile, status__in=[Trip.Status.SCHEDULED, Trip.Status.IN_PROGRESS])
        | models.Q(driver=driver_profile, status=Trip.Status.COMPLETED, completed_at__gte=sixty_days_ago)
        | models.Q(
            driver=driver_profile,
            status=Trip.Status.COMPLETED,
            completed_at__isnull=True,
            scheduled_datetime__gte=sixty_days_ago,
        )
    )
    return set(Trip.objects.filter(trip_filter).values_list("vehicle_id", flat=True))


def can_view_document(user, document):
    """
    Returns True if user has permission to view/download document, False otherwise.
    - Admins and Fleet Managers can see all documents.
    - Customers cannot view any compliance documents.
    - Drivers can view:
      (a) their own driver documents (or documents uploaded by them),
      (b) documents of vehicles that appear on their trips (upcoming, in progress, or completed in last 60 days).
    """
    if not user or not user.is_authenticated:
        return False

    if user.is_superuser or user.role in [User.Role.ADMIN, User.Role.FLEET_MANAGER]:
        return True

    if user.role == User.Role.CUSTOMER:
        return False

    if user.role == User.Role.DRIVER:
        driver_profile = getattr(user, "driver_profile", None)
        if not driver_profile:
            return False

        # (a) Driver's own document
        if (
            document.driver_id == driver_profile.id
            or (document.driver and document.driver.user_id == user.id)
            or document.uploaded_by_id == user.id
        ):
            return True

        # (b) Documents of vehicles that appear on trips (upcoming, in-progress, or completed in last 60d)
        if document.vehicle_id:
            accessible_ids = get_driver_accessible_vehicle_ids(driver_profile)
            if document.vehicle_id in accessible_ids:
                return True

        return False

    return False


class DocumentPermission(BasePermission):
    """
    Permissions for Document management:
    - Only Drivers can upload (create) documents.
    - Admin and Fleet Manager get 403 on upload (create).
    - Admin and Fleet Manager can list, view, download, approve, reject. Admin can delete.
    - Driver can list, view, download their own documents and vehicles they drive (within 60d policy).
    - Customer: 403 Forbidden.
    """

    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False

        if request.user.role == User.Role.CUSTOMER:
            return False

        if request.user.role in [User.Role.ADMIN, User.Role.FLEET_MANAGER] or request.user.is_superuser:
            # Admin and Fleet Manager get 403 on create/upload and update
            if view.action in ["create", "update", "partial_update"]:
                return False
            if view.action == "destroy":
                return request.user.role == User.Role.ADMIN or request.user.is_superuser
            return True

        if request.user.role == User.Role.DRIVER:
            if view.action in ["destroy", "approve", "reject"]:
                return False
            return True

        return False

    def has_object_permission(self, request, view, obj):
        if not (request.user and request.user.is_authenticated):
            return False

        if request.user.role == User.Role.CUSTOMER:
            return False

        if request.user.role in [User.Role.ADMIN, User.Role.FLEET_MANAGER] or request.user.is_superuser:
            if view.action in ["create", "update", "partial_update"]:
                return False
            if view.action == "destroy":
                return request.user.role == User.Role.ADMIN or request.user.is_superuser
            return True

        if request.user.role == User.Role.DRIVER:
            return can_view_document(request.user, obj)

        return False

