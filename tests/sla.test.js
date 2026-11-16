const test = require('node:test');
const assert = require('node:assert/strict');
const {rankQueue, slaStatus, formatMinutes} = require('../sla.js');

const tickets = [
  {id: 'paused', priority: 3, paused: true},
  {id: 'normal-p3', priority: 3, minutes: 50, atRiskMinutes: 10},
  {id: 'normal-p2', priority: 2, minutes: 60, atRiskMinutes: 10},
  {id: 'at-risk', priority: 3, minutes: 8, atRiskMinutes: 10},
  {id: 'major', priority: 1, major: true, minutes: 45, atRiskMinutes: 30}
];
const order = (elapsed) => rankQueue(tickets, elapsed).map(t => t.id);

test('ranks major, at risk, on track by priority, then paused', () => {
  assert.deepEqual(order(0), ['major', 'at-risk', 'normal-p2', 'normal-p3', 'paused']);
});

test('a ticket moves to breached once its clock runs out', () => {
  assert.deepEqual(order(9), ['major', 'at-risk', 'normal-p2', 'normal-p3', 'paused']);
  const ranked = rankQueue(tickets, 9);
  assert.equal(slaStatus(ranked.find(t => t.id === 'at-risk')), 'Breached · 1:00 over');
});

test('on-track tickets become at risk and sort by time left', () => {
  // At 45 min: normal-p3 has 5 left (at risk), normal-p2 has 15 left (on track).
  assert.deepEqual(order(45), ['major', 'at-risk', 'normal-p3', 'normal-p2', 'paused']);
});

test('the most overdue breached ticket comes first', () => {
  const late = [
    {id: 'a', priority: 1, minutes: 5, atRiskMinutes: 1},
    {id: 'b', priority: 3, minutes: 2, atRiskMinutes: 1}
  ];
  assert.deepEqual(rankQueue(late, 10).map(t => t.id), ['b', 'a']);
});

test('paused tickets keep their status regardless of elapsed time', () => {
  const [paused] = rankQueue([tickets[0]], 1000);
  assert.equal(paused.remaining, null);
  assert.equal(slaStatus(paused), 'Paused · awaiting customer evidence');
});

test('status text', () => {
  const [major] = rankQueue([tickets[4]], 0);
  assert.equal(slaStatus(major), 'Major incident · 45:00 left');
  const [breachedMajor] = rankQueue([tickets[4]], 50.5);
  assert.equal(slaStatus(breachedMajor), 'Major incident · breached 5:30 ago');
  assert.equal(formatMinutes(7.25), '7:15');
});

test('does not mutate the input tickets', () => {
  rankQueue(tickets, 5);
  assert.equal('remaining' in tickets[1], false);
});
