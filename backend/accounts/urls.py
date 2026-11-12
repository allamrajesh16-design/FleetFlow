from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView
from .views import (
    RegisterOptionsView,
    RegisterView,
    CheckEmailView,
    VerifyOTPView,
    ResendOTPView,
    ApprovalsListView,
    ApproveUserView,
    RejectUserView,
    ResendDecisionEmailView,
    LoginView,
    LogoutView,
    ForgotPasswordView,
    VerifyResetOTPView,
    ResetPasswordView,
    LegacyResetPasswordView,
    ProfileView,
    ChangePasswordView,
)

urlpatterns = [
    # Registration & Role options
    path('register-options/', RegisterOptionsView.as_view(), name='auth_register_options'),
    path('register/', RegisterView.as_view(), name='auth_register'),
    path('check-email/', CheckEmailView.as_view(), name='auth_check_email'),
    path('verify-otp/', VerifyOTPView.as_view(), name='auth_verify_otp'),
    path('verify-email-otp/', VerifyOTPView.as_view(), name='auth_verify_email_otp'),
    path('resend-otp/', ResendOTPView.as_view(), name='auth_resend_otp'),
    path('resend-email-otp/', ResendOTPView.as_view(), name='auth_resend_email_otp'),

    # Approvals workflow
    path('approvals/', ApprovalsListView.as_view(), name='auth_approvals_list'),
    path('approvals/<int:user_id>/approve/', ApproveUserView.as_view(), name='auth_approve_user'),
    path('approvals/<int:user_id>/reject/', RejectUserView.as_view(), name='auth_reject_user'),
    path('approvals/<int:user_id>/resend-decision-email/', ResendDecisionEmailView.as_view(), name='auth_resend_decision_email'),

    # Authentication & Profile
    path('login/', LoginView.as_view(), name='auth_login'),
    path('logout/', LogoutView.as_view(), name='auth_logout'),
    path('token/refresh/', TokenRefreshView.as_view(), name='auth_token_refresh'),
    path('forgot-password/', ForgotPasswordView.as_view(), name='auth_forgot_password'),
    path('forgot-password/verify-otp/', VerifyResetOTPView.as_view(), name='auth_forgot_password_verify_otp'),
    path('forgot-password/reset/', ResetPasswordView.as_view(), name='auth_forgot_password_reset'),
    # Deprecated endpoint for old reset links
    path('reset-password/', LegacyResetPasswordView.as_view(), name='auth_reset_password_legacy'),
    path('profile/', ProfileView.as_view(), name='auth_profile'),
    path('change-password/', ChangePasswordView.as_view(), name='auth_change_password'),
]

