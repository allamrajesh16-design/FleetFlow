import logging
from django.conf import settings
from django.core.mail import EmailMultiAlternatives

logger = logging.getLogger(__name__)


class EmailDeliveryError(Exception):
    """Custom exception raised when email delivery fails."""
    pass


class EmailRecipientRefusedError(EmailDeliveryError):
    """Raised when the mail server immediately refuses the recipient address (e.g. SMTPRecipientsRefused, 550)."""
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
        err_str = str(e).lower()
        err_type = type(e).__name__.lower()
        if (
            "smtprecipientsrefused" in err_type
            or "550" in err_str
            or "5.1.1" in err_str
            or "user unknown" in err_str
            or "recipient address rejected" in err_str
            or "mailbox unavailable" in err_str
            or "invalid recipient" in err_str
        ):
            raise EmailRecipientRefusedError("We could not deliver to this email. Please check the spelling.") from e
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
        f"This code is valid for 5 minutes.\n\n"
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
        <div class="validity">This code is valid for 5 minutes</div>
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


def send_driver_assignment_email(trip):
    """
    Sends a trip assignment notification email to the driver.
    Contains: driver name, booking ID, customer name, pickup, drop,
    journey datetime, and vehicle registration number.
    Call this AFTER a successful assignment is saved.
    Email failures are caught here and logged; they never raise to the caller.
    """
    try:
        driver = trip.driver
        if not driver or not driver.user or not driver.user.email:
            logger.warning(
                "send_driver_assignment_email: trip #%s has no driver email, skipping.", trip.id
            )
            return False

        driver_name = driver.user.full_name or driver.user.username or "Driver"
        driver_email = driver.user.email

        booking_id = trip.booking.id if trip.booking else None
        booking_ref = f"#{booking_id}" if booking_id else "N/A (Bus Schedule)"

        customer_name = "N/A"
        if trip.booking and trip.booking.customer:
            customer_name = trip.booking.customer.full_name or "Customer"

        vehicle_reg = trip.vehicle.registration_number if trip.vehicle else "N/A"
        vehicle_model = f"{trip.vehicle.brand} {trip.vehicle.model}" if trip.vehicle else "N/A"
        trip_status = trip.get_status_display() if hasattr(trip, "get_status_display") else (trip.status or "SCHEDULED")

        scheduled_str = (
            trip.scheduled_datetime.strftime("%d %b %Y at %I:%M %p")
            if trip.scheduled_datetime
            else "TBD"
        )

        subject = f"FleetFlow - New Trip Assignment: Booking {booking_ref}"

        text_content = (
            f"FleetFlow\n\n"
            f"Hello {driver_name},\n\n"
            f"You have been assigned a new trip. Here are the details:\n\n"
            f"  Driver Name       : {driver_name}\n"
            f"  Booking Reference : {booking_ref}\n"
            f"  Customer Name     : {customer_name}\n"
            f"  Pickup Location   : {trip.source}\n"
            f"  Drop Location     : {trip.destination}\n"
            f"  Journey Date/Time : {scheduled_str}\n"
            f"  Assigned Vehicle  : {vehicle_reg}\n"
            f"  Vehicle Model     : {vehicle_model}\n"
            f"  Assignment Status : {trip_status}\n\n"
            f"Please be at the pickup location on time.\n\n"
            f"Best regards,\n"
            f"The FleetFlow Team"
        )

        html_content = f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #1e293b; }}
    .card {{ max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05); }}
    .header {{ background: linear-gradient(135deg, #1e3a8a, #2563eb); padding: 24px; text-align: center; color: #ffffff; }}
    .header h1 {{ margin: 0; font-size: 24px; font-weight: 700; letter-spacing: -0.5px; }}
    .header p {{ margin: 6px 0 0 0; font-size: 14px; opacity: 0.85; }}
    .content {{ padding: 32px 24px; }}
    .greeting {{ font-size: 16px; margin-bottom: 20px; }}
    .detail-table {{ width: 100%; border-collapse: collapse; margin: 20px 0; }}
    .detail-table td {{ padding: 10px 12px; font-size: 14px; border-bottom: 1px solid #f1f5f9; vertical-align: top; }}
    .detail-table td:first-child {{ font-weight: 700; color: #64748b; text-transform: uppercase; font-size: 11.5px; letter-spacing: 0.04em; width: 40%; }}
    .detail-table td:last-child {{ color: #0f172a; font-weight: 600; }}
    .pickup-row td:last-child {{ color: #15803d; }}
    .drop-row td:last-child {{ color: #dc2626; }}
    .status-badge {{ display: inline-block; padding: 3px 8px; border-radius: 4px; font-size: 12px; font-weight: 700; background: #eff6ff; color: #1d4ed8; }}
    .notice {{ background: #eff6ff; border-left: 4px solid #2563eb; padding: 12px 16px; border-radius: 4px; font-size: 13px; color: #1e40af; margin: 20px 0; }}
    .footer {{ border-top: 1px solid #e2e8f0; padding: 16px 24px; font-size: 12px; color: #94a3b8; text-align: center; }}
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <h1>FleetFlow</h1>
      <p>New Trip Assignment</p>
    </div>
    <div class="content">
      <p class="greeting">Hello <strong>{driver_name}</strong>,</p>
      <p>You have been assigned a new trip. Please review the details below and be ready on time.</p>
      <table class="detail-table">
        <tr><td>Driver Name</td><td>{driver_name}</td></tr>
        <tr><td>Booking Reference</td><td>{booking_ref}</td></tr>
        <tr><td>Customer</td><td>{customer_name}</td></tr>
        <tr class="pickup-row"><td>Pickup Location</td><td>&#9679; {trip.source}</td></tr>
        <tr class="drop-row"><td>Drop Location</td><td>&#9679; {trip.destination}</td></tr>
        <tr><td>Journey Date &amp; Time</td><td><strong>{scheduled_str}</strong></td></tr>
        <tr><td>Vehicle Registration</td><td><strong>{vehicle_reg}</strong></td></tr>
        <tr><td>Vehicle Model</td><td>{vehicle_model}</td></tr>
        <tr><td>Assignment Status</td><td><span class="status-badge">{trip_status}</span></td></tr>
      </table>
      <div class="notice">
        <strong>Reminder:</strong> Please be at the pickup location at least 10 minutes before the scheduled time.
      </div>
      <p style="margin-bottom: 0;">Best regards,<br>The FleetFlow Team</p>
    </div>
    <div class="footer">
      &copy; FleetFlow Fleet &amp; Trip Management System. All rights reserved.
    </div>
  </div>
</body>
</html>"""

        result = send_email(driver_email, subject, text_content, html_content)
        logger.info(
            "send_driver_assignment_email: email sent to driver %s (trip #%s, booking %s).",
            driver_email, trip.id, booking_ref,
        )
        return result

    except Exception as exc:
        logger.error(
            "send_driver_assignment_email: failed to send email for trip #%s: %s",
            getattr(trip, "id", "?"), exc,
        )
        return False


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
        <div class="validity">This code is valid for 5 minutes</div>
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


def send_driver_assignment_email(trip):
    """
    Sends a trip assignment notification email to the driver.
    Contains: driver name, booking ID, customer name, pickup, drop,
    journey datetime, and vehicle registration number.
    Call this AFTER a successful assignment is saved.
    Email failures are caught here and logged; they never raise to the caller.
    """
    try:
        driver = trip.driver
        if not driver or not driver.user or not driver.user.email:
            logger.warning(
                "send_driver_assignment_email: trip #%s has no driver email, skipping.", trip.id
            )
            return False

        driver_name = driver.user.full_name or driver.user.username or "Driver"
        driver_email = driver.user.email

        booking_id = trip.booking.id if trip.booking else None
        booking_ref = f"#{booking_id}" if booking_id else "N/A (Bus Schedule)"

        customer_name = "N/A"
        if trip.booking and trip.booking.customer:
            customer_name = trip.booking.customer.full_name or "Customer"

        vehicle_reg = trip.vehicle.registration_number if trip.vehicle else "N/A"
        vehicle_model = f"{trip.vehicle.brand} {trip.vehicle.model}" if trip.vehicle else "N/A"
        trip_status = trip.get_status_display() if hasattr(trip, "get_status_display") else (trip.status or "SCHEDULED")

        scheduled_str = (
            trip.scheduled_datetime.strftime("%d %b %Y at %I:%M %p")
            if trip.scheduled_datetime
            else "TBD"
        )

        subject = f"FleetFlow - New Trip Assignment: Booking {booking_ref}"

        text_content = (
            f"FleetFlow\n\n"
            f"Hello {driver_name},\n\n"
            f"You have been assigned a new trip. Here are the details:\n\n"
            f"  Driver Name       : {driver_name}\n"
            f"  Booking Reference : {booking_ref}\n"
            f"  Customer Name     : {customer_name}\n"
            f"  Pickup Location   : {trip.source}\n"
            f"  Drop Location     : {trip.destination}\n"
            f"  Journey Date/Time : {scheduled_str}\n"
            f"  Assigned Vehicle  : {vehicle_reg}\n"
            f"  Vehicle Model     : {vehicle_model}\n"
            f"  Assignment Status : {trip_status}\n\n"
            f"Please be at the pickup location on time.\n\n"
            f"Best regards,\n"
            f"The FleetFlow Team"
        )

        html_content = f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #1e293b; }}
    .card {{ max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05); }}
    .header {{ background: linear-gradient(135deg, #1e3a8a, #2563eb); padding: 24px; text-align: center; color: #ffffff; }}
    .header h1 {{ margin: 0; font-size: 24px; font-weight: 700; letter-spacing: -0.5px; }}
    .header p {{ margin: 6px 0 0 0; font-size: 14px; opacity: 0.85; }}
    .content {{ padding: 32px 24px; }}
    .greeting {{ font-size: 16px; margin-bottom: 20px; }}
    .detail-table {{ width: 100%; border-collapse: collapse; margin: 20px 0; }}
    .detail-table td {{ padding: 10px 12px; font-size: 14px; border-bottom: 1px solid #f1f5f9; vertical-align: top; }}
    .detail-table td:first-child {{ font-weight: 700; color: #64748b; text-transform: uppercase; font-size: 11.5px; letter-spacing: 0.04em; width: 40%; }}
    .detail-table td:last-child {{ color: #0f172a; font-weight: 600; }}
    .pickup-row td:last-child {{ color: #15803d; }}
    .drop-row td:last-child {{ color: #dc2626; }}
    .status-badge {{ display: inline-block; padding: 3px 8px; border-radius: 4px; font-size: 12px; font-weight: 700; background: #eff6ff; color: #1d4ed8; }}
    .notice {{ background: #eff6ff; border-left: 4px solid #2563eb; padding: 12px 16px; border-radius: 4px; font-size: 13px; color: #1e40af; margin: 20px 0; }}
    .footer {{ border-top: 1px solid #e2e8f0; padding: 16px 24px; font-size: 12px; color: #94a3b8; text-align: center; }}
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <h1>FleetFlow</h1>
      <p>New Trip Assignment</p>
    </div>
    <div class="content">
      <p class="greeting">Hello <strong>{driver_name}</strong>,</p>
      <p>You have been assigned a new trip. Please review the details below and be ready on time.</p>
      <table class="detail-table">
        <tr><td>Driver Name</td><td>{driver_name}</td></tr>
        <tr><td>Booking Reference</td><td>{booking_ref}</td></tr>
        <tr><td>Customer</td><td>{customer_name}</td></tr>
        <tr class="pickup-row"><td>Pickup Location</td><td>&#9679; {trip.source}</td></tr>
        <tr class="drop-row"><td>Drop Location</td><td>&#9679; {trip.destination}</td></tr>
        <tr><td>Journey Date &amp; Time</td><td><strong>{scheduled_str}</strong></td></tr>
        <tr><td>Vehicle Registration</td><td><strong>{vehicle_reg}</strong></td></tr>
        <tr><td>Vehicle Model</td><td>{vehicle_model}</td></tr>
        <tr><td>Assignment Status</td><td><span class="status-badge">{trip_status}</span></td></tr>
      </table>
      <div class="notice">
        <strong>Reminder:</strong> Please be at the pickup location at least 10 minutes before the scheduled time.
      </div>
      <p style="margin-bottom: 0;">Best regards,<br>The FleetFlow Team</p>
    </div>
    <div class="footer">
      &copy; FleetFlow Fleet &amp; Trip Management System. All rights reserved.
    </div>
  </div>
</body>
</html>"""

        result = send_email(driver_email, subject, text_content, html_content)
        logger.info(
            "send_driver_assignment_email: email sent to driver %s (trip #%s, booking %s).",
            driver_email, trip.id, booking_ref,
        )
        return result

    except Exception as exc:
        logger.error(
            "send_driver_assignment_email: failed to send email for trip #%s: %s",
            getattr(trip, "id", "?"), exc,
        )
        return False


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


def send_driver_assignment_email(trip):
    """
    Sends a trip assignment notification email to the driver.
    Contains: driver name, booking ID, customer name, pickup, drop,
    journey datetime, and vehicle registration number.
    Call this AFTER a successful assignment is saved.
    Email failures are caught here and logged; they never raise to the caller.
    """
    try:
        driver = trip.driver
        if not driver or not driver.user or not driver.user.email:
            logger.warning(
                "send_driver_assignment_email: trip #%s has no driver email, skipping.", trip.id
            )
            return False

        driver_name = driver.user.full_name or driver.user.username or "Driver"
        driver_email = driver.user.email

        booking_id = trip.booking.id if trip.booking else None
        booking_ref = f"#{booking_id}" if booking_id else "N/A (Bus Schedule)"

        customer_name = "N/A"
        if trip.booking and trip.booking.customer:
            customer_name = trip.booking.customer.full_name or "Customer"

        vehicle_reg = trip.vehicle.registration_number if trip.vehicle else "N/A"
        vehicle_model = f"{trip.vehicle.brand} {trip.vehicle.model}" if trip.vehicle else "N/A"
        trip_status = trip.get_status_display() if hasattr(trip, "get_status_display") else (trip.status or "SCHEDULED")

        scheduled_str = (
            trip.scheduled_datetime.strftime("%d %b %Y at %I:%M %p")
            if trip.scheduled_datetime
            else "TBD"
        )

        subject = f"FleetFlow - New Trip Assignment: Booking {booking_ref}"

        text_content = (
            f"FleetFlow\n\n"
            f"Hello {driver_name},\n\n"
            f"You have been assigned a new trip. Here are the details:\n\n"
            f"  Driver Name       : {driver_name}\n"
            f"  Booking Reference : {booking_ref}\n"
            f"  Customer Name     : {customer_name}\n"
            f"  Pickup Location   : {trip.source}\n"
            f"  Drop Location     : {trip.destination}\n"
            f"  Journey Date/Time : {scheduled_str}\n"
            f"  Assigned Vehicle  : {vehicle_reg}\n"
            f"  Vehicle Model     : {vehicle_model}\n"
            f"  Assignment Status : {trip_status}\n\n"
            f"Please be at the pickup location on time.\n\n"
            f"Best regards,\n"
            f"The FleetFlow Team"
        )

        html_content = f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #1e293b; }}
    .card {{ max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05); }}
    .header {{ background: linear-gradient(135deg, #1e3a8a, #2563eb); padding: 24px; text-align: center; color: #ffffff; }}
    .header h1 {{ margin: 0; font-size: 24px; font-weight: 700; letter-spacing: -0.5px; }}
    .header p {{ margin: 6px 0 0 0; font-size: 14px; opacity: 0.85; }}
    .content {{ padding: 32px 24px; }}
    .greeting {{ font-size: 16px; margin-bottom: 20px; }}
    .detail-table {{ width: 100%; border-collapse: collapse; margin: 20px 0; }}
    .detail-table td {{ padding: 10px 12px; font-size: 14px; border-bottom: 1px solid #f1f5f9; vertical-align: top; }}
    .detail-table td:first-child {{ font-weight: 700; color: #64748b; text-transform: uppercase; font-size: 11.5px; letter-spacing: 0.04em; width: 40%; }}
    .detail-table td:last-child {{ color: #0f172a; font-weight: 600; }}
    .pickup-row td:last-child {{ color: #15803d; }}
    .drop-row td:last-child {{ color: #dc2626; }}
    .status-badge {{ display: inline-block; padding: 3px 8px; border-radius: 4px; font-size: 12px; font-weight: 700; background: #eff6ff; color: #1d4ed8; }}
    .notice {{ background: #eff6ff; border-left: 4px solid #2563eb; padding: 12px 16px; border-radius: 4px; font-size: 13px; color: #1e40af; margin: 20px 0; }}
    .footer {{ border-top: 1px solid #e2e8f0; padding: 16px 24px; font-size: 12px; color: #94a3b8; text-align: center; }}
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <h1>FleetFlow</h1>
      <p>New Trip Assignment</p>
    </div>
    <div class="content">
      <p class="greeting">Hello <strong>{driver_name}</strong>,</p>
      <p>You have been assigned a new trip. Please review the details below and be ready on time.</p>
      <table class="detail-table">
        <tr><td>Driver Name</td><td>{driver_name}</td></tr>
        <tr><td>Booking Reference</td><td>{booking_ref}</td></tr>
        <tr><td>Customer</td><td>{customer_name}</td></tr>
        <tr class="pickup-row"><td>Pickup Location</td><td>&#9679; {trip.source}</td></tr>
        <tr class="drop-row"><td>Drop Location</td><td>&#9679; {trip.destination}</td></tr>
        <tr><td>Journey Date &amp; Time</td><td><strong>{scheduled_str}</strong></td></tr>
        <tr><td>Vehicle Registration</td><td><strong>{vehicle_reg}</strong></td></tr>
        <tr><td>Vehicle Model</td><td>{vehicle_model}</td></tr>
        <tr><td>Assignment Status</td><td><span class="status-badge">{trip_status}</span></td></tr>
      </table>
      <div class="notice">
        <strong>Reminder:</strong> Please be at the pickup location at least 10 minutes before the scheduled time.
      </div>
      <p style="margin-bottom: 0;">Best regards,<br>The FleetFlow Team</p>
    </div>
    <div class="footer">
      &copy; FleetFlow Fleet &amp; Trip Management System. All rights reserved.
    </div>
  </div>
</body>
</html>"""

        result = send_email(driver_email, subject, text_content, html_content)
        logger.info(
            "send_driver_assignment_email: email sent to driver %s (trip #%s, booking %s).",
            driver_email, trip.id, booking_ref,
        )
        return result

    except Exception as exc:
        logger.error(
            "send_driver_assignment_email: failed to send email for trip #%s: %s",
            getattr(trip, "id", "?"), exc,
        )
        return False


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


def send_driver_assignment_email(trip):
    """
    Sends a trip assignment notification email to the driver.
    Contains: driver name, booking ID, customer name, pickup, drop,
    journey datetime, and vehicle registration number.
    Call this AFTER a successful assignment is saved.
    Email failures are caught here and logged; they never raise to the caller.
    """
    try:
        driver = trip.driver
        if not driver or not driver.user or not driver.user.email:
            logger.warning(
                "send_driver_assignment_email: trip #%s has no driver email, skipping.", trip.id
            )
            return False

        driver_name = driver.user.full_name or driver.user.username or "Driver"
        driver_email = driver.user.email

        booking_id = trip.booking.id if trip.booking else None
        booking_ref = f"#{booking_id}" if booking_id else "N/A (Bus Schedule)"

        customer_name = "N/A"
        if trip.booking and trip.booking.customer:
            customer_name = trip.booking.customer.full_name or "Customer"

        vehicle_reg = trip.vehicle.registration_number if trip.vehicle else "N/A"
        vehicle_model = f"{trip.vehicle.brand} {trip.vehicle.model}" if trip.vehicle else "N/A"
        trip_status = trip.get_status_display() if hasattr(trip, "get_status_display") else (trip.status or "SCHEDULED")

        scheduled_str = (
            trip.scheduled_datetime.strftime("%d %b %Y at %I:%M %p")
            if trip.scheduled_datetime
            else "TBD"
        )

        subject = f"FleetFlow - New Trip Assignment: Booking {booking_ref}"

        text_content = (
            f"FleetFlow\n\n"
            f"Hello {driver_name},\n\n"
            f"You have been assigned a new trip. Here are the details:\n\n"
            f"  Driver Name       : {driver_name}\n"
            f"  Booking Reference : {booking_ref}\n"
            f"  Customer Name     : {customer_name}\n"
            f"  Pickup Location   : {trip.source}\n"
            f"  Drop Location     : {trip.destination}\n"
            f"  Journey Date/Time : {scheduled_str}\n"
            f"  Assigned Vehicle  : {vehicle_reg}\n"
            f"  Vehicle Model     : {vehicle_model}\n"
            f"  Assignment Status : {trip_status}\n\n"
            f"Please be at the pickup location on time.\n\n"
            f"Best regards,\n"
            f"The FleetFlow Team"
        )

        html_content = f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #1e293b; }}
    .card {{ max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05); }}
    .header {{ background: linear-gradient(135deg, #1e3a8a, #2563eb); padding: 24px; text-align: center; color: #ffffff; }}
    .header h1 {{ margin: 0; font-size: 24px; font-weight: 700; letter-spacing: -0.5px; }}
    .header p {{ margin: 6px 0 0 0; font-size: 14px; opacity: 0.85; }}
    .content {{ padding: 32px 24px; }}
    .greeting {{ font-size: 16px; margin-bottom: 20px; }}
    .detail-table {{ width: 100%; border-collapse: collapse; margin: 20px 0; }}
    .detail-table td {{ padding: 10px 12px; font-size: 14px; border-bottom: 1px solid #f1f5f9; vertical-align: top; }}
    .detail-table td:first-child {{ font-weight: 700; color: #64748b; text-transform: uppercase; font-size: 11.5px; letter-spacing: 0.04em; width: 40%; }}
    .detail-table td:last-child {{ color: #0f172a; font-weight: 600; }}
    .pickup-row td:last-child {{ color: #15803d; }}
    .drop-row td:last-child {{ color: #dc2626; }}
    .status-badge {{ display: inline-block; padding: 3px 8px; border-radius: 4px; font-size: 12px; font-weight: 700; background: #eff6ff; color: #1d4ed8; }}
    .notice {{ background: #eff6ff; border-left: 4px solid #2563eb; padding: 12px 16px; border-radius: 4px; font-size: 13px; color: #1e40af; margin: 20px 0; }}
    .footer {{ border-top: 1px solid #e2e8f0; padding: 16px 24px; font-size: 12px; color: #94a3b8; text-align: center; }}
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <h1>FleetFlow</h1>
      <p>New Trip Assignment</p>
    </div>
    <div class="content">
      <p class="greeting">Hello <strong>{driver_name}</strong>,</p>
      <p>You have been assigned a new trip. Please review the details below and be ready on time.</p>
      <table class="detail-table">
        <tr><td>Driver Name</td><td>{driver_name}</td></tr>
        <tr><td>Booking Reference</td><td>{booking_ref}</td></tr>
        <tr><td>Customer</td><td>{customer_name}</td></tr>
        <tr class="pickup-row"><td>Pickup Location</td><td>&#9679; {trip.source}</td></tr>
        <tr class="drop-row"><td>Drop Location</td><td>&#9679; {trip.destination}</td></tr>
        <tr><td>Journey Date &amp; Time</td><td><strong>{scheduled_str}</strong></td></tr>
        <tr><td>Vehicle Registration</td><td><strong>{vehicle_reg}</strong></td></tr>
        <tr><td>Vehicle Model</td><td>{vehicle_model}</td></tr>
        <tr><td>Assignment Status</td><td><span class="status-badge">{trip_status}</span></td></tr>
      </table>
      <div class="notice">
        <strong>Reminder:</strong> Please be at the pickup location at least 10 minutes before the scheduled time.
      </div>
      <p style="margin-bottom: 0;">Best regards,<br>The FleetFlow Team</p>
    </div>
    <div class="footer">
      &copy; FleetFlow Fleet &amp; Trip Management System. All rights reserved.
    </div>
  </div>
</body>
</html>"""

        result = send_email(driver_email, subject, text_content, html_content)
        logger.info(
            "send_driver_assignment_email: email sent to driver %s (trip #%s, booking %s).",
            driver_email, trip.id, booking_ref,
        )
        return result

    except Exception as exc:
        logger.error(
            "send_driver_assignment_email: failed to send email for trip #%s: %s",
            getattr(trip, "id", "?"), exc,
        )
        return False


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


def send_driver_assignment_email(trip):
    """
    Sends a trip assignment notification email to the driver.
    Contains: driver name, booking ID, customer name, pickup, drop,
    journey datetime, and vehicle registration number.
    Call this AFTER a successful assignment is saved.
    Email failures are caught here and logged; they never raise to the caller.
    """
    try:
        driver = trip.driver
        if not driver or not driver.user or not driver.user.email:
            logger.warning(
                "send_driver_assignment_email: trip #%s has no driver email, skipping.", trip.id
            )
            return False

        driver_name = driver.user.full_name or driver.user.username or "Driver"
        driver_email = driver.user.email

        booking_id = trip.booking.id if trip.booking else None
        booking_ref = f"#{booking_id}" if booking_id else "N/A (Bus Schedule)"

        customer_name = "N/A"
        if trip.booking and trip.booking.customer:
            customer_name = trip.booking.customer.full_name or "Customer"

        vehicle_reg = trip.vehicle.registration_number if trip.vehicle else "N/A"
        vehicle_model = f"{trip.vehicle.brand} {trip.vehicle.model}" if trip.vehicle else "N/A"
        trip_status = trip.get_status_display() if hasattr(trip, "get_status_display") else (trip.status or "SCHEDULED")

        scheduled_str = (
            trip.scheduled_datetime.strftime("%d %b %Y at %I:%M %p")
            if trip.scheduled_datetime
            else "TBD"
        )

        subject = f"FleetFlow - New Trip Assignment: Booking {booking_ref}"

        text_content = (
            f"FleetFlow\n\n"
            f"Hello {driver_name},\n\n"
            f"You have been assigned a new trip. Here are the details:\n\n"
            f"  Driver Name       : {driver_name}\n"
            f"  Booking Reference : {booking_ref}\n"
            f"  Customer Name     : {customer_name}\n"
            f"  Pickup Location   : {trip.source}\n"
            f"  Drop Location     : {trip.destination}\n"
            f"  Journey Date/Time : {scheduled_str}\n"
            f"  Assigned Vehicle  : {vehicle_reg}\n"
            f"  Vehicle Model     : {vehicle_model}\n"
            f"  Assignment Status : {trip_status}\n\n"
            f"Please be at the pickup location on time.\n\n"
            f"Best regards,\n"
            f"The FleetFlow Team"
        )

        html_content = f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #1e293b; }}
    .card {{ max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05); }}
    .header {{ background: linear-gradient(135deg, #1e3a8a, #2563eb); padding: 24px; text-align: center; color: #ffffff; }}
    .header h1 {{ margin: 0; font-size: 24px; font-weight: 700; letter-spacing: -0.5px; }}
    .header p {{ margin: 6px 0 0 0; font-size: 14px; opacity: 0.85; }}
    .content {{ padding: 32px 24px; }}
    .greeting {{ font-size: 16px; margin-bottom: 20px; }}
    .detail-table {{ width: 100%; border-collapse: collapse; margin: 20px 0; }}
    .detail-table td {{ padding: 10px 12px; font-size: 14px; border-bottom: 1px solid #f1f5f9; vertical-align: top; }}
    .detail-table td:first-child {{ font-weight: 700; color: #64748b; text-transform: uppercase; font-size: 11.5px; letter-spacing: 0.04em; width: 40%; }}
    .detail-table td:last-child {{ color: #0f172a; font-weight: 600; }}
    .pickup-row td:last-child {{ color: #15803d; }}
    .drop-row td:last-child {{ color: #dc2626; }}
    .status-badge {{ display: inline-block; padding: 3px 8px; border-radius: 4px; font-size: 12px; font-weight: 700; background: #eff6ff; color: #1d4ed8; }}
    .notice {{ background: #eff6ff; border-left: 4px solid #2563eb; padding: 12px 16px; border-radius: 4px; font-size: 13px; color: #1e40af; margin: 20px 0; }}
    .footer {{ border-top: 1px solid #e2e8f0; padding: 16px 24px; font-size: 12px; color: #94a3b8; text-align: center; }}
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <h1>FleetFlow</h1>
      <p>New Trip Assignment</p>
    </div>
    <div class="content">
      <p class="greeting">Hello <strong>{driver_name}</strong>,</p>
      <p>You have been assigned a new trip. Please review the details below and be ready on time.</p>
      <table class="detail-table">
        <tr><td>Driver Name</td><td>{driver_name}</td></tr>
        <tr><td>Booking Reference</td><td>{booking_ref}</td></tr>
        <tr><td>Customer</td><td>{customer_name}</td></tr>
        <tr class="pickup-row"><td>Pickup Location</td><td>&#9679; {trip.source}</td></tr>
        <tr class="drop-row"><td>Drop Location</td><td>&#9679; {trip.destination}</td></tr>
        <tr><td>Journey Date &amp; Time</td><td><strong>{scheduled_str}</strong></td></tr>
        <tr><td>Vehicle Registration</td><td><strong>{vehicle_reg}</strong></td></tr>
        <tr><td>Vehicle Model</td><td>{vehicle_model}</td></tr>
        <tr><td>Assignment Status</td><td><span class="status-badge">{trip_status}</span></td></tr>
      </table>
      <div class="notice">
        <strong>Reminder:</strong> Please be at the pickup location at least 10 minutes before the scheduled time.
      </div>
      <p style="margin-bottom: 0;">Best regards,<br>The FleetFlow Team</p>
    </div>
    <div class="footer">
      &copy; FleetFlow Fleet &amp; Trip Management System. All rights reserved.
    </div>
  </div>
</body>
</html>"""

        result = send_email(driver_email, subject, text_content, html_content)
        logger.info(
            "send_driver_assignment_email: email sent to driver %s (trip #%s, booking %s).",
            driver_email, trip.id, booking_ref,
        )
        return result

    except Exception as exc:
        logger.error(
            "send_driver_assignment_email: failed to send email for trip #%s: %s",
            getattr(trip, "id", "?"), exc,
        )
        return False
