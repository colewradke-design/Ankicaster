# Anki toolbar checklist (Style A)

Python is not part of `npm test`. Run `python3 tests/banner_adjust_test.py` for the pure helpers
(`adjust_summary`, `format_chip`, `format_build_chip`, `format_service_chip`, `truncate_label`).
They mirror `buildChip` / `serviceChip` / `truncateLabel` in `src/utils/banner.ts`.

How it hooks in: `gui_hooks.webview_will_set_content` appends `toolbar/ankicaster-toolbar.css` and
`toolbar/ankicaster-toolbar.js` (served from the add-on web exports) when the context is
`aqt.toolbar.TopToolbar`. Clicks call `pycmd('ankicaster:open')`, caught by
`gui_hooks.webview_did_receive_js_message`. Numbers are pushed with
`mw.toolbar.web.eval("window.ankicasterToolbar && window.ankicasterToolbar.update(...)")`.
Reference look: `docs/mockups/a2.png`.

Checked by hand in Anki:

- [ ] Night mode: Anki's toolbar sits inside one rounded dark-violet bar with an amber border and ✦ corner ornaments. Left: "🏰 Ankicaster" and "✦ 1,240 Mana". Right: build and service chips with 44px gold bars and the reviews-left number.
- [ ] Day mode: parchment bar, brown text, gold bars. Switching the theme in Preferences repaints without a restart.
- [ ] Decks, Add, Browse, Stats and Sync work as before; the sync colour and spinner still show. The old strip under the toolbar is gone.
- [ ] An orb reads "🔮 Nature Lv 2", a grimoire the spell name, a summon "🌀 Summoning" (II / III for higher tiers). Nothing queued is a muted "Idle". A paused site shows "⏸ name". Long names end in "…". Hover shows the full text, e.g. "Library — 42 reviews left (crew of 3) · 1 more queued".
- [ ] Clicking the crest, mana or either chip opens the academy. Shift+A and Tools → Open Ankicaster Magic Academy still work; Shift+A does nothing while a text field has focus.
- [ ] With the game window open, chips follow the school within about a second. With it closed, ten honest reviews then back to Decks: both counts drop by ten and the bars move; nothing finishes until the game opens ("✓"). Mana gains a "+N" tag only when the payout per review is fixed.
- [ ] `show_banner: false` (after restart) gives the stock toolbar. A missing save shows "Your Academy awaits". Any failure logs a line starting with `[Ankicaster]` and leaves the toolbar stock.
- [ ] With the game closed, answering a card ticks the queue chips down right away (also during review).
