import logging
from django.conf import settings
from django.core.mail import EmailMultiAlternatives

logger = logging.getLogger(__name__)


class EmailDeliveryError(Exception):
    """Custom exception raised when email delivery fails."""
    pass


def send_email(to, subject, message, html_message=None):
    """
    Sends an email with both plain-text and HTML versions using Django's EMAIL_BACKEND.
    Raises EmailDeliveryError if delivery fails, logging without secrets.
    """
    from_email = getattr(settings, 'DEFAULT_FROM_EMAIL', None)
    if not from_email:
        host_user = getattr(settings, 'EMAIL_HOST_USER', '')
        from_email = f"FleetFlow <{host_user}>" if host_user else "FleetFlow <noreply@fleetflow.com>"

    recipient_list = [to] if isinstance(to, str) else list(to)

    try:
        msg = EmailMultiAlternatives(
            subject=subject,
            body=message,
            from_email=from_email,
            to=recipient_list,
        )
        if html_message:
            msg.attach_alternative(html_message, "text/html")
        msg.send(fail_silently=False)
        return True
    except Exception as e:
        clean_err = str(e).split('password')[0] if 'password' in str(e).lower() else str(e)
        logger.error("Failed to send email to %s: %s", recipient_list, clean_err)
        raise EmailDeliveryError("We could not send the email. Please try again.") from e


