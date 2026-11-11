const runbooks = {
  tag: [
    ['GitHub → Actions → Run 1842', 'Open the build-and-push step. Confirm commit 8c40f17 and the published tag checkout-api:8c40f17.'],
    ['AWS Console → Amazon ECR → Repositories → checkout-api', 'In us-east-1, find tag 8c40f17 and copy its image digest. Confirm the artifact belongs to the intended release and that release-1842 is absent.'],
    ['GitHub → deployment configuration for production/checkout-api', 'Find the image field for the checkout-api container in the manifest or Helm values that your pipeline actually deploys. Replace the existing registry/repository:release-1842 with the same registry/repository@sha256:<digest copied from ECR>. Open a pull request and deploy through the normal release workflow. The sample does not specify a file path or digest.'],
    ['EKS → production namespace → checkout-api deployment', 'From the intended cluster context, run the command below. Confirm the new pods are Ready, use the expected image digest, and pass the checkout smoke test before updating the customer.', 'kubectl -n production rollout status deployment/checkout-api --timeout=5m']
  ],
  role: [
    ['GitHub → Actions → Run 1851', 'Open Configure AWS credentials. Confirm the role configured for the release, the AccessDenied message, and the workflow subject repo:alder/billing-api:ref:refs/heads/main.'],
    ['AWS Console → IAM → Roles → release role → Trust relationships', 'After confirming that the new repository is authorized, update the GitHub OIDC subject in the matching trust statement. Preserve the other conditions and review the change in infrastructure code if it manages this role.', 'Before: repo:alder/legacy-billing:ref:refs/heads/main\nAfter:  repo:alder/billing-api:ref:refs/heads/main'],
    ['GitHub → Actions → Run 1851 → Re-run jobs', 'After the approved trust change is applied, rerun the failed workflow. Confirm the credentials step succeeds and the billing-api:41f93ae image appears in ECR.'],
    ['EKS → production namespace → billing-api deployment', 'Confirm the new release rolled out and the application passes its smoke test before updating the customer.', 'kubectl -n production rollout status deployment/billing-api --timeout=5m']
  ],
  patchpilot: [
    ['OpenSCAP → scan results', 'Record the missing report as No result. Keep the incident open until the scan returns a report.'],
    ['AWS Console → EC2 → Instances → database host → Status checks', 'Compare the first failed check with the scan start time. After the host is reachable, check available memory and swap, and review any retained host metrics for pressure at the time of the incident.', 'free -h\nswapon --show'],
    ['PatchPilot → database host configuration and scan scheduling', 'If evidence supports memory pressure, review sizing, swap, and scan priority. The lab moved from 4 GB to 8 GB, added swap, and lowered scan CPU and I/O priority. Size other hosts for their workload.'],
    ['Oracle health checks and OpenSCAP → verification', 'During an approved maintenance window, rerun the scan. Confirm the host stays reachable, Oracle remains healthy, and the scan produces a report.']
  ],
  recovery: [
    ['Incident timeline → confirm the deletion', 'Confirm known customer IDs are missing and establish the DELETE commit time in UTC from available evidence. In the lab, the API stayed available while records were missing. Preserve the original database and coordinate write handling before cutover.'],
    ['AWS Console → RDS → Databases → source DB → Actions → Restore to point in time', 'Choose a recoverable UTC time before the bad transaction and restore to a new instance. The lab chose one second before the DELETE committed. Check the recovery window and use the verified timestamp for this incident.'],
    ['Restored database → validate and reconcile', 'Check known missing IDs, expected counts, and application reads. Compare legitimate writes made after the restore point and reconcile recoverable changes before cutover. Document any unrecovered data.'],
    ['Application configuration → cut over and verify', 'Coordinate a write freeze and point the application to the validated instance through the approved release process. Verify reads and writes, retain the original instance for investigation, and record recovery duration and remaining data loss.']
  ]
};

function renderRunbook({id, action}) {
  const list = el('solution-steps');
  list.replaceChildren();
  for (const [index, [location, instruction, exactValue]] of runbooks[action].entries()) {
    const step = document.createElement('li');
    const heading = document.createElement('h3');
    const description = document.createElement('p');
    heading.textContent = location;
    description.textContent = instruction;
    step.append(heading, description);
    if (exactValue) {
      const code = document.createElement('code');
      code.textContent = exactValue;
      step.append(code);
    }
    const label = document.createElement('label');
    const note = document.createElement('textarea');
    const status = document.createElement('small');
    const noteId = 'step-note-' + index;
    const storageKey = 'corporate-pet:' + id + ':' + index;
    label.htmlFor = noteId;
    label.textContent = 'What I see instead';
    note.id = noteId;
    note.rows = 2;
    note.placeholder = 'Describe the menu, screen, or error you see.';
    note.setAttribute('aria-describedby', noteId + '-status');
    status.id = noteId + '-status';
    try {
      note.value = localStorage.getItem(storageKey) || '';
    } catch {
      status.textContent = 'Browser storage is unavailable.';
    }
    note.addEventListener('input', () => {
      try {
        if (note.value) localStorage.setItem(storageKey, note.value);
        else localStorage.removeItem(storageKey);
        status.textContent = note.value ? 'Saved in this browser.' : '';
      } catch {
        status.textContent = 'This note could not be saved.';
      }
    });
    step.append(label, note, status);
    list.append(step);
  }
  el('solution').hidden = false;
}

