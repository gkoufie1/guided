# Guided

A browser-based trainer for triaging cloud operations incidents. Work a live SLA queue, read simulated GitHub Actions, AWS, and Terraform evidence, choose the first useful action, follow a step-by-step runbook, and export an incident report.

**Live demo:** https://gkoufie1.github.io/guided/

![SLA queue counting down, with a breached ticket and several at-risk tickets](docs/queue.png)

![Investigating database timeouts: evidence cards and feedback explaining why rotating the password is wrong](docs/investigation.png)

## What it does

- **Live SLA queue.** Deadlines count down in real time (or at 10× / 60× for demos) and the queue re-ranks itself: major incidents, then breached, at-risk, on-track, and paused tickets.
- **Seven incidents** across deployments, IAM, TLS, Terraform state, networking, patching, and data recovery.
- **Two modes.** *Manual* hides the finding until you choose correctly. *Guided* shows the expert finding and runbook up front.
- **Feedback on wrong answers.** Every wrong option explains which piece of evidence rules it out.
- **Runbook notes.** Record what you actually see at each step. Notes stay in this browser.
- **Incident report.** Download or copy a Markdown write-up with the ticket, evidence, action taken, options ruled out, your step notes, and the customer reply draft.
- **Progress tracking.** Cases solved, first-try accuracy, and average time to solve.

| Case | Incident | Root cause |
|---|---|---|
| CP-1042 | Checkout rollout stalled | Deployment references an image tag missing from ECR |
| CP-1079 | Billing pipeline failed | IAM role trusts the old repository's OIDC subject |
| CP-1091 | Oracle host froze during a STIG scan | Memory pressure on a 4 GB host with no swap ([PatchPilot](https://github.com/gkoufie1/patchpilot)) |
| CP-1102 | Customer records missing | Accidental DELETE; point-in-time restore to a new RDS instance ([DR Drill 002](https://github.com/gkoufie1/aws-saas-sre-disaster-recovery-lab/blob/main/docs/dr/dr-drill-002-rds-pitr-results.md)) |
| CP-1110 | Portal certificate warning | ALB still serves an expired imported certificate |
| CP-1117 | Terraform state locked | A cancelled apply left a stale lock |
| CP-1123 | Orders API database timeouts | RDS security group still allows the retired app security group |

CP-1091 and CP-1102 are based on real lab work. The others are realistic samples.

## Run locally

Open `index.html` in a browser. There is no build step, and no dependencies or credentials are needed.

## Tests

Requires Node.js 18 or later. No packages are installed.

```sh
npm test
```

The tests cover SLA ranking and breach transitions, the incident report, and the shape of every case (one correct option, a hint for each wrong one, unique runbook step ids, and an SLA entry).

## Project layout

| File | Purpose |
|---|---|
| `index.html` | Page structure and styles |
| `cases.js` | All incident data: evidence, options and hints, runbooks, reply drafts, SLA entries |
| `sla.js` | SLA ranking and status text (pure functions) |
| `report.js` | Markdown incident report builder |
| `app.js` | UI wiring, live queue, progress, and browser storage |
| `tests/` | Node test runner suites |
| `.github/workflows/pages.yml` | Runs the tests, then deploys to GitHub Pages |

## Add a case

Append an object to `cases.js` using the same shape as the existing ones, then run `npm test`. The case shows up in the picker, the SLA queue, and the progress panel automatically.

## Scope

All tickets, evidence, and SLA deadlines are sample data. The app does not connect to a help desk, cloud account, or AI service. Notes and progress are stored only in your browser's `localStorage`.
