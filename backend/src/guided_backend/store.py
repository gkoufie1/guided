"""DynamoDB record per ticket, so each ticket gets at most one suggestion.

Webhooks and SQS both deliver at least once, so duplicates are expected.
`claim` is a conditional write: only one worker invocation can own a ticket.
A claim left in "processing" by a crashed invocation becomes reclaimable
after STALE_SECONDS. Records expire through DynamoDB TTL.

Only the ticket key, outcome, matched runbook id, and matched signal phrases
are stored. Ticket text is not.
"""

import time

STALE_SECONDS = 300
RETENTION_SECONDS = 30 * 24 * 3600


class DynamoStore:
    def __init__(self, table):
        self.table = table  # boto3 DynamoDB Table resource

    def claim(self, key, now=None):
        from botocore.exceptions import ClientError

        now = int(now or time.time())
        try:
            self.table.put_item(
                Item={"pk": key, "status": "processing", "claimed_at": now, "expires_at": now + RETENTION_SECONDS},
                ConditionExpression="attribute_not_exists(pk) OR #s = :failed OR (#s = :processing AND claimed_at < :stale)",
                ExpressionAttributeNames={"#s": "status"},
                ExpressionAttributeValues={":failed": "failed", ":processing": "processing", ":stale": now - STALE_SECONDS},
            )
            return True
        except ClientError as error:
            if error.response["Error"]["Code"] == "ConditionalCheckFailedException":
                return False
            raise

    def finish(self, key, status, **details):
        names = {"#s": "status"}
        values = {":s": status, ":t": int(time.time())}
        sets = ["#s = :s", "finished_at = :t"]
        for i, (name, value) in enumerate(details.items()):
            names[f"#d{i}"] = name
            values[f":d{i}"] = value
            sets.append(f"#d{i} = :d{i}")
        self.table.update_item(
            Key={"pk": key},
            UpdateExpression="SET " + ", ".join(sets),
            ExpressionAttributeNames=names,
            ExpressionAttributeValues=values,
        )

    def release(self, key):
        """Mark a claim as failed so the SQS retry can claim it again."""
        self.finish(key, "failed")
