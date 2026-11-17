import unittest

from _support import ticket

from guided_backend import note
from guided_backend.matcher import load_runbooks, match

RUNBOOKS = load_runbooks()

# Realistic first reports, worded differently from the sample cases.
REPORTS = {
    "CP-1042": "Pods for payments-api stuck in ImagePullBackOff after deploy. Events say manifest unknown / failed to pull image.",
    "CP-1079": "Release workflow broke at Configure AWS credentials: AccessDenied calling AssumeRoleWithWebIdentity. We renamed the repo last week.",
    "CP-1091": "App server stopped responding overnight. EC2 status check failed during the STIG scan; console shows out of memory.",
    "CP-1102": "Someone accidentally deleted rows from the customers table. Records are missing in the app. Can we do a point-in-time restore?",
    "CP-1110": "Browser says your connection is not private. curl: SSL certificate problem: certificate has expired.",
    "CP-1117": "Terraform plan fails with Error acquiring the state lock. Lock Info shows a cancelled run.",
    "CP-1123": "Orders service throwing 500s, logs show connect ETIMEDOUT to the database on 5432 after the security group change.",
}


class MatcherTest(unittest.TestCase):
    def test_each_report_matches_its_runbook(self):
        for expected, text in REPORTS.items():
            with self.subTest(expected):
                result = match(text, RUNBOOKS)
                self.assertIsNotNone(result.best, "no match")
                self.assertEqual(result.best.runbook["id"], expected, result.best.hits)

    def test_each_sample_ticket_with_evidence_matches_itself(self):
        from pathlib import Path

        # The text the trainer shows (title, ticket, scope, evidence), read from cases.js
        # with the signals line removed so a case can't match on its own signal list.
        cases_js = (Path(__file__).resolve().parents[2] / "cases.js").read_text(encoding="utf-8")
        for rb in RUNBOOKS:
            with self.subTest(rb["id"]):
                block = cases_js.split(f"id: '{rb['id']}'", 1)[1].split("action:", 1)[0]
                block = "\n".join(line for line in block.splitlines() if "signals:" not in line)
                result = match(block, RUNBOOKS)
                self.assertIsNotNone(result.best)
                self.assertEqual(result.best.runbook["id"], rb["id"])

    def test_unrelated_ticket_gets_no_suggestion(self):
        for text in ["Please reset my laptop password", "Request access to the finance SharePoint", "New starter needs a monitor"]:
            with self.subTest(text):
                self.assertIsNone(match(text, RUNBOOKS).best)

    def test_single_weak_signal_is_not_enough(self):
        self.assertIsNone(match("The GitHub Actions badge is grey", RUNBOOKS).best)

    def test_signals_need_word_boundaries(self):
        # "oom" must not match inside "room", "acm" not inside "acme".
        self.assertIsNone(match("Meeting room booking for ACME froze", RUNBOOKS).best)

    def test_confidence(self):
        self.assertEqual(match(REPORTS["CP-1042"], RUNBOOKS).confidence, "high")
        self.assertEqual(match("certificate expired, acm", RUNBOOKS).confidence, "medium")
        self.assertEqual(match("hello", RUNBOOKS).confidence, "none")


class NoteTest(unittest.TestCase):
    def test_note_contents(self):
        result = match(REPORTS["CP-1110"], RUNBOOKS)
        text = note.build(ticket(), result, "https://gkoufie1.github.io/guided/")
        self.assertIn("[Guided] Suggested runbook for INC0010023", text)
        self.assertIn("Closest known incident: CP-1110", text)
        self.assertIn("https://gkoufie1.github.io/guided/?case=CP-1110", text)
        self.assertIn("Ruled out in that incident:", text)
        self.assertIn("No changes were made.", text)
        self.assertLessEqual(len(text), note.MAX_NOTE)


if __name__ == "__main__":
    unittest.main()
