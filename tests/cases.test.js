const test = require('node:test');
const assert = require('node:assert/strict');
const cases = require('../cases.js');

test('case ids are unique', () => {
  assert.equal(new Set(cases.map(c => c.id)).size, cases.length);
});

for (const c of cases) {
  test(c.id + ' is well formed', () => {
    for (const field of ['title', 'ticket', 'scope', 'finding', 'draft']) assert.ok(c[field], field + ' is set');
    assert.ok(c.sources.length >= 2, 'has evidence');

    const values = c.options.map(o => o.value);
    assert.equal(new Set(values).size, values.length, 'option values are unique');
    assert.equal(values.filter(v => v === c.action).length, 1, 'exactly one option is the answer');
    assert.ok(c.options.length >= 3, 'has at least two distractors');
    for (const o of c.options) {
      if (o.value !== c.action) assert.ok(o.hint, 'wrong option "' + o.value + '" explains why');
    }

    const stepIds = c.runbook.map(s => s.id);
    assert.equal(new Set(stepIds).size, stepIds.length, 'runbook step ids are unique');
    for (const s of c.runbook) assert.ok(s.where && s.do, 'step ' + s.id + ' has a location and instruction');

    assert.ok(c.sla && c.sla.target && c.sla.next, 'has an SLA entry');
    if (!c.sla.paused) assert.ok(c.sla.minutes > 0 && c.sla.atRiskMinutes > 0, 'running SLA has times');
    if (c.source) assert.match(c.source.url, /^https:\/\//);
  });
}
