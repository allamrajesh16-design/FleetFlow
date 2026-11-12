import os
import re
import math
from collections import Counter
import socket
import dns.exception
import dns.resolver
from django.core.exceptions import ValidationError

# Data file paths
DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
DUMMY_WORDS_FILE = os.path.join(DATA_DIR, "dummy_local_parts.txt")
DISPOSABLE_DOMAINS_FILE = os.path.join(DATA_DIR, "disposable_domains.txt")


class EmailValidationError(ValidationError):
    """
    Custom ValidationError carrying structured error code and optional suggestion.
    Codes: FORMAT, GMAIL_TOO_SHORT, GMAIL_CHARS, DUMMY_PATTERN, DISPOSABLE, NO_MAIL_SERVER, DOMAIN_TYPO, RESERVED_DOMAIN
    """
    def __init__(self, message, code="FORMAT", suggestion=None):
        super().__init__(message, code=code)
        self.code = code
        self.suggestion = suggestion


def load_dummy_words() -> set:
    if not os.path.exists(DUMMY_WORDS_FILE):
        return {
            "test", "tester", "testing", "demo", "dummy", "fake", "sample", "example",
            "abc", "abcd", "abcde", "xyz", "asdf", "qwerty", "noname", "nobody", "none",
            "null", "user", "username", "email", "mail", "temp", "temporary", "random",
            "hello", "hi", "name", "yourname", "myname", "check"
        }
    with open(DUMMY_WORDS_FILE, "r", encoding="utf-8") as f:
        return {line.strip().lower() for line in f if line.strip() and not line.startswith("#")}


def load_disposable_domains() -> set:
    if not os.path.exists(DISPOSABLE_DOMAINS_FILE):
        return {
            "10minutemail.com", "mailinator.com", "guerrillamail.com", "sharklasers.com",
            "yopmail.com", "temp-mail.org", "tempmail.com", "throwawaymail.com", "trashmail.com",
            "dispostable.com", "getnada.com", "maildrop.cc", "fakeinbox.com"
        }
    with open(DISPOSABLE_DOMAINS_FILE, "r", encoding="utf-8") as f:
        return {line.strip().lower() for line in f if line.strip() and not line.startswith("#")}


DUMMY_WORDS = load_dummy_words()
DISPOSABLE_DOMAINS = load_disposable_domains()

RESERVED_DOMAINS = {"example.com", "example.org", "test.com", "localhost"}
RESERVED_TLDS = {".test", ".local", ".invalid", ".example"}

POPULAR_DOMAINS = [
    "gmail.com",
    "yahoo.com",
    "outlook.com",
    "hotmail.com",
    "live.com",
    "icloud.com",
    "yahoo.in",
    "rediffmail.com",
]

# Standard email regex
EMAIL_REGEX = re.compile(
    r"^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$"
)


def levenshtein_distance(s1: str, s2: str) -> int:
    """Calculates Levenshtein edit distance between two strings."""
    if len(s1) < len(s2):
        return levenshtein_distance(s2, s1)
    if len(s2) == 0:
        return len(s1)
    previous_row = list(range(len(s2) + 1))
    for i, c1 in enumerate(s1):
        current_row = [i + 1]
        for j, c2 in enumerate(s2):
            insertions = previous_row[j + 1] + 1
            deletions = current_row[j] + 1
            substitutions = previous_row[j] + (c1 != c2)
            current_row.append(min(insertions, deletions, substitutions))
        previous_row = current_row
    return previous_row[-1]


def shannon_entropy(s: str) -> float:
    """Calculates Shannon entropy for string s."""
    if not s:
        return 0.0
    counts = Counter(s)
    length = len(s)
    return -sum((count / length) * math.log2(count / length) for count in counts.values())


def has_character_run(s: str) -> bool:
    """Checks for sequential character or keyboard runs of length 5 or more."""
    clean = re.sub(r'[^a-z0-9]', '', s.lower())
    if len(clean) < 5:
        return False
    runs = [
        "abcdefghijklmnopqrstuvwxyz",
        "zyxwvutsrqponmlkjihgfedcba",
        "01234567890",
        "09876543210",
        "qwertyuiop",
        "poiuytrewq",
        "asdfghjkl",
        "lkjhgfdsa",
        "zxcvbnm",
        "mnbvcxz",
    ]
    for i in range(len(clean) - 4):
        sub = clean[i:i + 5]
        if any(sub in r for r in runs):
            return True
    return False


def is_dummy_local_word(local_base: str) -> bool:
    """Checks if local part equals a known dummy word when trailing digits/dots are ignored."""
    # 1. Whole local part ignoring digits and dots/hyphens/underscores at the end
    stripped = re.sub(r'[\d._-]+$', '', local_base).lower()
    if stripped in DUMMY_WORDS:
        return True
    # 2. Components separated by . or _ or - all matching dummy words
    parts = [re.sub(r'[\d._-]+$', '', p).lower() for p in re.split(r'[._\-]', local_base) if p]
    if parts and all(p in DUMMY_WORDS for p in parts):
        return True
    return False


