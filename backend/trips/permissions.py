from rest_framework.permissions import BasePermission
from accounts.models import User


class TripPermission(BasePermission):
    """
    Permission check for trips:
    - Admin & Fleet Manager have management access across all trips.
    - Drivers can only access/modify their assigned trips.
    - Other roles are forbidden.
    """

    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False

        if request.user.role in [User.Role.ADMIN, User.Role.FLEET_MANAGER] or request.user.is_superuser:
            return True

        if request.user.role == User.Role.DRIVER:
            # Driver can view list/detail, my-trips, history, driver-summary, and trip actions
            if view.action in [
                "list",
                "retrieve",
                "my_trips",
                "history",
                "driver_summary",
                "start",
                "location",
                "complete",
            ]:
                return True
            return False

        return False

    def has_object_permission(self, request, view, obj):
        if not (request.user and request.user.is_authenticated):
            return False

        if request.user.role in [User.Role.ADMIN, User.Role.FLEET_MANAGER] or request.user.is_superuser:
            return True

        if request.user.role == User.Role.DRIVER:
            return obj.driver.user_id == request.user.id

        return False
