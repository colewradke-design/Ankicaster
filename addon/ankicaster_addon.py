"""
Ankicaster Official Anki Add-on (Strictly Read-Only Bridge & Embedded Window)
Binding Rule BR-01 & Architecture Section 38:
- Reads intervals and card metadata strictly read-only.
- NEVER modifies card.ivl, card.due, card.factor, or any Anki scheduling parameter.
- Observes real elapsed answer time to enforce the 0.8s anti-mash rule (Rule H5).
- Saves install baseline once so historical reviews prior to install grant 0 mana.
- Previous interval comes from revlog:
  SELECT lastIvl FROM revlog WHERE cid = ? ORDER BY id DESC LIMIT 1 (negative = 0).
  Card age = min(current interval, last_ivl).
- Ignores any review older than the install baseline.
- Bundles the production dist/ inside the add-on and loads it with mw.addonManager.setWebExports
  and a local URL (never localhost:3000).
- Sends real reviews into the game through a pycmd/runJavaScript bridge.
- Dev mode is strictly off inside Anki.
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
        from aqt.qt import QWebEngineView, QWebEnginePage
    except ImportError:
        try:
            from PyQt6.QtWebEngineWidgets import QWebEngineView, QWebEnginePage  # type: ignore
        except ImportError:
            from PyQt5.QtWebEngineWidgets import QWebEngineView, QWebEnginePage  # type: ignore
except ImportError:
    # Standalone execution fallback
    mw = None
    gui_hooks = None
    QDialog = object  # type: ignore
    QWebEngineView = None  # type: ignore

ADDON_PACKAGE_NAME = "ankicaster_magic_academy"
DEFAULT_CONFIG = {
    "install_baseline_ms": 0,
    "min_answer_elapsed_ms": 800,
    "auto_open_on_startup": False
}

_card_shown_timestamp: float = 0.0
_ankicaster_dialog = None

def get_package_name() -> str:
    """Return top-level add-on folder name for web asset serving."""
    return __name__.split(".")[0]

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

def query_previous_interval(card_id: int) -> int:
    """
    Query previous interval directly from Anki's revlog table:
    SELECT lastIvl FROM revlog WHERE cid = ? ORDER BY id DESC LIMIT 1 (negative = 0).
    Negative lastIvl indicates learning step seconds, which counts as 0 days.
    """
    if not mw or not mw.col or not mw.col.db:
        return 0

    try:
        row = mw.col.db.first("SELECT lastIvl FROM revlog WHERE cid = ? ORDER BY id DESC LIMIT 1", card_id)
        if row and row[0] is not None:
            raw_ivl = int(row[0])
            return max(0, raw_ivl)
    except Exception as e:
        print(f"[Ankicaster] Revlog query error: {e}")

    return 0

def calculate_card_age(card: Any) -> int:
    """
    Card age = min(current interval, previous interval from revlog).
    Prevents artificial interval jumps from exploiting skill gains.
    """
    cur_ivl = getattr(card, "ivl", 0)
    if cur_ivl < 0:
        cur_ivl = 0

    last_ivl = query_previous_interval(getattr(card, "id", 0))
    if last_ivl <= 0:
        # If no previous revlog entry, last interval is 0 or current interval for brand new cards
        last_ivl = cur_ivl

    return max(0, min(int(cur_ivl), int(last_ivl)))

def on_card_will_show(card: Any) -> None:
    """Record precise timestamp when question is shown to user."""
    global _card_shown_timestamp
    _card_shown_timestamp = time.time()

def on_card_answered(reviewer: Any, card: Card, ease: int) -> None:
    """
    Hook called after user answers a card.
    STRICTLY READ-ONLY: Reads card state without altering database or scheduling.
    """
    global _card_shown_timestamp, _ankicaster_dialog
    answered_at_ms = int(time.time() * 1000)
    elapsed_ms = int((time.time() - _card_shown_timestamp) * 1000)

    config = get_config()
    min_time = config.get("min_answer_elapsed_ms", 800)
    baseline_ms = get_or_create_install_baseline()

    # Ignore reviews that occurred before install baseline
    if answered_at_ms < baseline_ms:
        return

    # Rule H5: Anti-mash guard (<0.8s)
    if elapsed_ms < min_time:
        if mw:
            tooltip("Ankicaster: Review answered in <0.8s — 0 mana earned (honest pace required).", period=2000)
        return

    card_age = calculate_card_age(card)
    last_ivl = query_previous_interval(card.id)

    payload = {
        "card_id": card.id,
        "nid": card.nid,
        "deck_id": card.did,
        "ease": ease,
        "elapsed_ms": elapsed_ms,
        "ivl": max(0, card.ivl),
        "last_ivl": last_ivl,
        "card_age": card_age,
        "honest_ivl": card_age,
        "queue": card.queue,
        "type": card.type,
        "answered_at_ms": answered_at_ms,
        "install_baseline_ms": baseline_ms
    }

    # 1. Forward to active game window via JavaScript bridge
    if _ankicaster_dialog is not None and getattr(_ankicaster_dialog, "web_view", None) is not None:
        try:
            js = f"if (window.ankicasterOnReview) {{ window.ankicasterOnReview({json.dumps(payload)}); }}"
            _ankicaster_dialog.web_view.page().runJavaScript(js)
        except Exception as e:
            print(f"[Ankicaster] Bridge error: {e}")

    # 2. Persist to pending log for offline / asynchronous sync
    save_review_record(payload)

def save_review_record(payload: Dict[str, Any]) -> None:
    """Append review event to local log in user profile."""
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
        card_age = calculate_card_age(c)

        cards_out[c.id] = {
            "id": c.id,
            "nid": c.nid,
            "deckName": deck_name,
            "front": note.fields[0] if len(note.fields) > 0 else "Prompt",
            "back": note.fields[1] if len(note.fields) > 1 else "Answer",
            "ivl": max(0, c.ivl),
            "lastAnswerIvl": query_previous_interval(c.id),
            "honestIvl": card_age,
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
    """Dedicated window inside Anki running the production Ankicaster web application."""
    def __init__(self, parent=None, local_url: str = ""):
        super().__init__(parent)
        self.setWindowTitle("Ankicaster — Magic Academy & Spaced-Repetition Simulator")
        self.resize(1340, 880)
        self.setMinimumSize(960, 640)

        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)

        if QWebEngineView is not None:
            self.web_view = QWebEngineView(self)
            self.web_view.setUrl(QUrl(local_url))
            layout.addWidget(self.web_view)
        else:
            showInfo("QtWebEngine is required to display Ankicaster within Anki.")

def get_addon_local_url() -> str:
    """
    Returns local web export URL served through Anki's media server.
    Loads from bundled production web assets, never localhost:3000.
    """
    pkg = get_package_name()
    port = mw.mediaServer.getPort() if mw and mw.mediaServer else 8765
    return f"http://127.0.0.1:{port}/_addons/{pkg}/web/index.html?addon=1"

def open_ankicaster_window() -> None:
    """Launch Ankicaster in its own dedicated window inside Anki."""
    global _ankicaster_dialog
    local_url = get_addon_local_url()

    if _ankicaster_dialog is None:
        _ankicaster_dialog = AnkicasterDialog(mw, local_url)

    _ankicaster_dialog.show()
    _ankicaster_dialog.raise_()
    _ankicaster_dialog.activateWindow()

def init_addon() -> None:
    """Register hooks, install baseline, web exports, and menu actions."""
    if not mw or not gui_hooks:
        return

    # 1. Initialize baseline once on load
    get_or_create_install_baseline()

    # 2. Register web exports for static files bundled inside addon
    pkg = get_package_name()
    try:
        mw.addonManager.setWebExports(pkg, r"(.*)")
    except Exception as e:
        print(f"[Ankicaster] setWebExports notice: {e}")

    # 3. Card timing hooks
    gui_hooks.reviewer_did_show_question.append(on_card_will_show)
    gui_hooks.reviewer_did_answer_card.append(on_card_answered)

    # 4. Menu items under Tools
    action_open = mw.form.menuTools.addAction("Open Ankicaster Magic Academy")
    action_open.triggered.connect(open_ankicaster_window)

    action_export = mw.form.menuTools.addAction("Export Ankicaster Snapshot (Read-Only)")
    action_export.triggered.connect(export_collection_snapshot)
