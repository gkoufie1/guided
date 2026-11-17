output "servicenow_webhook_url" {
  description = "Endpoint for the ServiceNow Business Rule"
  value       = "${aws_apigatewayv2_stage.default.invoke_url}webhooks/servicenow"
}

output "manageengine_webhook_url" {
  description = "Endpoint for the ServiceDesk Plus custom trigger"
  value       = "${aws_apigatewayv2_stage.default.invoke_url}webhooks/manageengine"
}

output "secret_parameters" {
  description = "Set these with aws ssm put-parameter --overwrite before connecting a ticketing system"
  value       = { for key, param in aws_ssm_parameter.secret : key => param.name }
}

output "suggestions_table" {
  value = aws_dynamodb_table.suggestions.name
}

output "dead_letter_queue_url" {
  value = aws_sqs_queue.dead_letter.url
}
