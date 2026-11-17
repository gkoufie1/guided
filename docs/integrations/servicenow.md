# Connect ServiceNow

Sends every new incident to Guided and receives the suggestion as a work note.

> Not yet tested end to end against a live instance. Use a free Personal Developer Instance (developer.servicenow.com) first, never a production instance without approval from its owners.

## 1. Deploy the backend

From `backend/terraform`, run `terraform apply` and note the `servicenow_webhook_url` output.

## 2. Create an integration user in ServiceNow

1. **User Administration → Users → New**: user ID `guided.integration`, check **Web service access only**, set a strong password.
2. Add the **itil** role so it can write incident work notes. A narrower custom role that can write `incident.work_notes` is better if your instance has one.

## 3. Store the secrets in AWS

```sh
# Shared webhook token (any long random string)
aws ssm put-parameter --overwrite --type SecureString --name /guided/webhook_token \
  --value "$(openssl rand -hex 32)"

# Credentials the worker uses to write the work note
aws ssm put-parameter --overwrite --type SecureString --name /guided/servicenow \
  --value '{"instance_url":"https://devXXXXX.service-now.com","username":"guided.integration","password":"..."}'
```

Read the token back once for step 4: `aws ssm get-parameter --with-decryption --name /guided/webhook_token --query Parameter.Value --output text`.

## 4. Add system properties

**System Properties → All Properties → New**, twice:

| Name | Type | Value |
|---|---|---|
| `x_guided.webhook_url` | string | the `servicenow_webhook_url` output |
| `x_guided.webhook_token` | password2 | the token from step 3 |

Restrict both properties' read roles to `admin`.

## 5. Add the Business Rule

**System Definition → Business Rules → New**

- Table: **Incident [incident]**
- Advanced: checked
- When: **async**, Insert: checked (not Update, so Guided's own work note doesn't trigger it again)

Script:

```javascript
(function executeRule(current, previous) {
    try {
        var request = new sn_ws.RESTMessageV2();
        request.setEndpoint(gs.getProperty('x_guided.webhook_url'));
        request.setHttpMethod('post');
        request.setRequestHeader('Content-Type', 'application/json');
        // password2 properties must be decrypted explicitly.
        var token = new GlideEncrypter().decrypt(gs.getProperty('x_guided.webhook_token'));
        request.setRequestHeader('X-Guided-Token', token);
        request.setRequestBody(JSON.stringify({
            sys_id: current.getUniqueValue(),
            number: current.getValue('number'),
            short_description: current.getValue('short_description'),
            description: current.getValue('description'),
            category: current.getValue('category'),
            cmdb_ci: current.getDisplayValue('cmdb_ci')
        }));
        var response = request.execute();
        if (response.getStatusCode() != 202) {
            gs.warn('Guided webhook returned ' + response.getStatusCode() + ' for ' + current.getValue('number'));
        }
    } catch (e) {
        gs.error('Guided webhook failed for ' + current.getValue('number') + ': ' + e);
    }
})(current, previous);
```

How password2 values are decrypted varies by release; if `GlideEncrypter` is unavailable on yours, store the token in a Connection & Credential alias and reference it from an Outbound REST Message instead.

Only the six fields above leave ServiceNow. Caller name, email, and phone are not sent.

## 6. Test

Create an incident with short description *Customer portal shows connection is not private* and description *curl: SSL certificate problem: certificate has expired*. Within a few seconds a work note starting **[Guided] Suggested runbook** should appear, pointing to CP-1110.

If nothing appears: check **System Logs → Warnings/Errors** in ServiceNow, then the `/aws/lambda/guided-receiver` and `/aws/lambda/guided-worker` log groups in CloudWatch.
