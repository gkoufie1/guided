"""Write a note back to the ticket through each system's REST API.

Standard library only (urllib), so the Lambda package has no dependencies.
Any non-2xx response raises, which makes SQS retry the message and, after the
configured attempts, move it to the dead-letter queue.
"""

import base64
import json
from urllib.parse import urlencode, urlsplit
from urllib.request import Request, urlopen

TIMEOUT_SECONDS = 10


class WriteBackError(RuntimeError):
    pass


def _https_base(url):
    parts = urlsplit(url)
    if parts.scheme != "https" or not parts.netloc:
        raise ValueError("ticketing system URL must be https://host")
    return f"https://{parts.netloc}{parts.path.rstrip('/')}"


def _send(request, opener):
    with opener(request, timeout=TIMEOUT_SECONDS) as response:
        status = response.status
        if not 200 <= status < 300:
            raise WriteBackError(f"{request.get_method()} {request.full_url} returned {status}")
        return status


class ServiceNowClient:
    """Writes to the incident's work_notes through the Table API.

    The integration user needs the itil role (or a narrower custom role that can
    write incident.work_notes).
    """

    def __init__(self, instance_url, username, password, opener=urlopen):
        self.base = _https_base(instance_url)
        self.auth = "Basic " + base64.b64encode(f"{username}:{password}".encode()).decode()
        self.opener = opener

    def add_note(self, ticket_id, text):
        request = Request(
            f"{self.base}/api/now/table/incident/{ticket_id}",
            data=json.dumps({"work_notes": text}).encode(),
            method="PATCH",
            headers={"Content-Type": "application/json", "Accept": "application/json", "Authorization": self.auth},
        )
        return _send(request, self.opener)


class ManageEngineClient:
    """Adds a private note through the ServiceDesk Plus v3 API (on-premises, technician API key).

    ServiceDesk Plus Cloud authenticates with Zoho OAuth instead, which this
    client does not implement yet.
    """

    def __init__(self, base_url, authtoken, opener=urlopen):
        self.base = _https_base(base_url)
        self.authtoken = authtoken
        self.opener = opener

    def add_note(self, ticket_id, text):
        body = {"note": {"description": text, "show_to_requester": False, "mark_first_response": False}}
        request = Request(
            f"{self.base}/api/v3/requests/{ticket_id}/notes",
            data=urlencode({"input_data": json.dumps(body)}).encode(),
            method="POST",
            headers={
                "Content-Type": "application/x-www-form-urlencoded",
                "Accept": "application/vnd.manageengine.sdp.v3+json",
                "authtoken": self.authtoken,
            },
        )
        return _send(request, self.opener)


def from_config(system, config):
    """Build a client from the JSON stored in SSM for that system."""
    if system == "servicenow":
        return ServiceNowClient(config["instance_url"], config["username"], config["password"])
    if system == "manageengine":
        return ManageEngineClient(config["base_url"], config["authtoken"])
    raise ValueError(f"unknown system {system!r}")
