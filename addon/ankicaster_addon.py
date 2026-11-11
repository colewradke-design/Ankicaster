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

def query_newest_revlog_id(card_id: int) -> Optional[int]:
    """
    Get newest revlog id for the card:
    SELECT id FROM revlog WHERE cid = ? ORDER BY id DESC LIMIT 1
    """
    if not mw or not mw.col or not mw.col.db:
        return None
    try:
        row = mw.col.db.first("SELECT id FROM revlog WHERE cid = ? ORDER BY id DESC LIMIT 1", card_id)
        if row and row[0] is not None:
            return int(row[0])
    except Exception as e:
        print(f"[Ankicaster] Revlog id query error: {e}")
    return None

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
    revlog_id = query_newest_revlog_id(card.id)
    review_id = str(revlog_id) if revlog_id is not None else f"{card.id}-{answered_at_ms}"

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
        "install_baseline_ms": baseline_ms,
        "review_id": review_id
    }

    # 1. Forward to active game window via JavaScript bridge only if frontend is ready
    if (
        _ankicaster_dialog is not None
        and getattr(_ankicaster_dialog, "web_view", None) is not None
        and getattr(_ankicaster_dialog, "is_ready", False)
    ):
        try:
            js = f"if (window.ankicasterOnReview) {{ window.ankicasterOnReview({json.dumps(payload)}); }}"
            _ankicaster_dialog.web_view.page().runJavaScript(js)
        except Exception as e:
            print(f"[Ankicaster] Bridge error: {e}")

    # 2. Always persist to pending log for replay & ack tracking
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

def get_non_suspended_cards_snapshot() -> list:
    """
    Build snapshot with one SQL query:
    SELECT c.id, c.did, c.ivl, c.type, c.queue, (SELECT lastIvl FROM revlog r WHERE r.cid=c.id ORDER BY r.id DESC LIMIT 1)
    FROM cards c WHERE c.queue != -1
    with a deck-name map.
    """
    if not mw or not mw.col or not mw.col.db:
        return []

    snapshot = []
    try:
        col = mw.col
        # Deck name map
        deck_map = {}
        for d in col.decks.all():
            deck_map[d['id']] = d['name']

        sql = """
            SELECT c.id, c.did, c.ivl, c.type, c.queue,
                   (SELECT lastIvl FROM revlog r WHERE r.cid=c.id ORDER BY r.id DESC LIMIT 1)
            FROM cards c
            WHERE c.queue != -1
        """
        rows = col.db.all(sql)
        for row in rows:
            cid = int(row[0])
            did = int(row[1])
            cur_ivl = max(0, int(row[2]) if row[2] is not None else 0)
            ctype = int(row[3]) if row[3] is not None else 2
            queue = int(row[4]) if row[4] is not None else 2
            raw_last_ivl = row[5]
            last_ivl = max(0, int(raw_last_ivl)) if (raw_last_ivl is not None and int(raw_last_ivl) > 0) else cur_ivl
            card_age = max(0, min(cur_ivl, last_ivl))
            deck_name = deck_map.get(did, "Anki Collection")

            snapshot.append({
                "id": cid,
                "deckName": deck_name,
                "card_age": card_age,
                "type": ctype,
                "queue": queue
            })
    except Exception as e:
        print(f"[Ankicaster] Single-SQL snapshot error: {e}")

    return snapshot

