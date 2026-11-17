import base64
import json
import unittest

from _support import FakeClient, FakeStore, servicenow_payload

from guided_backend import receiver, worker
from guided_backend.clients import ManageEngineClient, ServiceNowClient, WriteBackError
from guided_backend.matcher import load_runbooks

TOKEN = "s3cret-token"


def http_event(body, system="servicenow", token=TOKEN, b64=False):
    raw = json.dumps(body) if not isinstance(body, str) else body
    return {
        "headers": {"X-Guided-Token": token} if token is not None else {},
        "pathParameters": {"system": system},
        "body": base64.b64encode(raw.encode()).decode() if b64 else raw,
        "isBase64Encoded": b64,
    }


class ReceiverTest(unittest.TestCase):
    def setUp(self):
        self.sent = []

    def call(self, event, token=TOKEN):
        return receiver.handle(event, token=token, send=self.sent.append)

    def test_queues_redacted_ticket(self):
        payload = servicenow_payload(description="certificate has expired. Contact pat@example.com")
        response = self.call(http_event(payload))
        self.assertEqual(response["statusCode"], 202)
        self.assertEqual(len(self.sent), 1)
        queued = json.loads(self.sent[0])
        self.assertNotIn("pat@example.com", queued["description"])
        self.assertIn("[REDACTED:email]", queued["description"])

    def test_accepts_base64_body(self):
        self.assertEqual(self.call(http_event(servicenow_payload(), b64=True))["statusCode"], 202)

    def test_rejects_bad_token(self):
        for token in ["wrong", "", None]:
            with self.subTest(token=token):
                self.assertEqual(self.call(http_event(servicenow_payload(), token=token))["statusCode"], 401)
        self.assertEqual(self.sent, [])

    def test_refuses_when_no_token_configured(self):
        self.assertEqual(self.call(http_event(servicenow_payload(), token=""), token="")["statusCode"], 401)

    def test_unknown_system(self):
        self.assertEqual(self.call(http_event(servicenow_payload(), system="jira"))["statusCode"], 404)

    def test_bad_payloads(self):
        self.assertEqual(self.call(http_event("{not json"))["statusCode"], 400)
        response = self.call(http_event(servicenow_payload(sys_id="../x")))
        self.assertEqual(response["statusCode"], 400)
        self.assertIn("sys_id", json.loads(response["body"])["error"])
        self.assertEqual(self.call(http_event("x" * 70_000))["statusCode"], 413)
        self.assertEqual(self.sent, [])


class WorkerTest(unittest.TestCase):
    def setUp(self):
        self.store = FakeStore()
        self.client = FakeClient()
        self.deps = dict(
            store=self.store,
            client_for=lambda system: self.client,
            runbooks=load_runbooks(),
            guided_url="https://gkoufie1.github.io/guided/",
            min_signals=2,
        )

    def record(self, message_id="m1", **overrides):
        from guided_backend.tickets import parse_servicenow

        return {"messageId": message_id, "body": json.dumps(parse_servicenow(servicenow_payload(**overrides)).to_dict())}

    def test_posts_suggestion_and_records_it(self):
        result = worker.process([self.record()], **self.deps)
        self.assertEqual(result, {"batchItemFailures": []})
        self.assertEqual(len(self.client.notes), 1)
        self.assertIn("CP-1110", self.client.notes[0][1])
        record = self.store.records["servicenow#" + "a" * 32]
        self.assertEqual((record["status"], record["runbook"]), ("posted", "CP-1110"))

    def test_duplicate_delivery_posts_once(self):
        worker.process([self.record("m1"), self.record("m2")], **self.deps)
        self.assertEqual(len(self.client.notes), 1)

    def test_no_match_posts_nothing(self):
        worker.process([self.record(short_description="Laptop keyboard broken", description="")], **self.deps)
        self.assertEqual(self.client.notes, [])
        self.assertEqual(self.store.records["servicenow#" + "a" * 32]["status"], "no_match")

    def test_write_back_failure_is_retried_alone(self):
        self.client.fail = True
        good = self.record("ok", sys_id="b" * 32, short_description="Laptop keyboard broken", description="")
        result = worker.process([self.record("bad"), good], **self.deps)
        self.assertEqual(result, {"batchItemFailures": [{"itemIdentifier": "bad"}]})
        self.assertEqual(self.store.records["servicenow#" + "a" * 32]["status"], "failed")
        # The retry can claim the ticket again and succeeds once the help desk is back.
        self.client.fail = False
        self.assertEqual(worker.process([self.record("bad")], **self.deps), {"batchItemFailures": []})
        self.assertEqual(len(self.client.notes), 1)


class FakeResponse:
    def __init__(self, status):
        self.status = status

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


class ClientTest(unittest.TestCase):
    def capture(self, status=200):
        calls = []

        def opener(request, timeout):
            calls.append(request)
            return FakeResponse(status)

        return calls, opener

    def test_servicenow_request(self):
        calls, opener = self.capture()
        ServiceNowClient("https://dev12345.service-now.com/", "guided.bot", "pw", opener=opener).add_note("a" * 32, "hello")
        request = calls[0]
        self.assertEqual(request.get_method(), "PATCH")
        self.assertEqual(request.full_url, "https://dev12345.service-now.com/api/now/table/incident/" + "a" * 32)
        self.assertEqual(json.loads(request.data), {"work_notes": "hello"})
        self.assertTrue(request.get_header("Authorization").startswith("Basic "))

    def test_manageengine_request(self):
        calls, opener = self.capture()
        ManageEngineClient("https://sdp.example.com", "KEY", opener=opener).add_note("84512", "hello")
        request = calls[0]
        self.assertEqual(request.full_url, "https://sdp.example.com/api/v3/requests/84512/notes")
        self.assertIn(b"show_to_requester", request.data)
        self.assertEqual(request.get_header("Authtoken"), "KEY")

    def test_rejects_plain_http(self):
        with self.assertRaises(ValueError):
            ServiceNowClient("http://dev12345.service-now.com", "u", "p")

    def test_non_2xx_raises(self):
        _, opener = self.capture(status=204)
        ServiceNowClient("https://x.service-now.com", "u", "p", opener=opener).add_note("a" * 32, "ok")
        _, opener = self.capture(status=302)
        with self.assertRaises(WriteBackError):
            ServiceNowClient("https://x.service-now.com", "u", "p", opener=opener).add_note("a" * 32, "x")


if __name__ == "__main__":
    unittest.main()
