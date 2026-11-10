"""
Ankicaster Official Anki Add-on (Strictly Read-Only Bridge & Embedded Window)
Binding Rule BR-01 & Architecture Section 38:
- Reads intervals and card metadata strictly read-only.
- NEVER modifies card.ivl, card.due, card.factor, or any Anki scheduling parameter.
- Observes real elapsed answer time to enforce the 0.8s anti-mash rule (Rule H5).
- Saves install baseline once so historical reviews prior to install grant 0 mana.
- Takes card age as the shorter of the current and previous interval: min(card.ivl, card.lastIvl).
- Runs the game in its own window inside Anki using QWebEngineView.
"""

import time
import json
import os
from typing import Dict, Any, Optional

try:
    from aqt import mw, gui_hooks
    from aqt.utils import showInfo, tooltip
    from anki.cards import Card
    from aqt.qt import QDialog, QVBoxLayout, QUrl, Qt
    try:
        from aqt.qt import QWebEngineView
    except ImportError:
        try:
            from PyQt6.QtWebEngineWidgets import QWebEngineView  # type: ignore
        except ImportError:
            from PyQt5.QtWebEngineWidgets import QWebEngineView  # type: ignore
except ImportError:
    # Standalone test fallback
    mw = None
    gui_hooks = None
    QDialog = object  # type: ignore
    QWebEngineView = None  # type: ignore

ADDON_PACKAGE_NAME = "ankicaster_magic_academy"
DEFAULT_CONFIG = {
    "install_baseline_ms": 0,
    "app_url": "http://localhost:3000",
    "min_answer_elapsed_ms": 800,
    "auto_open_on_startup": false if 'false' in locals() else False,
    "export_filename": "ankicaster_cards_export.json"
}

_card_shown_timestamp: float = 0.0
_ankicaster_dialog = None

def get_config() -> Dict[str, Any]:
    if mw and mw.addonManager:
        cfg = mw.addonManager.getConfig(__name__)
        if cfg:
            return cfg
    return DEFAULT_CONFIG

def get_or_create_install_baseline() -> int:
    """
    Saves the install baseline timestamp once so past study history
    cannot be exploited for retroactive mana.
    """
    if not mw or not mw.addonManager:
        return int(time.time() * 1000)

    cfg = mw.addonManager.getConfig(__name__) or {}
    baseline = cfg.get("install_baseline_ms", 0)
    if not baseline or baseline <= 0:
        baseline = int(time.time() * 1000)
        cfg["install_baseline_ms"] = baseline
        mw.addonManager.writeConfig(__name__, cfg)
    return baseline

def calculate_honest_interval(card: Any) -> int:
    """
    Takes card age as the shorter of the current and previous interval:
    min(card.ivl, card.lastIvl) to prevent sudden interval leaps from boosting skill.
    """
    cur_ivl = getattr(card, "ivl", 0)
    last_ivl = getattr(card, "lastIvl", cur_ivl)
    if last_ivl is None or last_ivl <= 0:
        last_ivl = cur_ivl

    shorter_ivl = min(cur_ivl, last_ivl)
    return max(0, int(shorter_ivl))

def on_card_will_show(card: Any) -> None:
    """Record precise timestamp when question is shown to user."""
    global _card_shown_timestamp
    _card_shown_timestamp = time.time()

def on_card_answered(reviewer: Any, card: Card, ease: int) -> None:
    """
    Hook called after user answers a card.
    STRICTLY READ-ONLY: Reads card state without altering database or scheduling.
    """
    global _card_shown_timestamp
    elapsed_ms = int((time.time() - _card_shown_timestamp) * 1000)
    config = get_config()
    min_time = config.get("min_answer_elapsed_ms", 800)
    baseline_ms = get_or_create_install_baseline()

    # Rule H5: Anti-mash guard (<0.8s)
    if elapsed_ms < min_time:
        if mw:
            tooltip("Ankicaster: Review pace under 0.8s — 0 mana earned (honest study required).", period=2000)
        return

    honest_ivl = calculate_honest_interval(card)

    payload = {
        "card_id": card.id,
        "nid": card.nid,
        "deck_id": card.did,
        "ease": ease,
        "elapsed_ms": elapsed_ms,
        "ivl": card.ivl,
        "last_ivl": getattr(card, "lastIvl", card.ivl),
        "honest_ivl": honest_ivl,
        "queue": card.queue,
        "type": card.type,
        "answered_at_ms": int(time.time() * 1000),
        "install_baseline_ms": baseline_ms
    }

    save_review_record(payload)

