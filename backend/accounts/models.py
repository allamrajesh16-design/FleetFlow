from datetime import timedelta
import hashlib
import secrets
from django.conf import settings
from django.contrib.auth.models import AbstractUser, BaseUserManager
from django.db import models
from django.utils import timezone


class UserManager(BaseUserManager):
    """Custom manager for User model where email is the unique identifier for auth."""

    def create_user(self, email, password=None, **extra_fields):
        if not email:
            raise ValueError("The Email field must be set")
        email = self.normalize_email(email)
        extra_fields.setdefault("role", User.Role.CUSTOMER)
        user = self.model(email=email, **extra_fields)
        if password:
            user.set_password(password)
        else:
            user.set_unusable_password()
        user.save(using=self._db)
        return user

    def create_superuser(self, email, password=None, **extra_fields):
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        extra_fields.setdefault("role", User.Role.ADMIN)
        extra_fields.setdefault("is_email_verified", True)
        extra_fields.setdefault("approval_status", User.ApprovalStatus.APPROVED)

        if extra_fields.get("is_staff") is not True:
            raise ValueError("Superuser must have is_staff=True.")
        if extra_fields.get("is_superuser") is not True:
            raise ValueError("Superuser must have is_superuser=True.")

        return self.create_user(email, password, **extra_fields)


class User(AbstractUser):
    """Custom User model with email authentication and roles."""

    class Role(models.TextChoices):
        ADMIN = "ADMIN", "Admin"
        FLEET_MANAGER = "FLEET_MANAGER", "Fleet Manager"
        DRIVER = "DRIVER", "Driver"
        CUSTOMER = "CUSTOMER", "Customer"

    class ApprovalStatus(models.TextChoices):
        NOT_REQUIRED = "NOT_REQUIRED", "Not Required"
        PENDING = "PENDING", "Pending"
        APPROVED = "APPROVED", "Approved"
        REJECTED = "REJECTED", "Rejected"

    username = None  # Use email instead of username
    email = models.EmailField(unique=True)
    phone = models.CharField(max_length=20, unique=True, null=True, blank=True)
    full_name = models.CharField(max_length=150)
    role = models.CharField(max_length=20, choices=Role.choices, default=Role.CUSTOMER)

    # Email verification & registration approvals
    is_email_verified = models.BooleanField(default=False)
    approval_status = models.CharField(
        max_length=20,
        choices=ApprovalStatus.choices,
        default=ApprovalStatus.NOT_REQUIRED,
    )
    approved_by = models.ForeignKey(
        "self",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="approved_users",
    )
    approved_at = models.DateTimeField(null=True, blank=True)
    rejection_reason = models.TextField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    objects = UserManager()

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = ["full_name"]

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "User"
        verbose_name_plural = "Users"

    def __str__(self):
        return f"{self.full_name} <{self.email}> ({self.role})"


class EmailOTP(models.Model):
    """Model to store 6-digit Email OTP hashes for registration/verification and password reset."""

    class Purpose(models.TextChoices):
        REGISTER = "REGISTER", "Registration"
        PASSWORD_RESET = "PASSWORD_RESET", "Password Reset"

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="email_otps")
    purpose = models.CharField(
        max_length=32,
        choices=Purpose.choices,
        default=Purpose.REGISTER,
        db_index=True,
    )
    otp_hash = models.CharField(max_length=128)  # SHA-256 hash of 6-digit OTP
    expires_at = models.DateTimeField()
    attempts = models.PositiveIntegerField(default=0)
    last_sent_at = models.DateTimeField(default=timezone.now)
    is_used = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "Email OTP"
        verbose_name_plural = "Email OTPs"

    @staticmethod
    def hash_otp(otp_str: str) -> str:
        return hashlib.sha256(otp_str.encode("utf-8")).hexdigest()

    def verify_otp(self, input_otp: str) -> tuple[bool, str, str, int | None]:
        """
        Verifies input OTP.
        Returns (is_success, code, error_message, attempts_left).
        """
        if self.is_used:
            return False, "OTP_ALREADY_USED", "This OTP has already been used. Please request a new OTP.", None

        if timezone.now() > self.expires_at:
            return False, "OTP_EXPIRED", "This OTP has expired. Please request a new OTP.", None

        if self.attempts >= 5:
            return False, "TOO_MANY_ATTEMPTS", "Maximum wrong attempts exceeded. Please request a new OTP.", 0

        hashed_input = self.hash_otp(input_otp.strip())
        if secrets.compare_digest(self.otp_hash, hashed_input):
            self.is_used = True
            self.save(update_fields=["is_used"])
            return True, "SUCCESS", "", None
        else:
            self.attempts += 1
            self.save(update_fields=["attempts"])
            if self.attempts >= 5:
                return False, "TOO_MANY_ATTEMPTS", "Maximum wrong attempts exceeded. Please request a new OTP.", 0
            remaining = 5 - self.attempts
            return False, "WRONG_OTP", f"Invalid OTP. {remaining} attempt(s) remaining.", remaining

    def __str__(self):
        return f"OTP for {self.user.email} (purpose={self.purpose}, used={self.is_used}, attempts={self.attempts})"


class PasswordResetSession(models.Model):
    """
    Model for short-lived password reset sessions.
    Stores only the SHA-256 hash of the single-use urlsafe reset token.
    """

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="password_reset_sessions")
    token_hash = models.CharField(max_length=128, unique=True, db_index=True)
    expires_at = models.DateTimeField()
    is_used = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "Password Reset Session"
        verbose_name_plural = "Password Reset Sessions"

    @staticmethod
    def hash_token(raw_token: str) -> str:
        return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()

    @classmethod
    def create_session(cls, user, expires_in_minutes=10) -> tuple["PasswordResetSession", str]:
        raw_token = secrets.token_urlsafe(32)
        token_hash = cls.hash_token(raw_token)
        expires_at = timezone.now() + timedelta(minutes=expires_in_minutes)
        session = cls.objects.create(user=user, token_hash=token_hash, expires_at=expires_at)
        return session, raw_token

    def is_valid(self) -> bool:
        return not self.is_used and timezone.now() < self.expires_at

    def __str__(self):
        return f"Reset Session for {self.user.email} (used={self.is_used})"


class PasswordResetToken(models.Model):
    """
    DEPRECATED: Old link-based password reset model.
    Kept in database for backward schema compatibility. Do not use for new resets.
    """

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="password_reset_tokens")
    token = models.CharField(max_length=128, unique=True, db_index=True)
    expires_at = models.DateTimeField()
    is_used = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    @classmethod
    def generate_token(cls, user, expires_in_minutes=60):
        token = secrets.token_urlsafe(32)
        expires_at = timezone.now() + timedelta(minutes=expires_in_minutes)
        return cls.objects.create(user=user, token=token, expires_at=expires_at)

    def is_valid(self):
        return not self.is_used and timezone.now() < self.expires_at

    def __str__(self):
        return f"Reset token for {self.user.email} (used={self.is_used})"

