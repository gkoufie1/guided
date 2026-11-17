import unittest

from _support import SYS_ID, servicenow_payload, ticket

from guided_backend.redact import redact_text, redact_ticket
from guided_backend.tickets import InvalidTicket, parse_manageengine, parse_servicenow


class ParseServiceNowTest(unittest.TestCase):
    def test_keeps_only_needed_fields(self):
        t = parse_servicenow(servicenow_payload(caller_email="pat@example.com", caller_phone="555-123-4567"))
        self.assertEqual(t.ticket_id, SYS_ID)
        self.assertEqual(t.number, "INC0010023")
        self.assertNotIn("pat@example.com", t.text())
        self.assertEqual(t.ci, "portal-prod")

    def test_rejects_unsafe_sys_id(self):
        # sys_id is placed in the write-back URL, so path tricks must be refused.
        for bad in ["../../sys_user", "A" * 32, "a" * 31, ""]:
            with self.assertRaises(InvalidTicket):
                parse_servicenow(servicenow_payload(sys_id=bad))

    def test_requires_subject(self):
        with self.assertRaises(InvalidTicket):
            parse_servicenow(servicenow_payload(short_description="  "))

    def test_rejects_non_object(self):
        with self.assertRaises(InvalidTicket):
            parse_servicenow(["not", "an", "object"])

    def test_rejects_nested_field(self):
        with self.assertRaises(InvalidTicket):
            parse_servicenow(servicenow_payload(description={"html": "x"}))


class ParseManageEngineTest(unittest.TestCase):
    def test_parses_request(self):
        t = parse_manageengine({"id": "84512", "display_id": "REQ-84512", "subject": "State lock error", "description": "terraform plan fails"})
        self.assertEqual((t.system, t.ticket_id, t.number), ("manageengine", "84512", "REQ-84512"))

    def test_rejects_non_numeric_id(self):
        with self.assertRaises(InvalidTicket):
            parse_manageengine({"id": "1/notes/2", "subject": "x"})


class RedactTest(unittest.TestCase):
    def test_removes_personal_data_and_secrets(self):
        text = (
            "Reported by pat.lee@northwind.example, call +1 555-123-4567 or (555) 987-6543.\n"
            "Key AKIAIOSFODNN7EXAMPLE leaked, password: hunter2, api_key=abc123\n"
            "Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.payload.sig\n"
            "token ghp_0123456789abcdefghijklmnopqrstuvwxyzAB\n"
            "-----BEGIN RSA PRIVATE KEY-----\nMIIEow\n-----END RSA PRIVATE KEY-----"
        )
        clean, counts = redact_text(text)
        for secret in ["pat.lee@", "555-123-4567", "987-6543", "AKIAIOSFODNN7EXAMPLE", "hunter2", "abc123", "eyJhbGci", "ghp_0123", "MIIEow"]:
            self.assertNotIn(secret, clean)
        self.assertIn("password: [REDACTED:secret]", clean)
        self.assertEqual(counts["email"], 1)
        self.assertEqual(counts["phone"], 2)

    def test_keeps_technical_evidence(self):
        text = "connect ETIMEDOUT 10.20.3.41:5432 at 2026-11-16 09:12:04 UTC, lock ID 3f6b2c1e-9a4d-4e8b-b1f2-6c0d7e5a9b14"
        clean, counts = redact_text(text)
        self.assertEqual(clean, text)
        self.assertEqual(counts, {})

    def test_redacts_every_field(self):
        t, counts = redact_ticket(ticket(subject="From ops@example.com", ci="owner ops@example.com"))
        self.assertNotIn("ops@example.com", t.text())
        self.assertEqual(counts["email"], 2)


if __name__ == "__main__":
    unittest.main()
