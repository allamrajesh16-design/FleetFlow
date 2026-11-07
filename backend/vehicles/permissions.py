from rest_framework.permissions import BasePermission, SAFE_METHODS
from accounts.models import User


class VehiclePermission(BasePermission):
    """
    Admin & Fleet Manager: full access.
    Customer: read-only access (GET/HEAD/OPTIONS).
    Driver: no vehicle modification access.
    """

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False

        if (
            request.user.role in [User.Role.ADMIN, User.Role.FLEET_MANAGER]
            or request.user.is_superuser
        ):
            return True

        if request.method in SAFE_METHODS and request.user.role == User.Role.CUSTOMER:
            return True

        return False
