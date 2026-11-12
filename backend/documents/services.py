import logging
from django.utils import timezone

from accounts.emails import send_email
from accounts.models import User
from drivers.models import Driver
from notifications.models import Notification, notify

from .models import AlertLog, Document

logger = logging.getLogger(__name__)


def check_and_notify_expired_documents():
    """
    Checks document expiry dates automatically.
    When a document has expired (expiry_date < today):
      - Identifies exact document type.
      - Automatically sends an email notification to the appropriate recipient:
          * Driver document -> driver.user.email
          * Vehicle document -> fleet managers' emails (or admin fallback)
      - Email clearly mentions:
          * Document name/type
          * Associated driver or vehicle details
          * Expiry date
          * Expired status
          * Instructions to upload/update document
      - Idempotent: Uses AlertLog (threshold_days=0, alert_type="EXPIRED") to avoid duplicate spamming.
    Also checks Driver license_expiry < today and sends driver license expired notification.
    """
    today = timezone.localdate()
    sent_count = 0

    # 1. Expired compliance documents
    expired_docs = Document.objects.filter(
        expiry_date__lt=today
    ).select_related("vehicle", "driver", "driver__user")

    for doc in expired_docs:
        # Check if already alerted for expiry
        already_alerted = AlertLog.objects.filter(
            document=doc,
            threshold_days=0,
            alert_type="EXPIRED",
        ).exists()
        if already_alerted:
            continue

        doc_type_name = doc.get_doc_type_display()
        expiry_str = doc.expiry_date.strftime("%d-%m-%Y") if doc.expiry_date else "N/A"

        if doc.driver and doc.driver.user:
            recipient_email = doc.driver.user.email
            recipient_name = doc.driver.user.full_name or "Driver"
            target_info = f"Driver: {recipient_name} (License: {doc.driver.license_number or 'N/A'})"
            user_target = doc.driver.user
        elif doc.vehicle:
            # Send to Fleet Managers
            managers = User.objects.filter(
                role=User.Role.FLEET_MANAGER, is_active=True
            ).exclude(email="")
            if not managers.exists():
                managers = User.objects.filter(
                    role=User.Role.ADMIN, is_active=True
                ).exclude(email="")
            recipient_email = [m.email for m in managers if m.email]
            recipient_name = "Fleet Manager"
            target_info = f"Vehicle: {doc.vehicle.registration_number} ({doc.vehicle.model or doc.vehicle.vehicle_type})"
            user_target = managers.first()
        else:
            continue

        if not recipient_email:
            continue

        subject = f"URGENT: {doc_type_name} Has Expired - Action Required"
        text_message = (
            f"Dear {recipient_name},\n\n"
            f"This is an automated compliance alert from FleetFlow.\n\n"
            f"The following document has EXPIRED:\n"
            f"- Document Type: {doc_type_name}\n"
            f"- Details: {target_info}\n"
            f"- Expiry Date: {expiry_str}\n"
            f"- Current Status: EXPIRED\n\n"
            f"Instructions:\n"
            f"Please log in to your FleetFlow portal immediately, go to the Documents section, "
            f"and upload an updated or renewed copy of this document to keep operations compliant and active.\n\n"
            f"Thank you,\nFleetFlow Compliance Team"
        )

        html_message = f"""<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; background-color: #f8fafc; padding: 20px; color: #1e293b;">
  <div style="max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 10px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
    <div style="background: linear-gradient(135deg, #dc2626, #b91c1c); padding: 20px; text-align: center; color: #ffffff;">
      <h2 style="margin: 0; font-size: 20px;">FleetFlow Compliance Alert</h2>
      <p style="margin: 5px 0 0 0; font-size: 14px; opacity: 0.9;">Document Expired</p>
    </div>
    <div style="padding: 24px;">
      <p>Hello <strong>{recipient_name}</strong>,</p>
      <p>This is an automated notification that the following compliance document has <strong style="color: #dc2626;">EXPIRED</strong>:</p>
      
      <div style="background: #fef2f2; border-left: 4px solid #dc2626; padding: 14px 16px; border-radius: 6px; margin: 18px 0;">
        <p style="margin: 0 0 6px 0;"><strong>Document Type:</strong> {doc_type_name}</p>
        <p style="margin: 0 0 6px 0;"><strong>Associated Record:</strong> {target_info}</p>
        <p style="margin: 0 0 6px 0;"><strong>Expiry Date:</strong> <span style="color: #dc2626; font-weight: 700;">{expiry_str}</span></p>
        <p style="margin: 0;"><strong>Status:</strong> <span style="display: inline-block; background: #dc2626; color: #fff; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 700;">EXPIRED</span></p>
      </div>

      <h4 style="margin: 16px 0 8px 0; color: #0f172a;">Instructions to Update / Replace:</h4>
      <ol style="margin: 0 0 16px 0; padding-left: 20px; font-size: 13.5px; line-height: 1.6;">
        <li>Log in to your <strong>FleetFlow Portal</strong>.</li>
        <li>Navigate to the <strong>Documents</strong> section.</li>
        <li>Locate this document and click <strong>Replace / Update Document</strong>.</li>
        <li>Upload the renewed document file and update the expiry date.</li>
      </ol>

      <p style="font-size: 13px; color: #64748b; margin-top: 20px;">
        Maintaining valid compliance documents ensures vehicle safety and regulatory compliance.
      </p>
    </div>
    <div style="background: #f1f5f9; padding: 14px; text-align: center; font-size: 12px; color: #64748b;">
      FleetFlow Compliance System &bull; Automated Notification
    </div>
  </div>
</body>
</html>"""

        try:
            send_email(
                to=recipient_email,
                subject=subject,
                message=text_message,
                html_message=html_message,
            )
            AlertLog.objects.create(
                document=doc,
                threshold_days=0,
                alert_type="EXPIRED",
            )
            sent_count += 1
            if user_target:
                notify(
                    user=user_target,
                    title=f"Expired Document: {doc_type_name}",
                    message=f"The {doc_type_name} for {target_info} expired on {expiry_str}. Please upload an updated copy.",
                    type=Notification.NotificationType.SYSTEM,
                    item_type="document",
                    item_id=doc.id,
                )
        except Exception as e:
            logger.error("Failed to send expired document email for doc %s: %s", doc.id, e)

    # 2. Expired driver licenses
    expired_drivers = Driver.objects.filter(
        license_expiry__lt=today
    ).select_related("user")

    for driver in expired_drivers:
        already_alerted = AlertLog.objects.filter(
            driver=driver,
            threshold_days=0,
            alert_type="LICENSE_EXPIRED",
        ).exists()
        if already_alerted or not driver.user or not driver.user.email:
            continue

        exp_str = driver.license_expiry.strftime("%d-%m-%Y") if driver.license_expiry else "N/A"
        driver_name = driver.user.full_name or "Driver"
        sub = "URGENT: Driving License Has Expired - Action Required"
        msg = (
            f"Dear {driver_name},\n\n"
            f"Your driving license ({driver.license_number or 'N/A'}) has EXPIRED on {exp_str}.\n"
            f"Please log in to your FleetFlow Driver Portal and upload your renewed driving license immediately.\n\n"
            f"FleetFlow Compliance Team"
        )
        try:
            send_email(to=driver.user.email, subject=sub, message=msg)
            AlertLog.objects.create(
                driver=driver,
                threshold_days=0,
                alert_type="LICENSE_EXPIRED",
            )
            sent_count += 1
            notify(
                user=driver.user,
                title="Driving License Expired",
                message=f"Your driving license expired on {exp_str}. Please renew and upload your new license.",
                type=Notification.NotificationType.SYSTEM,
                item_type="driver",
                item_id=driver.id,
            )
        except Exception as e:
            logger.error("Failed to send expired license email for driver %s: %s", driver.id, e)

    return sent_count

