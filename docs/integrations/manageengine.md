# Connect ManageEngine ServiceDesk Plus

Sends new requests to Guided and receives the suggestion as a private note (not visible to the requester).

> Written for ServiceDesk Plus **on-premises**, which authenticates API calls with a technician API key. ServiceDesk Plus **Cloud** uses Zoho OAuth, which Guided does not support yet. Not yet tested against a live instance; menu names vary between builds.

## 1. Deploy the backend

From `backend/terraform`, run `terraform apply` and note the `manageengine_webhook_url` output.

## 2. Create a technician API key

Create a dedicated technician (for example `Guided Integration`) with permission to add notes to requests, then generate an API key for it: **Admin → Technicians → (technician) → Generate API key**, or from the technician's personal settings depending on your build.

## 3. Store the secrets in AWS

```sh
aws ssm put-parameter --overwrite --type SecureString --name /guided/manageengine \
  --value '{"base_url":"https://sdp.example.com","authtoken":"<technician API key>"}'
```

The webhook token in `/guided/webhook_token` is shared with ServiceNow; set it as described in the [ServiceNow guide](servicenow.md#3-store-the-secrets-in-aws) if you haven't already.

## 4. Add a custom trigger with a webhook action

**Admin → Automation → Custom Triggers (Request) → New**

- Execute when a request is **Created**.
- Action: **Webhook** (or *Execute Custom Function* with an HTTP call on builds without webhook actions).
  - Method: `POST`
  - URL: the `manageengine_webhook_url` output
  - Header: `X-Guided-Token: <token from /guided/webhook_token>`
  - Header: `Content-Type: application/json`
  - Body, using your build's request variable placeholders:

```json
{
  "id": "$id",
  "display_id": "$display_id",
  "subject": "$subject",
  "description": "$description",
  "category": "$category",
  "asset": "$asset"
}
```

Placeholder syntax differs between versions; use the variable picker in the trigger editor and keep the JSON keys exactly as above. `id` must be the numeric request id, because it is used in the API call that adds the note.

## 5. Test

Create a request with subject *Terraform plan fails* and description *Error acquiring the state lock*. A private note starting **[Guided] Suggested runbook** should appear, pointing to CP-1117.
