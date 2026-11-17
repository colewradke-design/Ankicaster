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
        self.assertEqual(banner.format_build_chip(out["build"])["count"], "✓")
        self.assertIsNone(banner.adjust_summary(None, 3))
        empty = banner.format_chip(None, False)
        self.assertEqual(empty["manaText"], "Your Academy awaits")
        self.assertEqual(empty["build"]["label"], "Idle")
        self.assertTrue(empty["service"]["muted"])

    def test_closed_reviews_move_the_bar(self):
        out = banner.adjust_summary(
            {"service": {"kind": "orb", "school": "Nature", "targetLevel": 2, "reviewsLeft": 18, "totalReviews": 30, "progressPct": 40}},
            6,
        )
        self.assertEqual(out["service"]["reviewsLeft"], 12)
        self.assertEqual(out["service"]["progressPct"], 60)

    def test_live_skips_the_pending_tag(self):
        summary = {"mana": 1240, "pendingMana": 50, "build": {"name": "Library", "reviewsLeft": 2}}
        live = banner.format_chip(summary, True)
        saved = banner.format_chip(summary, False)
        self.assertEqual(live["pending"], "")
        self.assertEqual(saved["pending"], "+50")
        self.assertEqual(saved["mana"], "1,240")


class FormatChipTest(unittest.TestCase):
    """Same labels as src/utils/banner.ts buildChip / serviceChip."""

    def test_orb(self):
        chip = banner.format_service_chip(
            {"kind": "orb", "school": "Nature", "targetLevel": 2, "reviewsLeft": 18, "progressPct": 40, "queuedCount": 2}
        )
        self.assertEqual((chip["icon"], chip["label"], chip["count"], chip["pct"]), ("🔮", "Nature Lv 2", "18", 40))
        self.assertEqual(chip["title"], "Pondering Nature to level 2 — 18 reviews left · 2 more queued")

    def test_grimoire(self):
        chip = banner.format_service_chip({"kind": "grimoire", "spellName": "Starlight Ink", "reviewsLeft": 23, "progressPct": 55})
        self.assertEqual((chip["icon"], chip["label"]), ("📖", "Starlight Ink"))
        self.assertEqual(chip["title"], "Studying the grimoire: Starlight Ink — 23 reviews left")

    def test_summon_tiers(self):
        labels = [banner.format_service_chip({"kind": "summon", "summonTier": t, "reviewsLeft": 6})["label"] for t in (1, 2, 3)]
        self.assertEqual(labels, ["Summoning", "Summoning II", "Summoning III"])

    def test_idle(self):
        svc = banner.format_service_chip(None)
        build = banner.format_build_chip(None)
        self.assertEqual((svc["icon"], svc["label"], svc["muted"], svc["pct"]), ("🔮", "Idle", True, None))
        self.assertEqual((build["icon"], build["label"], build["muted"], build["pct"]), ("🔨", "Idle", True, None))

    def test_truncation(self):
        self.assertEqual(banner.truncate_label("Exactly14Chars"), "Exactly14Chars")
        cut = banner.truncate_label("Grand Observatory of Stars")
        self.assertEqual(len(cut), 14)
        self.assertTrue(cut.endswith("…"))

    def test_build_states(self):
        active = banner.format_build_chip({"name": "Library", "reviewsLeft": 42, "progressPct": 65, "crew": 3, "queuedCount": 2})
        self.assertEqual(active["title"], "Library — 42 reviews left (crew of 3) · 2 more queued")
        paused = banner.format_build_chip({"name": "Library", "reviewsLeft": 42, "paused": True})
        self.assertEqual((paused["icon"], paused["label"]), ("⏸", "Library"))
        waiting = banner.format_build_chip({"name": "Library", "reviewsLeft": -1, "crew": 0})
        self.assertEqual((waiting["count"], waiting["title"]), ("…", "Library — waiting for builders"))

    def test_old_summary_without_kind(self):
        chip = banner.format_service_chip({"name": "Arcane Orb · Lv 1", "reviewsLeft": 4})
        self.assertEqual(chip["label"], banner.truncate_label("Arcane Orb · Lv 1"))
        self.assertFalse(chip["muted"])


if __name__ == "__main__":
    unittest.main()
