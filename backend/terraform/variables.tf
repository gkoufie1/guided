variable "aws_region" {
  description = "AWS region to deploy into"
  type        = string
  default     = "us-east-1"
}

variable "aws_profile" {
  description = "Named AWS CLI profile to deploy with. Leave null to use the default credential chain."
  type        = string
  default     = null
}

variable "name" {
  description = "Prefix for resource names"
  type        = string
  default     = "guided"
}

variable "guided_url" {
  description = "Public URL of the Guided trainer, linked from every suggestion note"
  type        = string
  default     = "https://gkoufie1.github.io/guided/"
}

variable "min_signals" {
  description = "Minimum distinct signal phrases a ticket must match before a suggestion is posted"
  type        = number
  default     = 2
}

variable "alert_email" {
  description = "Email for dead-letter and error alarms. Leave empty to create the alarms without a subscription."
  type        = string
  default     = ""
}

variable "log_retention_days" {
  description = "CloudWatch log retention for the Lambdas and API access logs"
  type        = number
  default     = 14
}

variable "api_rate_limit" {
  description = "Steady-state webhook requests per second allowed by API Gateway (cost and abuse guard)"
  type        = number
  default     = 5
}

variable "api_burst_limit" {
  description = "Webhook burst allowance in API Gateway"
  type        = number
  default     = 10
}
