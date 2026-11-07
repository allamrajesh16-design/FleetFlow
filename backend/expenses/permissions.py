from rest_framework.permissions import BasePermission
from accounts.models import User
from .models import Expense


class ExpensePermission(BasePermission):
    """
    Permissions for Expense management:
    - Admin & Fleet Manager: full access, can approve/reject, can view all.
    - Driver: create, view/list/edit own expenses (only while PENDING).
    - Customer: 403 Forbidden.
    """

    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False

        if request.user.role == User.Role.CUSTOMER:
            return False

        if request.user.role in [User.Role.ADMIN, User.Role.FLEET_MANAGER] or request.user.is_superuser:
            return True

        if request.user.role == User.Role.DRIVER:
            if view.action in ["approve", "reject", "destroy", "summary"]:
                return False
            return True

        return False

    def has_object_permission(self, request, view, obj):
        if not (request.user and request.user.is_authenticated):
            return False

        if request.user.role == User.Role.CUSTOMER:
            return False

        if request.user.role in [User.Role.ADMIN, User.Role.FLEET_MANAGER] or request.user.is_superuser:
            return True

        if request.user.role == User.Role.DRIVER:
            if view.action in ["retrieve", "download", "receipt"]:
                return obj.submitted_by == request.user

            if view.action in ["update", "partial_update"]:
                # An APPROVED expense cannot be edited by the driver
                if obj.status == Expense.Status.APPROVED:
                    return False
                return obj.submitted_by == request.user

            return False

        return False
