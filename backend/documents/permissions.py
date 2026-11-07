from rest_framework.permissions import BasePermission
from accounts.models import User


class DocumentPermission(BasePermission):
    """
    Permissions for Document management:
    - Only Drivers can upload (create) documents.
    - Admin and Fleet Manager get 403 on upload (create).
    - Admin and Fleet Manager can list, view, download, approve, reject. Admin can delete.
    - Driver can list, view, download their own documents and vehicles they drive.
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
            driver_profile = getattr(request.user, "driver_profile", None)
            if not driver_profile:
                return False
            # Check if doc belongs to driver or a vehicle driven by driver
            if obj.driver == driver_profile or obj.uploaded_by == request.user:
                return True
            from trips.models import Trip
            if obj.vehicle and Trip.objects.filter(driver=driver_profile, vehicle=obj.vehicle).exists():
                return True
            return False
            if obj.driver == driver_profile:
                return view.action in ["retrieve", "download"]
            return False

        return False
