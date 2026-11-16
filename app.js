const cases = window.GuidedCases;
const {rankQueue, slaRank, slaStatus, RANK} = window.GuidedSLA;
const {buildReport} = window.GuidedReport;

const el = id => document.getElementById(id);
const STORAGE_PREFIX = 'corporate-pet:';
const PROGRESS_KEY = STORAGE_PREFIX + 'progress';

let trial = null;   // investigation in progress
let lastRun = null; // most recently solved investigation, for the report

// ---------- storage ----------

function storageGet(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}

function storageSet(key, value) {
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

const noteKey = (caseId, stepId) => STORAGE_PREFIX + caseId + ':' + stepId;

// Notes used to be keyed by step position. Move them to step ids once so they
// stay attached to the right step if a runbook is reordered.
function migrateIndexedNotes() {
  for (const c of cases) {
    c.runbook.forEach((step, index) => {
      const oldKey = noteKey(c.id, index);
      const old = storageGet(oldKey);
      if (old === null) return;
      if (storageGet(noteKey(c.id, step.id)) === null) storageSet(noteKey(c.id, step.id), old);
      storageSet(oldKey, '');
    });
  }
}

function loadProgress() {
  try { return JSON.parse(storageGet(PROGRESS_KEY)) || {}; } catch { return {}; }
}

function recordSolve(run) {
  const progress = loadProgress();
  const seconds = Math.round((run.solvedAt - run.startedAt) / 1000);
  const entry = progress[run.caseData.id];
  if (entry) entry.completions += 1;
  else progress[run.caseData.id] = {firstTry: run.wrongLabels.length === 0, seconds, completions: 1};
  storageSet(PROGRESS_KEY, JSON.stringify(progress));
}

// ---------- progress panel ----------

function renderProgress() {
  const progress = loadProgress();
  const solved = cases.filter(c => progress[c.id]);
  el('stat-solved').textContent = solved.length + '/' + cases.length;
  if (solved.length) {
    const firstTry = solved.filter(c => progress[c.id].firstTry).length;
    const avgSeconds = solved.reduce((sum, c) => sum + progress[c.id].seconds, 0) / solved.length;
    el('stat-accuracy').textContent = Math.round(firstTry / solved.length * 100) + '%';
    el('stat-time').textContent = Math.floor(avgSeconds / 60) + 'm ' + Math.round(avgSeconds % 60) + 's';
  } else {
    el('stat-accuracy').textContent = el('stat-time').textContent = '–';
  }
  el('solved-list').replaceChildren(...cases.map(c => {
    const item = document.createElement('li');
    const done = Boolean(progress[c.id]);
    item.className = done ? 'done' : '';
    item.textContent = c.id + (done ? ' ✓ solved' : ' · open');
    return item;
  }));
  const selected = el('sample').value;
  el('sample').replaceChildren(...cases.map((c, index) => {
    const option = document.createElement('option');
    option.value = String(index);
    option.textContent = c.id + ' · ' + c.title + (progress[c.id] ? ' ✓' : '');
    return option;
  }));
  if (selected) el('sample').value = selected;
}

el('reset-progress').onclick = () => {
  if (!confirm('Clear solved cases and stats? Step notes are kept.')) return;
  storageSet(PROGRESS_KEY, '');
  renderProgress();
  el('progress-status').textContent = 'Progress cleared. Step notes were kept.';
};

// ---------- investigation ----------

function renderRunbook(caseData) {
  const list = el('solution-steps');
  list.replaceChildren();
  for (const step of caseData.runbook) {
    const item = document.createElement('li');
    const heading = document.createElement('h3');
    const description = document.createElement('p');
    heading.textContent = step.where;
    description.textContent = step.do;
    item.append(heading, description);
    if (step.code) {
      const code = document.createElement('code');
      code.textContent = step.code;
      item.append(code);
    }
    const label = document.createElement('label');
    const note = document.createElement('textarea');
    const status = document.createElement('small');
    const noteId = 'step-note-' + step.id;
    const key = noteKey(caseData.id, step.id);
    label.htmlFor = noteId;
    label.textContent = 'What I see instead';
    note.id = noteId;
    note.rows = 2;
    note.placeholder = 'Describe the menu, screen, or error you see.';
    note.setAttribute('aria-describedby', noteId + '-status');
    status.id = noteId + '-status';
    note.value = storageGet(key) || '';
    note.addEventListener('input', () => {
      if (storageSet(key, note.value)) status.textContent = note.value ? 'Saved in this browser.' : '';
      else status.textContent = 'This note could not be saved.';
    });
    item.append(label, note, status);
    list.append(item);
  }
  el('solution').hidden = false;
}

function start() {
  const mode = el('mode').value;
  const caseData = cases[Number(el('sample').value)];
  trial = {mode, caseData, wrongLabels: [], startedAt: Date.now()};

  el('ticket').textContent = caseData.id + ' · ' + caseData.ticket;
  el('scope').textContent = caseData.scope;
  el('source').hidden = !caseData.source;
  if (caseData.source) {
    const link = document.createElement('a');
    link.href = caseData.source.url;
    link.textContent = caseData.source.label;
    link.target = '_blank';
    link.rel = 'noopener';
    el('source').replaceChildren('Source: ', link);
  }

  el('workspace').hidden = false;
  el('draft-box').hidden = el('report-box').hidden = el('solution').hidden = true;
  el('feedback').textContent = el('copy-status').textContent = el('report-status').textContent = '';
  el('feedback').className = '';

  const placeholder = new Option('Choose the action supported by the records', '');
  el('action').replaceChildren(placeholder, ...caseData.options.map(o => new Option(o.label, o.value)));
  el('action').disabled = el('submit').disabled = false;
  el('start').disabled = el('sample').disabled = el('mode').disabled = true;
  el('cancel').disabled = false;

  el('sources').replaceChildren(...caseData.sources.map(([name, record]) => {
    const card = document.createElement('article');
    const details = document.createElement('details');
    const summary = document.createElement('summary');
    const code = document.createElement('code');
    summary.textContent = name;
    code.textContent = record;
    details.open = mode === 'guided';
    details.append(summary, code);
    card.append(details);
    return card;
  }));

  el('finding').hidden = mode === 'manual';
  el('finding').textContent = caseData.finding;
  if (mode === 'guided') renderRunbook(caseData);
  el('ticket-heading').focus();
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
  el('source').hidden = true;
};

el('action-form').onsubmit = event => {
  event.preventDefault();
  if (!trial) return;
  const choice = trial.caseData.options.find(o => o.value === el('action').value);
  if (!choice) return;
  if (choice.value !== trial.caseData.action) {
    if (!trial.wrongLabels.includes(choice.label)) trial.wrongLabels.push(choice.label);
    el('feedback').className = 'feedback-wrong';
    el('feedback').textContent = 'Not supported by the evidence. ' + choice.hint;
    return;
  }

  lastRun = {...trial, solvedAt: Date.now()};
  stop();
  recordSolve(lastRun);
  renderProgress();

  const {caseData, mode} = lastRun;
  el('feedback').className = 'feedback-right';
  el('feedback').textContent = 'Correct action selected.' + (mode === 'manual' ? ' The finding and runbook are now shown.' : '');
  el('finding').hidden = false;
  if (mode === 'manual') renderRunbook(caseData);
  el('draft').value = caseData.draft;
  el('draft-box').hidden = el('report-box').hidden = false;
  if (mode === 'manual') el('solution-heading').focus();
};

// ---------- copy and report ----------

async function copyText(text, statusId, fallbackMessage) {
  try {
    await navigator.clipboard.writeText(text);
    el(statusId).textContent = 'Copied.';
    return true;
  } catch {
    el(statusId).textContent = fallbackMessage;
    return false;
  }
}

el('copy').onclick = async () => {
  if (!await copyText(el('draft').value, 'copy-status', 'Draft selected. Copy it using your keyboard.')) el('draft').select();
};

function currentReport() {
  const notes = {};
  for (const step of lastRun.caseData.runbook) notes[step.id] = storageGet(noteKey(lastRun.caseData.id, step.id)) || '';
  return buildReport({...lastRun, notes, draft: el('draft').value});
}

el('copy-report').onclick = () => {
  if (lastRun) copyText(currentReport(), 'report-status', 'Clipboard unavailable. Use Download instead.');
};

el('download-report').onclick = () => {
  if (!lastRun) return;
  const url = URL.createObjectURL(new Blob([currentReport()], {type: 'text/markdown'}));
  const link = document.createElement('a');
  link.href = url;
  link.download = lastRun.caseData.id + '-incident-report.md';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  el('report-status').textContent = 'Report downloaded.';
};

// ---------- live SLA queue ----------

const clock = {base: 0, since: Date.now(), speed: 1};
const elapsedMinutes = () => clock.base + (Date.now() - clock.since) / 60000 * clock.speed;

el('sla-speed').onchange = () => {
  clock.base = elapsedMinutes();
  clock.since = Date.now();
  clock.speed = Number(el('sla-speed').value);
  renderQueue();
};

const slaTickets = cases.map((c, index) => ({...c.sla, id: c.id, title: c.title, index}));
const slaRows = new Map();

for (const ticket of slaTickets) {
  const row = document.createElement('tr');
  const open = document.createElement('button');
  open.type = 'button';
  open.textContent = ticket.id + ' · ' + ticket.title;
  open.onclick = () => {
    if (trial) el('cancel').click();
    el('sample').value = String(ticket.index);
    start();
  };
  const target = document.createElement('td');
  const status = document.createElement('small');
  target.append(ticket.target, status);
  const cells = [document.createElement('td'), document.createElement('td'), target, document.createElement('td')];
  cells[0].append(open);
  cells[1].textContent = 'P' + ticket.priority + ' · ' + ticket.owner;
  cells[3].textContent = ticket.next;
  row.append(...cells);
  slaRows.set(ticket.id, {row, status});
}

function renderQueue() {
  const body = el('sla-rows');
  const queue = rankQueue(slaTickets, elapsedMinutes());
  queue.forEach((ticket, position) => {
    const {row, status} = slaRows.get(ticket.id);
    const rank = slaRank(ticket);
    status.textContent = slaStatus(ticket);
    status.className = !ticket.paused && ticket.remaining <= 0 ? 'sla-breached' : rank <= RANK.atRisk ? 'sla-urgent' : '';
    // Only move rows when the order changes, so keyboard focus isn't disturbed every tick.
    if (body.children[position] !== row) body.insertBefore(row, body.children[position] || null);
  });
}

// ---------- boot ----------

migrateIndexedNotes();
renderProgress();
renderQueue();
setInterval(renderQueue, 1000);
