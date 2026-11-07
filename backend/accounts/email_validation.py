import re
import socket
import dns.exception
import dns.resolver
from django.core.exceptions import ValidationError

# List of known temporary/disposable email domains (easy to extend)
DISPOSABLE_DOMAINS = [
    "10minutemail.com",
    "crazymailing.com",
    "dispostable.com",
    "fakeinbox.com",
    "getnada.com",
    "guerrillamail.com",
    "maildrop.cc",
    "mailinator.com",
    "sharklasers.com",
    "temp-mail.org",
    "tempinbox.com",
    "tempmail.com",
    "throwawaymail.com",
    "trashmail.com",
    "yopmail.com",
]

# RFC-compliant standard email regex pattern
EMAIL_REGEX = re.compile(
    r"^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$"
)


def check_domain_dns(domain: str) -> bool:
    """
    Checks if a domain can accept emails using DNS lookup.
    Checks MX record first, falls back to A record.
    Returns True if domain is valid or if lookup times out/fails due to network issues.
    Raises ValidationError if domain is NXDOMAIN or has no mail/host records.
    """
    resolver = dns.resolver.Resolver()
    resolver.lifetime = 3.0
    resolver.timeout = 3.0

    # 1. Try MX record first
    try:
        mx_records = resolver.resolve(domain, "MX", lifetime=3.0)
        if mx_records:
            return True
    except (dns.resolver.NoAnswer, dns.resolver.NoNameservers):
        # Fallback to A record
        try:
            a_records = resolver.resolve(domain, "A", lifetime=3.0)
            if a_records:
                return True
        except (dns.resolver.NoAnswer, dns.resolver.NoNameservers):
            # No mail records at all
            raise ValidationError(
                "This email domain does not exist or cannot receive emails. Please enter a correct, real email."
            )
        except dns.resolver.NXDOMAIN:
            raise ValidationError(
                "This email domain does not exist or cannot receive emails. Please enter a correct, real email."
            )
        except (dns.resolver.Timeout, dns.resolver.LifetimeTimeout, dns.exception.DNSException, OSError, socket.error):
            # On timeout or network error, allow the email and rely on OTP verification
            return True
    except dns.resolver.NXDOMAIN:
        raise ValidationError(
            "This email domain does not exist or cannot receive emails. Please enter a correct, real email."
        )
    except (dns.resolver.Timeout, dns.resolver.LifetimeTimeout, dns.exception.DNSException, OSError, socket.error):
        # On timeout or network error, allow the email and rely on OTP verification
        return True

    raise ValidationError(
        "This email domain does not exist or cannot receive emails. Please enter a correct, real email."
    )


def validate_real_email(email_str: str) -> str:
    """
    Validates whether an email is properly formatted, does not use disposable/temporary domains,
    and belongs to a resolvable domain host with MX or A records.
    """
    if not email_str or "@" not in email_str:
        raise ValidationError("Please enter a valid email address.")

    email_clean = email_str.strip().lower()

    if not EMAIL_REGEX.match(email_clean):
        raise ValidationError("This email address format is not valid.")

    parts = email_clean.split("@")
    if len(parts) != 2:
        raise ValidationError("This email address format is not valid.")

    local_part, domain = parts

    # 1. Check domain structure
    if "." not in domain or domain.startswith(".") or domain.endswith("."):
        raise ValidationError("This email domain is not valid.")

    tld = domain.split(".")[-1]
    if len(tld) < 2:
        raise ValidationError("This email domain extension is not valid.")

    # 2. Block known disposable/fake temporary email domains
    if domain in DISPOSABLE_DOMAINS:
        raise ValidationError("Temporary or disposable email addresses are not allowed. Please enter a real email.")

    # 3. Check domain host DNS resolution (MX -> A -> Timeout allowance)
    check_domain_dns(domain)

    return email_clean
