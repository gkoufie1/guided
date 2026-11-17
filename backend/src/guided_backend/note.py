"""Format a match as a plain-text internal note.

Plain text works in both ServiceNow work notes and ServiceDesk Plus notes.
The note is framed as a suggestion from the closest known incident, never as
a diagnosis, and states that no changes were made.
"""

from urllib.parse import quote

MAX_NOTE = 8_000


def build(ticket, result, guided_url):
    best = result.best
    rb = best.runbook
    link = f"{guided_url.rstrip('/')}/?case={quote(rb['id'])}"
    lines = [
        f"[Guided] Suggested runbook for {ticket.number}",
        "",
        f"Closest known incident: {rb['id']} - {rb['title']}",
        f"Confidence: {result.confidence} (matched: {', '.join(best.hits)})",
        "",
        "In that incident:",
        rb["finding"],
        "",
        f"First useful action: {rb['action']}",
        "",
        "Runbook:",
    ]
    for number, step in enumerate(rb["steps"], 1):
        lines.append(f"{number}. {step['where']}")
        lines.append(f"   {step['do']}")
        if step.get("code"):
            lines.extend("   > " + line for line in step["code"].splitlines())
    lines += ["", "Ruled out in that incident:"]
    lines += [f"- {item['label']}: {item['hint']}" for item in rb["ruled_out"]]
    if result.alternatives:
        lines += ["", "Also similar: " + "; ".join(f"{a.runbook['id']} {a.runbook['title']}" for a in result.alternatives)]
    lines += [
        "",
        f"Walk through it in Guided: {link}",
        "",
        "This is an automated suggestion. Verify it against this ticket's own evidence before acting. No changes were made.",
    ]
    text = "\n".join(lines)
    if len(text) > MAX_NOTE:
        text = text[: MAX_NOTE - 40] + f"\n...\nFull runbook: {link}"
    return text
