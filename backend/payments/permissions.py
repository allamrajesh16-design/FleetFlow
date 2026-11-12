from rest_framework.permissions import BasePermission
from accounts.models import User


class PaymentPermission(BasePermission):
    """
    Permission rules for Payments:
    - Admin & Fleet Manager: full viewing and QR generation access.
    - Customer: view own payments, scan QR, pay own payments, view receipts.
    - Driver: view and generate QR for payments associated with their trips.
    """

    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False

        if request.user.role in [User.Role.ADMIN, User.Role.FLEET_MANAGER] or request.user.is_superuser:
            return True

        if request.user.role in [User.Role.CUSTOMER, User.Role.DRIVER]:
            return True

        return False

    def has_object_permission(self, request, view, obj):
        if not (request.user and request.user.is_authenticated):
            return False

        if getattr(view, "action", None) == "collect":
            # Only assigned driver can collect
            return bool(
                request.user.role == User.Role.DRIVER
                and obj.trip
                and obj.trip.driver
                and obj.trip.driver.user_id == request.user.id
            )

        if getattr(view, "action", None) == "settle_cash":
            # Only admin and fleet manager can settle
            return bool(
                request.user.role in [User.Role.ADMIN, User.Role.FLEET_MANAGER]
                or request.user.is_superuser
            )

        if request.user.role in [User.Role.ADMIN, User.Role.FLEET_MANAGER] or request.user.is_superuser:
            return True

        if request.user.role == User.Role.CUSTOMER:
            return obj.customer_id == request.user.id

        if request.user.role == User.Role.DRIVER:
            return bool(obj.trip and obj.trip.driver and obj.trip.driver.user_id == request.user.id)

        return False


class IsAdminUserOnly(BasePermission):
    """Allows access only to Admin users."""

    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and (request.user.role == User.Role.ADMIN or request.user.is_superuser)
        )
