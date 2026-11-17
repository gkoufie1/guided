# Least privilege: each function can touch only the specific resources it uses.

data "aws_iam_policy_document" "lambda_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

# ---------- receiver: read the webhook token, send to the queue, write its logs ----------

resource "aws_iam_role" "receiver" {
  name               = "${var.name}-receiver"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
}

data "aws_iam_policy_document" "receiver" {
  statement {
    sid       = "Logs"
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["${aws_cloudwatch_log_group.receiver.arn}:*"]
  }

  statement {
    sid       = "Enqueue"
    actions   = ["sqs:SendMessage"]
    resources = [aws_sqs_queue.tickets.arn]
  }

  # SecureStrings use the AWS managed aws/ssm key, whose key policy already allows
  # decryption through SSM for principals in this account, so no kms statement is needed.
  statement {
    sid       = "WebhookToken"
    actions   = ["ssm:GetParameter"]
    resources = [aws_ssm_parameter.secret["webhook_token"].arn]
  }
}

resource "aws_iam_role_policy" "receiver" {
  name   = "receiver"
  role   = aws_iam_role.receiver.id
  policy = data.aws_iam_policy_document.receiver.json
}

# ---------- worker: consume the queue, read/write its table, read help desk credentials ----------

resource "aws_iam_role" "worker" {
  name               = "${var.name}-worker"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
}

data "aws_iam_policy_document" "worker" {
  statement {
    sid       = "Logs"
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["${aws_cloudwatch_log_group.worker.arn}:*"]
  }

  statement {
    sid       = "ConsumeQueue"
    actions   = ["sqs:ReceiveMessage", "sqs:DeleteMessage", "sqs:GetQueueAttributes", "sqs:ChangeMessageVisibility"]
    resources = [aws_sqs_queue.tickets.arn]
  }

  statement {
    sid       = "SuggestionRecords"
    actions   = ["dynamodb:PutItem", "dynamodb:UpdateItem"]
    resources = [aws_dynamodb_table.suggestions.arn]
  }

  statement {
    sid     = "HelpDeskCredentials"
    actions = ["ssm:GetParameter"]
    resources = [
      aws_ssm_parameter.secret["servicenow"].arn,
      aws_ssm_parameter.secret["manageengine"].arn,
    ]
  }
}

resource "aws_iam_role_policy" "worker" {
  name   = "worker"
  role   = aws_iam_role.worker.id
  policy = data.aws_iam_policy_document.worker.json
}
