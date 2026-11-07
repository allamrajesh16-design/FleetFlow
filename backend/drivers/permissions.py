from rest_framework.permissions import BasePermission
from accounts.models import User


class DriverPermission(BasePermission):
    """
    Admin and Fleet Manager: full access.
    Driver: can access 'me' action only.
    Customer: denied access.
    """

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False

        # Driver can only access their own profile at /api/drivers/me/
        if getattr(view, "action", None) == "me":
            return bool(
                request.user.role == User.Role.DRIVER
                or request.user.role in [User.Role.ADMIN, User.Role.FLEET_MANAGER]
                or request.user.is_superuser
            )

        # All other actions require Admin or Fleet Manager
        return bool(
            request.user.role in [User.Role.ADMIN, User.Role.FLEET_MANAGER]
            or request.user.is_superuser
        )
