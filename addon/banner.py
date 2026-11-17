"""
Ankicaster banner under Anki's main toolbar.

Read-only. A layout or save failure is logged and swallowed so Anki keeps running.
"""

from typing import Any, Callable, Dict, Optional

_is_window_open: Callable[[], bool] = lambda: False
_load_save: Callable[[], Optional[Dict[str, Any]]] = lambda: None
_pending_count: Callable[[], int] = lambda: 0
_open_game: Callable[[], None] = lambda: None

_live: Optional[Dict[str, Any]] = None
_widget = None
_shortcut = None


def adjust_summary(summary: Optional[Dict[str, Any]], pending_honest: int) -> Optional[Dict[str, Any]]:
    """Lower reviews-left by reviews the game has not replayed yet.

    reviewsLeft < 0 means "waiting for builders" and is left alone.
    A paused build is still labeled paused; its count is not treated as moving.
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
        out[key] = nxt
    each = out.get("manaEach")
    if n and isinstance(each, (int, float)) and each > 0 and float(each).is_integer():
        out["pendingMana"] = int(each) * n
    return out


def _job_text(prefix: str, item: Optional[Dict[str, Any]], empty: str) -> str:
    if not isinstance(item, dict) or not item.get("name"):
        return empty
    name = str(item.get("name"))
    if item.get("paused"):
        return f"{prefix} {name} — paused"
    try:
        left = int(item.get("reviewsLeft"))
    except (TypeError, ValueError):
        left = -1
    if left < 0:
        return f"{prefix} {name} — waiting for builders"
    if left == 0:
        return f"{prefix} {name} — Ready — open to finish"
    word = "review" if left == 1 else "reviews"
    return f"{prefix} {name} — {left} {word} left"


def banner_lines(summary: Optional[Dict[str, Any]], live: bool) -> tuple:
    """Three elided segments: mana, build, service."""
    if not isinstance(summary, dict):
        return ("Your Academy awaits", "Nothing building", "No services queued")
    try:
        mana = int(round(float(summary.get("mana") or 0)))
    except (TypeError, ValueError):
        mana = 0
    mana_txt = f"✦ {mana:,} Mana"
    pending = summary.get("pendingMana")
    if not live and isinstance(pending, (int, float)) and pending > 0:
        mana_txt += f"  +{int(pending)}"
    build_txt = _job_text("🔨", summary.get("build"), "🔨 Nothing building")
    service_txt = _job_text("🔮", summary.get("service"), "🔮 No services queued")
    return (mana_txt, build_txt, service_txt)


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


def _night_mode() -> bool:
    try:
        from aqt.theme import theme_manager

        return bool(theme_manager.night_mode)
    except Exception:
        return True


def refresh_banner() -> None:
    widget = _widget
    if widget is None:
        return
    try:
        widget.apply(_config_flag("show_banner", True), _config_flag("banner_hide_in_review", True))
    except Exception as e:
        print(f"[Ankicaster] banner refresh failed: {e}")


def _on_state(new_state: str, _old_state: str = "") -> None:
    try:
        if _widget is not None:
            _widget.note_state(new_state)
        refresh_banner()
    except Exception as e:
        print(f"[Ankicaster] banner state change failed: {e}")


def install_banner() -> None:
    """Insert the banner directly under the toolbar. Never raises."""
    global _widget, _shortcut
    try:
        from aqt import mw, gui_hooks
        from aqt.qt import (
            QFontMetrics,
            QHBoxLayout,
            QLabel,
            QPainter,
            QPushButton,
            QShortcut,
            QKeySequence,
            QSizePolicy,
            Qt,
            QWidget,
        )
    except Exception as e:
        print(f"[Ankicaster] banner imports unavailable: {e}")
        return

    if not mw or getattr(mw, "mainLayout", None) is None or getattr(mw, "toolbarWeb", None) is None:
        print("[Ankicaster] banner skipped: main window layout is not ready")
        return

    class ElidingLabel(QLabel):
        def paintEvent(self, event):  # noqa: N802
            try:
                painter = QPainter(self)
                metrics = QFontMetrics(self.font())
                flag = getattr(Qt, "TextElideMode", Qt).ElideRight
                text = metrics.elidedText(self.text() or "", flag, max(0, self.width() - 2))
                align = getattr(Qt, "AlignmentFlag", Qt)
                painter.drawText(self.rect(), int(align.AlignVCenter | align.AlignLeft), text)
                painter.end()
            except Exception:
                try:
                    super().paintEvent(event)
                except Exception:
                    pass

    class BannerWidget(QWidget):
        def __init__(self, parent=None):
            super().__init__(parent)
            self.setObjectName("ankicasterBanner")
            self.setFixedHeight(38)
            self._state = "deckBrowser"
            self._night = True
            policy = QSizePolicy.Policy.Expanding if hasattr(QSizePolicy, "Policy") else QSizePolicy.Expanding
            self.setSizePolicy(policy, QSizePolicy.Policy.Fixed if hasattr(QSizePolicy, "Policy") else QSizePolicy.Fixed)

            row = QHBoxLayout(self)
            row.setContentsMargins(10, 0, 8, 0)
            row.setSpacing(10)

            self.brand = QLabel("🏰 Ankicaster")
            self.brand.setStyleSheet("background: transparent; font-weight: 700;")
            self.mana = ElidingLabel("")
            self.build = ElidingLabel("")
            self.service = ElidingLabel("")
            for lab in (self.mana, self.build, self.service):
                lab.setStyleSheet("background: transparent;")
                lab.setSizePolicy(policy, QSizePolicy.Policy.Preferred if hasattr(QSizePolicy, "Policy") else QSizePolicy.Preferred)
            self.open_btn = QPushButton("Open Ankicaster")
            self.open_btn.setCursor(getattr(Qt, "CursorShape", Qt).PointingHandCursor)
            self.open_btn.clicked.connect(self._open)

            row.addWidget(self.brand)
            row.addWidget(self.mana, 1)
            row.addWidget(self.build, 2)
            row.addWidget(self.service, 2)
            row.addWidget(self.open_btn)

        def mousePressEvent(self, event):  # noqa: N802
            self._open()
            try:
                super().mousePressEvent(event)
            except Exception:
                pass

        def _open(self) -> None:
            try:
                _open_game()
            except Exception as e:
                print(f"[Ankicaster] banner open failed: {e}")

        def note_state(self, new_state: str) -> None:
            self._state = new_state or ""

        def apply(self, show: bool, hide_in_review: bool) -> None:
            self._night = _night_mode()
            visible_state = self._state in ("deckBrowser", "overview")
            if not hide_in_review and self._state == "review":
                visible_state = True
            no_profile = True
            try:
                no_profile = mw.col is None
            except Exception:
                no_profile = True
            self.setVisible(bool(show) and visible_state and not no_profile)
            self._paint_theme()
            summary, live = _display_source()
            mana, build, service = banner_lines(summary, live)
            self.mana.setText(mana)
            self.build.setText(build)
            self.service.setText(service)
            self.mana.setToolTip(mana)
            self.build.setToolTip(build)
            self.service.setToolTip(service)

        def _paint_theme(self) -> None:
            if self._night:
                self.setStyleSheet(
                    """
                    QWidget#ankicasterBanner {
                        background: qlineargradient(x1:0, y1:0, x2:0, y2:1, stop:0 #1e293b, stop:1 #0f172a);
                        border-bottom: 2px solid #f59e0b;
                        font-family: "Segoe UI", "Helvetica Neue", Arial, sans-serif;
                        font-size: 13px;
                    }
                    QLabel { color: #fcd34d; }
                    QPushButton {
                        background: #78350f;
                        color: #fcd34d;
                        border: 1px solid #f59e0b;
                        border-radius: 5px;
                        padding: 3px 10px;
                        font-weight: 700;
                    }
                    QPushButton:hover { background: #92400e; }
                    """
                )
            else:
                self.setStyleSheet(
                    """
                    QWidget#ankicasterBanner {
                        background: #fdf6e3;
                        border-bottom: 2px solid #b45309;
                        font-family: "Segoe UI", "Helvetica Neue", Arial, sans-serif;
                        font-size: 13px;
                    }
                    QLabel { color: #78350f; }
                    QPushButton {
                        background: #fef3c7;
                        color: #78350f;
                        border: 1px solid #b45309;
                        border-radius: 5px;
                        padding: 3px 10px;
                        font-weight: 700;
                    }
                    QPushButton:hover { background: #fde68a; }
                    """
                )

    try:
        layout = mw.mainLayout
        toolbar = mw.toolbarWeb
        index = layout.indexOf(toolbar)
        widget = BannerWidget(mw)
        if index < 0:
            layout.insertWidget(1, widget)
        else:
            layout.insertWidget(index + 1, widget)
        _widget = widget
    except Exception as e:
        print(f"[Ankicaster] banner layout failed: {e}")
        return

    try:
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

    try:
        if gui_hooks and hasattr(gui_hooks, "state_did_change"):
            gui_hooks.state_did_change.append(_on_state)
        if gui_hooks and hasattr(gui_hooks, "theme_did_change"):
            gui_hooks.theme_did_change.append(lambda: refresh_banner())
    except Exception as e:
        print(f"[Ankicaster] banner hooks failed: {e}")

    try:
        state = mw.state if hasattr(mw, "state") else "deckBrowser"
        _on_state(state or "deckBrowser")
    except Exception as e:
        print(f"[Ankicaster] banner first paint failed: {e}")
