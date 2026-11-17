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
    from aqt.qt import QDialog, QVBoxLayout, QUrl
    try:
        from aqt.webview import AnkiWebView
    except ImportError:
        AnkiWebView = None  # type: ignore
except ImportError:
    # Standalone execution fallback
    mw = None
    gui_hooks = None
    QDialog = object  # type: ignore
    AnkiWebView = None  # type: ignore

ADDON_PACKAGE_NAME = "ankicaster_magic_academy"
DEFAULT_CONFIG = {
    "install_baseline_ms": 0,
    "min_answer_elapsed_ms": 800,
    "auto_open_on_startup": False,
    "sync_saves": False,
    "show_banner": True,
}

_card_shown_timestamp: float = 0.0
_ankicaster_dialog = None

def get_package_name() -> str:
    """Return top-level add-on folder name for web asset serving."""
    return __name__.split(".")[0]

def get_config() -> Dict[str, Any]:
    if mw and mw.addonManager:
        cfg = mw.addonManager.getConfig(get_package_name())
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

    pkg = get_package_name()
    cfg = mw.addonManager.getConfig(pkg) or {}
    baseline = cfg.get("install_baseline_ms", 0)
    if not baseline or baseline <= 0:
        baseline = int(time.time() * 1000)
        cfg["install_baseline_ms"] = baseline
        mw.addonManager.writeConfig(pkg, cfg)
    return baseline

def sync_saves_enabled() -> bool:
    return bool(get_config().get("sync_saves", False))

def set_sync_saves(enabled: bool) -> None:
    if not mw or not mw.addonManager:
        return
    pkg = get_package_name()
    cfg = mw.addonManager.getConfig(pkg) or {}
    cfg["sync_saves"] = bool(enabled)
    if "install_baseline_ms" not in cfg:
        cfg["install_baseline_ms"] = get_or_create_install_baseline()
    mw.addonManager.writeConfig(pkg, cfg)

def _revision(save: Optional[Dict[str, Any]]) -> int:
    if not isinstance(save, dict):
        return 0
    try:
        return int(save.get("saveRevisionMs") or 0)
    except Exception:
        return 0

def _review_count(save: Optional[Dict[str, Any]]) -> int:
    if not isinstance(save, dict):
        return 0
    try:
        return int(save.get("reviewIndex") or 0)
    except Exception:
        return 0

def review_cursor(save: Optional[Dict[str, Any]]) -> int:
    """Newest revlog id already considered. Missing cursor falls back to the paid id list."""
    if not isinstance(save, dict):
        return 0
    raw = save.get("revlogCursor")
    if isinstance(raw, (int, float)) and int(raw) > 0:
        return int(raw)
    cursor = 0
    for entry in save.get("processedReviewIds") or []:
        try:
            cursor = max(cursor, int(entry))
        except Exception:
            continue
    return cursor

def review_baseline(save: Optional[Dict[str, Any]]) -> int:
    if isinstance(save, dict):
        try:
            baseline = int(save.get("installBaselineMs") or 0)
            if baseline > 0:
                return baseline
        except Exception:
            pass
    return get_or_create_install_baseline()

def load_collection_save() -> Optional[Dict[str, Any]]:
    if not mw or not mw.col:
        return None
    try:
        raw = mw.col.get_config("ankicasterSave", None)
    except Exception as e:
        print(f"[Ankicaster] Collection save read failed: {e}")
        return None
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except Exception:
            return None
    return raw if isinstance(raw, dict) else None

