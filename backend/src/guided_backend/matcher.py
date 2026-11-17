"""Score ticket text against the runbook library.

Deliberately simple and explainable: each runbook lists signal phrases, and
the runbook with the most distinct phrases present in the ticket wins. The
note always says which phrases matched, so an engineer can judge the
suggestion instead of trusting a black box. Below `min_signals` nothing is
suggested, because a wrong suggestion costs more than no suggestion.
"""

import json
import re
from dataclasses import dataclass, field
from pathlib import Path

RUNBOOKS_PATH = Path(__file__).with_name("runbooks.json")

_QUOTES = str.maketrans({"‘": "'", "’": "'", "“": '"', "”": '"'})


def load_runbooks(path=RUNBOOKS_PATH):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def normalise(text):
    return re.sub(r"\s+", " ", text.translate(_QUOTES).lower())


def _contains(text, phrase):
    # Phrase must not be glued to other letters or digits: "oom" must not match "room".
    return re.search(r"(?<![a-z0-9])" + re.escape(phrase) + r"(?![a-z0-9])", text) is not None


@dataclass
class Candidate:
    runbook: dict
    hits: list

    @property
    def score(self):
        return len(self.hits)


@dataclass
class Match:
    best: Candidate | None
    alternatives: list = field(default_factory=list)

    @property
    def confidence(self):
        if self.best is None:
            return "none"
        if self.best.score >= 3 and not any(a.score == self.best.score for a in self.alternatives):
            return "high"
        return "medium"


def match(text, runbooks, min_signals=2):
    text = normalise(text)
    candidates = []
    for runbook in runbooks:
        hits = [s for s in runbook["signals"] if _contains(text, s)]
        if hits:
            candidates.append(Candidate(runbook, hits))
    # Highest score first; ties keep library order so results are deterministic.
    candidates.sort(key=lambda c: -c.score)
    qualified = [c for c in candidates if c.score >= min_signals]
    if not qualified:
        return Match(best=None)
    return Match(best=qualified[0], alternatives=qualified[1:3])
