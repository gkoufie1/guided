"""Normalise webhook payloads from each ticketing system into one Ticket shape.

Only the fields needed for matching and write-back are kept. Caller names,
emails, and phone numbers are never read from the payload (data minimisation),
and the free-text fields are redacted separately before queueing.
"""

import re
from dataclasses import asdict, dataclass

MAX_FIELD = 10_000  # characters kept per free-text field


class InvalidTicket(ValueError):
    """The payload is missing a required field or has an unsafe identifier."""


@dataclass(frozen=True)
class Ticket:
    system: str       # "servicenow" or "manageengine"
    ticket_id: str    # id used in the write-back URL (ServiceNow sys_id, SDP request id)
    number: str       # human-readable number shown in logs and notes
    subject: str
    description: str
    category: str = ""
    ci: str = ""      # affected configuration item / asset

    def text(self):
        """All matchable text in one string."""
        return "\n".join(part for part in (self.subject, self.description, self.category, self.ci) if part)

    def to_dict(self):
        return asdict(self)

    @classmethod
    def from_dict(cls, data):
        return cls(**data)


def _text(payload, key):
    value = payload.get(key)
    if value is None:
        return ""
    if not isinstance(value, (str, int, float)):
        raise InvalidTicket(f"{key} must be text")
    return str(value).strip()[:MAX_FIELD]


def _require(payload, key, pattern, description):
    value = _text(payload, key)
    if not re.fullmatch(pattern, value):
        raise InvalidTicket(f"{key} must be {description}")
    return value


def parse_servicenow(payload):
    """Payload sent by the Business Rule in docs/integrations/servicenow.md."""
    if not isinstance(payload, dict):
        raise InvalidTicket("payload must be a JSON object")
    # sys_id goes into the Table API URL, so it must be exactly 32 hex characters.
    sys_id = _require(payload, "sys_id", r"[0-9a-f]{32}", "a 32-character ServiceNow sys_id")
    number = _require(payload, "number", r"[A-Z]{2,10}\d{4,12}", "a ticket number like INC0010023")
    subject = _text(payload, "short_description")
    if not subject:
        raise InvalidTicket("short_description is required")
    return Ticket(
        system="servicenow",
        ticket_id=sys_id,
        number=number,
        subject=subject,
        description=_text(payload, "description"),
        category=_text(payload, "category"),
        ci=_text(payload, "cmdb_ci"),
    )


def parse_manageengine(payload):
    """Payload sent by the custom trigger in docs/integrations/manageengine.md."""
    if not isinstance(payload, dict):
        raise InvalidTicket("payload must be a JSON object")
    # The request id goes into the REST API URL, so digits only.
    request_id = _require(payload, "id", r"\d{1,20}", "a numeric ServiceDesk Plus request id")
    subject = _text(payload, "subject")
    if not subject:
        raise InvalidTicket("subject is required")
    return Ticket(
        system="manageengine",
        ticket_id=request_id,
        number=_text(payload, "display_id") or request_id,
        subject=subject,
        description=_text(payload, "description"),
        category=_text(payload, "category"),
        ci=_text(payload, "asset"),
    )


PARSERS = {
    "servicenow": parse_servicenow,
    "manageengine": parse_manageengine,
}