def get_all_pending_reviews() -> list:
    """Read all pending reviews from ankicaster_pending_reviews.jsonl."""
    user_dir = mw.pm.profileFolder() if mw and mw.pm else "."
    log_path = os.path.join(user_dir, "ankicaster_pending_reviews.jsonl")
    if not os.path.exists(log_path):
        return []

    records = []
    try:
        with open(log_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line:
                    records.append(json.loads(line))
    except Exception as e:
        print(f"[Ankicaster] Error reading pending reviews: {e}")

    return records

def acknowledge_pending_reviews_up_to(ack_review_id: str) -> None:
    """
    Remove acknowledged lines from ankicaster_pending_reviews.jsonl up to and including ack_review_id.
    """
    user_dir = mw.pm.profileFolder() if mw and mw.pm else "."
    log_path = os.path.join(user_dir, "ankicaster_pending_reviews.jsonl")
    if not os.path.exists(log_path):
        return

    try:
        with open(log_path, "r", encoding="utf-8") as f:
            lines = [line.strip() for line in f if line.strip()]

        remaining = []
        found_ack = False
        for line in lines:
            try:
                rec = json.loads(line)
                r_id = str(rec.get("review_id", ""))
                if not found_ack:
                    if r_id == str(ack_review_id):
                        found_ack = True
                    continue
                remaining.append(line)
            except Exception:
                remaining.append(line)

        # If ack_review_id was empty or not found in lines, but ack was sent, check if all were processed
        with open(log_path, "w", encoding="utf-8") as f:
            for line in remaining:
                f.write(line + "\n")
    except Exception as e:
        print(f"[Ankicaster] Error acknowledging reviews: {e}")

def get_save_file_path() -> str:
    """Return path to user_files/save.json in the add-on folder."""
    pkg = get_package_name()
    addon_dir = os.path.dirname(os.path.abspath(__file__))
    user_files_dir = os.path.join(addon_dir, "user_files")
    if not os.path.exists(user_files_dir):
        os.makedirs(user_files_dir, exist_ok=True)
    return os.path.join(user_files_dir, "save.json")

def load_saved_game_state() -> Optional[Dict[str, Any]]:
    """Load game state from user_files/save.json."""
    path = get_save_file_path()
    if os.path.exists(path):
        try:
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            print(f"[Ankicaster] Error loading save.json: {e}")
    return None

def write_saved_game_state(save_data: str) -> bool:
    """Write game state JSON string to user_files/save.json."""
    try:
        path = get_save_file_path()
        with open(path, "w", encoding="utf-8") as f:
            f.write(save_data)
        return True
    except Exception as e:
        print(f"[Ankicaster] Error saving save.json: {e}")
        return False

class AnkicasterDialog(QDialog):
    """Dedicated window inside Anki running the production Ankicaster web application."""
    def __init__(self, parent=None, local_url: str = ""):
        super().__init__(parent)
        self.setWindowTitle("Ankicaster — Magic Academy & Spaced-Repetition Simulator")
        self.resize(1340, 880)
        self.setMinimumSize(960, 640)
        self.is_ready = False

        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)

        if QWebEngineView is not None:
            self.web_view = QWebEngineView(self)
            self.web_view.setUrl(QUrl(local_url))
            layout.addWidget(self.web_view)
        else:
            showInfo("QtWebEngine is required to display Ankicaster within Anki.")

    def handle_pycmd(self, cmd: str) -> None:
        """Handle pycmd messages from Ankicaster web application."""
        if cmd == "ankicaster:ready":
            self.is_ready = True
            self.on_frontend_ready()
        elif cmd.startswith("ankicaster:ack:"):
            ack_id = cmd[len("ankicaster:ack:"):]
            acknowledge_pending_reviews_up_to(ack_id)
        elif cmd.startswith("ankicaster:save:"):
            save_payload = cmd[len("ankicaster:save:"):]
            write_saved_game_state(save_payload)

    def on_frontend_ready(self) -> None:
        """Called once the App bridge effect has registered all handlers and emitted ankicaster:ready."""
        if not self.web_view:
            return

        # 1. Send saved game state from user_files/save.json if it exists
        saved_state = load_saved_game_state()
        if saved_state is not None:
            save_json = json.dumps(saved_state)
            js_load = f"if (window.ankicasterLoadSavedGame) {{ window.ankicasterLoadSavedGame({save_json}); }}"
            self.web_view.page().runJavaScript(js_load)

        # 2. Send full collection snapshot
        snapshot = get_non_suspended_cards_snapshot()
        if snapshot:
            snap_json = json.dumps(snapshot)
            js_snap = f"if (window.ankicasterLoadSnapshot) {{ window.ankicasterLoadSnapshot({snap_json}); }}"
            self.web_view.page().runJavaScript(js_snap)

        # 3. Send all pending reviews
        pending = get_all_pending_reviews()
        if pending:
            pending_json = json.dumps(pending)
            js_replay = f"if (window.ankicasterReplayPendingReviews) {{ window.ankicasterReplayPendingReviews({pending_json}); }}"
            self.web_view.page().runJavaScript(js_replay)

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
    elif getattr(_ankicaster_dialog, "is_ready", False):
        # Refresh snapshot & pending on subsequent foregrounding
        _ankicaster_dialog.on_frontend_ready()

    _ankicaster_dialog.show()
    _ankicaster_dialog.raise_()
    _ankicaster_dialog.activateWindow()

def on_webview_bridge_cmd(handled: Any, cmd: str, context: Any) -> Any:
    """Intercept pycmd messages from webview."""
    global _ankicaster_dialog
    if cmd.startswith("ankicaster:"):
        if _ankicaster_dialog:
            _ankicaster_dialog.handle_pycmd(cmd)
        return (True, None)
    return handled

def init_addon() -> None:
    """Register hooks, install baseline, web exports, and menu actions."""
    if not mw or not gui_hooks:
        return

    # 1. Initialize baseline once on load
    get_or_create_install_baseline()

    # 2. Register web exports for static files bundled inside addon under web/
    pkg = get_package_name()
    try:
        mw.addonManager.setWebExports(pkg, r"web/.*")
    except Exception as e:
        print(f"[Ankicaster] setWebExports notice: {e}")

    # 3. Card timing hooks
    gui_hooks.reviewer_did_show_question.append(on_card_will_show)
    gui_hooks.reviewer_did_answer_card.append(on_card_answered)

    # 4. Pycmd hook for web communication
    if hasattr(gui_hooks, "webview_did_receive_js_message"):
        gui_hooks.webview_did_receive_js_message.append(on_webview_bridge_cmd)

    # 5. Menu items under Tools
    action_open = mw.form.menuTools.addAction("Open Ankicaster Magic Academy")
    action_open.triggered.connect(open_ankicaster_window)

    action_export = mw.form.menuTools.addAction("Export Ankicaster Snapshot (Read-Only)")
    action_export.triggered.connect(export_collection_snapshot)