def save_review_record(payload: Dict[str, Any]) -> None:
    """Append review event to local log for game bridge sync."""
    try:
        user_dir = mw.pm.profileFolder() if mw and mw.pm else "."
        log_path = os.path.join(user_dir, "ankicaster_pending_reviews.jsonl")
        with open(log_path, "a", encoding="utf-8") as f:
            f.write(json.dumps(payload) + "\n")
    except Exception as e:
        print(f"[Ankicaster] Log write error: {e}")

def export_collection_snapshot() -> None:
    """
    Export current card collection as clean read-only JSON for Ankicaster import.
    Never alters cards or scheduling.
    """
    if not mw or not mw.col:
        return

    col = mw.col
    cards_out = {}
    baseline_ms = get_or_create_install_baseline()

    card_ids = col.find_cards("")
    for cid in card_ids:
        c = col.get_card(cid)
        note = c.note()
        deck_name = col.decks.name(c.did)
        honest_ivl = calculate_honest_interval(c)

        cards_out[c.id] = {
            "id": c.id,
            "nid": c.nid,
            "deckName": deck_name,
            "front": note.fields[0] if len(note.fields) > 0 else "Prompt",
            "back": note.fields[1] if len(note.fields) > 1 else "Answer",
            "ivl": c.ivl,
            "lastAnswerIvl": getattr(c, "lastIvl", c.ivl),
            "honestIvl": honest_ivl,
            "type": c.type,
            "queue": c.queue,
            "due": c.due,
            "lastStudiedMs": int(time.time() * 1000),
            "installBaselineMs": baseline_ms
        }

    user_dir = mw.pm.profileFolder() if mw.pm else "."
    out_file = os.path.join(user_dir, "ankicaster_cards_export.json")
    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(cards_out, f, indent=2)

    showInfo(f"Successfully exported {len(cards_out)} cards to:\n{out_file}\n\nStrictly read-only; Anki scheduling untouched.")

class AnkicasterDialog(QDialog):
    """Modal or standalone dialog embedding the Ankicaster Magic Academy web application."""
    def __init__(self, parent=None, url="http://localhost:3000"):
        super().__init__(parent)
        self.setWindowTitle("Ankicaster — Magic Academy & Honest Spaced-Repetition Simulator")
        self.resize(1280, 840)
        self.setMinimumSize(900, 600)

        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)

        if QWebEngineView is not None:
            self.web_view = QWebEngineView(self)
            self.web_view.setUrl(QUrl(url))
            layout.addWidget(self.web_view)
        else:
            showInfo("QtWebEngine is required to display Ankicaster within Anki. Please ensure PyQtWebEngine is installed.")

def open_ankicaster_window() -> None:
    """Launch Ankicaster in its own dedicated window inside Anki."""
    global _ankicaster_dialog
    config = get_config()
    url = config.get("app_url", "http://localhost:3000")

    if _ankicaster_dialog is None:
        _ankicaster_dialog = AnkicasterDialog(mw, url)

    _ankicaster_dialog.show()
    _ankicaster_dialog.raise_()
    _ankicaster_dialog.activateWindow()

def init_addon() -> None:
    """Register hooks, install baseline, and menu actions."""
    if not mw or not gui_hooks:
        return

    # Initialize baseline once on load
    get_or_create_install_baseline()

    # Card timing hooks
    gui_hooks.reviewer_did_show_question.append(on_card_will_show)
    gui_hooks.reviewer_did_answer_card.append(on_card_answered)

    # Menu items under Tools
    action_open = mw.form.menuTools.addAction("Open Ankicaster Magic Academy")
    action_open.triggered.connect(open_ankicaster_window)

    action_export = mw.form.menuTools.addAction("Export Ankicaster Snapshot (Read-Only)")
    action_export.triggered.connect(export_collection_snapshot)
