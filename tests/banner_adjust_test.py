"""Pure checks for the Anki banner's pending-review adjustment. Not part of npm test."""

import importlib.util
import os
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
SPEC = importlib.util.spec_from_file_location(
    "ankicaster_banner",
    os.path.join(HERE, "..", "addon", "banner.py"),
)
banner = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(banner)


class AdjustSummaryTest(unittest.TestCase):
    def test_lowers_both_counts_and_adds_fixed_mana(self):
        summary = {
            "v": 1,
            "mana": 100,
            "manaEach": 10,
            "build": {"name": "Library", "reviewsLeft": 42},
            "service": {"name": "Arcane Orb · Lv 1", "reviewsLeft": 18},
        }
        out = banner.adjust_summary(summary, 10)
        self.assertEqual(out["build"]["reviewsLeft"], 32)
        self.assertEqual(out["service"]["reviewsLeft"], 8)
        self.assertEqual(out["pendingMana"], 100)
        self.assertEqual(out["mana"], 100)

    def test_waiting_and_paused_are_not_moved(self):
        summary = {
            "build": {"name": "Dormitory", "reviewsLeft": 20, "paused": True},
            "service": {"name": "Summon Servant", "reviewsLeft": 4},
        }
        out = banner.adjust_summary(summary, 5)
        self.assertEqual(out["build"]["reviewsLeft"], 20)
        self.assertTrue(out["build"]["paused"])
        self.assertEqual(out["service"]["reviewsLeft"], 0)
        self.assertNotIn("pendingMana", out)

    def test_ready_floor_and_corrupt(self):
        out = banner.adjust_summary({"build": {"name": "Library", "reviewsLeft": 3}}, 9)
        self.assertEqual(out["build"]["reviewsLeft"], 0)
        lines = banner.banner_lines(out, False)
        self.assertIn("Ready — open to finish", lines[1])
        self.assertIsNone(banner.adjust_summary(None, 3))
        empty = banner.banner_lines(None, False)
        self.assertEqual(empty[0], "Your Academy awaits")

    def test_live_lines_skip_the_pending_tag(self):
        summary = {"mana": 1240, "pendingMana": 50, "build": {"name": "Library", "reviewsLeft": 2}}
        live = banner.banner_lines(summary, True)
        saved = banner.banner_lines(summary, False)
        self.assertNotIn("+50", live[0])
        self.assertIn("+50", saved[0])
        self.assertIn("1,240", saved[0])


if __name__ == "__main__":
    unittest.main()
