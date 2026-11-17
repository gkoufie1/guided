"""Guided backend: matches incoming help desk tickets to runbooks and posts
the suggestion back to the ticket as an internal note.

Modules
  tickets   normalise ServiceNow / ManageEngine webhook payloads into a Ticket
  redact    strip personal data and secrets before anything is queued or stored
  matcher   score a ticket against the runbook library
  note      format the suggestion as a work note
  clients   write the note back through each system's REST API
  store     DynamoDB idempotency record, so a ticket gets one suggestion
  receiver  Lambda behind API Gateway: authenticate, parse, redact, enqueue
  worker    Lambda on SQS: match, post the note, record the outcome
"""
