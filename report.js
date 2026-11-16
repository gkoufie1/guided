// Builds a Markdown incident report from a solved investigation.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.GuidedReport = api;
})(typeof self !== 'undefined' ? self : this, function () {
  function quote(text) {
    return text.split('\n').map(line => '> ' + line).join('\n');
  }

  function fence(text) {
    return '```\n' + text + '\n```';
  }

  function duration(ms) {
    const seconds = Math.max(0, Math.round(ms / 1000));
    return Math.floor(seconds / 60) + ' min ' + (seconds % 60) + ' s';
  }

  // run: {caseData, mode, wrongLabels, startedAt, solvedAt, notes, draft}
  // notes maps runbook step id → note text.
  function buildReport(run) {
    const c = run.caseData;
    const chosen = c.options.find(option => option.value === c.action);
    const lines = [
      '# ' + c.id + ' · ' + c.title,
      '',
      '- **Scope:** ' + c.scope,
      '- **Opened:** ' + new Date(run.startedAt).toISOString(),
      '- **Action confirmed:** ' + new Date(run.solvedAt).toISOString() + ' (' + duration(run.solvedAt - run.startedAt) + ')',
      '- **Mode:** ' + (run.mode === 'manual' ? 'Manual' : 'Guided'),
      '- **Attempts:** ' + (run.wrongLabels.length + 1),
      '',
      '## Ticket',
      '',
      quote(c.ticket),
      '',
      '## Evidence',
      ''
    ];
    for (const [name, record] of c.sources) lines.push('### ' + name, '', fence(record), '');
    lines.push('## Finding', '', c.finding, '', '## Action taken', '', chosen.label, '');
    if (run.wrongLabels.length) {
      lines.push('Ruled out first:', '');
      for (const label of run.wrongLabels) lines.push('- ' + label);
      lines.push('');
    }
    lines.push('## Runbook', '');
    c.runbook.forEach((step, index) => {
      lines.push((index + 1) + '. **' + step.where + '**  ', '   ' + step.do);
      if (step.code) lines.push('', fence(step.code).split('\n').map(line => '   ' + line).join('\n'));
      const note = (run.notes[step.id] || '').trim();
      if (note) lines.push('', '   *What I saw instead:* ' + note.replace(/\n/g, ' '));
      lines.push('');
    });
    lines.push('## Customer update', '', quote(run.draft.trim() || '(no draft)'), '');
    return lines.join('\n');
  }

  return {buildReport};
});
