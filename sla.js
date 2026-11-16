// SLA queue ranking. Pure functions, shared by the browser and the Node tests.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.GuidedSLA = api;
})(typeof self !== 'undefined' ? self : this, function () {
  // Rank order: major incident, breached, at risk, on track, paused.
  const RANK = {major: 0, breached: 1, atRisk: 2, onTrack: 3, paused: 4};

  // Minutes left on a ticket after `elapsed` simulated minutes. Paused clocks don't run.
  function remainingAt(ticket, elapsed) {
    return ticket.paused ? null : ticket.minutes - elapsed;
  }

  function slaRank(ticket) {
    if (ticket.major) return RANK.major;
    if (ticket.paused) return RANK.paused;
    if (ticket.remaining <= 0) return RANK.breached;
    if (ticket.remaining <= ticket.atRiskMinutes) return RANK.atRisk;
    return RANK.onTrack;
  }

  // 7.5 → "7:30"
  function formatMinutes(minutes) {
    const seconds = Math.floor(Math.abs(minutes) * 60);
    return Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0');
  }

  function slaStatus(ticket) {
    if (ticket.paused) return 'Paused · awaiting customer evidence';
    const time = formatMinutes(ticket.remaining);
    const breached = ticket.remaining <= 0;
    if (ticket.major) return 'Major incident · ' + (breached ? 'breached ' + time + ' ago' : time + ' left');
    if (breached) return 'Breached · ' + time + ' over';
    return ticket.remaining <= ticket.atRiskMinutes ? 'At risk · ' + time + ' left' : time + ' left';
  }

  // Returns new ticket objects with `remaining`, sorted for the queue.
  // Within a rank, on-track tickets go by priority first; everything else by least time left.
  function rankQueue(tickets, elapsed) {
    return tickets
      .map(ticket => ({...ticket, remaining: remainingAt(ticket, elapsed)}))
      .sort((a, b) => {
        const rankA = slaRank(a);
        return rankA - slaRank(b) ||
          (rankA === RANK.onTrack ? a.priority - b.priority : 0) ||
          (a.remaining ?? Infinity) - (b.remaining ?? Infinity) ||
          a.priority - b.priority;
      });
  }

  return {RANK, remainingAt, slaRank, slaStatus, formatMinutes, rankQueue};
});