def choose_save(local: Optional[Dict[str, Any]], remote: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """Local file always wins unless this computer opted into save sync."""
    if not sync_saves_enabled() or remote is None:
        return local
    if local is None:
        return remote
    # A brand-new school on this machine must not bury a school that already has reviews.
    if _review_count(local) == 0 and _review_count(remote) > 0 and not (local.get("characters") or []):
        return remote
    return remote if _revision(remote) > _revision(local) else local

def query_reviews_since(cursor_ms: int, baseline_ms: int) -> list:
    """
    Study rows from every device. type 0/1/2 are learning, review, and relearn.
    type 3 is a cram, type 4 is a hand reschedule.
    """
    if not mw or not mw.col or not mw.col.db:
        return []
    floor = max(int(cursor_ms), int(baseline_ms) - 1)
    try:
        rows = mw.col.db.all(
            """
            SELECT id, cid, ease, ivl, lastIvl, time, type
            FROM revlog
            WHERE id > ? AND type IN (0, 1, 2)
            ORDER BY id ASC
            """,
            floor,
        )
    except Exception as e:
        print(f"[Ankicaster] Revlog catch-up query error: {e}")
        return []

    reviews = []
    for row in rows or []:
        try:
            revlog_id = int(row[0])
            if revlog_id < baseline_ms:
                continue
            ease = int(row[2] or 3)
            if ease < 1 or ease > 4:
                ease = 3
            ivl = int(row[3] or 0)
            last_ivl = int(row[4] or 0)
            if ivl < 0:
                ivl = 0
            if last_ivl < 0:
                last_ivl = 0
            age = max(0, min(ivl, last_ivl))
            reviews.append({
                "card_id": int(row[1]),
                "ease": ease,
                "elapsed_ms": max(0, int(row[5] or 0)),
                "card_age": age,
                "review_id": str(revlog_id),
                "answered_at_ms": revlog_id
            })
        except Exception:
            continue
    return reviews

def push_revlog_catchup() -> None:
    dialog = _ankicaster_dialog
    if dialog is None or not getattr(dialog, "is_ready", False) or not getattr(dialog, "web_view", None):
        return
    save = load_saved_game_state()
    reviews = query_reviews_since(review_cursor(save), review_baseline(save))
    if not reviews:
        return
    try:
        payload = json.dumps(reviews)
        dialog.web_view.page().runJavaScript(
            f"if (window.ankicasterReplayPendingReviews) {{ window.ankicasterReplayPendingReviews({payload}); }}"
        )
    except Exception as e:
        print(f"[Ankicaster] Revlog catch-up send failed: {e}")

def on_sync_finished(*_args: Any) -> None:
    push_revlog_catchup()
    try:
        from .banner import refresh_banner
        refresh_banner()
    except Exception as e:
        print(f"[Ankicaster] banner refresh after sync failed: {e}")


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
    Treat lastIvl <= 0 as 0 in card_age.
    """
    cur_ivl = getattr(card, "ivl", 0)
    if cur_ivl < 0:
        cur_ivl = 0

    last_ivl = query_previous_interval(getattr(card, "id", 0))
    if last_ivl <= 0:
        last_ivl = 0

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

def on_card_answered(reviewer: Any, card: Any, ease: int) -> None:
    """
    Hook called after user answers a card.
    STRICTLY READ-ONLY: Reads card state without altering database or scheduling.
    """
    answered_at_ms = int(time.time() * 1000)
    if _card_shown_timestamp <= 0:
        elapsed_ms = 0
    else:
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

    # 3. With the game closed, tick the toolbar queue down from the pending log.
    try:
        from .banner import refresh_banner
        refresh_banner()
    except Exception as e:
        print(f"[Ankicaster] banner refresh after review failed: {e}")

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
            last_ivl = max(0, int(raw_last_ivl)) if (raw_last_ivl is not None and int(raw_last_ivl) > 0) else 0
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

def acknowledge_pending_reviews(ack_ids: list) -> None:
    """
    Remove ONLY the exact acknowledged review IDs from ankicaster_pending_reviews.jsonl.
    Never wipes the file when an ID isn't found.
    """
    user_dir = mw.pm.profileFolder() if mw and mw.pm else "."
    log_path = os.path.join(user_dir, "ankicaster_pending_reviews.jsonl")
    if not os.path.exists(log_path):
        return

    ack_set = {str(i) for i in ack_ids if i}
    if not ack_set:
        return

    try:
        with open(log_path, "r", encoding="utf-8") as f:
            lines = [line.strip() for line in f if line.strip()]

        remaining = []
        for line in lines:
            try:
                rec = json.loads(line)
                r_id = str(rec.get("review_id", ""))
                if r_id in ack_set:
                    continue
                remaining.append(line)
            except Exception:
                remaining.append(line)

        tmp_path = log_path + ".tmp"
        with open(tmp_path, "w", encoding="utf-8") as f:
            for line in remaining:
                f.write(line + "\n")
        os.replace(tmp_path, log_path)
    except Exception as e:
        print(f"[Ankicaster] Error acknowledging reviews: {e}")

def get_save_file_path() -> str:
    """Return path to user_files/<profile name>/save.json to match per-profile reviews."""
    addon_dir = os.path.dirname(os.path.abspath(__file__))
    profile_name = mw.pm.name if mw and mw.pm and hasattr(mw.pm, 'name') and mw.pm.name else "default"
    user_files_dir = os.path.join(addon_dir, "user_files", str(profile_name))
    if not os.path.exists(user_files_dir):
        os.makedirs(user_files_dir, exist_ok=True)
    return os.path.join(user_files_dir, "save.json")

def load_saved_game_state() -> Optional[Dict[str, Any]]:
    """Local save.json, or the newer collection copy when save sync is on."""
    local = None
    path = get_save_file_path()
    if os.path.exists(path):
        try:
            with open(path, "r", encoding="utf-8") as f:
                loaded = json.load(f)
            if isinstance(loaded, dict):
                local = loaded
        except Exception as e:
            print(f"[Ankicaster] Error loading save.json: {e}")
    return choose_save(local, load_collection_save())

def write_saved_game_state(save_data: str) -> bool:
    """Write save.json. Also write the collection when this computer opted in."""
    try:
        parsed = json.loads(save_data)
    except Exception:
        parsed = None
    if isinstance(parsed, dict):
        parsed["saveRevisionMs"] = int(time.time() * 1000)
        save_data = json.dumps(parsed)
    try:
        path = get_save_file_path()
        tmp_path = path + ".tmp"
        with open(tmp_path, "w", encoding="utf-8") as f:
            f.write(save_data)
        os.replace(tmp_path, path)
    except Exception as e:
        print(f"[Ankicaster] Error saving save.json: {e}")
        return False
    if sync_saves_enabled() and isinstance(parsed, dict) and mw and mw.col:
        try:
            mw.col.set_config("ankicasterSave", parsed)
        except Exception as e:
            print(f"[Ankicaster] Collection save write failed: {e}")
            return False
    try:
        from .banner import refresh_banner
        refresh_banner()
    except Exception as e:
        print(f"[Ankicaster] banner refresh after save failed: {e}")
    return True

class AnkicasterDialog(QDialog):
    """Dedicated window inside Anki running the production Ankicaster web application."""
    def __init__(self, parent=None, local_url: str = ""):
        super().__init__(parent)
        self.setWindowTitle("Ankicaster — Magic Academy & Spaced-Repetition Simulator")
        self.resize(1340, 880)
        self.setMinimumSize(960, 640)
        self.is_ready = False
        self.local_url = local_url

        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)

        if AnkiWebView is not None:
            self.web_view = AnkiWebView(self)
            self.web_view.set_open_links_externally(False)
            self.web_view.set_bridge_command(self.handle_pycmd, self)
            self.web_view.load_url(QUrl(local_url))
            layout.addWidget(self.web_view)
        else:
            showInfo("AnkiWebView is required to display Ankicaster within Anki.")

    def reload_view(self) -> None:
        """Reset is_ready, set link handling, and reload page URL."""
        self.is_ready = False
        if hasattr(self, 'web_view') and self.web_view:
            self.web_view.set_open_links_externally(False)
            self.web_view.load_url(QUrl(self.local_url))

    def handle_pycmd(self, cmd: str) -> None:
        """Handle pycmd messages from Ankicaster web application."""
        if cmd == "ankicaster:ready":
            self.is_ready = True
            self.on_frontend_ready()
        elif cmd.startswith("ankicaster:ack:"):
            ack_id = cmd[len("ankicaster:ack:"):]
            ids = [i.strip() for i in ack_id.split(",") if i.strip()]
            acknowledge_pending_reviews(ids)
        elif cmd.startswith("ankicaster:save:"):
            save_payload = cmd[len("ankicaster:save:"):]
            write_saved_game_state(save_payload)
        elif cmd.startswith("ankicaster:banner:"):
            raw = cmd[len("ankicaster:banner:"):]
            try:
                from .banner import set_live_summary
                parsed = json.loads(raw)
                set_live_summary(parsed if isinstance(parsed, dict) else None)
            except Exception as e:
                print(f"[Ankicaster] banner live update failed: {e}")
        elif cmd == "ankicaster:syncSaves:1" or cmd == "ankicaster:syncSaves:0":
            enabled = cmd.endswith(":1")
            set_sync_saves(enabled)
            if enabled and self.web_view:
                chosen = load_saved_game_state()
                reviews = query_reviews_since(review_cursor(chosen), review_baseline(chosen))
                parts = []
                if chosen is not None:
                    parts.append(
                        f"if (window.ankicasterLoadSavedGame) {{ window.ankicasterLoadSavedGame({json.dumps(chosen)}); }}"
                    )
                if reviews:
                    parts.append(
                        f"if (window.ankicasterReplayPendingReviews) {{ window.ankicasterReplayPendingReviews({json.dumps(reviews)}); }}"
                    )
                if parts:
                    self.web_view.page().runJavaScript("\n".join(parts))

    def on_frontend_ready(self) -> None:
        """Called once the App bridge effect has registered all handlers and emitted ankicaster:ready."""
        if not self.web_view:
            return

        # 1. Send saved game state from user_files/save.json if it exists, otherwise send null
        saved_state = load_saved_game_state()
        if saved_state is not None:
            save_json = json.dumps(saved_state)
            js_load = f"if (window.ankicasterLoadSavedGame) {{ window.ankicasterLoadSavedGame({save_json}); }}"
        else:
            js_load = "if (window.ankicasterLoadSavedGame) { window.ankicasterLoadSavedGame(null); }"
        self.web_view.page().runJavaScript(js_load)

        sync_flag = "true" if sync_saves_enabled() else "false"
        self.web_view.page().runJavaScript(
            f"if (window.ankicasterSetSyncSaves) {{ window.ankicasterSetSyncSaves({sync_flag}); }}"
        )

        # 2. Send full collection snapshot
        snapshot = get_non_suspended_cards_snapshot()
        if snapshot:
            snap_json = json.dumps(snapshot)
            js_snap = f"if (window.ankicasterLoadSnapshot) {{ window.ankicasterLoadSnapshot({snap_json}); }}"
            self.web_view.page().runJavaScript(js_snap)

        # 3. Reviews answered on any device since the cursor, plus anything still queued locally
        pending = get_all_pending_reviews()
        caught_up = query_reviews_since(review_cursor(saved_state), review_baseline(saved_state))
        seen = {str(r.get("review_id")) for r in caught_up}
        merged = list(caught_up)
        for row in pending:
            if str(row.get("review_id")) not in seen:
                merged.append(row)
        if merged:
            pending_json = json.dumps(merged)
            js_replay = f"if (window.ankicasterReplayPendingReviews) {{ window.ankicasterReplayPendingReviews({pending_json}); }}"
            self.web_view.page().runJavaScript(js_replay)

    def closeEvent(self, event) -> None:  # noqa: N802
        self._banner_closed = True
        try:
            from .banner import clear_live_summary, refresh_banner
            clear_live_summary()
            refresh_banner()
        except Exception as e:
            print(f"[Ankicaster] banner close failed: {e}")
        try:
            super().closeEvent(event)
        except Exception:
            if event is not None and hasattr(event, "accept"):
                event.accept()

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
        _ankicaster_dialog.on_frontend_ready()

    _ankicaster_dialog._banner_closed = False
    _ankicaster_dialog.show()
    _ankicaster_dialog.raise_()
    _ankicaster_dialog.activateWindow()

def init_addon() -> None:
    """Register hooks, install baseline, web exports, and menu actions."""
    if not mw or not gui_hooks:
        return

    # 1. Initialize baseline once on load
    get_or_create_install_baseline()

    # 2. Register web exports for static files bundled inside addon under web/
    pkg = get_package_name()
    try:
        mw.addonManager.setWebExports(pkg, r"(web|toolbar)/.*")
    except Exception as e:
        print(f"[Ankicaster] setWebExports notice: {e}")

    # 3. Card timing hooks
    gui_hooks.reviewer_did_show_question.append(on_card_will_show)
    gui_hooks.reviewer_did_answer_card.append(on_card_answered)
    if hasattr(gui_hooks, "sync_did_finish"):
        gui_hooks.sync_did_finish.append(on_sync_finished)

    # 4. Menu item under Tools (removed undefined export_collection_snapshot)
    action_open = mw.form.menuTools.addAction("Open Ankicaster Magic Academy")
    action_open.triggered.connect(open_ankicaster_window)

    # 5. Themed top toolbar (Style A). Failures here must not stop the rest of the add-on.
    try:
        from .banner import configure, install_banner

        def _window_open() -> bool:
            dlg = _ankicaster_dialog
            if dlg is None or getattr(dlg, "_banner_closed", False):
                return False
            try:
                return bool(dlg.isVisible())
            except Exception:
                return False

        def _pending() -> int:
            try:
                return len(get_all_pending_reviews())
            except Exception:
                return 0

        configure(_window_open, load_saved_game_state, _pending, open_ankicaster_window)
        install_banner()
    except Exception as e:
        print(f"[Ankicaster] banner install failed: {e}")
