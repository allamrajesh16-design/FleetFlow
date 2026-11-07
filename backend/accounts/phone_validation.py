import re
from rest_framework import serializers

# Regex for cleaning non-digit characters except leading plus
NON_DIGIT_RE = re.compile(r"[^\d+]")


def clean_indian_phone(value):
    """
    Cleans an input phone string to Indian 10 digits.
    Accepts:
      - 10 digits starting with 6, 7, 8, or 9
      - Optional prefixes: +91, 91, or 0
      - Spaces, dashes, parentheses
    Returns:
      10-digit string, or raises serializers.ValidationError
    """
    if not value:
        return None

    raw = str(value).strip()
    if not raw:
        return None

    # Disallow letters or unauthorized symbols
    if re.search(r"[a-zA-Z]", raw):
        raise serializers.ValidationError(
            "Enter a valid 10-digit mobile number starting with 6, 7, 8 or 9."
        )

    # Strip spaces, dashes, dots, brackets
    cleaned = re.sub(r"[\s\-\(\)\.]", "", raw)

    if cleaned.startswith("+91"):
        digits = cleaned[3:]
    elif cleaned.startswith("91") and len(cleaned) == 12:
        digits = cleaned[2:]
    elif cleaned.startswith("0") and len(cleaned) == 11:
        digits = cleaned[1:]
    elif cleaned.startswith("+"):
        raise serializers.ValidationError(
            "Enter a valid 10-digit mobile number starting with 6, 7, 8 or 9."
        )
    else:
        digits = cleaned

    if not digits.isdigit() or len(digits) != 10:
        raise serializers.ValidationError(
            "Enter a valid 10-digit mobile number starting with 6, 7, 8 or 9."
        )

    if digits[0] not in ("6", "7", "8", "9"):
        raise serializers.ValidationError(
            "Enter a valid 10-digit mobile number starting with 6, 7, 8 or 9."
        )

    # Reject repeated digits like 9999999999 or 0000000000
    if len(set(digits)) == 1:
        raise serializers.ValidationError(
            "Enter a valid 10-digit mobile number starting with 6, 7, 8 or 9."
        )

    return digits


def validate_and_normalize_phone(value, existing_user_pk=None, current_stored_value=None):
    """
    Shared validator used across registration, profile update, admin user create/update,
    and driver create/update serializers.
    - If value is empty: returns None (or blank).
    - If value matches existing stored number for the same user: allows it without locking out.
    - Validates 10-digit mobile starting with 6, 7, 8 or 9.
    - Rejects duplicate registered numbers.
    - Normalizes and stores as +91XXXXXXXXXX.
    """
    if value is None:
        return None
    val_str = str(value).strip()
    if not val_str:
        return None

    # If current stored value is unchanged, do not lock out old invalid records
    if current_stored_value and val_str == current_stored_value:
        return current_stored_value

    digits = clean_indian_phone(val_str)
    normalized = f"+91{digits}"

    # Check duplicates
    from .models import User

    qs = User.objects.filter(phone=normalized)
    if existing_user_pk:
        qs = qs.exclude(pk=existing_user_pk)

    if qs.exists():
        raise serializers.ValidationError("This mobile number is already registered")

    return normalized


def get_phone_lookup_candidates(identifier):
    """
    Given an identifier typed in login (email or phone in any accepted format),
    returns a list of candidate phone strings to query in User.phone.
    """
    candidates = [identifier.strip()]
    try:
        digits = clean_indian_phone(identifier)
        if digits:
            candidates.append(f"+91{digits}")
            candidates.append(digits)
            candidates.append(f"0{digits}")
            candidates.append(f"91{digits}")
    except serializers.ValidationError:
        pass
    return list(set(candidates))
