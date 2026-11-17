// Writes backend/src/guided_backend/runbooks.json from cases.js so the website
// and the backend share one source of runbooks. Run after editing cases.js:
//   npm run export-runbooks
// tests/runbooks.test.js fails if the committed JSON is out of date.
const fs = require('node:fs');
const path = require('node:path');
const cases = require('../cases.js');

const OUTPUT = path.join(__dirname, '..', 'backend', 'src', 'guided_backend', 'runbooks.json');

function toRunbook(c) {
  return {
    id: c.id,
    title: c.title,
    signals: c.signals,
    finding: c.finding,
    action: c.options.find(o => o.value === c.action).label,
    ruled_out: c.options.filter(o => o.value !== c.action).map(o => ({label: o.label, hint: o.hint})),
    steps: c.runbook.map(s => ({where: s.where, do: s.do, ...(s.code ? {code: s.code} : {})}))
  };
}

function render() {
  return JSON.stringify(cases.map(toRunbook), null, 2) + '\n';
}

if (require.main === module) {
  fs.writeFileSync(OUTPUT, render());
  console.log('Wrote ' + path.relative(process.cwd(), OUTPUT));
}

module.exports = {render, OUTPUT};
