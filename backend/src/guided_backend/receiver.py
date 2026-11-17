"""Webhook receiver: API Gateway (HTTP API) → this Lambda → SQS.

Kept small and fast on purpose. It authenticates the caller, validates and
redacts the ticket, queues it, and returns 202. Matching and the call back to
the ticketing system happen in the worker, so a slow help desk API never
makes the webhook time out, and a burst of tickets just queues up.

Ticket text is never logged.
"""

import base64
import hmac
import json
import logging

from . import config
from .redact import redact_ticket
from .tickets import PARSERS, InvalidTicket

MAX_BODY_BYTES = 64 * 1024
TOKEN_HEADER = "x-guided-token"

log = logging.getLogger()
log.setLevel(logging.INFO)


def _response(status, body):
    return {"statusCode": status, "headers": {"Content-Type": "application/json"}, "body": json.dumps(body)}


def handle(event, *, token, send):
    headers = {k.lower(): v for k, v in (event.get("headers") or {}).items()}
    supplied = headers.get(TOKEN_HEADER, "")
    if not token or not hmac.compare_digest(supplied.encode(), token.encode()):
        return _response(401, {"error": "unauthorized"})

    system = (event.get("pathParameters") or {}).get("system")
    parse = PARSERS.get(system)
    if parse is None:
        return _response(404, {"error": "unknown ticketing system"})

    raw = event.get("body") or ""
    if len(raw) > MAX_BODY_BYTES * 2:  # cheap guard before decoding
        return _response(413, {"error": "payload too large"})
    try:
        body = base64.b64decode(raw, validate=True) if event.get("isBase64Encoded") else raw.encode()
        if len(body) > MAX_BODY_BYTES:
            return _response(413, {"error": "payload too large"})
        ticket = parse(json.loads(body))
    except (ValueError, UnicodeDecodeError) as error:
        # InvalidTicket and JSON errors are both ValueErrors; only our own messages are returned.
        message = str(error) if isinstance(error, InvalidTicket) else "body must be valid JSON"
        return _response(400, {"error": message})

    ticket, redactions = redact_ticket(ticket)
    send(json.dumps(ticket.to_dict()))
    log.info(json.dumps({"event": "queued", "system": system, "ticket": ticket.number, "redactions": redactions}))
    return _response(202, {"status": "queued", "ticket": ticket.number})


_sqs = None


def _send_to_queue(message):
    global _sqs
    if _sqs is None:
        import boto3

        _sqs = boto3.client("sqs")
    _sqs.send_message(QueueUrl=config.env("QUEUE_URL"), MessageBody=message)


def handler(event, context):
    return handle(event, token=config.secret(config.env("WEBHOOK_TOKEN_PARAM")), send=_send_to_queue)
