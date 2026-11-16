const test = require('node:test');
const assert = require('node:assert/strict');
const cases = require('../cases.js');
const {buildReport} = require('../report.js');

const caseData = cases[0];
const run = {
  caseData,
  mode: 'manual',
  wrongLabels: ['Wait for the rollout to recover on its own'],
  startedAt: Date.UTC(2026, 10, 16, 9, 0, 0),
  solvedAt: Date.UTC(2026, 10, 16, 9, 3, 25),
  notes: {ecr: 'Tag list was paginated;\nhad to search.'},
  draft: 'Hello customer.'
};

test('report covers the investigation', () => {
  const md = buildReport(run);
  assert.match(md, /^# CP-1042 · Checkout rollout stalled/);
  assert.match(md, /\*\*Attempts:\*\* 2/);
  assert.match(md, /\(3 min 25 s\)/);
  assert.match(md, /Ruled out first:\n\n- Wait for the rollout/);
  assert.ok(md.includes(caseData.options.find(o => o.value === caseData.action).label));
  assert.match(md, /\*What I saw instead:\* Tag list was paginated; had to search\./);
  assert.match(md, /> Hello customer\./);
  for (const step of caseData.runbook) assert.ok(md.includes(step.where));
});

test('first-try solves have no ruled-out section', () => {
  const md = buildReport({...run, wrongLabels: [], notes: {}});
  assert.doesNotMatch(md, /Ruled out first/);
  assert.match(md, /\*\*Attempts:\*\* 1/);
});
