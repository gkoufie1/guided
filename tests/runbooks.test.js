const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const cases = require('../cases.js');
const {render, OUTPUT} = require('../scripts/export-runbooks.js');

test('backend runbooks.json matches cases.js (run npm run export-runbooks)', () => {
  assert.equal(fs.readFileSync(OUTPUT, 'utf8').replace(/\r\n/g, '\n'), render());
});

for (const c of cases) {
  test(c.id + ' has usable matching signals', () => {
    assert.ok(Array.isArray(c.signals) && c.signals.length >= 3, 'at least three signals');
    for (const s of c.signals) assert.equal(s, s.toLowerCase().trim(), 'signal "' + s + '" is lowercase and trimmed');
    assert.equal(new Set(c.signals).size, c.signals.length, 'signals are unique');
  });
}
