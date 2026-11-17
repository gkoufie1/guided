# One package, two functions. Standard library only, so no build step or layers.

data "archive_file" "backend" {
  type        = "zip"
  source_dir  = "${path.module}/../src"
  output_path = "${path.module}/build/guided-backend.zip"
  excludes    = ["**/__pycache__/**", "**/*.pyc"]
}

resource "aws_cloudwatch_log_group" "receiver" {
  name              = "/aws/lambda/${var.name}-receiver"
  retention_in_days = var.log_retention_days
}

resource "aws_cloudwatch_log_group" "worker" {
  name              = "/aws/lambda/${var.name}-worker"
  retention_in_days = var.log_retention_days
}

resource "aws_lambda_function" "receiver" {
  function_name    = "${var.name}-receiver"
  role             = aws_iam_role.receiver.arn
  handler          = "guided_backend.receiver.handler"
  runtime          = "python3.12"
  architectures    = ["arm64"]
  memory_size      = 128
  timeout          = 10
  filename         = data.archive_file.backend.output_path
  source_code_hash = data.archive_file.backend.output_base64sha256

  environment {
    variables = {
      QUEUE_URL           = aws_sqs_queue.tickets.url
      WEBHOOK_TOKEN_PARAM = aws_ssm_parameter.secret["webhook_token"].name
    }
  }

  depends_on = [aws_cloudwatch_log_group.receiver]
}

resource "aws_lambda_function" "worker" {
  function_name    = "${var.name}-worker"
  role             = aws_iam_role.worker.arn
  handler          = "guided_backend.worker.handler"
  runtime          = "python3.12"
  architectures    = ["arm64"]
  memory_size      = 256
  timeout          = 30
  filename         = data.archive_file.backend.output_path
  source_code_hash = data.archive_file.backend.output_base64sha256

  environment {
    variables = {
      TABLE_NAME         = aws_dynamodb_table.suggestions.name
      SERVICENOW_PARAM   = aws_ssm_parameter.secret["servicenow"].name
      MANAGEENGINE_PARAM = aws_ssm_parameter.secret["manageengine"].name
      GUIDED_URL         = var.guided_url
      MIN_SIGNALS        = tostring(var.min_signals)
    }
  }

  depends_on = [aws_cloudwatch_log_group.worker]
}

resource "aws_lambda_event_source_mapping" "worker" {
  event_source_arn        = aws_sqs_queue.tickets.arn
  function_name           = aws_lambda_function.worker.arn
  batch_size              = 5
  function_response_types = ["ReportBatchItemFailures"]

  # Caps concurrent workers so a burst of tickets can't flood the help desk API
  # (2 is the minimum SQS allows). Raise it as ticket volume grows.
  scaling_config {
    maximum_concurrency = 2
  }
}
