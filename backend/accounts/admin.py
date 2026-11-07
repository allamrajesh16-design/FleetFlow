from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from .models import User, EmailOTP, PasswordResetSession, PasswordResetToken


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    """Admin configuration for custom User model."""

    list_display = (
        "email",
        "full_name",
        "phone",
        "role",
        "is_email_verified",
        "approval_status",
        "is_active",
        "is_staff",
        "created_at",
    )
    list_filter = ("role", "is_email_verified", "approval_status", "is_active", "is_staff")
    fieldsets = (
        (None, {"fields": ("email", "password")}),
        ("Personal Info", {"fields": ("full_name", "phone")}),
        (
            "Registration & Approval",
            {
                "fields": (
                    "is_email_verified",
                    "approval_status",
                    "approved_by",
                    "approved_at",
                    "rejection_reason",
                )
            },
        ),
        (
            "Roles & Permissions",
            {
                "fields": (
                    "role",
                    "is_active",
                    "is_staff",
                    "is_superuser",
                    "groups",
                    "user_permissions",
                )
            },
        ),
        ("Timestamps", {"fields": ("last_login", "created_at", "updated_at")}),
    )
    readonly_fields = ("created_at", "updated_at", "last_login")
    add_fieldsets = (
        (
            None,
            {
                "classes": ("wide",),
                "fields": ("email", "full_name", "phone", "role", "password1", "password2"),
            },
        ),
    )
    search_fields = ("email", "full_name", "phone")
    ordering = ("-created_at",)

    def save_model(self, request, obj, form, change):
        if not change:
            # Users created in Django admin are automatically verified and approved
            obj.is_email_verified = True
            obj.approval_status = User.ApprovalStatus.APPROVED
        super().save_model(request, obj, form, change)


@admin.register(EmailOTP)
class EmailOTPAdmin(admin.ModelAdmin):
    """Admin configuration for EmailOTP model."""

    list_display = ("user", "purpose", "expires_at", "attempts", "is_used", "last_sent_at", "created_at")
    list_filter = ("purpose", "is_used", "created_at")
    search_fields = ("user__email",)
    readonly_fields = ("created_at", "last_sent_at")
    exclude = ("otp_hash",)


@admin.register(PasswordResetSession)
class PasswordResetSessionAdmin(admin.ModelAdmin):
    """Admin configuration for PasswordResetSession model."""

    list_display = ("id", "user", "expires_at", "is_used", "created_at")
    list_filter = ("is_used", "created_at")
    search_fields = ("user__email",)
    readonly_fields = ("created_at", "expires_at")
    exclude = ("token_hash",)


@admin.register(PasswordResetToken)
class PasswordResetTokenAdmin(admin.ModelAdmin):
    """Admin configuration for deprecated PasswordResetToken model."""

    list_display = ("id", "user", "expires_at", "is_used", "created_at")
    list_filter = ("is_used", "created_at")
    search_fields = ("user__email",)
    readonly_fields = ("created_at",)
    exclude = ("token",)


