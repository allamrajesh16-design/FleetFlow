from rest_framework.permissions import BasePermission
from .models import User


class IsAdmin(BasePermission):
    """Allows access only to Admin users."""

    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and (request.user.role == User.Role.ADMIN or request.user.is_superuser)
        )


class IsFleetManager(BasePermission):
    """Allows access only to Fleet Managers."""

    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and request.user.role == User.Role.FLEET_MANAGER
        )


class IsDriver(BasePermission):
    """Allows access only to Drivers."""

    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and request.user.role == User.Role.DRIVER
        )


class IsCustomer(BasePermission):
    """Allows access only to Customers."""

    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and request.user.role == User.Role.CUSTOMER
        )


class IsAdminOrFleetManager(BasePermission):
    """Allows access to Admins or Fleet Managers."""

    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and (
                request.user.role in [User.Role.ADMIN, User.Role.FLEET_MANAGER]
                or request.user.is_superuser
            )
        )
