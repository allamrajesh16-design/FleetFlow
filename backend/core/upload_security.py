"""
Security utilities for file uploads in FleetFlow:
- Restricts extensions to PNG, JPG, JPEG, WEBP
- Enforces maximum file size of 2 MB
- Renames files with random UUIDs to avoid path traversal and file collisions
"""

import os
import uuid
from django.core.exceptions import ValidationError

ALLOWED_IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp"}
MAX_UPLOAD_SIZE = 2 * 1024 * 1024  # 2 MB in bytes


def validate_image_file(file_obj):
    """
    Validates uploaded file extension and size.
    Raises ValidationError if invalid.
    """
    if not file_obj:
        return

    # Check extension
    ext = os.path.splitext(file_obj.name)[1].lower()
    if ext not in ALLOWED_IMAGE_EXTENSIONS:
        raise ValidationError(
            f"Invalid file extension '{ext}'. Allowed formats are PNG, JPG, JPEG, WEBP."
        )

    # Check size
    if file_obj.size > MAX_UPLOAD_SIZE:
        size_mb = file_obj.size / (1024 * 1024)
        raise ValidationError(
            f"file size cannot exceed 2 MB (actual: {size_mb:.2f} MB)."
        )


def random_payment_proof_path(instance, filename):
    """Generates a secure random filename in payment_proofs/."""
    ext = os.path.splitext(filename)[1].lower()
    if ext not in ALLOWED_IMAGE_EXTENSIONS:
        ext = ".jpg"
    return f"payment_proofs/{uuid.uuid4().hex}{ext}"


def random_qr_image_path(instance, filename):
    """Generates a secure random filename in payment_qr/."""
    ext = os.path.splitext(filename)[1].lower()
    if ext not in ALLOWED_IMAGE_EXTENSIONS:
        ext = ".png"
    return f"payment_qr/{uuid.uuid4().hex}{ext}"


# =========================================================================
# Private Document & Receipt Security
# =========================================================================
from django.conf import settings
from django.core.files.storage import FileSystemStorage

class PrivateFileSystemStorage(FileSystemStorage):
    """Storage that places files in PRIVATE_MEDIA_ROOT and does not provide public URLs."""
    def __init__(self, *args, **kwargs):
        kwargs.setdefault("location", str(settings.PRIVATE_MEDIA_ROOT))
        kwargs.setdefault("base_url", None)
        super().__init__(*args, **kwargs)

    def url(self, name):
        # Explicitly do not provide a direct public URL
        return None


private_file_storage = PrivateFileSystemStorage()

ALLOWED_DOCUMENT_EXTENSIONS = {".pdf", ".jpg", ".jpeg", ".png", ".webp"}
MAX_DOCUMENT_SIZE = 5 * 1024 * 1024  # 5 MB in bytes


def validate_private_document_file(file_obj):
    """
    Validates uploaded file for documents, fuel receipts, and expense receipts:
    - Allowed extensions: .pdf, .jpg, .jpeg, .png, .webp
    - Max size: 5 MB
    - Real file type magic bytes check to prevent spoofing
    """
    if not file_obj:
        return

    # Check size
    if file_obj.size > MAX_DOCUMENT_SIZE:
        size_mb = file_obj.size / (1024 * 1024)
        raise ValidationError(
            f"File size cannot exceed 5 MB (actual: {size_mb:.2f} MB)."
        )

    # Check extension
    ext = os.path.splitext(file_obj.name)[1].lower()
    if ext not in ALLOWED_DOCUMENT_EXTENSIONS:
        raise ValidationError(
            f"Invalid file extension '{ext}'. Allowed formats are PDF, JPG, JPEG, PNG, WEBP."
        )

    # Inspect magic bytes for real file content
    initial_pos = file_obj.tell() if hasattr(file_obj, "tell") else 0
    try:
        header = file_obj.read(16)
        if hasattr(file_obj, "seek"):
            file_obj.seek(initial_pos)
    except Exception:
        raise ValidationError("Unable to read file content for validation.")

    is_valid = False
    if ext == ".pdf":
        is_valid = header.startswith(b"%PDF-")
    elif ext in (".jpg", ".jpeg"):
        is_valid = header.startswith(b"\xff\xd8\xff")
    elif ext == ".png":
        is_valid = header.startswith(b"\x89PNG\r\n\x1a\n")
    elif ext == ".webp":
        is_valid = len(header) >= 12 and header.startswith(b"RIFF") and header[8:12] == b"WEBP"

    if not is_valid:
        raise ValidationError(
            f"File content does not match the file extension '{ext}' or is corrupted."
        )


def random_document_path(instance, filename):
    """Generates a secure random filename in documents/."""
    ext = os.path.splitext(filename)[1].lower()
    if ext not in ALLOWED_DOCUMENT_EXTENSIONS:
        ext = ".pdf"
    return f"documents/{uuid.uuid4().hex}{ext}"


def random_fuel_receipt_path(instance, filename):
    """Generates a secure random filename in fuel_receipts/."""
    ext = os.path.splitext(filename)[1].lower()
    if ext not in ALLOWED_DOCUMENT_EXTENSIONS:
        ext = ".jpg"
    return f"fuel_receipts/{uuid.uuid4().hex}{ext}"


def random_expense_receipt_path(instance, filename):
    """Generates a secure random filename in expense_receipts/."""
    ext = os.path.splitext(filename)[1].lower()
    if ext not in ALLOWED_DOCUMENT_EXTENSIONS:
        ext = ".jpg"
    return f"expense_receipts/{uuid.uuid4().hex}{ext}"

