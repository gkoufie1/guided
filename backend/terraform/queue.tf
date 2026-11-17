# Receiver → queue → worker. The queue absorbs bursts and decouples the webhook
# from the speed and availability of the ticketing system's API.

resource "aws_sqs_queue" "dead_letter" {
  name                      = "${var.name}-tickets-dlq"
  message_retention_seconds = 14 * 24 * 3600
  sqs_managed_sse_enabled   = true
}

resource "aws_sqs_queue" "tickets" {
  name                       = "${var.name}-tickets"
  visibility_timeout_seconds = 6 * aws_lambda_function.worker.timeout # AWS guidance: at least 6x the function timeout
  message_retention_seconds  = 4 * 24 * 3600
  sqs_managed_sse_enabled    = true

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.dead_letter.arn
    maxReceiveCount     = 3
  })
}

resource "aws_sqs_queue_redrive_allow_policy" "dead_letter" {
  queue_url = aws_sqs_queue.dead_letter.id

  redrive_allow_policy = jsonencode({
    redrivePermission = "byQueue"
    sourceQueueArns   = [aws_sqs_queue.tickets.arn]
  })
}

# One record per ticket for idempotency and an audit trail of what was suggested.
# Holds no ticket text. Records expire after 30 days through TTL.
resource "aws_dynamodb_table" "suggestions" {
  name         = "${var.name}-suggestions"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "pk"

  attribute {
    name = "pk"
    type = "S"
  }

  ttl {
    attribute_name = "expires_at"
    enabled        = true
  }

  server_side_encryption {
    enabled = true
  }
}