def send_otp_email(user, otp_code):
    """
    Sends a 6-digit registration verification OTP email.
    """
    subject = "FleetFlow - Verify Your Email"
    full_name = getattr(user, 'full_name', 'User') or 'User'

    text_content = (
        f"FleetFlow\n\n"
        f"Hello {full_name},\n\n"
        f"Your verification code for FleetFlow is: {otp_code}\n\n"
        f"This code is valid for 10 minutes.\n\n"
        f"WARNING: Never share this OTP with anyone. FleetFlow staff will never ask for your code.\n\n"
        f"Best regards,\n"
        f"The FleetFlow Team"
    )

    html_content = f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #1e293b; }}
    .card {{ max-width: 520px; margin: 0 auto; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05); }}
    .header {{ background: linear-gradient(135deg, #1e3a8a, #2563eb); padding: 24px; text-align: center; color: #ffffff; }}
    .header h1 {{ margin: 0; font-size: 24px; font-weight: 700; letter-spacing: -0.5px; }}
    .content {{ padding: 32px 24px; }}
    .otp-box {{ background: #eff6ff; border: 2px dashed #2563eb; border-radius: 8px; padding: 18px; text-align: center; margin: 24px 0; }}
    .otp-code {{ font-size: 34px; font-weight: 800; letter-spacing: 8px; color: #1d4ed8; font-family: 'Courier New', Courier, monospace; }}
    .validity {{ font-size: 13px; color: #64748b; margin-top: 8px; font-weight: 600; }}
    .warning {{ background: #fffbeb; border-left: 4px solid #f59e0b; padding: 12px 16px; border-radius: 4px; font-size: 13px; color: #92400e; margin: 20px 0; }}
    .footer {{ border-top: 1px solid #e2e8f0; padding: 16px 24px; font-size: 12px; color: #94a3b8; text-align: center; }}
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <h1>FleetFlow</h1>
    </div>
    <div class="content">
      <h2 style="margin-top: 0; font-size: 18px; color: #0f172a;">Email Verification</h2>
      <p>Hello <strong>{full_name}</strong>,</p>
      <p>Please enter the 6-digit verification code below to complete your email verification:</p>
      <div class="otp-box">
        <div class="otp-code">{otp_code}</div>
        <div class="validity">This code is valid for 10 minutes</div>
      </div>
      <div class="warning">
        <strong>Security Warning:</strong> Never share this code with anyone. FleetFlow representatives will never ask for your verification code.
      </div>
      <p style="margin-bottom: 0;">Best regards,<br>The FleetFlow Team</p>
    </div>
    <div class="footer">
      &copy; FleetFlow Fleet & Trip Management System. All rights reserved.
    </div>
  </div>
</body>
</html>"""

    return send_email(user.email, subject, text_content, html_content)


def send_password_reset_otp_email(user, otp_code):
    """
    Sends a 6-digit password reset OTP email with plain text and styled HTML version.
    """
    subject = "FleetFlow - Password reset code"
    full_name = getattr(user, 'full_name', 'User') or 'User'

    text_content = (
        f"FleetFlow\n\n"
        f"Hello {full_name},\n\n"
        f"Your password reset code for FleetFlow is:\n\n"
        f"    {otp_code}\n\n"
        f"This code is valid for 10 minutes.\n\n"
        f"If you did not ask for this, ignore this email. Never share this code with anyone.\n\n"
        f"Best regards,\n"
        f"The FleetFlow Team"
    )

    html_content = f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #1e293b; }}
    .card {{ max-width: 520px; margin: 0 auto; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05); }}
    .header {{ background: linear-gradient(135deg, #1e3a8a, #2563eb); padding: 24px; text-align: center; color: #ffffff; }}
    .header h1 {{ margin: 0; font-size: 24px; font-weight: 700; letter-spacing: -0.5px; }}
    .content {{ padding: 32px 24px; }}
    .otp-box {{ background: #eff6ff; border: 2px dashed #2563eb; border-radius: 8px; padding: 18px; text-align: center; margin: 24px 0; }}
    .otp-code {{ font-size: 36px; font-weight: 800; letter-spacing: 8px; color: #1d4ed8; font-family: 'Courier New', Courier, monospace; }}
    .validity {{ font-size: 13px; color: #64748b; margin-top: 8px; font-weight: 600; }}
    .warning {{ background: #fffbeb; border-left: 4px solid #f59e0b; padding: 12px 16px; border-radius: 4px; font-size: 13px; color: #92400e; margin: 20px 0; }}
    .footer {{ border-top: 1px solid #e2e8f0; padding: 16px 24px; font-size: 12px; color: #94a3b8; text-align: center; }}
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <h1>FleetFlow</h1>
    </div>
    <div class="content">
      <h2 style="margin-top: 0; font-size: 18px; color: #0f172a;">Password Reset Code</h2>
      <p>Hello <strong>{full_name}</strong>,</p>
      <p>We received a request to reset your password. Use the verification code below:</p>
      <div class="otp-box">
        <div class="otp-code">{otp_code}</div>
        <div class="validity">This code is valid for 10 minutes</div>
      </div>
      <div class="warning">
        <strong>Security Notice:</strong> If you did not ask for this, ignore this email. Never share this code with anyone. FleetFlow representatives will never ask for your code.
      </div>
      <p style="margin-bottom: 0;">Best regards,<br>The FleetFlow Team</p>
    </div>
    <div class="footer">
      &copy; FleetFlow Fleet & Trip Management System. All rights reserved.
    </div>
  </div>
</body>
</html>"""

    return send_email(user.email, subject, text_content, html_content)


def send_password_changed_email(user, changed_time_str):
    """
    Sends notification email when a user's password is changed.
    """
    subject = "FleetFlow - Your password was changed"
    full_name = getattr(user, 'full_name', 'User') or 'User'

    text_content = (
        f"FleetFlow\n\n"
        f"Hello {full_name},\n\n"
        f"Your FleetFlow account password was successfully changed on {changed_time_str}.\n\n"
        f"All active sessions and refresh tokens have been logged out.\n\n"
        f"Security Notice: If this was not you, please contact the administrator immediately at support@fleetflow.com.\n\n"
        f"Best regards,\n"
        f"The FleetFlow Team"
    )

    html_content = f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #1e293b; }}
    .card {{ max-width: 520px; margin: 0 auto; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05); }}
    .header {{ background: linear-gradient(135deg, #15803d, #16a34a); padding: 24px; text-align: center; color: #ffffff; }}
    .header h1 {{ margin: 0; font-size: 24px; font-weight: 700; letter-spacing: -0.5px; }}
    .content {{ padding: 32px 24px; }}
    .alert-box {{ background: #fef2f2; border-left: 4px solid #ef4444; padding: 12px 16px; border-radius: 4px; font-size: 13px; color: #991b1b; margin: 20px 0; }}
    .footer {{ border-top: 1px solid #e2e8f0; padding: 16px 24px; font-size: 12px; color: #94a3b8; text-align: center; }}
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <h1>FleetFlow</h1>
    </div>
    <div class="content">
      <h2 style="margin-top: 0; font-size: 18px; color: #0f172a;">Password Changed</h2>
      <p>Hello <strong>{full_name}</strong>,</p>
      <p>Your FleetFlow account password was successfully changed on <strong>{changed_time_str}</strong>.</p>
      <p>For your security, all existing login sessions across your devices have been logged out.</p>
      <div class="alert-box">
        <strong>Important:</strong> If this was not you, please contact the administrator immediately at support@fleetflow.com.
      </div>
      <p style="margin-bottom: 0;">Best regards,<br>The FleetFlow Team</p>
    </div>
    <div class="footer">
      &copy; FleetFlow Fleet & Trip Management System. All rights reserved.
    </div>
  </div>
</body>
</html>"""

    return send_email(user.email, subject, text_content, html_content)


def send_approval_email(user):
    """
    Sends registration approval email.
    """
    subject = "FleetFlow - Your registration is approved"
    full_name = getattr(user, 'full_name', 'User') or 'User'
    login_url = "http://localhost:3000/login"

    text_content = (
        f"FleetFlow\n\n"
        f"Hello {full_name},\n\n"
        f"Your registration is accepted. You can login now.\n\n"
        f"Login here: {login_url}\n\n"
        f"Best regards,\n"
        f"The FleetFlow Team"
    )

    html_content = f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #1e293b; }}
    .card {{ max-width: 520px; margin: 0 auto; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; }}
    .header {{ background: linear-gradient(135deg, #15803d, #16a34a); padding: 24px; text-align: center; color: #ffffff; }}
    .header h1 {{ margin: 0; font-size: 24px; }}
    .content {{ padding: 32px 24px; }}
    .btn {{ display: inline-block; background: #16a34a; color: #ffffff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600; margin-top: 16px; }}
    .footer {{ border-top: 1px solid #e2e8f0; padding: 16px 24px; font-size: 12px; color: #94a3b8; text-align: center; }}
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <h1>FleetFlow</h1>
    </div>
    <div class="content">
      <h2 style="margin-top: 0; color: #15803d;">Registration Approved</h2>
      <p>Hello <strong>{full_name}</strong>,</p>
      <p>Your registration is accepted. You can login now.</p>
      <p style="margin-top: 24px;">
        <a href="{login_url}" class="btn" style="color: #ffffff; text-decoration: none;">Log In to FleetFlow</a>
      </p>
      <p style="margin-top: 24px;">Best regards,<br>The FleetFlow Team</p>
    </div>
    <div class="footer">
      &copy; FleetFlow Fleet & Trip Management System.
    </div>
  </div>
</body>
</html>"""

    return send_email(user.email, subject, text_content, html_content)


def send_rejection_email(user, reason):
    """
    Sends registration rejection email with reason.
    """
    subject = "FleetFlow - Your registration was not approved"
    full_name = getattr(user, 'full_name', 'User') or 'User'

    text_content = (
        f"FleetFlow\n\n"
        f"Hello {full_name},\n\n"
        f"Your registration was not approved.\n\n"
        f"Reason: {reason}\n\n"
        f"What to do next: Please review the rejection reason above and ensure all required information and valid documentation are provided. You may submit a new registration or contact our support team at support@fleetflow.com for assistance.\n\n"
        f"Best regards,\n"
        f"The FleetFlow Team"
    )

    html_content = f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #1e293b; }}
    .card {{ max-width: 520px; margin: 0 auto; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; }}
    .header {{ background: linear-gradient(135deg, #b91c1c, #dc2626); padding: 24px; text-align: center; color: #ffffff; }}
    .header h1 {{ margin: 0; font-size: 24px; }}
    .content {{ padding: 32px 24px; }}
    .reason-box {{ background: #fef2f2; border-left: 4px solid #ef4444; padding: 12px 16px; border-radius: 4px; color: #991b1b; margin: 16px 0; }}
    .next-box {{ background: #f8fafc; border: 1px solid #e2e8f0; padding: 12px 16px; border-radius: 6px; margin: 16px 0; font-size: 13.5px; }}
    .footer {{ border-top: 1px solid #e2e8f0; padding: 16px 24px; font-size: 12px; color: #94a3b8; text-align: center; }}
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <h1>FleetFlow</h1>
    </div>
    <div class="content">
      <h2 style="margin-top: 0; color: #b91c1c;">Registration Not Approved</h2>
      <p>Hello <strong>{full_name}</strong>,</p>
      <p>Your registration was not approved.</p>
      <div class="reason-box">
        <strong>Reason:</strong> {reason}
      </div>
      <div class="next-box">
        <strong>What to do next:</strong>
        <p style="margin: 6px 0 0 0;">Please review the reason given above. You may register again with accurate details and required documents, or reach out to our team at support@fleetflow.com.</p>
      </div>
      <p>Best regards,<br>The FleetFlow Team</p>
    </div>
    <div class="footer">
      &copy; FleetFlow Fleet & Trip Management System.
    </div>
  </div>
</body>
</html>"""

    return send_email(user.email, subject, text_content, html_content)
