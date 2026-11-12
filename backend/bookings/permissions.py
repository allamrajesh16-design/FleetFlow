from rest_framework.permissions import BasePermission, SAFE_METHODS
from accounts.models import User


class BusSchedulePermission(BasePermission):
    """
    Permission check for Bus Schedules:
    - Drivers are denied access.
    - Customers can view (list & retrieve).
    - Admins and Fleet Managers have full CRUD permissions.
    """

    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False

        if request.user.role == User.Role.DRIVER:
            return False

        if request.method in SAFE_METHODS:
            return request.user.role in [
                User.Role.CUSTOMER,
                User.Role.FLEET_MANAGER,
                User.Role.ADMIN,
            ] or request.user.is_superuser

        return request.user.role in [
            User.Role.FLEET_MANAGER,
            User.Role.ADMIN,
        ] or request.user.is_superuser


class BookingPermission(BasePermission):
    """
    Permission check for Bookings:
    - Drivers are denied access.
    - Customers can create bookings and view/manage their own bookings.
    - Admins and Fleet Managers can view all bookings, and approve/reject bookings.
    """

    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False

        if request.user.role == User.Role.DRIVER:
            return False

        if view.action == "create":
            return request.user.role == User.Role.CUSTOMER

        if view.action in ["approve", "reject"]:
            return request.user.role in [
                User.Role.ADMIN,
                User.Role.FLEET_MANAGER,
            ] or request.user.is_superuser

        if view.action == "cancel":
            return request.user.role in [
                User.Role.CUSTOMER,
                User.Role.ADMIN,
                User.Role.FLEET_MANAGER,
            ] or request.user.is_superuser

        if view.action == "bus_response":
            return request.user.role == User.Role.CUSTOMER

        return True

    def has_object_permission(self, request, view, obj):
        if not (request.user and request.user.is_authenticated):
            return False

        if request.user.role == User.Role.DRIVER:
            return False

        if request.user.role in [User.Role.ADMIN, User.Role.FLEET_MANAGER] or request.user.is_superuser:
            return True

        return obj.customer_id == request.user.id
