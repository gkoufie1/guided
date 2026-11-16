// Sample incidents. Each case owns its evidence, answer options (with a hint for
// every wrong option), runbook, reply draft, and SLA queue entry.
// To add a case, append an object with the same shape; tests/cases.test.js checks it.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.GuidedCases = api;
})(typeof self !== 'undefined' ? self : this, function () {
  return [
    {
      id: 'CP-1042',
      title: 'Checkout rollout stalled',
      ticket: 'The new checkout deployment has stalled. GitHub Actions finished successfully, but the new pods never became ready.',
      scope: 'Sample client Northwind · AWS us-east-1 · EKS production/checkout-api',
      sources: [
        ['GitHub Actions', 'Run 1842 · commit 8c40f17 · build-and-push succeeded\nPublished checkout-api:8c40f17'],
        ['Amazon ECR', 'checkout-api:8c40f17 · image present\ncheckout-api:release-1842 · ImageNotFoundException'],
        ['Amazon EKS', 'Deployment image checkout-api:release-1842\nPod event · manifest unknown\nPod status · ImagePullBackOff']
      ],
      action: 'tag',
      options: [
        {value: 'probe', label: 'Review readiness probe configuration and service health', hint: 'Readiness probes only run once a container starts. These pods are in ImagePullBackOff, so the image was never pulled.'},
        {value: 'tag', label: 'Align the deployment image reference with the verified ECR artifact and review the rollout'},
        {value: 'role', label: 'Correct the GitHub Actions role trust and rerun the workflow', hint: 'The workflow authenticated and published checkout-api:8c40f17, so the pipeline identity is working.'},
        {value: 'wait', label: 'Wait for the rollout to recover on its own', hint: 'ImagePullBackOff will not clear by itself. The tag release-1842 does not exist in ECR, so every retry fails the same way.'}
      ],
      finding: 'The rollout references release-1842, which is absent from ECR. The pipeline published 8c40f17. Verify that this is the intended release artifact, then review a deployment update to use its immutable digest.',
      runbook: [
        {id: 'run', where: 'GitHub → Actions → Run 1842', do: 'Open the build-and-push step. Confirm commit 8c40f17 and the published tag checkout-api:8c40f17.'},
        {id: 'ecr', where: 'AWS Console → Amazon ECR → Repositories → checkout-api', do: 'In us-east-1, find tag 8c40f17 and copy its image digest. Confirm the artifact belongs to the intended release and that release-1842 is absent.'},
        {id: 'manifest', where: 'GitHub → deployment configuration for production/checkout-api', do: 'Find the image field for the checkout-api container in the manifest or Helm values that your pipeline actually deploys. Replace the existing registry/repository:release-1842 with the same registry/repository@sha256:<digest copied from ECR>. Open a pull request and deploy through the normal release workflow. The sample does not specify a file path or digest.'},
        {id: 'verify', where: 'EKS → production namespace → checkout-api deployment', do: 'From the intended cluster context, run the command below. Confirm the new pods are Ready, use the expected image digest, and pass the checkout smoke test before updating the customer.', code: 'kubectl -n production rollout status deployment/checkout-api --timeout=5m'}
      ],
      draft: 'Hi, we traced the stalled checkout rollout to an image reference that does not match the published release artifact. We’re reviewing the intended image before updating the deployment. We’ll confirm rollout health and share another update once verification is complete.',
      sla: {priority: 3, owner: 'Unassigned', minutes: 8, atRiskMinutes: 10, target: 'First response', next: 'Assign an owner and acknowledge the ticket.'}
    },
    {
      id: 'CP-1079',
      title: 'Billing pipeline failed',
      ticket: 'The billing release failed in GitHub Actions. The team reports that the previous deployment is still running.',
      scope: 'Sample client Alder · AWS us-east-1 · EKS production/billing-api',
      sources: [
        ['GitHub Actions', 'Run 1851 · commit 41f93ae\nConfigure AWS credentials · AccessDenied for AssumeRoleWithWebIdentity\nOIDC subject · repo:alder/billing-api:ref:refs/heads/main'],
        ['Amazon ECR / IAM', 'billing-api:41f93ae · absent\nRelease role trust · repo:alder/legacy-billing:ref:refs/heads/main\nBuild-and-push step · skipped'],
        ['Amazon EKS', 'Deployment image billing-api:3c915d2\nExisting replicas · 3/3 ready\nNo new rollout observed']
      ],
      action: 'role',
      options: [
        {value: 'admin', label: 'Attach AdministratorAccess to the release role and rerun', hint: 'AssumeRoleWithWebIdentity failed, so the trust policy rejected the caller before any permissions policy was evaluated. Broader permissions would not help and would widen the blast radius.'},
        {value: 'tag', label: 'Point the deployment at billing-api:41f93ae in ECR', hint: 'billing-api:41f93ae was never built. The build-and-push step was skipped after authentication failed.'},
        {value: 'role', label: 'Correct the GitHub Actions role trust for the approved repository and rerun the workflow'},
        {value: 'wait', label: 'Rerun the workflow without changes', hint: 'The trust policy still names repo:alder/legacy-billing, so a rerun fails with the same AccessDenied.'}
      ],
      finding: 'The AWS role trusts the old repository, so the workflow could not authenticate. The image was never published and EKS stayed on the previous deployment. Review the approved repository and branch, then correct the scoped trust and rerun the workflow.',
      runbook: [
        {id: 'run', where: 'GitHub → Actions → Run 1851', do: 'Open Configure AWS credentials. Confirm the role configured for the release, the AccessDenied message, and the workflow subject repo:alder/billing-api:ref:refs/heads/main.'},
        {id: 'trust', where: 'AWS Console → IAM → Roles → release role → Trust relationships', do: 'After confirming that the new repository is authorized, update the GitHub OIDC subject in the matching trust statement. Preserve the other conditions and review the change in infrastructure code if it manages this role.', code: 'Before: repo:alder/legacy-billing:ref:refs/heads/main\nAfter:  repo:alder/billing-api:ref:refs/heads/main'},
        {id: 'rerun', where: 'GitHub → Actions → Run 1851 → Re-run jobs', do: 'After the approved trust change is applied, rerun the failed workflow. Confirm the credentials step succeeds and the billing-api:41f93ae image appears in ECR.'},
        {id: 'verify', where: 'EKS → production namespace → billing-api deployment', do: 'Confirm the new release rolled out and the application passes its smoke test before updating the customer.', code: 'kubectl -n production rollout status deployment/billing-api --timeout=5m'}
      ],
      draft: 'Hi, the new billing release stopped during pipeline authentication before it reached the cluster. The previous release remains active, and its replicas are reporting ready. We’re reviewing the deployment identity configuration and will verify the rollout after the pipeline is rerun.',
      sla: {priority: 2, owner: 'Release engineering', minutes: 25, atRiskMinutes: 35, target: 'Resolution', next: 'Review the release role and escalate if the fix will miss the deadline.'}
    },
    {
      id: 'CP-1091',
      title: 'PatchPilot host freeze',
      ticket: 'The Oracle database host stopped responding during an OpenSCAP STIG scan. The EC2 status check failed and no scan report came back.',
      scope: 'PatchPilot · historical AWS lab case · source: project README excerpt',
      source: {label: 'PatchPilot on GitHub', url: 'https://github.com/gkoufie1/patchpilot'},
      sources: [
        ['EC2 status check', 'README records an instance status check failure during the scan. Original telemetry is unavailable.'],
        ['OpenSCAP', 'No scan report returned. Compliance status: unknown.'],
        ['Database host', 'The README attributes the freeze to memory pressure while Oracle and the scan shared a 4 GB host with no swap.']
      ],
      action: 'patchpilot',
      options: [
        {value: 'compliant', label: 'Mark the host compliant because the previous scan passed', hint: 'No report means No result. A previous pass says nothing about the host’s current state.'},
        {value: 'rescan', label: 'Reboot the host and immediately rerun the scan', hint: 'That reproduces the same conditions without understanding them. Check memory and swap first or the host may freeze again.'},
        {value: 'patchpilot', label: 'Record the scan as No result and investigate host health'},
        {value: 'disable', label: 'Exclude this host from STIG scanning', hint: 'That removes compliance coverage instead of fixing the cause.'}
      ],
      finding: 'Record the scan as No result. The historical write-up points to memory pressure. For a new incident, correlate the failed status check with the scan and verify memory and swap before changing host sizing.',
      runbook: [
        {id: 'record', where: 'OpenSCAP → scan results', do: 'Record the missing report as No result. Keep the incident open until the scan returns a report.'},
        {id: 'health', where: 'AWS Console → EC2 → Instances → database host → Status checks', do: 'Compare the first failed check with the scan start time. After the host is reachable, check available memory and swap, and review any retained host metrics for pressure at the time of the incident.', code: 'free -h\nswapon --show'},
        {id: 'sizing', where: 'PatchPilot → database host configuration and scan scheduling', do: 'If evidence supports memory pressure, review sizing, swap, and scan priority. The lab moved from 4 GB to 8 GB, added swap, and lowered scan CPU and I/O priority. Size other hosts for their workload.'},
        {id: 'verify', where: 'Oracle health checks and OpenSCAP → verification', do: 'During an approved maintenance window, rerun the scan. Confirm the host stays reachable, Oracle remains healthy, and the scan produces a report.'}
      ],
      draft: 'Hi, the database host became unreachable during the compliance scan, and the scan did not return a report. We’re reviewing the host health checks and investigating memory pressure. We’ll verify database health before rerunning the scan and share the result once available.',
      sla: {priority: 3, owner: 'Linux operations', paused: true, target: 'Resolution', next: 'Check for the requested host metrics at the next shift handoff.'}
    },
    {
      id: 'CP-1102',
      title: 'RDS customer records missing',
      ticket: 'Customer records are missing after an accidental DELETE. The API is still responding. How do we restore and verify the data?',
      scope: 'Historical AWS SaaS SRE lab · DR Drill 002 · RDS PostgreSQL',
      source: {label: 'DR Drill 002 write-up', url: 'https://github.com/gkoufie1/aws-saas-sre-disaster-recovery-lab/blob/main/docs/dr/dr-drill-002-rds-pitr-results.md'},
      sources: [
        ['Grafana / API', 'Availability remained 100% while 166,721 customer records were missing.'],
        ['S3 backups', 'The first dump after deletion was 16.7% smaller. The archive was valid but contained incomplete data.'],
        ['RDS recovery', 'Lab restored to one second before the DELETE committed. Recovery took 15 min 52 s and recovered all pre-incident data. 2,372 later inserts were reconciled and 101 updates were lost.']
      ],
      action: 'recovery',
      options: [
        {value: 'dump', label: 'Restore the latest S3 dump over the production database', hint: 'The latest dump was taken after the deletion (16.7% smaller), and overwriting production destroys evidence and later legitimate writes.'},
        {value: 'none', label: 'No action needed: API availability is 100%', hint: 'Availability is not integrity. The API is serving incomplete data.'},
        {value: 'latest', label: 'Restore to the latest restorable time', hint: 'The latest restorable time is after the DELETE committed, so the restored copy would be missing the same records.'},
        {value: 'recovery', label: 'Confirm the deletion time and plan a point-in-time restore to a new RDS instance'}
      ],
      finding: 'This is a data integrity incident. Confirm the deletion time, restore to a separate RDS instance just before the transaction, and validate and reconcile data before changing the application endpoint.',
      runbook: [
        {id: 'timeline', where: 'Incident timeline → confirm the deletion', do: 'Confirm known customer IDs are missing and establish the DELETE commit time in UTC from available evidence. In the lab, the API stayed available while records were missing. Preserve the original database and coordinate write handling before cutover.'},
        {id: 'restore', where: 'AWS Console → RDS → Databases → source DB → Actions → Restore to point in time', do: 'Choose a recoverable UTC time before the bad transaction and restore to a new instance. The lab chose one second before the DELETE committed. Check the recovery window and use the verified timestamp for this incident.'},
        {id: 'reconcile', where: 'Restored database → validate and reconcile', do: 'Check known missing IDs, expected counts, and application reads. Compare legitimate writes made after the restore point and reconcile recoverable changes before cutover. Document any unrecovered data.'},
        {id: 'cutover', where: 'Application configuration → cut over and verify', do: 'Coordinate a write freeze and point the application to the validated instance through the approved release process. Verify reads and writes, retain the original instance for investigation, and record recovery duration and remaining data loss.'}
      ],
      draft: 'We confirmed that customer records are missing even though the API is responding. We’re preparing a point-in-time restore to a separate database and will verify the recovered records and reconcile subsequent changes before switching traffic. We’ll share the recovery result and any remaining data impact.',
      sla: {priority: 1, owner: 'Incident lead', major: true, minutes: 45, atRiskMinutes: 30, target: 'Resolution', next: 'Escalate immediately and coordinate database recovery.'}
    },
    {
      id: 'CP-1110',
      title: 'Portal certificate expired',
      ticket: 'Since midnight UTC, customers get a “connection is not private” warning on the customer portal. Nothing was deployed overnight.',
      scope: 'Sample client Bramble · AWS us-east-1 · ALB portal-prod → ECS portal-web',
      sources: [
        ['TLS check', 'curl https://portal.bramble.example\nSSL certificate problem: certificate has expired\nnotAfter=Nov 16 00:00:00 2026 GMT'],
        ['ALB listener', 'portal-prod · HTTPS:443\nDefault certificate · imported certificate (expired)\nTargets · 4/4 healthy'],
        ['AWS Certificate Manager', 'portal.bramble.example · Imported · Expired · In use: yes\nportal.bramble.example · Amazon issued · Issued · DNS validated · In use: no']
      ],
      action: 'cert',
      options: [
        {value: 'restart', label: 'Restart the portal-web ECS service', hint: 'TLS terminates at the ALB, and its targets are healthy. Restarting tasks will not change the certificate the listener presents.'},
        {value: 'cert', label: 'Attach the issued ACM certificate to the ALB HTTPS listener'},
        {value: 'request', label: 'Request a new certificate and wait for validation', hint: 'ACM already holds an issued, DNS-validated certificate for this name. It just isn’t attached to the listener.'},
        {value: 'http', label: 'Serve the portal over HTTP until a certificate is ready', hint: 'That removes encryption for customer traffic and does not fix the listener.'}
      ],
      finding: 'The listener still presents an imported certificate that expired at midnight. ACM does not renew imported certificates. A valid Amazon-issued certificate for the same name exists but is not in use. Attach it to the listener, then retire the imported one.',
      runbook: [
        {id: 'acm', where: 'AWS Console → Certificate Manager → Certificates (us-east-1)', do: 'Open the Amazon-issued certificate for portal.bramble.example. Confirm the status is Issued, the domain names cover the portal hostname, and it is in the same Region as the load balancer.'},
        {id: 'listener', where: 'AWS Console → EC2 → Load Balancers → portal-prod → Listeners → HTTPS:443 → Edit', do: 'Change the default SSL/TLS certificate to the issued ACM certificate and save. If the listener is managed in Terraform or CloudFormation, make the change there instead so the next apply does not revert it.'},
        {id: 'verify', where: 'Terminal → confirm the certificate being served', do: 'Check the subject and expiry date the portal now presents, then load the portal in a browser.', code: 'openssl s_client -connect portal.bramble.example:443 -servername portal.bramble.example </dev/null 2>/dev/null | openssl x509 -noout -subject -enddate'},
        {id: 'prevent', where: 'CloudWatch → Alarms → AWS/CertificateManager DaysToExpiry', do: 'Remove the expired imported certificate once nothing references it, and add a DaysToExpiry alarm (for example, below 30 days) for any certificate that ACM does not renew automatically.'}
      ],
      draft: 'Hi, the portal warning was caused by an expired certificate on the load balancer. We’re switching it to a valid, automatically renewed certificate and will confirm once customers can connect without the warning.',
      sla: {priority: 1, owner: 'Edge on-call', minutes: 12, atRiskMinutes: 15, target: 'First response', next: 'Acknowledge, post a status page update, and swap the listener certificate.'}
    },
    {
      id: 'CP-1117',
      title: 'Terraform state locked',
      ticket: 'Our network change pipeline has failed twice with “Error acquiring the state lock”. Nobody on the team is running Terraform right now.',
      scope: 'Sample client Alder · GitHub Actions → Terraform · S3 backend with DynamoDB locking',
      sources: [
        ['GitHub Actions · Run 2203', 'terraform plan\nError acquiring the state lock\nLock Info:\n  ID: 3f6b2c1e-9a4d-4e8b-b1f2-6c0d7e5a9b14\n  Operation: OperationTypeApply\n  Who: runner@gh-runner-7\n  Created: 2026-11-16 09:12:04 UTC'],
        ['GitHub Actions · Run 2198', 'terraform apply · started 09:12:03 UTC\nRun cancelled at 09:14:40 UTC (superseded by a newer push)\nNo apply is in progress for this workspace'],
        ['DynamoDB lock table', 'Item network/prod/terraform.tfstate\nInfo · ID 3f6b2c1e-9a4d-4e8b-b1f2-6c0d7e5a9b14\nNo newer lock items']
      ],
      action: 'unlock',
      options: [
        {value: 'nolock', label: 'Rerun the pipeline with -lock=false', hint: 'That disables state protection for every run and risks concurrent writes corrupting state.'},
        {value: 'droptable', label: 'Delete the DynamoDB lock table', hint: 'That removes locking for every workspace that shares the table. Only one stale item needs to go.'},
        {value: 'wait', label: 'Wait for the lock to time out', hint: 'Terraform state locks do not expire. The lock stays until it is released or force-unlocked.'},
        {value: 'unlock', label: 'Confirm no run holds the lock, then force-unlock with the recorded lock ID and review the plan'}
      ],
      finding: 'Run 2198 was cancelled mid-apply and left a stale lock (ID 3f6b2c1e…). After confirming nothing else is applying, release that specific lock, then review the plan for changes the interrupted apply may have partly made.',
      runbook: [
        {id: 'confirm', where: 'GitHub → Actions → workflows that apply network/prod', do: 'Confirm no run is in progress or queued for this workspace and that the lock ID in Run 2203 matches the cancelled Run 2198. Do not unlock while any apply could still be writing state.'},
        {id: 'unlock', where: 'Terminal → network/prod working directory with the same backend configuration', do: 'Release only the recorded lock.', code: 'terraform init\nterraform force-unlock 3f6b2c1e-9a4d-4e8b-b1f2-6c0d7e5a9b14'},
        {id: 'plan', where: 'GitHub → Actions → rerun the network pipeline', do: 'Review the plan carefully. The cancelled apply may have created or changed some resources, so expect differences beyond the original change and confirm each one before applying.'},
        {id: 'prevent', where: 'GitHub → workflow file for the network pipeline', do: 'Add a concurrency group so a new push queues behind a running apply instead of cancelling it.', code: 'concurrency:\n  group: terraform-network-prod\n  cancel-in-progress: false'}
      ],
      draft: 'Hi, the pipeline was blocked by a lock left behind when an earlier run was cancelled during an apply. We’ve confirmed no other change is in progress and are releasing that lock, then reviewing the plan before applying. We’re also updating the pipeline so runs queue instead of being cancelled.',
      sla: {priority: 3, owner: 'Platform engineering', minutes: 3, atRiskMinutes: 10, target: 'First response', next: 'Acknowledge and confirm whether any apply is still running.'}
    },
    {
      id: 'CP-1123',
      title: 'Orders API database timeouts',
      ticket: 'After yesterday’s network change, the orders service returns 500 errors. Application logs show database connection timeouts.',
      scope: 'Sample client Northwind · AWS us-east-1 · ECS orders-api → RDS PostgreSQL orders-db',
      sources: [
        ['ECS orders-api logs', 'connect ETIMEDOUT 10.20.3.41:5432\nTask security group · sg-0b27e9 (orders-app-v2)\nDeployed with network change PR #418'],
        ['VPC Flow Logs', '10.20.1.87 → 10.20.3.41:5432 · REJECT\n10.20.1.92 → 10.20.3.41:5432 · REJECT'],
        ['RDS orders-db', 'CPU 7% · DatabaseConnections dropped to 0\nSecurity group sg-rds-orders inbound:\n  TCP 5432 from sg-0a14c3 (orders-app, retired in PR #418)']
      ],
      action: 'sg',
      options: [
        {value: 'password', label: 'Rotate the database password', hint: 'An authentication problem would return an error from PostgreSQL. These are timeouts and the flow logs show REJECT, so packets never reach the database.'},
        {value: 'sg', label: 'Allow PostgreSQL from the new app security group on the RDS security group'},
        {value: 'open', label: 'Open port 5432 to 0.0.0.0/0 on the RDS security group', hint: 'That exposes the database to every address that can route to it. Reference the app security group instead.'},
        {value: 'scale', label: 'Scale up the RDS instance', hint: 'CPU is 7% and connections dropped to zero. The database is idle because traffic is being blocked, not overloaded.'}
      ],
      finding: 'PR #418 moved the orders tasks to a new security group, but the RDS inbound rule still references the retired one. Flow logs confirm the traffic is rejected. Update the RDS rule to allow 5432 from sg-0b27e9 through the same Terraform change process.',
      runbook: [
        {id: 'confirm', where: 'AWS Console → VPC → Security groups → sg-rds-orders → Inbound rules', do: 'Confirm the only 5432 rule references sg-0a14c3 and that the running orders-api tasks use sg-0b27e9.'},
        {id: 'fix', where: 'GitHub → network Terraform → RDS security group rule', do: 'Update the source security group of the PostgreSQL rule and open a pull request. Apply through the normal pipeline.', code: 'Before: source_security_group_id = aws_security_group.orders_app.id      # sg-0a14c3\nAfter:  source_security_group_id = aws_security_group.orders_app_v2.id   # sg-0b27e9'},
        {id: 'verify', where: 'CloudWatch → orders-api 5xx rate and RDS DatabaseConnections', do: 'Confirm connections recover, the 5xx rate returns to baseline, and new flow log records for port 5432 show ACCEPT.'},
        {id: 'prevent', where: 'GitHub → PR #418 follow-up', do: 'Reference security groups by Terraform resource rather than hard-coded IDs, and add a post-deploy check that the orders service can reach its database.'}
      ],
      draft: 'Hi, the 500 errors were caused by yesterday’s network change: the database firewall rule still pointed at the service’s old network identity, so connections were blocked. We’re updating the rule through our normal change process and will confirm once the error rate is back to normal.',
      sla: {priority: 2, owner: 'Unassigned', minutes: 40, atRiskMinutes: 20, target: 'First response', next: 'Assign an owner and check recent network changes.'}
    }
  ];
});