const cases = [
  {
    id: 'CP-1042',
    ticket: 'The new checkout deployment has stalled. GitHub Actions finished successfully, but the new pods never became ready.',
    scope: 'Sample client Northwind · AWS us-east-1 · EKS production/checkout-api',
    sources: [
      ['GitHub Actions', 'Run 1842 · commit 8c40f17 · build-and-push succeeded\nPublished checkout-api:8c40f17'],
      ['Amazon ECR', 'checkout-api:8c40f17 · image present\ncheckout-api:release-1842 · ImageNotFoundException'],
      ['Amazon EKS', 'Deployment image checkout-api:release-1842\nPod event · manifest unknown\nPod status · ImagePullBackOff']
    ],
    action: 'tag',
    finding: 'The rollout references release-1842, which is absent from ECR. The pipeline published 8c40f17. Verify that this is the intended release artifact, then review a deployment update to use its immutable digest.',
    draft: 'Hi, we traced the stalled checkout rollout to an image reference that does not match the published release artifact. We’re reviewing the intended image before updating the deployment. We’ll confirm rollout health and share another update once verification is complete.'
  },
  {
    id: 'CP-1079',
    ticket: 'The billing release failed in GitHub Actions. The team reports that the previous deployment is still running.',
    scope: 'Sample client Alder · AWS us-east-1 · EKS production/billing-api',
    sources: [
      ['GitHub Actions', 'Run 1851 · commit 41f93ae\nConfigure AWS credentials · AccessDenied for AssumeRoleWithWebIdentity\nOIDC subject · repo:alder/billing-api:ref:refs/heads/main'],
      ['Amazon ECR / IAM', 'billing-api:41f93ae · absent\nRelease role trust · repo:alder/legacy-billing:ref:refs/heads/main\nBuild-and-push step · skipped'],
      ['Amazon EKS', 'Deployment image billing-api:3c915d2\nExisting replicas · 3/3 ready\nNo new rollout observed']
    ],
    action: 'role',
    finding: 'The AWS role trusts the old repository, so the workflow could not authenticate. The image was never published and EKS stayed on the previous deployment. Review the approved repository and branch, then correct the scoped trust and rerun the workflow.',
    draft: 'Hi, the new billing release stopped during pipeline authentication before it reached the cluster. The previous release remains active, and its replicas are reporting ready. We’re reviewing the deployment identity configuration and will verify the rollout after the pipeline is rerun.'
  },
  {
    id: 'CP-1091',
    ticket: 'The Oracle database host stopped responding during an OpenSCAP STIG scan. The EC2 status check failed and no scan report came back.',
    scope: 'PatchPilot · historical AWS lab case · source: project README excerpt',
    sources: [
      ['EC2 status check', 'README records an instance status check failure during the scan. Original telemetry is unavailable.'],
      ['OpenSCAP', 'No scan report returned. Compliance status: unknown.'],
      ['Database host', 'The README attributes the freeze to memory pressure while Oracle and the scan shared a 4 GB host with no swap.']
    ],
    action: 'patchpilot',
    finding: 'Record the scan as No result. The historical write-up points to memory pressure. For a new incident, correlate the failed status check with the scan and verify memory and swap before changing host sizing.',
    draft: 'Hi, the database host became unreachable during the compliance scan, and the scan did not return a report. We’re reviewing the host health checks and investigating memory pressure. We’ll verify database health before rerunning the scan and share the result once available.'
  },
  {
    id: 'CP-1102',
    ticket: 'Customer records are missing after an accidental DELETE. The API is still responding. How do we restore and verify the data?',
    scope: 'Historical AWS SaaS SRE lab · DR Drill 002 · RDS PostgreSQL',
    sources: [
      ['Grafana / API', 'Availability remained 100% while 166,721 customer records were missing.'],
      ['S3 backups', 'The first dump after deletion was 16.7% smaller. The archive was valid but contained incomplete data.'],
      ['RDS recovery', 'Lab restored to one second before the DELETE committed. Recovery took 15 min 52 s and recovered all pre-incident data. 2,372 later inserts were reconciled and 101 updates were lost.']
    ],
    action: 'recovery',
    finding: 'This is a data integrity incident. Confirm the deletion time, restore to a separate RDS instance just before the transaction, and validate and reconcile data before changing the application endpoint.',
    draft: 'We confirmed that customer records are missing even though the API is responding. We’re preparing a point-in-time restore to a separate database and will verify the recovered records and reconcile subsequent changes before switching traffic. We’ll share the recovery result and any remaining data impact.'
  }
];

const el = id => document.getElementById(id);
let trial;

