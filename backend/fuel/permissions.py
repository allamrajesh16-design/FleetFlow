from rest_framework.permissions import BasePermission
from accounts.models import User


class FuelPermission(BasePermission):
    """
    Permissions for FuelLog operations:
    - Only Drivers can create fuel logs.
    - Drivers can update their own logs only while PENDING.
    - Admin and Fleet Manager cannot create or update (403 Forbidden).
    - Admin and Fleet Manager can list, retrieve, approve, reject. Admin can delete.
    - Customer: 403 Forbidden.
    """

    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False

        if request.user.role == User.Role.CUSTOMER:
            return False

        if request.user.role in [User.Role.ADMIN, User.Role.FLEET_MANAGER] or request.user.is_superuser:
            # Admin and Fleet Manager get 403 on create and update
            if view.action in ["create", "update", "partial_update"]:
                return False
            if view.action == "destroy":
                return request.user.role == User.Role.ADMIN or request.user.is_superuser
            return True

        if request.user.role == User.Role.DRIVER:
            # Drivers cannot delete or access admin-only actions like approve/reject
            if view.action in ["destroy", "summary", "approve", "reject"]:
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
            is_own = (obj.created_by == request.user) or (driver_profile and obj.driver == driver_profile)
            if view.action in ["retrieve", "download", "receipt"]:
                return is_own
            if view.action in ["update", "partial_update"]:
                return is_own and obj.review_status == "PENDING"
            return False

        return False
