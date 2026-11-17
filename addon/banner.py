"""
Ankicaster theme for Anki's own top toolbar (Style A).

Anki draws the top toolbar as a web page. We append a stylesheet and a small
script to it through gui_hooks.webview_will_set_content, which wrap Anki's
links in a gold-framed bar with mana on the left and the two queues on the right.

Read-only. Every hook is wrapped so a failure is logged with "[Ankicaster]" and
Anki's own Decks / Add / Browse / Stats / Sync links keep working untouched.
"""

import json
from typing import Any, Callable, Dict, Optional

_is_window_open: Callable[[], bool] = lambda: False
_load_save: Callable[[], Optional[Dict[str, Any]]] = lambda: None
_pending_count: Callable[[], int] = lambda: 0
_open_game: Callable[[], None] = lambda: None

_live: Optional[Dict[str, Any]] = None
_shortcut = None
_installed = False
_state = "deckBrowser"

CHIP_LABEL_MAX = 14
_ROMAN = {2: "II", 3: "III"}


# ---------------------------------------------------------------------------
# Pure helpers (tests/banner_adjust_test.py). Mirror src/utils/banner.ts.
# ---------------------------------------------------------------------------

def adjust_summary(summary: Optional[Dict[str, Any]], pending_honest: int) -> Optional[Dict[str, Any]]:
    """Lower reviews-left by reviews the game has not replayed yet.

    reviewsLeft < 0 means "waiting for builders" and is left alone.
    A paused job is not moved. When totalReviews is known the bar moves too.
    manaEach, when present, is a fixed whole-mana payout per pending review.
    """
    if not isinstance(summary, dict):
        return None
    try:
        n = max(0, int(pending_honest or 0))
    except (TypeError, ValueError):
        n = 0
    out = dict(summary)
    for key in ("build", "service"):
        item = out.get(key)
        if not isinstance(item, dict):
            continue
        if item.get("paused"):
            continue
        left = item.get("reviewsLeft")
        if not isinstance(left, (int, float)) or left < 0:
            continue
        nxt = dict(item)
        nxt["reviewsLeft"] = max(0, int(left) - n)
        total = item.get("totalReviews")
        if n and isinstance(total, (int, float)) and total > 0:
            done = max(0, min(int(total), int(total) - nxt["reviewsLeft"]))
            pct = int(done * 100 // int(total))
            old = item.get("progressPct")
            nxt["progressPct"] = max(pct, int(old) if isinstance(old, (int, float)) else 0)
        out[key] = nxt
    each = out.get("manaEach")
    if n and isinstance(each, (int, float)) and each > 0 and float(each).is_integer():
        out["pendingMana"] = int(each) * n
    return out


def truncate_label(text: Any, limit: int = CHIP_LABEL_MAX) -> str:
    s = str(text or "")
    if len(s) <= limit:
        return s
    return s[: limit - 1].rstrip() + "…"


def _plural(n: int, word: str) -> str:
    return f"{n} {word}{'' if n == 1 else 's'}"


def _left_text(left: int) -> str:
    if left < 0:
        return "waiting for builders"
    if left == 0:
        return "done, completes when the Academy opens"
    return f"{_plural(left, 'review')} left"


def _count_text(left: int) -> str:
    if left < 0:
        return "…"
    if left == 0:
        return "✓"
    return str(left)


def _queued_text(n: Any) -> str:
    try:
        n = int(n or 0)
    except (TypeError, ValueError):
        n = 0
    return f" · {n} more queued" if n > 0 else ""


def _int(value: Any, default: int) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _pct(item: Dict[str, Any]) -> int:
    return max(0, min(100, _int(item.get("progressPct"), 0)))


def format_build_chip(job: Any) -> Dict[str, Any]:
    if not isinstance(job, dict) or not job.get("name"):
        return {"icon": "🔨", "label": "Idle", "muted": True, "pct": None, "count": "", "title": "Nothing building"}
    name = str(job.get("name"))
    left = _int(job.get("reviewsLeft"), -1)
    paused = bool(job.get("paused"))
    crew_n = _int(job.get("crew"), 0)
    crew = f" (crew of {crew_n})" if crew_n > 0 and not paused else ""
    status = f"paused, {_left_text(left) if left >= 0 else 'waiting'}" if paused else _left_text(left)
    return {
        "icon": "⏸" if paused else "🔨",
        "label": truncate_label(name),
        "muted": False,
        "pct": _pct(job),
        "count": _count_text(left),
        "title": f"{name} — {status}{crew}{_queued_text(job.get('queuedCount'))}",
    }


def format_service_chip(svc: Any) -> Dict[str, Any]:
    if not isinstance(svc, dict) or (not svc.get("kind") and not svc.get("name")):
        return {"icon": "🔮", "label": "Idle", "muted": True, "pct": None, "count": "", "title": "No services queued"}
    kind = svc.get("kind")
    left = max(0, _int(svc.get("reviewsLeft"), 0))
    icon = "🔮"
    if kind == "grimoire":
        icon = "📖"
        label = str(svc.get("spellName") or "Grimoire")
        what = f"Studying the grimoire: {label}"
    elif kind == "summon":
        icon = "🌀"
        roman = _ROMAN.get(_int(svc.get("summonTier"), 1))
        label = f"Summoning {roman}" if roman else "Summoning"
        what = f"Summoning a servant (tier {roman})" if roman else "Summoning a servant"
    elif kind != "orb":
        label = str(svc.get("name"))
        what = label
    else:
        school = str(svc.get("school") or "Arcane")
        lv = _int(svc.get("targetLevel"), 1) or 1
        label = f"{school} Lv {lv}"
        what = f"Pondering {school} to level {lv}"
    paused = bool(svc.get("paused"))
    if paused:
        icon = "⏸"
    return {
        "icon": icon,
        "label": truncate_label(label),
        "muted": False,
        "pct": _pct(svc),
        "count": _count_text(left),
        "title": f"{what} — {'paused, ' if paused else ''}{_left_text(left)}{_queued_text(svc.get('queuedCount'))}",
    }


def format_chip(summary: Optional[Dict[str, Any]], live: bool = True) -> Dict[str, Any]:
    """Everything the toolbar script paints, as plain JSON-safe values."""
    if not isinstance(summary, dict):
        return {
            "mana": None,
            "manaText": "Your Academy awaits",
            "manaTitle": "Open Ankicaster",
            "pending": "",
            "build": format_build_chip(None),
            "service": format_service_chip(None),
        }
    raw_mana = summary.get("mana")
    mana = max(0, int(round(raw_mana))) if isinstance(raw_mana, (int, float)) else 0
    pending = summary.get("pendingMana")
    pending_txt = ""
    if not live and isinstance(pending, (int, float)) and pending > 0:
        pending_txt = f"+{int(pending)}"
    title = f"{mana:,} Mana"
    if pending_txt:
        title += f" ({pending_txt} from reviews since you last opened the Academy)"
    return {
        "mana": f"{mana:,}",
        "manaText": "Mana",
        "manaTitle": title,
        "pending": pending_txt,
        "build": format_build_chip(summary.get("build")),
        "service": format_service_chip(summary.get("service")),
    }


# ---------------------------------------------------------------------------
# Data source (unchanged contract from the old banner)
# ---------------------------------------------------------------------------

def configure(
    is_window_open: Callable[[], bool],
    load_save: Callable[[], Optional[Dict[str, Any]]],
    pending_count: Callable[[], int],
    open_game: Callable[[], None],
) -> None:
    global _is_window_open, _load_save, _pending_count, _open_game
    _is_window_open = is_window_open
    _load_save = load_save
    _pending_count = pending_count
    _open_game = open_game


def set_live_summary(summary: Optional[Dict[str, Any]]) -> None:
    """Game window is the source of truth. Pending reviews are already inside this summary."""
    global _live
    if not _is_window_open():
        return
    if isinstance(summary, dict):
        _live = summary
    refresh_banner()


def clear_live_summary() -> None:
    global _live
    _live = None


def _display_source() -> tuple:
    """(summary or None, live). Live skips the pending-review adjustment."""
    try:
        if _is_window_open() and isinstance(_live, dict):
            return _live, True
        saved = _load_save()
        raw = saved.get("bannerSummary") if isinstance(saved, dict) else None
        if _is_window_open():
            return raw if isinstance(raw, dict) else None, True
        return adjust_summary(raw if isinstance(raw, dict) else None, _pending_count()), False
    except Exception as e:
        print(f"[Ankicaster] banner summary failed: {e}")
        return None, False


def _config_flag(name: str, default: bool) -> bool:
    try:
        from aqt import mw

        if not mw or not mw.addonManager:
            return default
        pkg = __name__.split(".")[0]
        cfg = mw.addonManager.getConfig(pkg) or {}
        if name not in cfg:
            return default
        return bool(cfg.get(name))
    except Exception:
        return default


def _package() -> str:
    try:
        from aqt import mw

        return mw.addonManager.addonFromModule(__name__)
    except Exception:
        return __name__.split(".")[0]


# ---------------------------------------------------------------------------
# Toolbar web view
# ---------------------------------------------------------------------------

def _is_top_toolbar(context: Any) -> bool:
    try:
        from aqt.toolbar import TopToolbar

        if isinstance(context, TopToolbar):
            return True
    except Exception:
        pass
    # Older or patched builds: match by class name, never the bottom bar.
    return type(context).__name__ == "TopToolbar"


def _toolbar_web():
    try:
        from aqt import mw

        toolbar = getattr(mw, "toolbar", None)
        return getattr(toolbar, "web", None) or getattr(mw, "toolbarWeb", None)
    except Exception:
        return None


def toolbar_payload() -> Dict[str, Any]:
    summary, live = _display_source()
    payload = format_chip(summary, live)
    payload["enabled"] = _config_flag("show_banner", True)
    payload["live"] = bool(live)
    return payload


def refresh_banner() -> None:
    """Push fresh numbers into the toolbar. A no-op until our script is on the page."""
    if not _installed:
        return
    web = _toolbar_web()
    if web is None:
        return
    try:
        data = json.dumps(toolbar_payload(), ensure_ascii=False)
        web.eval(f"window.ankicasterToolbar && window.ankicasterToolbar.update({data});")
    except Exception as e:
        print(f"[Ankicaster] toolbar refresh failed: {e}")


def _fit_height() -> None:
    web = _toolbar_web()
    try:
        if web is not None and hasattr(web, "adjustHeightToFit"):
            web.adjustHeightToFit()
    except Exception as e:
        print(f"[Ankicaster] toolbar height fit failed: {e}")


def on_webview_will_set_content(web_content: Any, context: Any) -> None:
    try:
        if not _is_top_toolbar(context):
            return
        if not _config_flag("show_banner", True):
            return
        pkg = _package()
        web_content.css.append(f"/_addons/{pkg}/toolbar/ankicaster-toolbar.css")
        web_content.js.append(f"/_addons/{pkg}/toolbar/ankicaster-toolbar.js")
    except Exception as e:
        print(f"[Ankicaster] toolbar styling skipped: {e}")


def on_js_message(handled: tuple, message: str, context: Any) -> tuple:
    try:
        if not isinstance(message, str) or not message.startswith("ankicaster:"):
            return handled
        if not _is_top_toolbar(context):
            return handled
        if message == "ankicaster:open":
            try:
                _open_game()
            except Exception as e:
                print(f"[Ankicaster] toolbar open failed: {e}")
            return (True, None)
        if message == "ankicaster:toolbarReady":
            refresh_banner()
            _fit_height()
            return (True, None)
        return (True, None)
    except Exception as e:
        print(f"[Ankicaster] toolbar message failed: {e}")
        return handled


def _on_state(new_state: str, _old_state: str = "") -> None:
    global _state
    try:
        _state = new_state or ""
        refresh_banner()
    except Exception as e:
        print(f"[Ankicaster] toolbar state change failed: {e}")


def _install_shortcut() -> None:
    global _shortcut
    try:
        from aqt import mw
        from aqt.qt import QKeySequence, QShortcut, Qt

        shortcut = QShortcut(QKeySequence("Shift+A"), mw)
        context = getattr(Qt, "ShortcutContext", Qt).WindowShortcut
        shortcut.setContext(context)

        def _shift_a() -> None:
            try:
                from aqt.qt import QApplication

                focused = QApplication.focusWidget()
                if focused is not None:
                    cls = focused.metaObject().className()
                    if cls in ("QLineEdit", "QTextEdit", "QPlainTextEdit", "QSpinBox"):
                        return
                _open_game()
            except Exception as e:
                print(f"[Ankicaster] Shift+A failed: {e}")

        shortcut.activated.connect(_shift_a)
        _shortcut = shortcut
    except Exception as e:
        print(f"[Ankicaster] Shift+A shortcut failed: {e}")


def install_banner() -> None:
    """Theme Anki's top toolbar. Never raises; on any failure the toolbar stays stock."""
    global _installed
    try:
        from aqt import mw, gui_hooks
    except Exception as e:
        print(f"[Ankicaster] toolbar imports unavailable: {e}")
        return

    _install_shortcut()

    try:
        for name in ("webview_will_set_content", "webview_did_receive_js_message"):
            if not hasattr(gui_hooks, name):
                print(f"[Ankicaster] toolbar styling skipped: gui_hooks.{name} is missing")
                return
        gui_hooks.webview_will_set_content.append(on_webview_will_set_content)
        gui_hooks.webview_did_receive_js_message.append(on_js_message)
        if hasattr(gui_hooks, "state_did_change"):
            gui_hooks.state_did_change.append(_on_state)
        if hasattr(gui_hooks, "profile_did_open"):
            gui_hooks.profile_did_open.append(lambda: refresh_banner())
        if hasattr(gui_hooks, "theme_did_change"):
            gui_hooks.theme_did_change.append(lambda: refresh_banner())
        _installed = True
    except Exception as e:
        print(f"[Ankicaster] toolbar hooks failed: {e}")
        return

    # Anki draws the toolbar before add-ons load, so draw it once more with our styling.
    try:
        toolbar = getattr(mw, "toolbar", None)
        if toolbar is not None and _config_flag("show_banner", True):
            toolbar.draw()
    except Exception as e:
        print(f"[Ankicaster] toolbar redraw failed: {e}")