function start() {
  const mode = el('mode').value;
  const sample = cases[Number(el('sample').value)];
  trial = {mode, sample};
  el('ticket').textContent = sample.id + ' · ' + sample.ticket;
  el('scope').textContent = sample.scope;
  el('workspace').hidden = false;
  el('draft-box').hidden = true;
  el('solution').hidden = true;
  el('feedback').textContent = el('copy-status').textContent = '';
  el('action').value = '';
  el('action').disabled = el('submit').disabled = false;
  el('start').disabled = el('sample').disabled = el('mode').disabled = true;
  el('cancel').disabled = false;
  el('sources').replaceChildren();
  for (const [name, record] of sample.sources) {
    const card = document.createElement('article');
    const details = document.createElement('details');
    const summary = document.createElement('summary');
    const code = document.createElement('code');
    summary.textContent = name;
    code.textContent = record;
    details.open = mode === 'assisted';
    details.append(summary, code);
    card.append(details);
    el('sources').append(card);
  }
  el('finding').hidden = mode === 'manual';
  el('finding').textContent = mode === 'assisted' ? sample.finding : '';
  if (mode === 'assisted') renderRunbook(sample);
}

function stop() {
  trial = null;
  el('start').disabled = el('sample').disabled = el('mode').disabled = false;
  el('cancel').disabled = el('action').disabled = el('submit').disabled = true;
}

el('start').onclick = start;
el('cancel').onclick = () => {
  stop();
  el('workspace').hidden = true;
  el('ticket').textContent = 'Investigation closed. Open a sample ticket to continue.';
  el('scope').textContent = '';
};
el('action-form').onsubmit = event => {
  event.preventDefault();
  if (!trial) return;
  if (el('action').value !== trial.sample.action) {
    el('feedback').textContent = 'That action is unsupported by the evidence. Review the records and try again.';
    return;
  }
  const {mode, sample} = trial;
  stop();
  el('feedback').textContent = 'Correct action selected.';
  if (mode === 'manual') renderRunbook(sample);
  if (mode === 'assisted') {
    el('draft').value = sample.draft;
    el('draft-box').hidden = false;
  }
};
el('copy').onclick = async () => {
  try {
    await navigator.clipboard.writeText(el('draft').value);
    el('copy-status').textContent = 'Draft copied.';
  } catch {
    el('draft').select();
    el('copy-status').textContent = 'Draft selected. Copy it using your keyboard.';
  }
};

const slaExamples = [
  {sample: 2, title: 'PatchPilot host freeze', priority: 3, owner: 'Linux operations', paused: true, target: 'Resolution', next: 'Check for the requested host metrics at the next shift handoff.'},
  {sample: 0, title: 'Checkout rollout stalled', priority: 3, owner: 'Unassigned', minutes: 8, expectedMinutes: 10, target: 'First response', next: 'Assign an owner and acknowledge the ticket.'},
  {sample: 1, title: 'Billing pipeline failed', priority: 2, owner: 'Release engineering', minutes: 25, expectedMinutes: 35, target: 'Resolution', next: 'Review the release role and escalate if the fix will miss the deadline.'},
  {sample: 3, title: 'RDS customer records missing', priority: 1, owner: 'Incident lead', major: true, minutes: 45, expectedMinutes: 30, target: 'Resolution', next: 'Escalate immediately and coordinate database recovery.'}
];

function slaRank(ticket) {
  if (ticket.major) return 0;
  if (ticket.paused) return 4;
  if (ticket.minutes <= 0) return 1;
  if (ticket.minutes <= ticket.expectedMinutes) return 2;
  return 3;
}

function slaStatus(ticket) {
  if (ticket.paused) return 'Paused · awaiting customer evidence';
  if (ticket.minutes <= 0) return 'Breached';
  const remaining = ticket.minutes + ' min left';
  if (ticket.major) return 'Major incident · ' + remaining;
  return ticket.minutes <= ticket.expectedMinutes ? 'At risk · ' + remaining : remaining;
}

const slaQueue = [...slaExamples].sort((a, b) =>
  slaRank(a) - slaRank(b) ||
  (slaRank(a) === 3 ? a.priority - b.priority : 0) ||
  (a.minutes ?? Infinity) - (b.minutes ?? Infinity) ||
  a.priority - b.priority
);

for (const ticket of slaQueue) {
  const row = el('sla-rows').insertRow();
  const open = document.createElement('button');
  open.type = 'button';
  open.textContent = cases[ticket.sample].id + ' · ' + ticket.title;
  open.onclick = () => {
    if (trial) el('cancel').click();
    el('sample').value = String(ticket.sample);
    el('mode').value = 'assisted';
    start();
    el('ticket').scrollIntoView({block: 'center'});
  };
  row.insertCell().append(open);
  row.insertCell().textContent = 'P' + ticket.priority + ' · ' + ticket.owner;
  const target = row.insertCell();
  target.textContent = ticket.target;
  const status = document.createElement('small');
  status.textContent = slaStatus(ticket);
  if (slaRank(ticket) <= 2) status.className = 'sla-urgent';
  target.append(status);
  row.insertCell().textContent = ticket.next;
}
