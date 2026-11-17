# SecureString parameters (standard tier is free). Terraform creates them with a
# placeholder and then ignores the value, so real secrets are set out of band
# with `aws ssm put-parameter --overwrite` and never land in Terraform state or git.

locals {
  secret_params = {
    webhook_token = "Shared token the ticketing systems send in the X-Guided-Token header"
    servicenow    = "JSON: {\"instance_url\": \"https://<instance>.service-now.com\", \"username\": \"...\", \"password\": \"...\"}"
    manageengine  = "JSON: {\"base_url\": \"https://<sdp-host>\", \"authtoken\": \"...\"}"
  }
}

resource "aws_ssm_parameter" "secret" {
  for_each = local.secret_params

  name        = "/${var.name}/${each.key}"
  description = each.value
  type        = "SecureString"
  value       = "CHANGE_ME"

  lifecycle {
    ignore_changes = [value]
  }
}
