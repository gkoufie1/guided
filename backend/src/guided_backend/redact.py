"""Remove personal data and secrets from ticket text.

Runs in the receiver, before the ticket is queued, so SQS, DynamoDB, and any
future AI step only ever see the redacted text. IP addresses, hostnames, and
error messages are kept on purpose: they are the evidence matching relies on.
"""

import re
from dataclasses import replace

_PATTERNS = [
    # Order matters: private keys and tokens before the generic key=value rule.
    ("private-key", re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----.*?-----END [A-Z ]*PRIVATE KEY-----", re.S)),
    ("aws-access-key", re.compile(r"\b(?:AKIA|ASIA)[0-9A-Z]{16}\b")),
    ("github-token", re.compile(r"\bgh[pousr]_[A-Za-z0-9]{30,}\b")),
    ("bearer-token", re.compile(r"(?i)\bbearer\s+[A-Za-z0-9._~+/-]+=*")),
    ("email", re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b")),
    ("phone", re.compile(r"(?<![\w-])(?:\+\d{1,3}[\s.-]?)?(?:\(\d{3}\)\s?|\d{3}[\s.-])\d{3}[\s.-]\d{4}(?![\w-])")),
]

# "password: hunter2", "api_key=abc", "secret is xyz" → keep the label, drop the value.
_ASSIGNMENT = re.compile(
    r"(?i)\b(password|passwd|pwd|passphrase|secret|client[_-]?secret|token|api[_-]?key|access[_-]?key)"
    r"(\s*[:=]\s*|\s+is\s+)"
    r"(?!\[REDACTED)(\S+)"
)


def redact_text(text):
    """Return (redacted_text, {kind: count})."""
    counts = {}
    for kind, pattern in _PATTERNS:
        text, n = pattern.subn(f"[REDACTED:{kind}]", text)
        if n:
            counts[kind] = counts.get(kind, 0) + n
    text, n = _ASSIGNMENT.subn(lambda m: f"{m.group(1)}{m.group(2)}[REDACTED:secret]", text)
    if n:
        counts["secret"] = counts.get("secret", 0) + n
    return text, counts


def redact_ticket(ticket):
    """Return (redacted Ticket, {kind: count}) with every free-text field redacted."""
    totals = {}
    fields = {}
    for name in ("subject", "description", "category", "ci"):
        fields[name], counts = redact_text(getattr(ticket, name))
        for kind, n in counts.items():
            totals[kind] = totals.get(kind, 0) + n
    return replace(ticket, **fields), totals