def check_domain_dns(domain: str) -> bool:
    """
    Checks if a domain can accept emails using DNS lookup.
    Checks MX record first, falls back to A record.
    Returns True if domain is valid or if lookup times out/fails due to network issues.
    Raises EmailValidationError if domain is NXDOMAIN or has no mail/host records.
    """
    resolver = dns.resolver.Resolver()
    resolver.lifetime = 3.0
    resolver.timeout = 3.0

    try:
        mx_records = resolver.resolve(domain, "MX", lifetime=3.0)
        if mx_records:
            return True
    except dns.resolver.NoAnswer:
        try:
            a_records = resolver.resolve(domain, "A", lifetime=3.0)
            if a_records:
                return True
        except dns.resolver.NoAnswer:
            raise EmailValidationError(
                "This email domain does not exist or cannot receive emails. Please enter a correct, real email.",
                code="NO_MAIL_SERVER",
            )
        except dns.resolver.NXDOMAIN:
            raise EmailValidationError(
                "This email domain does not exist or cannot receive emails. Please enter a correct, real email.",
                code="NO_MAIL_SERVER",
            )
        except (dns.resolver.Timeout, dns.resolver.LifetimeTimeout, dns.resolver.NoNameservers, dns.exception.DNSException, OSError, socket.error):
            return True
    except dns.resolver.NXDOMAIN:
        raise EmailValidationError(
            "This email domain does not exist or cannot receive emails. Please enter a correct, real email.",
            code="NO_MAIL_SERVER",
        )
    except (dns.resolver.Timeout, dns.resolver.LifetimeTimeout, dns.resolver.NoNameservers, dns.exception.DNSException, OSError, socket.error):
        return True

    raise EmailValidationError(
        "This email domain does not exist or cannot receive emails. Please enter a correct, real email.",
        code="NO_MAIL_SERVER",
    )


