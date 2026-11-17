# Anki banner checklist

Python is not part of `npm test`. Run `python3 tests/banner_adjust_test.py` for the pure helper.

The banner is a Qt strip, so these are checked by hand in Anki:

- [ ] On the Decks screen the strip sits directly under the toolbar. It shows mana, the top build, the top service, and Open Ankicaster.
- [ ] Night mode is dark slate with an amber edge. Day mode is parchment (`#fdf6e3`) with dark amber text. Neither wraps; long names ellipsize.
- [ ] The strip hides while a card is showing, and while no profile is open. `show_banner: false` removes it. `banner_hide_in_review: false` keeps it up during review.
- [ ] With the game closed, ten honest reviews, then back to Decks: both reviews-left numbers drop by ten. Mana gains a `+N` tag only when the school still pays a fixed amount per review. Nothing finishes until the game opens. A site with no crew stays "waiting for builders". A paused site stays "paused".
- [ ] At zero the line says "Ready — open to finish". Opening the game is what completes it.
- [ ] With the game window open, the strip matches the school within about a second of a review, a build change, or a service change, and it does not also subtract the pending log.
- [ ] Closing the game window goes back to the save plus the pending adjustment.
- [ ] Shift+A and the Open button open the academy. Shift+A does nothing while a text field has focus. Tools → Open Ankicaster Magic Academy still works.
- [ ] A missing save says "Your Academy awaits". A broken save or a missing toolbar does not raise; the log line starts with `[Ankicaster]`.
