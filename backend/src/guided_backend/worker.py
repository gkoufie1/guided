"""Queue worker: SQS → match → note back to the ticket → record outcome.

Uses partial batch responses, so one failing ticket is retried on its own
instead of re-running the whole batch. After the queue's maxReceiveCount a
failing message moves to the dead-letter queue, which raises an alarm.
"""

import json
import logging
import time

from . import config, note
from .clients import from_config
from .matcher import load_runbooks, match
from .tickets import Ticket

log = logging.getLogger()
log.setLevel(logging.INFO)


def process_one(body, *, store, client_for, runbooks, guided_url, min_signals):
    ticket = Ticket.from_dict(json.loads(body))
    key = f"{ticket.system}#{ticket.ticket_id}"
    started = time.monotonic()

    if not store.claim(key):
        log.info(json.dumps({"event": "duplicate_skipped", "ticket": ticket.number}))
        return "duplicate"

    result = match(ticket.text(), runbooks, min_signals)
    if result.best is None:
        store.finish(key, "no_match")
        log.info(json.dumps({"event": "no_match", "system": ticket.system, "ticket": ticket.number}))
        return "no_match"

    runbook_id = result.best.runbook["id"]
    try:
        client_for(ticket.system).add_note(ticket.ticket_id, note.build(ticket, result, guided_url))
    except Exception:
        store.release(key)
        raise
    store.finish(key, "posted", runbook=runbook_id, confidence=result.confidence, signals=result.best.hits)
    log.info(json.dumps({
        "event": "suggestion_posted",
        "system": ticket.system,
        "ticket": ticket.number,
        "runbook": runbook_id,
        "confidence": result.confidence,
        "ms": round((time.monotonic() - started) * 1000),
    }))
    return "posted"


def process(records, **deps):
    failures = []
    for record in records:
        try:
            process_one(record["body"], **deps)
        except Exception:
            log.exception(json.dumps({"event": "failed", "messageId": record.get("messageId")}))
            failures.append({"itemIdentifier": record["messageId"]})
    return {"batchItemFailures": failures}


_deps = None


def _live_deps():
    global _deps
    if _deps is None:
        import boto3

        from .store import DynamoStore

        params = {
            "servicenow": config.env("SERVICENOW_PARAM"),
            "manageengine": config.env("MANAGEENGINE_PARAM"),
        }
        _deps = {
            "store": DynamoStore(boto3.resource("dynamodb").Table(config.env("TABLE_NAME"))),
            # Credentials are re-read through the SSM cache on every call, so rotation needs no redeploy.
            "client_for": lambda system: from_config(system, config.secret_json(params[system])),
            "runbooks": load_runbooks(),
            "guided_url": config.env("GUIDED_URL"),
            "min_signals": int(config.env("MIN_SIGNALS", "2")),
        }
    return _deps


def handler(event, context):
    return process(event.get("Records", []), **_live_deps())
