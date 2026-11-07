import io
from datetime import datetime
import zoneinfo
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas
from .models import Receipt


def format_ist_datetime(iso_str_or_dt):
    """Format an ISO datetime string or datetime object to '03 Nov 2026, 08:54 AM' IST."""
    if not iso_str_or_dt:
        return "N/A"
    try:
        if isinstance(iso_str_or_dt, str):
            # Parse ISO string
            dt = datetime.fromisoformat(iso_str_or_dt)
        else:
            dt = iso_str_or_dt
        ist_tz = zoneinfo.ZoneInfo("Asia/Kolkata")
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=zoneinfo.ZoneInfo("UTC"))
        ist_dt = dt.astimezone(ist_tz)
        return ist_dt.strftime("%d %b %Y, %I:%M %p")
    except Exception:
        return str(iso_str_or_dt)


def generate_receipt_pdf(receipt: Receipt) -> bytes:
    """Generate professional PDF receipt using ReportLab."""
    buffer = io.BytesIO()
    p = canvas.Canvas(buffer, pagesize=letter)
    width, height = letter

    payment = receipt.payment
    data = receipt.data
    is_refunded = (payment.status == "REFUNDED") or (data.get("status") == "REFUNDED")

    # Header Banner
    p.setFillColorRGB(0.12, 0.23, 0.36)  # Deep Navy
    p.rect(0, height - 80, width, 80, fill=1, stroke=0)

    p.setFillColorRGB(1, 1, 1)  # White text
    p.setFont("Helvetica-Bold", 22)
    p.drawString(50, height - 48, "FleetFlow Trip Receipt")

    p.setFont("Helvetica", 10)
    p.drawString(width - 200, height - 45, f"Receipt: {receipt.receipt_number}")

    # Body Content
    p.setFillColorRGB(0.1, 0.1, 0.1)
    y = height - 120

    p.setFont("Helvetica-Bold", 14)
    p.drawString(50, y, "Payment & Trip Details")
    y -= 25

    p.setStrokeColorRGB(0.8, 0.8, 0.8)
    p.line(50, y + 15, width - 50, y + 15)

    paid_at_raw = data.get("paid_at") or (payment.paid_at.isoformat() if payment.paid_at else None)
    paid_at_formatted = format_ist_datetime(paid_at_raw)

    fields = [
        ("Customer Name", data.get("customer_name", "N/A")),
        ("Customer Email", data.get("customer_email", "N/A")),
        ("Route", data.get("route", "N/A")),
        ("Assigned Vehicle", data.get("vehicle", "N/A")),
        ("Assigned Driver", data.get("driver", "N/A")),
        ("Distance Traveled", f"{data.get('distance_km', '0')} km" if data.get("distance_km") else "N/A"),
        ("Payment Method", str(data.get("payment_method", "N/A"))),
        ("Gateway Reference", str(data.get("gateway_reference", "N/A"))),
        ("Paid At", paid_at_formatted),
    ]

    for label, val in fields:
        p.setFont("Helvetica-Bold", 10)
        p.drawString(50, y, f"{label}:")
        p.setFont("Helvetica", 10)
        p.drawString(200, y, str(val))
        y -= 20

    if is_refunded:
        refund_at_raw = payment.refunded_at.isoformat() if payment.refunded_at else None
        refund_at_formatted = format_ist_datetime(refund_at_raw)
        y -= 5
        p.setFont("Helvetica-Bold", 11)
        p.setFillColorRGB(0.85, 0.15, 0.15)  # Crimson Red
        p.drawString(50, y, f"REFUNDED: Rs. {payment.amount} refunded on {refund_at_formatted}")
        p.setFillColorRGB(0.1, 0.1, 0.1)
        y -= 15

    y -= 10
    p.setStrokeColorRGB(0.8, 0.8, 0.8)
    p.line(50, y + 10, width - 50, y + 10)
    y -= 20

    # Total Box
    p.setFillColorRGB(0.95, 0.96, 0.98)
    p.rect(50, y - 25, width - 100, 35, fill=1, stroke=0)

    p.setFillColorRGB(0.1, 0.1, 0.1)
    p.setFont("Helvetica-Bold", 12)
    p.drawString(65, y - 10, "Total Amount Paid:")
    p.setFont("Helvetica-Bold", 14)
    p.setFillColorRGB(0.1, 0.6, 0.2)  # Emerald green
    p.drawRightString(width - 65, y - 10, f"Rs. {data.get('amount', '0.00')}")

    # Diagonal Watermark if REFUNDED
    if is_refunded:
        p.saveState()
        p.setFont("Helvetica-Bold", 60)
        p.setFillColorRGB(0.9, 0.2, 0.2, alpha=0.25)
        p.translate(width / 2, height / 2)
        p.rotate(45)
        p.drawCentredString(0, 0, "REFUNDED")
        p.restoreState()

    # Footer
    p.setFillColorRGB(0.5, 0.5, 0.5)
    p.setFont("Helvetica-Oblique", 9)
    p.drawString(50, 40, "Thank you for traveling with FleetFlow. This is a computer-generated receipt.")
    p.drawRightString(width - 50, 40, "support@fleetflow.com")

    p.showPage()
    p.save()
    buffer.seek(0)
    return buffer.getvalue()

