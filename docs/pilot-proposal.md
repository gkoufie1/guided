# Proposal: pilot a runbook-suggestion assistant on the service desk

**From:** George Koufie
**To:** Service desk / platform management and information security
**Status:** Request for approval to run a limited, non-production pilot

## Summary

I built a small tool, on my own time, that reads an incoming incident ticket and posts the most relevant internal runbook back onto the ticket as an internal note. The goal is to shorten the time an engineer spends finding "which of our known problems is this, and what did we do last time." I am asking for approval to pilot it against **non-production or sample tickets only**, with security review first. It is not connected to any live ticket queue today.

## The problem

Common incidents recur: an expired certificate on a load balancer, a Terraform state lock left by a cancelled run, a security-group change that blocks a database. Each time, an engineer re-derives the diagnosis and re-finds the runbook. That is slow and inconsistent, and it is hardest on newer team members and on-call staff out of hours.

## What it does

- On ticket creation, the ticketing system (ServiceNow or ManageEngine ServiceDesk Plus) sends the ticket to the tool.
- The tool matches the ticket text against our library of runbooks and, if it is confident, posts an **internal note** with the likely cause, the runbook steps, and what to rule out.
- Every note is labelled as an automated suggestion, states that **no changes were made**, and asks the engineer to verify against the ticket's own evidence.
- If nothing matches confidently, it posts nothing.

It suggests. It never touches the customer environment, and it cannot make changes.

## What it does NOT do

- It does not remediate, run commands, or alter any system.
- It does not send ticket data to any third-party AI service in this pilot. Matching is rule-based and runs entirely in our (or my sandbox) AWS account.
- It does not read or store caller contact details.

## How customer data is protected

- **Data minimisation:** only the fields needed for matching are read (subject, description, category, affected item). Caller name, email, and phone are never read.
- **Redaction before storage:** emails, phone numbers, cloud access keys, tokens, and password-style values are stripped from the text before it is queued or processed. Ticket text is never written to logs or to the database.
- **Stays in our control:** the tool runs on AWS Lambda in an account we designate. Encryption at rest, least-privilege IAM per function, and secrets in AWS SSM, never in code.
- **Auditable:** every ticket produces a log line (ticket number, outcome, which runbook, how confident) and an alarm fires if anything fails.

Full design and security notes: `docs/architecture.md` in the project repository.

## Proposed pilot (low risk, reversible)

1. **Security review** of the design and the AWS account setup before anything is connected.
2. **Sandbox first:** run against a ServiceNow developer instance or a copy of anonymised tickets. No production data.
3. **Shadow mode on non-production queues:** suggestions visible to a small group of volunteers, measured for accuracy, not acted on blindly.
4. **Decision checkpoint:** review precision (how often the suggestion was the real fix), false-positive rate, and engineer feedback. Expand, adjust, or stop.

Everything is defined in Terraform and can be removed with a single `terraform destroy`.

## What I need

- Approval to proceed to the security review step.
- Guidance on which ticketing data is acceptable for a sandbox pilot, and any data-residency requirements.
- If the pilot succeeds and we want an AI fallback for tickets the rules miss, direction on which company-approved AI service and account to use (no customer data would go to any AI service without that approval).

## Why it is worth a look

Even a modest improvement in time-to-first-useful-action on recurring incidents compounds across the volume the service desk handles, and it most helps the people who are newest or on-call. The design is deliberately conservative: suggest, never act; minimise and redact data; keep everything inside our control and fully auditable.