def validate_real_email(email_str: str) -> str:
    """
    Validates email address thoroughly according to FleetFlow registration rules.
    Normalises (trim, lowercase, ASCII only), then enforces provider, dummy, and domain checks.
    Raises EmailValidationError on failure with a clear code and plain message.
    Returns normalized email string on success.
    """
    if not email_str or not isinstance(email_str, str):
        raise EmailValidationError("Please enter an email address.", code="FORMAT")

    # 1. Normalisation: trim whitespace
    email_clean = email_str.strip()
    if not email_clean:
        raise EmailValidationError("Please enter an email address.", code="FORMAT")

    # Check for whitespace inside
    if re.search(r'\s', email_clean):
        raise EmailValidationError("This email address format is not valid.", code="FORMAT")

    # ASCII only (reject look-alike letters / homoglyphs)
    if not email_clean.isascii():
        raise EmailValidationError("Email address must contain only standard ASCII characters.", code="FORMAT")

    # Total length <= 254
    if len(email_clean) > 254:
        raise EmailValidationError("Email address is too long (maximum 254 characters).", code="FORMAT")

    # Exactly one "@"
    parts = email_clean.split("@")
    if len(parts) != 2:
        raise EmailValidationError("This email address format is not valid.", code="FORMAT")

    local_part, domain = parts
    if not local_part or not domain:
        raise EmailValidationError("This email address format is not valid.", code="FORMAT")

    # Local part length <= 64
    if len(local_part) > 64:
        raise EmailValidationError("Email local part is too long (maximum 64 characters).", code="FORMAT")

    # Lower case
    local_part = local_part.lower()
    domain = domain.lower()
    email_clean = f"{local_part}@{domain}"

    # 2. DOMAIN CHECKS
    # a) Reserved and test domains (including localhost)
    if domain in RESERVED_DOMAINS or any(domain.endswith(rtld) for rtld in RESERVED_TLDS):
        raise EmailValidationError(
            "Reserved or test email domains are not allowed. Please enter a real email.",
            code="RESERVED_DOMAIN",
        )

    # Domain syntax checks
    if "." not in domain or domain.startswith(".") or domain.endswith(".") or ".." in domain:
        raise EmailValidationError("This email domain is not valid.", code="FORMAT")

    domain_labels = domain.split(".")
    for label in domain_labels:
        if not label or len(label) > 63:
            raise EmailValidationError("This email domain is not valid.", code="FORMAT")
        if not re.match(r'^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$', label):
            raise EmailValidationError("This email domain is not valid.", code="FORMAT")

    tld = domain_labels[-1]
    if len(tld) < 2 or not tld.isalpha():
        raise EmailValidationError("This email domain is not valid.", code="FORMAT")

    # Plus addresses: name+tag -> local_base is name
    local_base = local_part.split("+")[0]
    if not local_base:
        raise EmailValidationError("This email address format is not valid.", code="FORMAT")

    # b) Disposable domains
    if domain in DISPOSABLE_DOMAINS:
        raise EmailValidationError(
            "Temporary or disposable email addresses are not allowed. Please enter a real email.",
            code="DISPOSABLE",
        )

    # c) Typo domains (within edit distance <= 2 of popular domains)
    if domain not in POPULAR_DOMAINS:
        typo_matches = []
        for pop in POPULAR_DOMAINS:
            dist = levenshtein_distance(domain, pop)
            if 0 < dist <= 2:
                typo_matches.append((pop, dist))
        if typo_matches:
            typo_matches.sort(key=lambda x: x[1])
            suggested_domain = typo_matches[0][0]
            suggested_email = f"{local_part}@{suggested_domain}"
            raise EmailValidationError(
                f"Did you mean {suggested_email}?",
                code="DOMAIN_TYPO",
                suggestion=suggested_email,
            )

    # d) Mail server DNS check (MX -> A -> Timeout allowance)
    check_domain_dns(domain)

    # 3. PROVIDER-SPECIFIC RULES
    # a) Gmail rules (gmail.com, googlemail.com)
    if domain in ("gmail.com", "googlemail.com"):
        if local_base.startswith(".") or local_base.endswith(".") or ".." in local_base:
            raise EmailValidationError(
                "Gmail addresses cannot have consecutive dots or dots at the beginning or end.",
                code="GMAIL_CHARS",
            )
        if not re.match(r'^[a-z0-9.]+$', local_base):
            raise EmailValidationError(
                "Gmail usernames can only contain letters, numbers, and periods.",
                code="GMAIL_CHARS",
            )
        if len(local_base) < 6:
            raise EmailValidationError(
                "Gmail addresses have at least 6 characters.",
                code="GMAIL_TOO_SHORT",
            )
        if len(local_base) > 30:
            raise EmailValidationError(
                "Gmail addresses cannot be longer than 30 characters.",
                code="GMAIL_CHARS",
            )

    # b) Yahoo rules (yahoo.com, yahoo.in, ymail.com)
    elif domain in ("yahoo.com", "yahoo.in", "ymail.com"):
        if len(local_base) < 4 or len(local_base) > 32:
            raise EmailValidationError(
                "Yahoo usernames must be between 4 and 32 characters.",
                code="FORMAT",
            )
        if not local_base[0].isalpha():
            raise EmailValidationError(
                "Yahoo usernames must start with a letter.",
                code="FORMAT",
            )
        if local_base.startswith(".") or local_base.endswith(".") or ".." in local_base:
            raise EmailValidationError(
                "Yahoo usernames cannot have consecutive dots or dots at the beginning or end.",
                code="FORMAT",
            )
        if not re.match(r'^[a-z0-9._]+$', local_base):
            raise EmailValidationError(
                "Yahoo usernames can only contain letters, numbers, periods, and underscores.",
                code="FORMAT",
            )

    # c) Every other domain: local part has at least 3 characters
    else:
        if len(local_base) < 3:
            raise EmailValidationError(
                "Email username must have at least 3 characters.",
                code="FORMAT",
            )
        if local_base.startswith(".") or local_base.endswith(".") or ".." in local_base:
            raise EmailValidationError(
                "This email address format is not valid.",
                code="FORMAT",
            )
        if not re.match(r"^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$", local_part):
            raise EmailValidationError(
                "This email address format is not valid.",
                code="FORMAT",
            )

    # 4. DUMMY PATTERNS
    dummy_message = "This email looks like a dummy address. Please use your real email."

    # a) One character repeated 4 or more times in a row
    if re.search(r'(.)\1{3,}', local_base):
        raise EmailValidationError(dummy_message, code="DUMMY_PATTERN")

    # b) At most 2 different characters when length is 6 or more
    clean_chars = re.sub(r'[^a-z0-9]', '', local_base)
    if len(clean_chars) >= 6 and len(set(clean_chars)) <= 2:
        raise EmailValidationError(dummy_message, code="DUMMY_PATTERN")

    # c) Character runs such as abcdef, 123456, 12345, qwerty, asdfgh, zxcvbn, 111111
    if has_character_run(local_base):
        raise EmailValidationError(dummy_message, code="DUMMY_PATTERN")

    # d) Shannon entropy below 1.6 for local part >= 8
    if len(local_base) >= 8 and shannon_entropy(local_base) < 1.6:
        raise EmailValidationError(dummy_message, code="DUMMY_PATTERN")

    # e) Whole local part (ignoring digits and dots at the end) equal to dummy word list
    if is_dummy_local_word(local_base):
        raise EmailValidationError(dummy_message, code="DUMMY_PATTERN")

    return email_clean
