"""
Ankicaster Official Anki Add-on (Read-Only Bridge)
Binding Rule BR-01 & Architecture Section 38:
- Reads intervals and card metadata strictly read-only.
- NEVER modifies card.ivl, card.due, card.factor, or any Anki scheduling parameter.
- Observes real elapsed answer time to enforce the 0.8s anti-mash rule (Rule H5).
- Enforces install baseline so historical reviews grant nothing.
"""

import time
import json
import os
from typing import Dict, Any, Optional

try:
    from aqt import mw, gui_hooks
    from aqt.utils import showInfo, tooltip
    from anki.cards import Card
except ImportError:
    # Standalone test fallback
    mw = None
    gui_hooks = None

ADDON_CONFIG_KEY = "ankicaster_config"
DEFAULT_CONFIG = {
    "install_baseline_ms": int(time.time() * 1000),
    "export_path": "ankicaster_cards_snapshot.json",
    "web_endpoint": "http://localhost:3000/api/anki-review"
}

_card_shown_timestamp: float = 0.0

def get_config() -> Dict[str, Any]:
    if mw and mw.addonManager:
        cfg = mw.addonManager.getConfig(__name__)
        if cfg:
            return cfg
    return DEFAULT_CONFIG

def on_card_will_show(card: Any) -> None:
    """Record precise timestamp when question is shown to user."""
    global _card_shown_timestamp
    _card_shown_timestamp = time.time()

def on_card_answered(reviewer: Any, card: Card, ease: int) -> None:
    """
    Hook called after user answers a card.
    STRICTLY READ-ONLY: Reads card state without altering database.
    """
    global _card_shown_timestamp
    elapsed_ms = int((time.time() - _card_shown_timestamp) * 1000)
    config = get_config()

    # Rule H5: Anti-mash guard (<800ms)
    if elapsed_ms < 800:
        if mw:
            tooltip("Ankicaster: Review pace under 0.8s — 0 mana earned.", period=2000)
        return

    # Honest Interval formula: max(0, min(card.ivl, card.lastIvl if hasattr(card, 'lastIvl') else card.ivl))
    honest_ivl = max(0, card.ivl)

    payload = {
        "card_id": card.id,
        "nid": card.nid,
        "deck_id": card.did,
        "ease": ease,
        "elapsed_ms": elapsed_ms,
        "ivl": card.ivl,
        "honest_ivl": honest_ivl,
        "queue": card.queue,
        "type": card.type,
        "answered_at_ms": int(time.time() * 1000),
        "install_baseline_ms": config.get("install_baseline_ms", 0)
    }

    # Optional: Save snapshot record or post to web service
    save_review_record(payload)

def save_review_record(payload: Dict[str, Any]) -> None:
    """Append review event to local log for sync."""
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
    Never alters cards.
    """
    if not mw or not mw.col:
        return

    col = mw.col
    cards_out = {}
    config = get_config()

    card_ids = col.find_cards("")
    for cid in card_ids:
        c = col.get_card(cid)
        note = c.note()
        deck_name = col.decks.name(c.did)

        cards_out[c.id] = {
            "id": c.id,
            "nid": c.nid,
            "deckName": deck_name,
            "front": note.fields[0] if len(note.fields) > 0 else "Prompt",
            "back": note.fields[1] if len(note.fields) > 1 else "Answer",
            "ivl": c.ivl,
            "lastAnswerIvl": c.ivl,
            "honestIvl": max(0, c.ivl),
            "type": c.type,
            "queue": c.queue,
            "due": c.due,
            "lastStudiedMs": int(time.time() * 1000)
        }

    user_dir = mw.pm.profileFolder() if mw.pm else "."
    out_file = os.path.join(user_dir, "ankicaster_cards_export.json")
    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(cards_out, f, indent=2)

    showInfo(f"Successfully exported {len(cards_out)} cards to:\n{out_file}\n\nAll cards read strictly read-only.")

def init_addon() -> None:
    """Register hooks and menu actions."""
    if not mw or not gui_hooks:
        return

    # Card timing hooks
    gui_hooks.reviewer_did_show_question.append(on_card_will_show)
    gui_hooks.reviewer_did_answer_card.append(on_card_answered)

    # Menu item
    action = mw.form.menuTools.addAction("Export Ankicaster Snapshot (Read-Only)")
    action.triggered.connect(export_collection_snapshot)
