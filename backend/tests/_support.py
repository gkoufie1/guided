"""Shared test setup: put backend/src on the import path and provide fakes."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from guided_backend.tickets import Ticket  # noqa: E402

SYS_ID = "a" * 32


def servicenow_payload(**overrides):
    payload = {
        "sys_id": SYS_ID,
        "number": "INC0010023",
        "short_description": "Customer portal shows connection is not private",
        "description": "Since midnight curl reports: SSL certificate problem: certificate has expired.",
        "category": "Network",
        "cmdb_ci": "portal-prod",
    }
    payload.update(overrides)
    return payload


def ticket(**overrides):
    fields = dict(
        system="servicenow",
        ticket_id=SYS_ID,
        number="INC0010023",
        subject="Customer portal shows connection is not private",
        description="curl: certificate has expired",
    )
    fields.update(overrides)
    return Ticket(**fields)


class FakeStore:
    def __init__(self):
        self.records = {}

    def claim(self, key):
        if self.records.get(key, {}).get("status") not in (None, "failed"):
            return False
        self.records[key] = {"status": "processing"}
        return True

    def finish(self, key, status, **details):
        self.records[key] = {"status": status, **details}

    def release(self, key):
        self.finish(key, "failed")


class FakeClient:
    def __init__(self, fail=False):
        self.notes = []
        self.fail = fail

    def add_note(self, ticket_id, text):
        if self.fail:
            raise RuntimeError("help desk unavailable")
        self.notes.append((ticket_id, text))
