---
title: "Ankicaster — Visual Overhaul Addendum"
subtitle: "An add-on to the Ankicaster Game Design Document (GDD v1.0): art, a living castle, characters, creatures and character creation"
date: "10 November 2026"
---

# Ankicaster — Visual Overhaul Addendum

**Version:** Addendum V1.0 to *Ankicaster — Game Design Document & Implementation Specification* (GDD v1.0, aligned to Concept Draft 8)
**Date:** 10 November 2026
**For:** Google AI Studio, to be used **after** it finishes the current round of fixes to the existing build
**Target build:** the React 19 + Vite + TypeScript + Tailwind v4 single-page app (`src/App.tsx`, `src/components/CastleGrid.tsx`, `src/components/GamePanels.tsx`, `src/components/TopBar.tsx`, `src/components/FlashcardReviewer.tsx`, `src/utils/engine.ts`, `src/utils/formulas.ts`, `src/data/content.ts`, `src/data/initialState.ts`, `src/types/ankicaster.ts`). It will later run inside Anki's `AnkiWebView`.
**Inspiration credit:** the feel of a lively, side-on magic school, in the spirit of *Spellcaster University*. No assets, names or text from that game are used.

## How this addendum relates to the GDD

- **It adds to the GDD and does not change any game rule.** Every number, formula, binding rule (BR-01 to BR-35) and system in the GDD stays exactly as written. The visuals in this addendum *show* game state; they never create, change or reward it.
- **Where it replaces GDD text, it says so.** The replacements are listed once here and repeated where they apply:

| GDD text | Status | Replaced by |
|---|---|---|
| Section 37.2 "Practical approach for v1" (HTML/CSS/SVG room `div`s, SVG sprite sheet, 64 × 64 px tiles, CSS-only animation, emoji placeholders) | **Replaced** | Sections 2, 3, 5, 6, 12 and 13: a PixiJS canvas world under the React UI, pixel-art sprites, a 64 × 48 art-pixel grid cell drawn at integer zoom |
| Section 37.1 "Cozy storybook cross-section" direction | **Kept and refined** | Section 2.1 (the same idea, made concrete as cozy storybook pixel art) |
| Section 37.3 palette | **Kept, extended** | Section 2.4 (the GDD hex values become the key colours of each school ramp) |
| Section 37.4 typography | **Replaced** | Section 11.2 (two named SIL Open Font License fonts) |
| Section 37.5 audio | **Kept** | No change (off by default, never in the reviewer) |
| Section 36.3 item 1 "Academy map" description (64 px tiles, zoom 50–150%, small idling sprites) | **Replaced in its visual details** | Sections 3, 6 and 7. The lenses, Room panel contents and click behaviour in 36.3 stay exactly as written |
| Section 36.3 items 2, 3, 9 (Wizard, Roster, Rift screens) | **Kept; skin added** | Section 11 (portraits, chance-meter art, roster cards). Contents are unchanged |
| Section 7.2 creation fields | **Kept; one field added** | Section 10.2 adds a **founding school** choice, which only decides the tutorial's suggested first orb and which school's tier-1 grimoire is in the starting kit (GDD 29.1 "starting kit for the first school") |
| Section 35.2 tutorial Step 0 | **Kept; staged visually** | Section 10.6 |

## Conventions

- **Art px** = one pixel of the source art. **Screen px** = one CSS pixel. At the default zoom (2×) one art px is drawn as a 2 × 2 block of screen px.
- **Cell** = one cell of the GDD castle grid (`PlacedRoom.x`, `y`, `w`, `h`). In this addendum a cell is **64 × 48 art px**.
- **Plot** = one grounds plot (`area: 'grounds'`), drawn one cell wide.
- **Agent** = the on-screen puppet of a character or creature. Agents belong to the visual layer only and are never saved.
- **VR-nn** = a visual rule in Section 1.3. Code reviews should cite them.
- Every number in this addendum that the GDD does not define (sizes, frame counts, speeds, caps) is a **starting value to tune**. None of them affect game rules.


# 0. Instructions for AI Studio (paste block)

Paste the block below into AI Studio as the first message of the visual-overhaul round. The rest of this document is the specification it refers to.

```text
You are adding a visual layer to the existing Ankicaster app. Read the attached
"Ankicaster Visual Overhaul Addendum" (this document) together with the Ankicaster
GDD. The GDD's rules are unchanged. This addendum only changes how the game looks.

WHAT TO BUILD FIRST (milestone V1, "walking around" slice):
1. Add pixi.js (v8, latest 8.x). Create src/visual/ as described in Section 13.
2. Replace the inside of CastleGrid.tsx with <AcademyCanvas>, a PixiJS canvas that
   draws the castle side-on (floor 0 at the bottom) from state.rooms using
   x/y/w/h, a cell size of 64x48 art pixels, and integer zoom (default 2x).
   Keep CastleGrid's props (state, onSelectRoom, selectedRoomId) so App.tsx does
   not change. Clicking a room must still call onSelectRoom(room).
3. Draw rooms with code-drawn placeholder art ("forge" sprites, Section 12.2):
   tier wall colours, a floor slab, doorways, stairs, grounds plots, the sky.
4. Draw every character in state.characters plus the player's wizard as a
   paper-doll pixel sprite (body, robe in school colour, hair, hat) and make them
   walk between rooms with the Choreographer (Section 7): class, meals, sleep,
   free time, along floors and stairs.
5. Replace the hard-coded start with a fresh start and the character-creation
   screen (Section 10): 0 mana, 0 Renown, all wizard levels 0, only the GDD's
   six starting rooms, starting stock only, no creatures, no pending events.

DO NOT BREAK:
- Any rule in the GDD (BR-01 to BR-35) or anything in engine.ts/formulas.ts
  behaviour. The visual layer must NEVER write to FullGameState, never call
  engine functions on its own, and never add mana, resources, Renown or progress.
- Nothing may reward review count or speed. Animations must not get faster,
  bigger or more frequent because the user reviews more or faster.
- Existing panels (WizardStudyPanel, RosterPanel, RecruitmentPanel, BuildMenuPanel,
  CardDraftPanel, AlchemyPanel, RiftPanel), the TopBar, FlashcardReviewer and saves.
- Reduce motion (settings.reduceMotion) must stop all walking, particles and
  looping animation.
- The app must run with zero image files present (forge placeholders), and must
  still run if WebGL is unavailable (Pixi canvas fallback).

VISUALS ARE COSMETIC: agents, paths, schedules, bubbles, day/night, the Veil
shimmer and every animation are derived from game state and the local clock,
are never saved, and can be thrown away and rebuilt at any time with no effect
on the game. If you are unsure whether something is a rule or a visual, treat
it as a visual and do not change the engine.

After V1 works and its acceptance criteria in Section 16 pass, continue with
V2 to V6 in order. Ship each milestone as a working app.
```


# 1. Purpose, Scope and Visual Rules

## 1.1 What the overhaul is for

The current build is mechanically rich and visually empty. It has boxes, text and lucide icons, so the Academy reads as a spreadsheet. The GDD's promise is that "construction is where mana becomes something you can see" (GDD 15.1). This addendum delivers that promise. The player should open Ankicaster after a review session and see *their* castle: the wizard or witch they made pacing the Study, students filing into the Refectory at the mealtime bell, a Tamer leaning over the Menagerie fence, a half-built Greenhouse under scaffolding that has grown since last time, a Mossback Tortoise asleep in the meadow, and the Veil glimmering over the towers.

The feel to aim for is that of a lively side-on magic school, in the spirit of *Spellcaster University* (credited as inspiration only). The castle is a doll's house cut open, every room has a recognisable silhouette, and small people with small errands make the place feel alive.

## 1.2 Scope

In scope: the canvas-drawn castle, grounds and sky; pixel-art rooms, furniture, characters and creatures with code-drawn fallbacks; the cosmetic movement simulation; day/night and the Veil shimmer; character creation and a correct fresh start; the UI skin; the asset pipeline; Anki packaging. Out of scope: any change to a rule, formula, cost or table in the GDD; expansions or anything beyond the base game; real weather, seasons or geolocation; any reward for looking at the map; runtime downloads of art.

## 1.3 Visual rules (VR)

These rules sit beside the GDD's binding rules. A change that breaks a VR rule is a bug.

| ID | Rule |
|---|---|
| **VR-01** | **Read-only.** The visual layer never writes to `FullGameState`, never calls a state-changing engine function and never schedules one. It subscribes to state and renders it. |
| **VR-02** | **Nothing is saved.** Agent positions, paths, schedules, bubbles, animation timers and camera position are not part of the save. The camera position and zoom may go in `localStorage` as a UI preference. Deleting all visual state and rebuilding it changes nothing in the game. |
| **VR-03** | **No reward for review count or speed (BR-03).** Animation speed, particle amounts, crowd sizes and celebration size must not depend on reviews per minute, reviews today or review streaks. A bell rings the same way whether it took 3 minutes or 3 hours. Celebrations are sized by the *event* (a level-up, a master, a finished room), never by how fast it came. |
| **VR-04** | **Honest display.** If the visuals show something, it must be true in state: a character shown in the Infirmary bed is injured; scaffolding at 60% means `buildProgress / buildRequired` is 0.6. Visuals may *simplify* (one representative student at the board instead of 14) but never invent (no students where none are enrolled, no creature that is not in `state.creatures`). |
| **VR-05** | **Engine decides, visuals follow.** Where the GDD gives a visible thing a real effect (Headmaster's Presence +5% in the room the wizard is in; a Loose creature's location; detention; injury place factor), the engine owns the value and the visual layer reads it. The Choreographer may not pick the wizard's room if the engine has one. |
| **VR-06** | **Breaks are calm (BR-04, BR-26).** While the player is away and the Veil holds, the castle looks peaceful when they come back: no broken furniture is invented, no fires, no Torn sky unless `veil.strength` is actually in the Torn band. |
| **VR-07** | **Reviewer is untouched.** Nothing from the visual layer draws over, slows down or animates inside the Anki reviewer or `FlashcardReviewer`. The mana toast follows the GDD 36.1 toast rules exactly. |
| **VR-08** | **Always runs.** The game runs with zero art files (code-drawn forge placeholders), with WebGL unavailable (Pixi's canvas renderer or a static fallback), and with `reduceMotion` on. |
| **VR-09** | **Reduce motion wins.** With `settings.reduceMotion` on: no walking (agents appear at their destination with no tween), no looping idle animation beyond a static frame, no particles, no shimmer, no camera easing. State changes are shown by a static badge or a one-frame swap. |
| **VR-10** | **Readable first.** Status (Unfinished, Unreachable, Locked, Dirty, Hazard, Injured, Mastery-ready) must be readable by icon *and* shape, not colour alone (GDD 36.5). |

## 1.4 Conflicts

When the addendum and the GDD seem to conflict on a **rule**, the GDD wins. When they conflict on **appearance**, the addendum wins, as listed in the replacement table at the front. Keep existing component names: `CastleGrid` stays the map component used by `App.tsx` and becomes a thin wrapper around the new canvas; the other components keep their props and gain a skin (Section 11).


# 2. Art Direction

> **Replaces GDD 37.2.** The GDD's v1 approach (HTML/CSS/SVG room `div`s, an SVG sprite sheet, 64 × 64 px tiles, CSS-only animation, emoji placeholders) is replaced by the approach in this section and Sections 12–13. GDD 37.1's "cozy storybook cross-section" direction is kept and made concrete here.

## 2.1 Style: cozy storybook pixel art

- **Pixel art, side-on cutaway.** The castle is drawn as if its front wall has been removed: you see each room's back wall, floor, ceiling beam and furniture, with small figures inside. The grounds are drawn in the same side-on view, with the ground line level with floor 0.
- **Cozy, not grim.** Warm lamplight, rounded shapes, plants everywhere, soft outlines. Shadow-school rooms are moody but friendly: indigo and teal with lantern glow, never horror.
- **Outlines.** Sprites use a 1 art-px outline in a darkened version of the sprite's main colour (selective outlining), not pure black. Rooms use a 2 art-px dark stone outline at the cutaway edge so adjacent rooms read as separate boxes.
- **Light comes from the left and above.** Highlights go on top-left edges and shadows on bottom-right. Every asset follows this so mixed sources still look like one world.
- **No anti-aliasing in art.** Edges are hard pixels. Transparency is 1-bit (fully on or off) except for glow, shimmer and light sprites, which use additive blending (Section 4).
- **Limited palette.** All art is snapped to the master palette in Appendix C (about 64 colours: 5 school ramps, 4 neutral ramps, skin and hair ramps, Veil ramp, UI ramp). This is what makes AI-generated, CC0 and code-drawn art sit together.

## 2.2 Proportions

| Thing | Size in art px | Notes |
|---|---|---|
| Grid cell (one castle tile) | **64 × 48** | 64 wide so a 2×1 room holds 7 furniture positions; 48 tall so a standing character (28) fits under the ceiling beam with headroom for hats and wall items |
| Floor slab | 4 tall | Bottom of each cell. Its top edge is the **floor line** that characters stand on |
| Ceiling beam | 3 tall | Top of each cell. Hidden for rooms more than 1 cell tall (they are one open space) |
| Outer wall / cutaway edge | 2 wide | Each side of a room |
| Character frame | **16 × 28** | Feet at the bottom row. Adults are 24–26 px tall plus hat; students 22–24 px |
| One-slot furniture | 16 × 16 (small), 16 × 24 (tall) | Bottom-centre anchored on the floor line |
| Two-slot furniture | 32 × 16 or 32 × 32 | Same anchor rule |
| Grounds plot | 64 × 48, plus up to 48 px of sky overhang | Trees, the Rift Gate arch and the Observatory dome can rise above the cell |
| Creatures | 16 × 16 (Common/Uncommon), 24 × 24 (Rare), 32 × 32 (Epic/Legendary), 48 × 32 (Philosopher's Chimera) | Sizes per creature in Appendix A.3 |
| Status bubble | 12 × 12 | Drawn above the head, 2 px gap |
| School pip | 3 × 3 | Under the feet, one per mastered school |

## 2.3 Resolution, zoom and readability at Anki window sizes

The world is drawn at **integer zoom only**, with nearest-neighbour scaling, so pixels stay crisp.

| Zoom step | Scale | Label shown | One cell on screen | Starting castle (8 × 5) on screen | Largest castle (14 × 11) on screen |
|---|---|---|---|---|---|
| Far | 1× | 50% | 64 × 48 | 512 × 240 | 896 × 528 |
| **Default** | **2×** | **100%** | 128 × 96 | 1024 × 480 | 1792 × 1056 |
| Close | 3× | 150% | 192 × 144 | 1536 × 720 | 2688 × 1584 |
| Closest | 4× | 200% | 256 × 192 | 2048 × 960 | 3584 × 2112 |

- The GDD's 64 px tile at 100% (36.3) is honoured in spirit: at the default zoom a cell is 128 screen px wide, and a character is about 50–56 screen px tall, which is readable in Anki's default game window.
- Device pixel ratio is handled by Pixi's `resolution: window.devicePixelRatio` and `autoDensity: true`. The integer zoom is in CSS pixels; on a 2× display each art pixel becomes 4 × 4 device pixels, which is still crisp.
- **Target window sizes.** The game window (GDD 36.1) is designed for 1280 × 800 and must be usable at 1024 × 700. At 1024 × 700, after the TopBar (about 88 px) and bottom tab bar (about 64 px), the map area is about 1024 × 548 (narrower when the Events and Notices trays are open). **Fit** picks the largest integer zoom at which the whole castle and grounds fit; at 1024 × 548 that is 1× for the full starting map with grounds, so the default view is **2× centred on the Entrance Hall**, with pan.
- **Minimum legible zoom.** At 1×, characters are 28 screen px tall. Bubbles and badges are drawn in a separate **overlay layer** that does not scale with zoom below 2× (it is drawn at 2× size anchored to the 1× positions), so status icons stay at least 24 px (GDD 36.5's 13 px minimum text is met by labels in the overlay, never by text inside art).

## 2.4 School palettes

The GDD 37.3 colours are kept as the **key** shade of each school. Each school gets a 4-shade ramp (shadow, base, key, highlight) and an accent ramp. Full hex tables are in Appendix C; the key values are:

| School | Main ramp (key in bold) | Accent ramp (key in bold) | Glyph (always shown with colour) | Room motifs |
|---|---|---|---|---|
| Arcane | #2E2160 · #4B3796 · **#6B4FBB** · #9C86E0 | #8A909B · **#C9CED6** · #EEF1F5 | Eight-point star | Floating books, runes, star charts, violet glass |
| Nature | #24451C · #3A6B2C · **#4E8B3A** · #7DB861 | #9C6A1E · **#E0A33A** · #F5CE7A | Leaf | Vines, pots, moss, honey wood |
| Light | #8F7420 · #C4A233 · **#E8C547** · #F6E08C | #E6D9B0 · **#FFF6DC** · #FFFFFF | Sun disc | White stone, gold trim, stained glass, halos |
| Shadow | #151A38 · #222B57 · **#2F3A73** · #4C5BA3 | #1C5757 · **#2E8B8B** · #5FC2C2 | Crescent | Velvet curtains, lanterns, mirrors, mist |
| Alchemy | #5E3410 · #8A4C17 · **#B5651D** · #DB8C46 | #8F2A17 · **#D9472B** · #F07A5C | Flask | Copper pipes, cauldrons, brick, coloured fumes |

- **Neutral ramps** for stone, plaster, wood and slate carry the quality tiers (Section 5.2). School colour appears as *trim* (banners, rugs, glass, robes) so a castle with all five schools still looks like one building.
- **Robes.** A character's robe uses their current school's main ramp. Undecided students and the wizard default to the robe colour chosen at creation (12 choices, Appendix C.3); the wizard's robe never changes colour on its own.
- **Colour-blind safety (GDD 36.5).** Every school colour is paired with its glyph wherever it carries meaning (robe scarf glyph, room banner glyph, pips drawn as glyph shapes at 2× and above). Tier colours in the Quality lens are paired with a 1–5 bar count.

## 2.5 Light mode and dark mode

- **The world art does not change between themes.** The castle is always drawn the same; its look is driven by the local time of day (Section 4) and the Veil. Changing the theme never makes it suddenly night in the castle.
- **The UI skin changes.** Light theme: parchment panels (#F4EBD9) with ink text (#2A2533). Dark theme: ink panels (#2A2533) with parchment text (#F4EBD9). These are the GDD 37.3 UI values.
- **Theme source, in order:** the Settings choice (Light / Dark / Follow Anki, default Follow Anki); in Anki, `theme_manager.night_mode` is passed into the page (Section 15) and sets `document.documentElement.dataset.theme`; in the browser build, `prefers-color-scheme`.
- **Map frame.** In dark theme the map gets a 2 px dark-ink frame and the sky's top colour is darkened 10%. In light theme the frame is parchment. This is the only theme effect on the map, and it is outside the world.
- **Overlay legibility.** Bubbles and badges have a 1 px outline plus a 1 px drop shadow so they read on both a night sky and a sunlit Greenhouse.


# 3. The Castle View: Geometry, Camera and Grounds

> **Replaces the visual details of GDD 36.3 item 1** (64 px tiles, zoom 50–150%, "small sprites idling"). The lenses, the badges, the click behaviour and the Room panel contents in 36.3 stay exactly as written.

## 3.1 World layout

The world is one horizontal strip, left to right: **left grounds**, the **castle**, **right grounds**, with the **sky** above and a band of **earth** below the ground line.

```
            sky (gradient, clouds, stars, Veil dome)
   ┌──────────────────────────── castle (W × H cells) ─────────────┐
   │ roof / battlements on the top room of each column              │
   │ floor H-1                                                      │
   │ ...                                                            │
   │ floor 1                                                        │
L8 … L1 L0 │ floor 0  [Storage][Stair][Entrance Hall][Study]  │ R0 R1 … R8
═══════════╧═══════════════ ground line ══════════════════════════╧════════
   front path (cobbles, in front of everything at ground level)
   earth band (32 art px, roots, a few buried stones)
```

**Coordinates.** World units are art pixels. With `G` = number of plot positions on the left (fixed at 9; Section 3.5), the cell size `CW = 64`, `CH = 48`, and `groundY` = the world y of the ground line:

- Castle cell left edge: `worldX(x) = (G × CW) + x × CW`
- Castle room box: `left = worldX(room.x)`, `top = groundY − (room.y + room.h) × CH`, `width = room.w × CW`, `height = room.h × CH`
- A room's **floor line** for floor `f` (for multi-floor rooms, each floor it covers): `groundY − f × CH − 4`. Characters stand with their feet on this line.
- `groundY = skyHeight + castleMaxH × CH`, where `skyHeight = 160` art px and `castleMaxH` is the **current** castle height in floors (5 at the start, up to 11). The world grows upward when the castle expands, so the ground line stays at the bottom of the view.

Every function that converts between grid and world lives in `src/visual/layout/gridToWorld.ts` and is unit-tested (Section 17).

## 3.2 Drawing the castle

Draw order (back to front), one Pixi `Container` per layer:

1. **Sky** (Section 4): gradient, sun or moon, stars, clouds, distant hills.
2. **Castle shell**: the stone backdrop behind built rooms, plus foundations under floor 0 along the full castle width.
3. **Empty cells**: inside the current grid bounds, empty cells are transparent (you see the sky). In **Build mode** only, empty cells show a faint dashed blueprint outline, and cells that pass P3 (support) are tinted pale green when a ghost is being placed.
4. **Rooms**: each room is drawn as tier wall skin, then room dressing, then level trim, then furniture (Section 5).
5. **Doorways**: where two built rooms on the same floor share a wall edge (the GDD 15.3 P4 link), the shared wall gets a doorway cut-out (an arch 14 × 30 art px at the floor line). Where rooms do not connect, the wall is solid. This makes reachability visible without a lens.
6. **Agents**: characters and creatures (Sections 6–8), sorted by y then x.
7. **Roofs**: for every castle column, the topmost built room gets a roof piece on top. The roof style follows that room: battlements (default), a pointed slate spire (Wizard's Study, Spiral Stair tops), a glass ridge (Greenhouse), a dome with a shutter slit (Observatory), a netted cupola (Aviary). Roofs are 64 × 24 per column and overhang into the sky.
8. **Front layer**: the front path, foreground grass tufts, the Veil dome (Section 4.4), weather-free particles.
9. **Overlay** (not scaled below 2×): status bubbles, room badges, selection outline, progress rings, the "+N" crowd badge, lens tints.

**Support Pillars** are drawn as a 16 px stone column centred in their cell, with an arch on each side so the cell still looks open. **Construction sites** are drawn in their room box (Section 5.6).

## 3.3 Stairs and vertical travel

- A **Spiral Stair** room shows a spiral staircase rising through the cell. When stairs are stacked in the same column, the staircase art continues through the ceiling into the stair above (the ceiling beam is cut open) so the column reads as one shaft.
- The **Wizard's Study** shows its internal stair on its left side, linking floors 0 and 1 of its column (GDD 15.3).
- Vertical movement is **only** through these stairs, matching the GDD's BFS. Agents walk to the stair's centre, switch to the `climb` animation (back view), move vertically at 24 art px/s, and step off at the next floor line.
- **Multi-floor rooms** (1×2, 3×2 and so on) are one open space. Their floor line is the bottom floor. If a multi-floor room shares a wall edge with a room on one of its upper floors, that doorway opens onto a 16 px wooden **ledge** with a short ladder down to the room's floor. Agents use the ledge and ladder to enter. This is a visual route only: whether the room counts as linked to that upper room is decided by the reachability function (Section 13.4), and the nav graph copies its answer.

## 3.4 Reachability, shown honestly

Reachability comes from one shared pure function, `computeReachability(rooms)`, which implements GDD 15.3 exactly and is used by both the engine and the visuals (Section 13.4). The visuals use it for doorways, the Unreachable badge, the Reachability lens and the nav graph.

Unreachable rooms are drawn normally, with:

- a grey "no entry" badge (a circle with a bar, plus the word "Unreachable" on hover);
- solid walls (no doorway) on every side;
- no agents inside, ever (the Choreographer never routes there).

## 3.5 Grounds and plots

- The grounds are a strip of plots to the **left and right** of the castle (GDD 15.2). Each plot is one cell wide (64 art px) and sits on the ground line.
- **Plot positions are fixed**, so plots never jump sides when the grounds expand. There are 18 plot positions: 9 on the left (L8 … L0, with L0 touching the castle) and 9 on the right (R0 … R8, with R0 touching the castle).
- **Proposed index mapping** (shared by engine and visuals in `src/utils/groundsLayout.ts`): a grounds room's `x` is a plot index from 0 to 17. Indices 0–8 are L8…L0 (left to right) and 9–17 are R0…R8 (left to right). The unlocked plots grow **outward from the castle, alternating sides**: 6 plots = indices 6–11; 10 plots = 4–13; 14 plots = 2–15; 16 plots = 1–16; 18 plots = 0–17. Locked plot positions are drawn as wild meadow with a small "locked" marker in Build mode only.
- A multi-plot room (2 plots) needs two adjacent unlocked indices on the **same side** (8 and 9 are separated by the castle and are not adjacent). This is the visual reading of GDD P7's "adjacent plots"; it needs the owner's confirmation (Section 18, D-04).
- The current build places the Vegetable Patch at grounds `x: 0` and the Woodlot at `x: 1`. Under the mapping these become **index 8 (L0) and index 9 (R0)**, one plot each side of the castle, so the start reads as balanced. This is part of the fresh-start fix (Section 10.4).
- **Empty unlocked plots** are drawn as mown grass with a low fence post at each edge. **Built plots** use their room dressing (Appendix A.1), which may rise up to 48 art px into the sky.
- **The front path.** A cobbled path runs along the whole world at ground level, drawn in front of the grounds and the castle base. It links the Entrance Hall's front doors to every plot. Agents walking to the grounds leave the Entrance Hall by turning toward the viewer, stepping down 6 art px onto the path, walking along it, and stepping back up into the plot. This is how GDD P7's "the grounds path connects to the Entrance Hall" is shown.
- **The Rift Gate** (2 plots, unlocked by the GDD 27.2 conditions) is a standing-stone arch 128 × 96 art px that rises above its plots. States: **dormant** (grey stones, faint runes); **open** (a swirling portal surface using the Veil ramp, slow rotation); **expedition out** (portal swirl plus a small "away" banner on the arch with the team's portrait chips in the overlay); **returning** (a 1.5 s flare, then the team walks out on the path). Section 9 lists the triggers.

## 3.6 Camera: zoom and pan

| Input | Action |
|---|---|
| Mouse wheel / trackpad pinch | Zoom one integer step, anchored on the pointer |
| `+` / `−` buttons (map corner) | Zoom one step, anchored on the view centre |
| Drag with left button on empty space, or middle button anywhere | Pan |
| Arrow keys (when the map has focus) | Pan 1 cell; with Shift, move the selection between rooms (GDD 36.5 keyboard navigation) |
| `F` or the **Fit** button | Largest integer zoom where the whole world fits; centres it |
| `H` or the **Home** button | Default view: 2× centred on the Entrance Hall |
| Double-click a room | Zoom one step in, centred on that room |
| Click a room | `onSelectRoom(room)` (unchanged behaviour) |
| Click a character or creature | Opens its Roster or Menagerie card (`RosterPanel` / Menagerie view) |

- **Pan limits.** The camera can show at most half a screen of empty sky or earth past the world edges.
- **Easing.** Zoom and Home/Fit ease over 180 ms, except with `reduceMotion` (instant).
- **Saved view.** Zoom and centre are stored in `localStorage` under `ankicaster.camera` (a UI preference, not game state, VR-02).
- **Follow.** A "follow" pin on a character card makes the camera keep that agent centred until the user pans.
- **Lenses** (GDD 36.3) are drawn as a tint over each room in the overlay layer, with the lens value as a number and a pattern (stripes, dots, cross-hatch) so colour is never the only signal.

# 4. Atmosphere: Day and Night, Sky and the Veil

## 4.1 Time of day from the real local clock

The castle's light follows the player's **local wall-clock time** (`new Date()` in the webview, which uses the computer's time zone). It is checked once a minute and when the window regains focus.

| Phase | Local time | Sky (top → horizon) | World tint (multiply) | Lights |
|---|---|---|---|---|
| Night | 19:30 – 05:30 | #1B1838 → #3A3170 | #6E6FA8 at 100% | Windows and lamps on, stars and moon |
| Dawn | 05:30 – 07:30 | #4A4A8A → #F2B38A | blends night → day | Lamps fade out over the phase |
| Day | 07:30 – 17:30 | #8FC8F0 → #DDF0FB | none (#FFFFFF) | Off |
| Dusk | 17:30 – 19:30 | #5B5BA0 → #F09A6A | blends day → night | Lamps fade in over the phase |

- Blends are linear over each 2-hour band, sampled once per minute, so the change is never noticeable from second to second.
- **Lights at night.** Rooms with a light source (candle sconces, Glow Lanterns, Radiant Lamps, hearths, the Observatory's Nightglass, any Light-school room) add an additive glow sprite (a soft 64 × 48 radial gradient in warm amber) on top of the night tint. Every room has at least one warm window glow at night so the castle never goes fully dark.
- **Moon and sun.** A 16 px sun moves along an arc across the sky during the day; a 16 px moon with a phase (drawn from the real date) moves across at night. Purely decorative.
- **Setting:** `visualTime: 'clock' | 'day' | 'night'` (default `'clock'`). "Always day" helps players who study at night and want a bright castle.
- **No rules.** The time of day changes nothing in the game. Characters do not sleep "because it is night" in any rule sense; the Choreographer uses the clock only to choose cosmetic activities (Section 7.4), and only when the `clock` schedule style is on.

## 4.2 Sky layers

Back to front: gradient, stars (night), sun or moon, two parallax hill silhouettes (20% and 40% of camera pan) and a few slow clouds. The Veil sits in front (4.4).

## 4.3 Veil-coloured sky (GDD 37.1)

GDD 37.1 ties the sky to the Veil. That is kept and combined with the clock: the clock sets the brightness and the Veil band sets an overlay hue.

| Veil band (GDD 18.3) | `veil.strength` | Sky overlay | Extra |
|---|---|---|---|
| Strong | 80–100 | none | Clear sky |
| Thinning | 50–79 | 15% #B9A6FF wash | Faint aurora ribbons near the top at night |
| Thin | 20–49 | 30% #7D5BA6 wash | Aurora by day and night; slow drifting wisps |
| Torn | 0–19 | 45% #3D2856 wash | Inky sky with drifting dark shapes far away (never near the castle, never threatening a character) |

The band thresholds are read from the same helper the engine uses (`getVeilBand(strength)`). If the build has no helper, add it in `formulas.ts` using GDD 18.3's thresholds and use it in both places.

## 4.4 The Veil shimmer

- **Shape.** A dome drawn over the whole castle and the unlocked grounds, from ground level at the outer plots to 24 art px above the highest roof.
- **Look.** A thin band of light (2–3 art px) along the dome's edge plus a soft fill, using the Veil ramp colour of the current band. A slow shader moves a noise pattern across it (Section 13.6). With `reduceMotion` it is a static outline.
- **Thinning, shown.** The dome's opacity follows `veil.strength`: fill alpha `= 0.04 + 0.10 × strength/100`, edge alpha `= 0.25 + 0.5 × strength/100`. In the Thin band (below 50), gaps appear in the edge: the edge is drawn in arcs with gaps whose total length grows as strength falls. In Torn (below 20), small flickering "tears" appear at a few points on the dome edge.
- **No fear at the door.** When the player opens the game after a break, the dome is drawn with the strength saved in state. Because the Veil holds while away (BR-26), it looks the same as when they left. There is no "it got worse while you were gone" animation.
- **Day tick.** On a day tick where the Veil is paid, a soft ripple runs over the dome once (0.8 s). Where it was not fully paid (GDD 18.4), the dome dims to its new strength over 1 s. No sound, no shake.
- **Wards.** Warding Chamber radii (the Hazards and wards lens) are drawn as faint teal circles in the overlay, only when that lens is on.


# 5. Rooms, Furniture and Construction Visuals

> **Replaces GDD 37.2's "Quality tiers change wall and floor art" bullet and its CSS approach.** The five tiers and what each looks like (GDD 15.6 "Art" column) are kept and drawn as described here.

## 5.1 How a room is drawn

A built room is a stack of five pieces, back to front:

1. **Tier wall skin**: back wall and floor texture for the room's quality tier (5.2), tinted by room category.
2. **Room dressing**: one transparent PNG per room type (Appendix A.1) with the room's fixed features: windows, arches, built-in shelves, a hearth, the Observatory's dome slit, the Greenhouse's glass. The dressing has no furniture that the player can add or remove.
3. **Level trim** (5.4).
4. **Furniture**: one sprite per `PlacedFurniture`, placed at slot anchors (5.3).
5. **Overlays**: cleanliness decals (5.7), damage marks, badges, lens tints (overlay layer).

## 5.2 Quality tier skins

The tier comes from `calculateRoomQuality(room).tier` (already in `formulas.ts`). Skins are tileable 64 × 48 cell textures (wall plus floor), stretched by tiling across the room's cells.

| Tier | Wall | Floor | Light | Extra |
|---|---|---|---|---|
| **Bare** (Q 0–9) | Grey rough stone blocks, uneven mortar | Bare flagstones | One wall torch (flicker, 3 frames) | A crack or two, a cobweb in a top corner |
| **Plain** (Q 10–24) | Off-white plaster with a stone base course | Smooth flagstones | Two torches | Plaster patch marks |
| **Cozy** (Q 25–44) | Warm limewash above wood wainscot | Honey wood planks; a small rug in the category colour | Warm lamp glow added (additive, low) | Plant pot on a ledge |
| **Fine** (Q 45–69) | Full wood panelling, picture rail | Polished boards with a long runner rug | Wall sconces | Category banner (glyph) on the back wall |
| **Splendid** (Q 70+) | Panelling with gilded trim and arched niches | Parquet with an inlaid crest (the player's sigil) | Floating candles along the ceiling (bob, 4 frames) | Slow sparkle particles (max 3 at once per room) |

**Category tint.** Each skin has a neutral version; the category colour is applied to trim pixels only (rug, banner, wainscot stain, niche glass) by palette-indexed recolouring at load (Section 12.6). Categories: core (stone grey and the player's robe colour), living (warm rose and cream), the five schools (Section 2.4), craft (copper), rift (Veil purple), grounds (no wall skin; plots use their own dressing).

**Tier change.** When a room's tier changes (state diff, Section 9), the new skin wipes in from left to right over 600 ms with a brief sparkle at the wipe edge (going up a tier) or a plain cross-fade (going down, for example after furniture is removed). With `reduceMotion`, swap instantly.

## 5.3 Furniture slots and anchors

Each room type has a layout in `src/visual/layout/roomLayouts.ts`:

```ts
interface RoomLayout {
  defId: string;
  // Slot anchors in art px from the room's left edge, on a given floor (0 = bottom floor of the room).
  required: Array<{ role: string; x: number; floor: number; anchor: 'floor' | 'wall' | 'ceiling' }>;
  optional: Array<{ x: number; floor: number; anchor: 'floor' | 'wall' | 'ceiling'; width: 1 | 2 }>;
  // Where agents go to do things in this room (Section 7.3).
  spots: Array<{ kind: 'seat' | 'bed' | 'work' | 'stand' | 'queue' | 'teach' | 'pen'; x: number; floor: number; facing: 'L' | 'R' | 'front' }>;
}
```

- **Required furniture** is placed at the anchor for its `role`, matched to `PlacedFurniture.slotKind` (`'required:<role>'`, as the build already writes it).
- **Optional furniture** fills `optional[]` anchors in order. A two-slot item takes two neighbouring anchors (the layout marks which pairs can merge). Optional anchors come in three kinds: floor, wall and ceiling. The furniture's own anchor kind (Appendix A.2) chooses which list it draws from, so a tapestry goes on the wall and a rug goes on the floor even if the player added them in any order.
- **Level slots.** Room level 2 and 3 each add one optional slot (GDD 15.5). The layout lists the extra anchors last; they are only used when `room.level` allows.
- **Default layout.** If a room type has no hand-made layout yet, `defaultLayout(def)` spaces required anchors evenly from the left wall, optional floor anchors between them, two wall anchors at one-third and two-thirds width, and one ceiling anchor at the centre. Spots come from furniture kinds (a desk makes a seat spot in front of it, a bed makes a bed spot on it). This means every one of the 56 rooms works on day one; hand layouts are polish.
- **Missing required furniture (Unfinished).** Each empty required anchor shows a dashed ghost outline of the missing piece with a "+" in the overlay. Clicking it opens the Room panel's furnish list filtered to that role (existing behaviour).
- **Damaged furniture** (`damaged: true`) uses the `_damaged` frame: tilted, cracked, a scorch or a little smoke wisp. A wrench badge appears in the overlay. GDD rules decide what damage means; this is only how it looks.

**Seating and beds.** The furniture sprite and the spot are separate. A Student Desks (2) sprite gives two seat spots; a Bunk Bed gives two bed spots, one above the other. When capacity is larger than the number of drawable spots (a big Refectory), extra agents use **overflow spots** (standing at the wall, sitting on the floor with a cushion) and beyond that are shown by the "+N" badge (Section 7.8).

## 5.4 Room levels

| Level | What changes | Animation on reaching it |
|---|---|---|
| 1 | Base dressing | — |
| 2 | **Trim I**: carved cornice along the ceiling beam, a second window or arch in the dressing (the `_l2` variant if present, else an added window sprite), a small school or category emblem above the door | 1.2 s: gold outline traces the room edge, the trim "draws in" left to right, 12 sparkles |
| 3 | **Trim II**: gilded cornice, a stained-glass window in the category colour, a crest banner, and the room's **level-3 perk** shown by one signature prop listed for that room in Appendix A.1's "Ambient animation" column | As level 2, plus a soft bell-ring shimmer and the room name in a banner over it for 2 s |

Levels change **only** when the engine's `room.level` changes. The visual never predicts or pre-shows a level.

## 5.5 Room animations (cosmetic)

Every room has one ambient animation from Appendix A.1 (for example the Greenhouse's crop growth stages and misting, the Observatory's turning telescope at night, the Kitchen's steam). Rules:

- Ambient loops run at fixed rates (2–8 fps), never faster when reviews are faster (VR-03).
- A room's ambient animation runs only if the room is built, reachable and not Locked. An Unfinished room shows its dressing but no ambient loop.
- **Crop growth** (Greenhouse, Herb Garden, Vegetable Patch, Orchard) shows four stages. The stage is chosen from the room's real output timing, where the engine has one (for example bells since the last harvest notice divided by the harvest interval). Otherwise it uses the bell index modulo 4, so it changes once per bell and never more often.
- Output pops (a small "+2 Timber" floating icon above a Woodlot) happen **once per bell** per producing room, when `bellIndex` changes, not per review.

## 5.6 Construction sites driven by the review countdown

A construction site (`state: 'site'`) is drawn in its room box. Its look comes from the fraction `p = buildProgress / buildRequired`:

| Stage | `p` | Castle site | Grounds site |
|---|---|---|---|
| 1. Marked out | 0.00–0.20 | Chalk outline on the stone, stakes and string, a stack of the materials paid (Timber logs, Stone blocks, Glass panes icons) | Pegged string rectangle, a cart of materials |
| 2. Framed | 0.20–0.40 | Wooden scaffold frame across the box, floor slab laid | Ground levelled, posts up |
| 3. Walls rising | 0.40–0.60 | Back wall drawn from the floor up to `(p − 0.4) / 0.2` of the height; scaffold planks at two levels | Low walls, fence or beds outlined |
| 4. Roofed | 0.60–0.80 | Full back wall in Bare skin; ceiling beam; dressing shown as pale "blueprint" lines | Main structure up, unpainted |
| 5. Finishing | 0.80–1.00 | Dressing fades in from 0% to 100% across the stage; a tarp drops off at 0.95 | Paint and planting appear |
| Complete | 1.00 | One-time reveal: dust puff, scaffold slides down, room drawn with its real tier (normally Bare until furniture is placed), Unfinished ghosts for required furniture | Same |

- **Progress ring.** The overlay shows a ring at the site's top-right with the fraction and, on hover, **"About N honest reviews to go"**, where `N = ceil((buildRequired − buildProgress) / rate)` and `rate` is 1.25 if the site has a Builder slot, otherwise 1 (GDD 15.4). This is a countdown, the same information the Build panel shows. It does not reward speed: it is in reviews, not minutes.
- **Only state moves it.** The stage changes when `buildProgress` changes, at whatever pace the player reviews. Between changes the site is static apart from fixed-rate ambience.
- **Workers.** A site in an active construction slot (`buildSlot` set, not paused) shows activity. Slot 0 (the wizard's own slot, GDD 15.4) is shown as a **spectral hammer and floating trowel** in the wizard's sigil colour working on their own. The wizard does not have to walk there. Each Builder slot shows that Builder character on the scaffold with the `work` animation during their work activity (Section 7.4). The hammering rate is fixed (one swing per 0.8 s) whatever the review rate.
- **Queued sites** (waiting for a slot) show stage art with no workers and a small hourglass badge with their queue position.
- **Paused sites** (`buildPaused: true`) are covered by a canvas tarp in the category colour with a "paused" ribbon. Progress is kept forever, and the tarp shows the same stage underneath when lifted.
- **Cancel** before progress: the stakes and materials vanish with a puff. **Demolish** (a deliberate player action, GDD 15.4): a 0.8 s dust cloud, then empty cells. There are no destruction effects that are not player-initiated (BR-04, BR-25).
- **Renovation** (level 2–3 by Renovate). If the build shows renovation progress on a built room, the room stays fully visible and usable in the art, with a light scaffold over its front at 50% opacity and the same progress ring. If the build applies the level instantly, play the level animation (5.4).

## 5.7 Cleanliness, locks and hazards in rooms

| State (from `PlacedRoom`) | Visual |
|---|---|
| `cleanliness` 70–100 | Clean |
| 40–69 | Dust specks on the floor (decal set A) |
| 20–39 | Cobweb in a top corner, a few stains, scattered paper (A + B) |
| 0–19 | All of the above plus a muddy footprint trail (A + B + C), and the Dirty badge |
| `lockedUntilReviewIndex > reviewIndex` | Padlock badge; the room's hazard visual from `lockReason` (Section 9.3); a ring showing "Locked for N more reviews" where `N = lockedUntilReviewIndex − reviewIndex`; agents avoid the room |
| Enchanted Broom present | The broom sweeps along the floor during free time loops (cosmetic; the engine's cleaning amount is unchanged) |
| Mopslime in a habitat | Occasionally slides across the Menagerie floor leaving a shiny trail |

Cleaning is shown by Builders with a mop during their `work` activity when no site needs them; dirt decals fade when `cleanliness` rises, never before.


# 6. Characters: Paper-Doll Sprites, Animation and Readability

> **Replaces GDD 37.2's "layered paper doll SVGs"** with layered pixel-art sprite sheets baked into one texture per character. The idea (body, robe in school colour, hair, hat) is the same.

## 6.1 Who is drawn

| Who | Source in state | Drawn when |
|---|---|---|
| The player's wizard or witch | `state.wizard` (plus the new `wizard.appearance`, Section 13.5) | Always (the wizard never leaves; GDD 7.7) |
| Students | `characters` with `status: 'student'` | Always, unless away |
| Resident masters | `status: 'resident'` | Always |
| Faculty | `status: 'faculty'` | Always; Sabbatical faculty (`careerState: 'sabbatical'`) are drawn in civilian clothes doing free-time activities |
| Adventurers on an expedition | `status: 'away'` or in an active expedition's `teamIds` | **Not on the map.** Shown as portrait chips on the Rift Gate and the active expedition card |
| Alumni | `status: 'alumnus'` | Not drawn, except during an alumni visit notice (GDD 13.3), when one alumnus walks in from the path, waves in the Common Room or Entrance Hall for 60 s and leaves |

## 6.2 Layers

Every layer is a sprite sheet with the **same frame grid** (Section 6.4), so the composite can be built frame by frame. Back to front:

| # | Layer | Options | Colour source |
|---|---|---|---|
| 1 | Ground shadow | 1 | Fixed, 40% black ellipse 10 × 3 |
| 2 | Back gear | none, cape (wizard), travel pack (adventurer career), wings charm (cosmetic, from titles) | Robe ramp |
| 3 | Body | 4 shapes (GDD 7.2) × 2 heights (adult, student) | Skin ramp (8 tones) |
| 4 | Legs and shoes | 3 (boots, slippers, sandals) | Neutral leather |
| 5 | Robe | short robe (student), long robe (faculty and residents), wizard robe, civilian tunic (sabbatical) | School main ramp, or the chosen robe colour (12) for the wizard and undecided students |
| 6 | Hair (back) | 12 styles (GDD 7.2) | Hair ramp (10 colours) |
| 7 | Head and face | 4 face shapes, 6 expressions (neutral, happy, tired, worried, asleep, focused) | Skin ramp |
| 8 | Hair (front) | Same 12 styles | Hair ramp |
| 9 | Hat | 8 (GDD 7.2, including none): pointed, floppy, wide-brim, hood, circlet, cap, flower crown, none | Robe ramp or the hat's own colour |
| 10 | Role marks | student scarf (school glyph), faculty stole (career emblem), master star pin, wizard sigil on hat | School or career colours |
| 11 | Held item | staff (6, GDD 7.2, wizard only), book, tray, lantern, broom, watering can, hammer, quill, crate | Item's own colours |

**Palette-indexed recolouring.** Robe, hair and skin layers are drawn in **index colours** (four reserved grey values per ramp). At bake time the four indices are replaced by the four shades of the chosen ramp. One robe sheet therefore serves all five schools and twelve robe colours. Section 12.6 describes the shader-free CPU recolour used at bake time.

**Mapping existing appearance strings.** `Character.appearance` already holds `skin`, `hair`, `hairColor`, `robeColor` and `hat` as strings. `appearanceToLayers(appearance, id)` maps known ids directly and hashes unknown strings (with the character id as seed) to a stable option, so older saves and generated applicants always get a stable look. Students' robes use `currentSchool` for the colour and ignore `robeColor`, except the wizard and students with no school yet.

## 6.3 Baking

- When a character first appears, or when any input to its look changes (school, status, career, appearance, injury, mastery), the visual layer **bakes** a composite: for every frame of every animation, all layers are drawn into one `RenderTexture` (or an offscreen canvas in the fallback renderer).
- One baked sheet per character, about 56 frames × 16 × 28 px, roughly 100 KB of GPU memory. 60 visible characters use about 6 MB.
- Bakes are queued and limited to **4 per animation frame**, so loading a big Academy never stalls.
- Unchanged characters keep their bake between sessions of the same page (cached by a hash of the inputs).

## 6.4 Animations

Sheets are 16 × 28 frames, one row per animation, facing right. Facing left is a horizontal flip at draw time. "Front" and "back" views are separate rows.

| Animation | Row | Frames | fps | Used for |
|---|---|---|---|---|
| `idle` | 0 | 4 | 6 | Standing, breathing, small sway |
| `walk` | 1 | 6 | 10 | Moving along a floor or the path |
| `walk_front` | 2 | 4 | 8 | Stepping toward the viewer (leaving the Entrance Hall onto the path) |
| `climb` | 3 | 4 | 8 | Back view on stairs and ladders |
| `sit_study` | 4 | 4 | 4 | Seated at a desk, writing or reading; page flips |
| `eat` | 5 | 4 | 6 | Seated at a table with a bowl; spoon up and down |
| `sleep` | 6 | 2 | 2 | Lying down, chest rising (drawn rotated onto the bed spot); "z" particles optional |
| `cast` | 7 | 6 | 10 | Arms up, a spark from the hand or staff in the school colour |
| `carry_walk` | 8 | 6 | 10 | Walking with a crate, tray or bundle (item layer swaps by activity) |
| `work` | 9 | 4 | 8 | Generic task: hammering, stirring, watering, sweeping (item layer decides which) |
| `cheer` | 10 | 4 | 8 | Celebration (level-up, master, finished room) |
| `limp_walk` | 11 | 6 | 8 | Walking while injured (Sprained, Broken Bone) |
| `talk` | 12 | 2 | 3 | Two agents standing face to face in free time |
| `teach` | 13 | 4 | 6 | Faculty or the wizard at the board or lectern, pointing |

**Movement speeds** (art px per second): walk 28, limp 16, carry 24, climb 24 vertical. Speeds never depend on review rate (VR-03).

**Expression layer.** The face swaps to `tired` below Rest 25, `worried` below Composure 25, `happy` at morale 80+, `asleep` while sleeping, `focused` while studying or working, otherwise `neutral`.

## 6.5 Telling people apart at a glance

| Who | Silhouette | Colour | Marks |
|---|---|---|---|
| **The wizard** | Tallest; pointed hat (or their chosen hat) with the sigil; flowing **cape**; **staff** always in hand | Their chosen robe colour | **1 art px gold outline** around the whole sprite, a small floating sigil above the head on hover, and the camera Home button centres on them |
| **Faculty** | Adult height; **long robe** to the floor | Their teaching school's ramp | **Career stole** with the career emblem (9 emblems, Appendix C.4); a lectern or tool held during work |
| **Resident masters** | Adult height; long robe | Their mastered school | **Star pin** on the chest; no stole until they take a career |
| **Students** | 2 px shorter; **short robe** to the knee | Current school ramp | **School scarf** with the school glyph; a book under the arm when walking to class |
| **Adventurers** (career) | Adult; long robe plus **travel cloak and pack** | School ramp | Pack and a rolled map; the cloak replaces the stole |
| **Sabbatical faculty** | Adult; civilian tunic | Muted school colour | Stole folded over one arm |

## 6.6 Badges under the feet

- **Mastery pips**: one 3 × 3 pip per mastered school, in a row under the feet, coloured by school. At zoom 2× and above, each pip is drawn as the school glyph in the overlay.
- **Career emblem**: on the stole in the art, and as a 10 × 10 icon next to the pips in the overlay at 3× and above.
- **Selection**: a soft ellipse under the feet in the sigil colour when selected or followed.

## 6.7 Status bubbles

One bubble at a time per character, above the head, chosen by priority:

| Priority | Condition (from state) | Bubble |
|---|---|---|
| 1 | `injury` present | Injury icon: Bruised (purple bruise mark), Sprained (bandaged ankle), Hexed / Rift curse (swirling purple spiral), Broken Bone (sling), Rift-Touched (faint violet glow around the whole sprite plus a small rift-star icon). The glow is permanent while Rift-Touched; the icon is the bubble |
| 2 | A need in the 0–24 band (GDD 14.5: Hungry, Exhausted, Restless, Rattled) | Need icon in a red-rimmed bubble: bowl, pillow, ball, storm cloud |
| 3 | Mastery-ready for their current school (`readyDays` > 0) | A gold star with a tiny countdown ring (full when the teacher delay has passed) |
| 4 | A need in the 25–49 band | Same icons in a grey bubble, **only** when the Needs lens is on or the character is hovered |
| 5 | Morale 80+ | A small heart, shown for 3 s when the character arrives in a room, then hidden |

- Bubbles have a 1 px outline and a shape per priority (round for injuries, square for needs, star for mastery), so colour is never the only cue.
- Bubbles use the overlay layer, so they stay 24 screen px at every zoom.
- **Crowding**: if more than 8 bubbles would show in one room, the room shows one combined bubble ("3 hungry, 1 injured") instead.

## 6.8 Portraits

- **V3:** a 64 × 64 portrait is made by cropping the baked `idle` frame's head and shoulders (16 × 16 art px), scaling it ×4 with nearest-neighbour, and placing it in a school-coloured round frame. No extra art is needed.
- **V6 (optional):** dedicated 32 × 32 bust layers with the same option ids and index colours, drawn at ×2. Fall back to the crop.
- Portraits appear in `RosterPanel`, `RecruitmentPanel` (applicants), `RiftPanel` (team picker and active expedition), the Wizard screen, and the dock panel (96 × 96 with a 2-frame blink). The dock never renders the world.


# 7. The Movement Simulation (Choreographer)

## 7.1 What it is and what it is not

The **Choreographer** (`src/visual/agents/Choreographer.ts`) moves character and creature agents around the castle so the Academy looks lived in. It is a puppet show staged on top of the real game:

- **Inputs:** a read-only snapshot of `FullGameState`, the reachability result (Section 3.4), the room layouts, the local clock and the visual settings.
- **Outputs:** positions, facing, animation names and bubble choices for agents. Nothing else.
- **It never writes game state (VR-01)**, never rolls a game random number, never causes a hazard or misbehavior, and never decides anything that has a game effect. Where a game effect depends on where someone is (Headmaster's Presence, healing place, detention, a Loose creature's room), the engine decides it and the Choreographer reads it (VR-05).
- **It does not reward review count or speed (VR-03).** Its timing comes from the real clock and its own fixed loop, not from reviews. A bell that rings changes *what* is shown, never how fast or how much.

If the Choreographer is switched off (Settings → Display → "Animate the Academy: off"), every agent stands at its "home" spot (seat, workplace or bed) with an idle frame, and the game plays the same.

## 7.2 The activity resolver

For each character, once per **tick** (every 2 s of real time, staggered across agents so not all decide on the same frame), the resolver picks one **activity** in priority order. The first match wins.

| # | Activity | Condition (from state) | Destination | Animation at destination |
|---|---|---|---|---|
| 1 | **Off-map** | In an active expedition's `teamIds`, or `status: 'away'` | Leaves via the path to the Rift Gate, then hidden | — |
| 2 | **Recovering** | `injury` present | The engine's healing place: Infirmary bed, else own bed (`bedRoomId`), else a cot spot in the Entrance Hall ("nowhere") | `sleep` or `sit_study` with a bandage; Broken Bone never leaves the bed |
| 3 | **Detention** | The engine marks the student as in detention (Section 13.5 hook) | A Detention Hall spot | `sit_study` with a sulky expression |
| 4 | **Sleep** | Schedule phase is Sleep (7.4) and the character has a bed | `bedRoomId` bed spot | `sleep` |
| 5 | **Meal** | Meal window open (7.5) | Refectory seat spot, else standing spot ("food but no seat", GDD 14.4) | `eat` |
| 6 | **Work** | Has a career with a `workplaceRoomId` and the schedule phase is Work | Their workplace work spot, or for Builders the active site (Section 5.6) | `work`, `teach` (teachers at the board), `cast` (Warders at a ward), `carry_walk` loops (Gardeners between plot and Kitchen) |
| 7 | **Class** | Student with a `seatRoomId` and the schedule phase is Class | Their seat spot | `sit_study`; their teacher stands at the `teach` spot |
| 8 | **Free time** | Otherwise | Chosen by 7.6 | `idle`, `talk`, `sit_study` (reading), `eat` (snack) |

The resolver is a pure function: `resolveActivity(character, snapshot, clockPhase, rng) → Activity`. The `rng` is the Choreographer's own seeded random, used only for cosmetic choices (which free-time room, which spot).

**The wizard** has its own short list: (1) at each bell, go to the engine's **Headmaster's Presence** room (`presenceRoomId`) and stay there until the next bell (GDD's "the wizard's sprite visits a random room each bell"); (2) if the engine does not expose one yet, stay in the Study; (3) while an orb or grimoire session is active, short `cast` loops at the orb stand; (4) when the player casts a spell, a `cast` animation in place. The wizard never sleeps on the map during the `lively` schedule; at night in `clock` mode the Study window glows and the wizard reads by lamplight.

## 7.3 Agent state machine

Each agent runs a small finite-state machine (`AgentFSM.ts`): **Idle → Plan path → Walking ⇄ Climbing → Arriving → Performing**, and back to Plan path when the activity changes. If there is no path, or the spot is taken or the room locked, the agent waits in place for 4 s and tries again.

- **Plan path**: ask the pathfinder for a route from the current node to the destination spot (7.7). If none exists (the room became unreachable, the stair was demolished), the agent does a free-time idle where it is and tries again on the next tick.
- **Walking / Climbing**: follow the route's waypoints at the animation's speed. Doorways are just waypoints on the floor line. Stairs switch to `climb`.
- **Arriving**: snap to the spot (seat, bed, work), set facing, play a 1-frame transition (sit down, lie down).
- **Performing**: loop the activity animation until the activity changes. A minimum dwell of **8 s** stops agents flickering between activities.
- **Teleport rule.** If the route is longer than 40 s of walking, or the agent is off-screen at both ends, the agent fades out and in at the destination instead of walking. With `reduceMotion`, every move is a teleport with no fade (VR-09).

## 7.4 The schedule

Two schedule styles, set in Settings → Display (`visualSchedule`):

**`lively` (default): a 10-minute loop.** The Academy goes through a short school "day" every 10 real minutes, so a player who opens the window for a minute sees a mix of class, work and free time.

| Loop minute | Phase | Who does what |
|---|---|---|
| 0:00–4:00 | Class / Work | Students in seats; faculty teaching or working |
| 4:00–6:00 | Free time | Everyone picks free-time rooms (7.6) |
| 6:00–9:00 | Class / Work | As above |
| 9:00–10:00 | Free time | As above |
| (any time) | Meal | Overrides when a meal window opens (7.5) |
| (any time) | Sleep | Characters whose Rest is 0–24 nap in their bed during free time |

**`clock`: follows the local clock.** Class/Work 08:00–12:00 and 13:30–17:00; meals 12:00–13:30 and 18:00–19:00 (plus the meal window); free time 17:00–18:00 and 19:00–23:00; sleep 23:00–06:00 for about 70% of characters (seeded per character). Night Owl characters (trait, GDD 14.3) are in the 30% who stay up, and carry lanterns. Early Riser characters wake first. A Sleepwalker is shown wandering only when the engine reports a sleepwalking incident (it is a rule in GDD 14.3), never as random flavour.

Phase boundaries are **staggered** by a per-character offset of 0–30 s so the castle does not empty in one frame.

## 7.5 Meals and bells

- **Meal window.** In the engine, meals happen every 5th bell (GDD 14.4). When the visual layer sees `bellIndex` change to a multiple of 5, it opens a **meal window of 90 s** of real time: characters walk to the Refectory, sit, eat and leave.
- **Debounce (VR-03).** A new meal window cannot open within 5 minutes of the previous one. If meals happen faster (fast reviewing with the window open), the extra meal bells are shown only as the bell icon in the TopBar. The castle never turns into a meal-rush loop because the player reviews quickly.
- **Who eats.** Everyone not off-map or bedridden. Seats are Refectory seat spots in the order of the engine's meal capacity (`seats × 2`, two sittings). Characters beyond the first sitting wait at **queue spots** by the Refectory door, then sit when the first sitting leaves (45 s in). Characters with no seat at all eat standing at the wall. This is a picture of GDD 14.4, not a simulation of it: who is fed and how much hunger changes is decided by the engine.
- **No Refectory.** Characters carry a bowl and eat standing in the Entrance Hall.
- **Bell ring.** On every `bellIndex` change a small bell in the Entrance Hall's dressing swings once (0.6 s), debounced to at most one swing per 3 s.

## 7.6 Free time

Free-time room choice (cosmetic, seeded):

1. If a need is in the 0–49 band, go to the room that serves the **lowest** such need (Hunger → Refectory or Kitchen doorway for a snack; Rest → own bed for a nap; Leisure → Common Room, Faculty Lounge (faculty only), Bathhouse, Orchard; Composure → Sanctum, Bathhouse, a creature habitat).
2. Else, with 40% chance, go to a room the character's **personality loves** (GDD 14.2: Bookish → Library, Mischievous → Common Room, Gentle → a habitat, Bold → Training Yard, Dreamy → Observatory, Steadfast → Sanctum, Social → Common Room or Refectory, Curious → Alchemy Lab or Menagerie), if it exists and is reachable.
3. Else pick from all reachable leisure-type rooms and grounds plots, weighted by their free stand spots.
4. Two characters in the same room in free time may pair up for `talk` (Social characters 2× as likely).

The choice is cosmetic. Whether a Common Room actually raises Leisure is decided by the engine's formulas (GDD 14.4).

## 7.7 Navigation and pathfinding

**Nav graph** (`navGraph.ts`), rebuilt only when rooms change (a hash of room ids, positions, states and the reachability result):

- **Nodes:** each built, reachable room's floor segment on each floor it covers; each Spiral Stair cell; the Study's internal stair; the Entrance Hall's front door; one node per plot; the path.
- **Edges:**
  - same-floor neighbours that share a wall edge (the doorway), cost = horizontal distance;
  - stacked Spiral Stairs and the Study's floors 0–1 stair, cost = vertical distance × 1.5 (climbing is slower);
  - multi-floor room ledges (Section 3.3), cost = ladder height × 1.5;
  - Entrance Hall front door ↔ path ↔ each plot, cost = path distance.
- **Rule:** the nav graph uses **exactly** the same links as `computeReachability`. An edge exists only where the GDD's BFS has a link. If the nav graph would reach a room that reachability says is unreachable, that is a test failure (Section 17).
- **Pathfinding:** Dijkstra over the small graph (at most about 160 nodes), with **all-pairs routes cached** after each rebuild. Agents ask for `route(fromNode, toSpot)` and get a list of waypoints (door positions, stair tops and bottoms, the spot).
- **Within a room:** agents walk along the floor line. They do not collide; they keep at least 6 art px apart when standing still by nudging to the nearest free stand spot.
- **Locked or construction rooms** are removed from the graph while Locked or under construction (agents route around them, or wait if there is no way round).

## 7.8 Crowding

- **Visible cap per room.** A room shows at most as many agents as it has spots plus its overflow spots. If more characters would be in it (a full Refectory, a packed Common Room), the extra ones are not drawn and the room shows a **"+N"** badge at its top-left in the overlay.
- **Global cap.** At most **60 character agents and 40 creature agents** are drawn at once (Section 14.1). Beyond that, characters in free time are hidden first (the "+N" badges count them), then students in class (their room shows "+N"), never the wizard, never injured characters, never a character the user is following.
- **Over capacity, shown honestly.** When the engine says a room is over capacity (more students assigned to a classroom than its seats, more residents than beds), the extra agents stand at the back wall with a small "no seat" or "no bed" bubble. This is VR-04: the crowding shown must be true.

## 7.9 Misbehavior and hazards, shown

The engine rolls misbehavior and hazards (GDD 19–20); the visual layer only shows what happened, from notices and state changes (Section 9). For an incident, the named student goes to the named room, plays its 3 s vignette (Section 9.3), and the room shows the dirt the engine's cleanliness change implies; detention means a walk to the Detention Hall. For a hazard, the room plays its vignette while Locked, agents leave it for the nearest neighbouring room, and a Warder or the wizard plays `cast` at the door when the engine resolves it. **No vignette ever plays without a matching notice or state change.** Free-time flavour is limited to harmless things (a Mischievous student peeking from behind a curtain) that show no damage or dirt.

## 7.10 Determinism and opening the window

The Choreographer's own random is seeded from the Academy name and day, so the castle looks similar each time it opens; nothing depends on it. On opening, agents are placed directly at their current activity's spot, so the first frame is already a lived-in castle. A layout change re-plans affected agents only.


# 8. Creatures

## 8.1 Who is drawn

Every `CreatureInstance` in `state.creatures` is drawn according to its `status`:

| `status` | Where | Look |
|---|---|---|
| `egg` | The matching habitat if it has room, else the Storage Vault (GDD 22.3: Rift eggs wait in Storage) | Egg sprite in a straw nest; wobbles as `hatchProgress` rises (8.4) |
| `wary` | Its habitat room (`roomId`) | Normal sprite, but keeps to the back of the pen, ears or feathers flat; a small "?" bubble at first sight; a **taming ring** above it (8.3) |
| `tamed` | Its habitat room | Relaxed idle; comes to the front of the pen when its tamer is there; Bond hearts (1–3) on hover |
| `loose` | Wandering the map (8.5) | Normal sprite with a dashed outline and a red "!" bubble; clickable |
| `away` | Not drawn (on an expedition as a companion) | Shown as a portrait chip on the expedition card |

A creature that arrived with nowhere to live ("Looking for a home", GDD 22.3) is drawn sitting by the Entrance Hall doors with a small bundle, until the engine moves or removes it.

## 8.2 Sprites, sizes and behaviour

- **Sheet layout** (Appendix A.3): 5 rows, facing right: `idle` (4 frames), `move` (6), `eat` (2), `sleep` (2), `trouble` (4). Legendary creatures add an `aura` row (4 frames, additive). Frame size by rarity: Common and Uncommon 16 × 16, Rare 24 × 24, Epic and Legendary 32 × 32, Philosopher's Chimera 48 × 32.
- **Movement types by habitat:** Meadow creatures walk; Tide creatures swim inside the tank's water rectangle (bob and loop, surfacing for bubbles); Sky creatures hop between perch spots and make short arcing flights in the open air above an Aviary (it needs sky, GDD P5); Gloom creatures dart between burrow spots and spend most time in shadow with only their eyes lit; Ember creatures bask on coals with a flicker shader; Crystal creatures hover and slowly orbit a geode.
- **Pens.** Each habitat room's layout (Section 5.3) defines a **pen rectangle** and `pen` spots. Creatures stay inside it with a simple wander: choose a random pen spot every 4–12 s, move there, idle or eat or sleep. Menagerie modules each get their own pen rectangle inside the 3 × 2 room, drawn with the module's habitat backdrop strip (Appendix A.2 `habitat_module_{habitat}`).
- **Night.** In `clock` mode, creatures sleep at night except Gloom creatures and nocturnal Sky species (owls, bats, moths), which are more active.
- **Diet.** At the meal window, a Tamer (or the wizard, if they are the creature's tamer) walks to the habitat with a bucket (`carry_walk`), and creatures play `eat`. A **Hungry** creature (`hungry: true`) shows a red bowl bubble and stands at the pen's front. This shows the engine's state; it does not feed anything.
- **Grounds creatures** in the Meadow Paddock graze along the plot and occasionally walk to its fence. They never leave the plot unless Loose.

## 8.3 Taming progress

- A Wary creature shows a **taming ring** above it: a circle that fills clockwise with `tamingProgress / tamingRequirement` (requirement by rarity from GDD 22.4: 40 / 90 / 160 / 260 / 400). Hovering shows "About N honest reviews to tame", with the rate from the engine where available.
- The assigned tamer (`tamerId`) spends their **work** activity at the pen, crouching (`work` with the brush or treat item). When the wizard is the tamer (Nature L3+, Common creatures only, GDD 22.4), the wizard is **not** moved to the pen by the Choreographer, because the wizard's position has a real effect (Headmaster's Presence, VR-05). Instead the pen shows a small floating sigil-coloured paw charm while the wizard is the tamer, and the wizard is drawn at the pen only in bells where the engine's Presence room is that habitat.
- **Becoming Tamed** (status change): the ring completes with a burst of hearts, the creature hops once (`trouble` row is not used for this; it uses `idle` sped to 12 fps for 1 s, the only exception to fixed speeds, and it is per event, not per review), and its posture switches to relaxed.
- **Bond up** (`bondLevel` change): a heart icon rises from the creature; at Bond 3 a small permanent sparkle under its feet.

## 8.4 Eggs and hatching

- Egg sheets are shared by rarity: `creatures/eggs/egg_{rarity}.png`, 12 × 14 frames: 4 `idle` frames (still, slight shine), 4 `wobble` frames, 6 `hatch` frames (crack, top pops, the creature's own `idle` frame 0 appears).
- `hatchProgress` thresholds: below 50% the egg is still with an occasional shine; 50–90% it wobbles every 6 s; above 90% it wobbles every 2 s and shows a crack line.
- When `status` changes from `egg` to `wary`, play the 6-frame hatch, then the creature appears with a "?" bubble.

## 8.5 Escapes and Loose creatures

- **Escape** (status changes to `loose`): the creature plays its `trouble` animation once in the pen (the trouble effect itself is the engine's), a small gap opens in the pen's fence art for 2 s, and the creature leaves the room.
- **Wandering.** A Loose creature wanders reachable rooms and the grounds using the nav graph with its habitat's movement style (Sky creatures fly between rooms' ceilings; Tide creatures hop in puddles). It shows its trouble flavour as a small looping vignette where it stops (an Ember Salamander leaves scorch dots that fade after 10 s; a Mopslime leaves a shiny trail; an Imp hides behind a crate). These are cosmetic only and never change cleanliness or damage furniture in the art beyond what the state says.
- **If the engine stores where a Loose creature is**, the visual follows it (VR-05). If not, the Choreographer picks rooms cosmetically and moves the creature on every 20–40 s.
- **Recapture.** When status changes back to `tamed` or `wary`: if a tamer or warder did it, that character walks to the creature and leads it home (both walk to the habitat); if *Beckon* was cast, the wizard plays `cast` and the creature floats home in a bubble; if it came home by itself, it walks home.
- **Never lost (GDD 22.6).** Loose creatures always stay on the map. They are never drawn walking off the edge of the world.

## 8.6 Creature caps

At most 40 creature agents are drawn (Section 14.1). In a habitat with more creatures than its pen can show clearly (more than 6 in a 1 × 1 pen), the extras are hidden and the room shows "+N". Loose creatures and eggs are always drawn.


# 9. Visual Events: From Game State to Animation

## 9.1 Where events come from

The visual layer learns that "something happened" in two ways, both read-only:

1. **State diffs.** `visualEvents.ts` keeps the previous snapshot and compares it with the new one after every state update: bell index, day, wizard levels, room list and fields, characters' status, career, injury, `readyDays` and `masteredSchools`, creatures' status, bond and progress, expeditions, `activeEvents`, `veil.strength`, `knownSpells` and `hand`. Each difference becomes a typed `VisualEvent`.
2. **Notices.** The engine already writes `notices` entries (`id`, `time`, `text`, `type`; types such as `build_complete`, `level_up`, `mastery`, `expedition`, `event`, `enrollment`, `career`, `spell`). New notices are turned into visual events by `type`.

**Recommended hook (Section 13.5).** Add an optional `data` field to notices: `{ roomId?, characterIds?, creatureId?, hazardId?, incidentId?, outcome? }`. It is optional, ignored by all existing code, and lets the visual layer play the right vignette in the right room without parsing notice text. Where `data` is missing, the event plays its generic version (a sparkle on the Entrance Hall plus the notice toast), never a guessed location.

## 9.2 Event rules

- **One vignette per event, sized by the event.** A level-up gets the same celebration whether it came after 10 reviews or 10,000 (VR-03).
- **Queue and debounce.** Visual events go into a queue played at most **one big effect (cheer, burst, banner) every 2 s** per room and **4 at once** across the map. If more arrive (for example after opening the window to a long arrival summary), only the most important per category play and the rest are summarised by the existing arrival summary (GDD 36.4). Small effects (a door swing, a pop icon) merge.
- **Events from away time do not replay.** When the window opens after a gap, the arrival summary already tells the story. The castle opens in its current state with no backlog of animations (VR-06).
- **Reduce motion.** Every event falls back to a static badge or a one-frame swap (VR-09).

## 9.3 Catalogue

**Academy rhythm**

| Event | Trigger | Visual |
|---|---|---|
| Bell | `bellIndex` changes | Entrance Hall bell swings once (debounced 3 s); output pops above producing rooms (one per room) |
| Meal | `bellIndex % 5 === 0` changes | Meal window (Section 7.5; debounced 5 min) |
| Day tick | `day` changes | Dome ripple (paid) or dim (not fully paid), Section 4.4 |
| Honest review | `reviewIndex` changes | **No world effect.** Only the TopBar counter and the optional toast (Section 11.5), so nothing in the castle scales with review speed |

**Wizard**

| Event | Trigger | Visual |
|---|---|---|
| Session started | `wizard.activeSession` appears | The Study orb stand lights up in the school colour; the wizard does `cast` at it for 3 s |
| Level up | `wizard.levels[school]` increases | The wizard does `cheer` in place; a ring of the school glyph rises from the Study roof; a 2 s banner "Nature 3" over the Study |
| New spell | `knownSpells` grows | A book flies from the Study shelf into the wizard's hands |
| Spell cast | `spell` notice | Wizard `cast`; a burst in the school colour over the target room, floor or the whole castle (by the spell's target) |

**Rooms**: site placed, build complete, furniture added, damaged or repaired, tier change, level up, demolished, locked and unlocked all use the visuals defined in Sections 5.2–5.7, triggered by the matching field change on the room.

**People**

| Event | Trigger | Visual |
|---|---|---|
| Enrolled | New character | Walks in from the path carrying a trunk (`carry_walk`), to their bed, then their seat |
| Mastery-ready | `readyDays[school]` becomes > 0 | Gold star bubble appears (6.7) |
| Becomes a master | `masteredSchools` grows | Character `cheer`; a star pin drops onto their robe; students nearby clap (`cheer`) |
| Career taken | `career` set | A stole shimmers onto them; they walk to their new workplace |
| Injured | `injury` set | They switch to `limp_walk` (Sprained, Broken Bone) or get the spiral (Hexed) and head to their healing place |
| Healed | `injury` cleared | A small sparkle; they walk out of the Infirmary normally |
| Retired | `status` becomes `alumnus` | They walk to the Entrance Hall, wave, walk out along the path; their portrait slides into the Alumni Gallery button |
| Detention | Engine detention hook | Walks to the Detention Hall with a sulky face |

**Rift and expeditions**

| Event | Trigger | Visual |
|---|---|---|
| Rift opens | GDD 27.2 conditions met (state flag or notice) | The Rift Gate stones glow, the portal surface forms over 2 s |
| Expedition launched | New expedition with `state: 'active'` | Team walks from wherever they are, along the path, into the Gate; portal swirls faster for 2 s; "away" banner with portraits on the arch |
| Returned safe | `outcome: 'safe'` | Flare; team walks out cheering; loot chests pop over the Gate (one per loot line, max 5) |
| Minor injury | `minor_injury` | Flare; the injured hero (`injuredHeroId`) limps out, the others support them |
| Serious injury | `serious_injury` | Flare; two teammates carry the hero out between them (shared `carry_walk`) toward the Infirmary |
| Curse | `curse` | Flare in violet; the cursed hero comes out with the spiral or the Rift-Touched glow |
| Retreat | `retreat` | Flare; the team walks out quickly with no chests |
| Eggs | Egg added | An egg rolls out of the portal into a crate, then to its habitat or Storage |

**Creatures**: arrival (walks or flies in from the sky or the path, "?" bubble), hatch, tamed, bond up, escape, recapture (Section 8).

**Events board**: a new `activeEvents` entry brings a **messenger owl** that lands on the Entrance Hall roof with a letter and stays until the event is resolved. Clicking it opens the event modal (`activeEventModal`, existing behaviour).

**Hazard vignettes** (play while the room or floor is Locked or affected; ended by the state change)

| Hazard id | Vignette |
|---|---|
| `mana_static` | Blue sparks crackle between furniture; furniture glows switch off |
| `poltergeist` | Books and cups float and drift; a translucent sheet-ghost bobs; dirt decals appear as the engine lowers cleanliness |
| `wild_growth` | Vines creep across the room's front; flowers open when cleared |
| `hex_fog` | Green-grey fog band across the whole floor |
| `gravity_hiccup` | Everyone and every loose prop on the floor bobs 4 px up and down slowly (the "very funny animation"); agents play `idle` in mid-air |
| `imp_infestation` | Two small imps peek from behind crates and dart away; a sack of Provisions shuffles |
| `echo_loop` | The same speech bubble ("…and then…") repeats over everyone in the room |
| `wisp_swarm` | Glowing wisps circle over two plots |
| `cold_snap` | Frost on the window frames and blue breath puffs |
| `night_ink` | Inky blots spread over the floor's back walls |
| `bubbling_cauldron` | Cauldron foams over in the brew's colour; one character jumps back |
| `kitchen_fire` | Small, cartoony flames on the range, smoke out of the doorway; a Warder or the wizard `cast`s a blue splash when it ends |
| `drafty_window` | Curtains blow; papers swirl in three rooms |
| `rift_tremor` | The Gate stones shake 1 px and dust falls |
| Breaches (`shade_breach`, `gloom_pack`, `veil_rent`, `wanderer`) | A soft-edged shade in the room (never with a face, never attacking a sprite on screen); a pack of shadow-hound silhouettes running along the far hills; dome tears plus padlocks; a strange round creature sitting by the doors |

**Misbehavior vignettes** (3 s, in the named room, from the incident notice)

| Incident id | Vignette |
|---|---|
| `graffiti_glyphs` | Glowing doodles appear on the back wall (they stay until cleanliness is back to 80+) |
| `food_fight` | Food arcs across the Refectory; splat decals |
| `unauthorized_summoning` | A chalk circle flashes, followed by the hazard it caused |
| `sneaking_out` | The student tiptoes along the path off the map edge, and is hidden until they return |
| `hex_duel` | Two students face each other in a corridor and trade sparks |
| `creature_release` | A student opens the pen gate; the creature runs (escape visuals) |
| `potion_prank` | Green hair / floating / a tiny speech bubble on the target for the cosmetic status's duration (the engine sets the status; the art shows it) |
| `midnight_feast` | Students with plates in the dorm by candlelight |
| `bell_prank` | The Entrance Hall bell rings with a ribbon tied to it |
| `library_fort` | A wall of books with a flag on top in the Library |
| `portrait_mustache` | A mustache on the Founder's Portrait; the wizard's sprite briefly wears one too (GDD 20.3) |
| `broom_joyride` | A student zooms across the sky on a broom and lands with a bump |
| `alchemy_dare` | Students egging each other on at the cauldron |
| `rift_peek` | The student walks to the Gate and peers in |
| `secret_club` | Three students in a huddle with a hand-drawn banner |
| `dorm_swap` | Pillows fly; beds show swapped name tags |


# 10. Character Creation, Fresh Start and the Tutorial

> **Fixes the current build's start.** `createInitialGameState()` today starts the player as "Hazel", a level-2 Nature witch with 250 mana, 10 Renown, five known spells, all school levels at 1, extra essences, a Wary Mossback Tortoise, two cards in hand, a pending "misaddressed owl" event and the `doors_open` achievement. That contradicts the GDD: BR-01 (mana only from honest reviews), GDD 7.2 (the player creates their character), GDD 35.2 (the tutorial grants the kit and the first free draft), GDD 32 (`doors_open` is earned by enrolling the first student) and GDD 15.2 (the starting Academy). This section replaces it.

## 10.1 The flow on first launch

1. **Welcome page** (GDD 35.2 Step 0): storybook panel with the honesty promise text exactly as written in the GDD. Buttons: **Begin** / Skip tutorial. Behind it, the empty castle (Section 10.4) is already drawn at night-blue dusk with the Veil dome shimmering, so the first impression is the castle, not a form.
2. **Create your Headmaster** (10.2): one screen, a live animated preview on the left and choices on the right.
3. **Name your Academy**: Academy name, sigil and mode on one short screen.
4. **Founding Day** (GDD 28 scripted event "Founding Day (first launch)"): played as a 6 s scene, not left as a pending event. The camera starts on the closed Entrance Hall doors, the doors open, the wizard walks in along the path from the left, the crest banner with the chosen sigil unfurls, and the wizard walks up to the Study. The event is marked fired.
5. **Guided tour** (GDD 35.2's 4 panels): the camera pans and a spotlight cut-out highlights each in turn: **Study** (orbs and the training ring), **Entrance Hall** (where students arrive and ceremonies happen), **grounds** (Vegetable Patch and Woodlot), **top bar** (mana and the Veil gauge). One sentence per panel; Next / Skip.
6. **Starting kit and free draft**: crates float into the Storage Vault (the starting stock) and the `CardDraftPanel` opens with the fixed first draw (Courtyard Garden / Crate of Supplies / Bountiful Harvest), keep 1.
7. **First goal** banner: "Study in Anki as usual. Your first 8 reviews pay for your first orb."

"Skip tutorial" skips steps 4, 5 and 7 but still runs creation and still grants the kit and the free draft.

## 10.2 Create your Headmaster

All GDD 7.2 fields, plus one new field (**founding school**). Every choice except the founding date can be changed later in the Wizard screen's appearance editor (GDD 36.3 item 2).

| Field | Control | Options | Default |
|---|---|---|---|
| Name | Text input, 1–24 characters, trimmed | Free text | Empty (Begin disabled until filled); a "Suggest" button picks from a name list |
| Title | Segmented buttons + custom | Wizard, Witch, Mage, Sorcerer, Sorceress, Warlock, Magus, custom (1–16 characters) | Wizard |
| Pronouns | Segmented buttons + custom | she/her, he/him, they/them, custom | they/them |
| Body shape | 4 swatches | 4 (GDD 7.2) | 1 |
| Skin tone | 8 swatches | Appendix C.2 | Random |
| Hair style | Carousel with arrows | 12 | Random |
| Hair colour | 10 swatches | Appendix C.2 | Random |
| Robe colour | 12 swatches | Appendix C.3 (the five school keys plus seven neutrals and jewel tones) | The founding school's key colour, until the player picks one |
| Hat | Carousel | 8 including "no hat" | Pointed |
| Staff | Carousel | 6 | Oak staff |
| **Founding school** (new) | 5 cards with glyph and a one-line reason (the same lines GDD 35.2 Step 2 uses) | Arcane, Nature, Light, Shadow, Alchemy | Nature, marked "Suggested" |
| Sigil | Grid of 24 pixel sigils | 24 (Appendix A.4 file list) | Eight-point star |
| Academy name | Text input | Free text | "Ankicaster Academy" |
| Mode | Two cards | Endless School (default) or Timed Term (GDD 30) | Endless School |

- **Live preview.** A 4× preview of the baked paper doll (Section 6.3) cycles `idle`, `walk`, `cast` with the chosen staff, in front of a mini Study backdrop tinted by the founding school. Re-bake on every change (debounced 100 ms).
- **Randomise** (dice button) rolls appearance only, never name or founding school.
- **Keyboard and screen readers.** Every swatch is a radio button with a name ("Skin tone 3 of 8"); carousels are buttons with arrow-key support.

**What the founding school does, and does not do.** It is only a tutorial and starting-kit choice: (a) the Study's orb stand shows that school's orb first and the tutorial's Step 2 pre-selects it ("Nature is suggested" becomes "you chose Nature at founding"); (b) the tier-1 grimoire placed in the starting kit is that school's (GDD 29.1 says the starting kit has the T1 grimoire for the first school); (c) the default robe colour. It grants no level, no mana, no essence, no unlock and no bonus. The player can still ponder any orb first. This needs confirmation (Section 18, D-01).

## 10.3 Data written by creation

Creation calls one pure function, `createNewAcademy(choices): FullGameState` in `src/visual/onboarding/freshStart.ts`. It is UI code calling a state constructor, which is allowed; the world renderer stays read-only (VR-01). It fills the existing wizard fields (`name`, `title`, `pronouns`, `sigil` as a sigil id such as `"star8"`, `academyName`), `settings.mode`, the new optional fields in Section 13.5 (`wizard.appearance`, `wizard.foundingSchool`, `wizard.foundedAt`), and everything in 10.4.

## 10.4 The fresh start

| Field | Fresh value | Reason |
|---|---|---|
| `mana`, `bankAtLastReview`, `manaDebt` | 0, 0, 0 | BR-01: mana only from honest reviews made after install |
| `renown` | 0 | Renown is earned (GDD 32) |
| `wizard.levels` | all 0 | The first orb gives level 1 (GDD 7.3–7.4) |
| `wizard.knownSpells` | `[]` | Spells come from grimoires (GDD 29) |
| `wizard.activeSession`, `queuedSessions` | none, `[]` | Step 2 starts the first session |
| `rooms` | Exactly the GDD 15.2 start: **Entrance Hall** (castle x 3–4, floor 0, with Grand Doors), **Wizard's Study** (x 5, floors 0–1, internal stair, with its required furniture), **Spiral Stair** (x 2, floor 0), **Storage Vault** (x 1, floor 0, with its required furniture), **Vegetable Patch** (grounds plot index 8) and **Woodlot** (plot index 9) | GDD 15.2. Plot indices per Section 3.5 |
| `resources` | 120 Timber, 60 Stone, 20 Glass, 20 Cloth, 40 Provisions, 10 Greens; **everything else 0**, no potions | GDD 25.1 starting stock only |
| `resources.seedsUnlocked` | Whatever the GDD's seed unlock rules give at level 0 (computed by the existing unlock code, not hard-coded) | GDD 21.3 |
| Starting kit items | All five Orbs on the orb stand (GDD 7.3) and the founding school's T1 grimoire (GDD 29.1) | GDD |
| `characters`, `cardSets` | `[]` | No students until the player enrolls one |
| `creatures` | `[]` | The first creature comes from Step 5's guaranteed visitor |
| `expeditions` | `[]` | — |
| `hand` | `[]` before the tutorial's free draft; then the one card kept | GDD 35.2 |
| `knownPlans`, `knownPatterns` | Computed from the unlock rules at total level 0 | Avoids hard-coded lists that drift from the GDD |
| `activeEvents` | `[]` | No pending events; Founding Day is played inside the creation flow and marked fired |
| `notices` | One welcome notice | — |
| `achievements` | `[]` | `doors_open` is earned by the first enrolment |
| `veil` | `strength: 100`, `costToday: 0`, `paidToday: 0`, `autoPay` per settings, `reductions: []` | Nothing pre-paid; the first bill comes at the first day tick (GDD 35.2 Step 6) |
| `day`, `reviewIndex`, `bellIndex` | 1, 0, 0 | — |
| `settings` | GDD defaults (unchanged from the build) | — |

`createInitialGameState()` should be reduced to "return `createNewAcademy(defaultChoices)`" so tests and the dev sandbox still have a one-call start. The browser build's `generateInitialCollection(350)` mock card collection stays as it is: it stands in for the Anki collection, and its cards earn nothing until reviewed.

## 10.5 Existing saves

Players (and AI Studio's own test saves) may already have a save from the hard-coded start.

- **Never wipe a save automatically** (BR-04). On load, if `wizard.appearance` is missing, open the creation screen in **"Choose your look"** mode: appearance, title, pronouns and sigil only, prefilled from the save, with no reset.
- Settings → Data already has a reset with double confirmation (GDD 36.3 item 11). Rename it **"Found a new Academy"** and route it through the full creation flow.
- Save migration adds the new optional fields with safe defaults (Section 13.5) and maps old grounds `x` values `0` and `1` to plot indices `8` and `9` (Section 3.5).

## 10.6 Tutorial staging (GDD 35.2, kept as written)

The tutorial's text and steps are unchanged. The visual layer stages them:

| Step | Visual staging |
|---|---|
| 0 | Welcome over the live castle; creation; Founding Day scene; 4-panel tour with camera pans |
| 1 | The mana toast (Section 11.5). In the castle, nothing per review (VR-03). At 80 mana a soft glow appears on the Study's orb stand (shown once, not nagging) |
| 2 | Clicking the glowing orb stand opens `WizardStudyPanel` with the founding school pre-selected; when the session starts, the wizard does `cast` and the progress ring appears over the Study |
| 3 | The Build menu opens on standard plans; the hint arrow points at an empty plot (Herb Garden) or a castle cell (Quarry) on the map, with the ghost placement preview |
| 4 | The level-up celebration (Section 9.3) |
| 5 | The guaranteed Common visitor walks or flies in to the new habitat with a "?" bubble |
| 6 | The first day-tick dome ripple, then the arrival summary introducing the Veil |
| 7 | The first student walks in from the path with a trunk (Section 9.3); the constellation is shown on their roster card |
| 8 | When the second student arrives, the Refectory and Dormitory capacity chips pulse once on the map |
| 9 | The Study's bookshelf glows once to point at the draft |

Hints never cover the map's centre for more than one panel, and all are dismissible (GDD 35.1).


# 11. UI Skin

> **Adds a skin; keeps every panel's contents and behaviour.** `TopBar`, `FlashcardReviewer`, `WizardStudyPanel`, `RosterPanel`, `RecruitmentPanel`, `BuildMenuPanel`, `CardDraftPanel`, `AlchemyPanel` and `RiftPanel` keep their props and logic. Only styles, icons and decorative frames change.

## 11.1 Panels

- **Frame.** Panels use a 9-slice frame (`ui/panel_light.png` and `ui/panel_dark.png`, 48 × 48 with 16 px corners): a parchment page with a thin ink rule and small corner flourishes (light theme), or ink with a gold rule (dark theme). Implemented with CSS `border-image` (DOM panels stay DOM). Fallback: a 2 px border and 8 px radius in the same colours (Tailwind classes).
- **Header ribbon.** Each panel's title sits on a ribbon in the colour of its area (Build = copper, Roster = rose, Recruit = moss, Wizard = the founding school, Draft = violet, Alchemy = vermilion, Rift = Veil purple). Ribbon art is a 3-slice image; fallback is a coloured bar.
- **Over the map.** Panels open over the map with the map dimmed 40% behind them (GDD 36.2's "translucent veil"), and the world keeps animating underneath at 15 fps to save power.
- **Buttons.** Primary: filled with a 1 px darker bottom edge (a pressed-stone look); secondary: outlined; disabled buttons keep showing their reason (GDD 36.3 item 4) in a tooltip. Hit areas at least 32 × 32.
- **Tailwind tokens.** Add theme tokens in the Tailwind v4 `@theme` block: `--color-parchment`, `--color-ink`, `--color-arcane-*`, `--color-nature-*` and so on from Appendix C, so panel code uses names, not hex values.

## 11.2 Fonts

> **Replaces GDD 37.4's "system UI font stack" and the unnamed display face.**

| Use | Font | Licence | Sizes |
|---|---|---|---|
| Display (panel titles, banners, the Academy name, level-up banners) | **Pixelify Sans** | SIL Open Font License 1.1 | 16, 24, 32 px only (it is a pixel face; keep it at multiples of 8) |
| Body and UI text | **Atkinson Hyperlegible Next** | SIL Open Font License 1.1 | 13–16 px base, scaled by the GDD text-scale setting (80–150%) |
| Numbers in the TopBar and meters | Atkinson Hyperlegible Next with `font-variant-numeric: tabular-nums` | — | — |

- Fonts are bundled as WOFF2 files under `assets/fonts/` with their `OFL.txt` licence files, loaded with `@font-face` and `font-display: swap`. No web font CDN (Section 15).
- The minimum text size stays 13 px (GDD 36.5). Pixel art never contains text, so translations and text scaling never touch art.

## 11.3 Icon set

- **Pixel icons**, 16 × 16 art px drawn at 2× (32 px) in the UI: mana spark, the 5 school glyphs, 9 career emblems, 20 resources (Timber, Stone, Glass, Cloth, Provisions, Greens, Fish, Nectar, the 5 essences, the 8 rare materials), the 5 room badges (Unfinished, Unreachable, Locked, Dirty, Hazard), 5 quality tiers, 5 injury icons, 4 need icons, bell, day, Veil bands (4), creature statuses (5), and the UI verbs (build, demolish, pause, renovate, furnish, enroll, reroll, launch, close, settings, codex).
- **Sources.** Code-drawn forge versions first (Section 12.2), then CC0 icons where they fit (12.3), then AI-generated ones post-processed into the palette.
- **lucide-react** stays as the fallback for any icon not yet drawn, through a single `<Icon name="…">` component that looks up the pixel icon and falls back to the lucide icon. Panels call `<Icon>`, never lucide directly, so swapping art never touches panel code.
- **Emoji** (used today in notices, for example "🎉") are replaced by `<Icon>` in rendered notices; the text in state can keep them for now.

## 11.4 TopBar

The TopBar keeps its contents (mana, resources, Veil gauge, bell). Skin: a carved wooden shelf with parchment labels; resource chips use the pixel icons; the **Veil gauge** is a small pixel dome icon that fills and shimmers with the band colour (static with reduce motion), plus the band name in text. No review-count or streak display (GDD 36.3 item 10).

## 11.5 The reviewer mana toast

The toast rules are the GDD's (36.1): frequency `every_review`, `every_bell` (default), `events_only` or `off`; top-right of the main window; fades in 120 ms, holds 1.2 s, fades out; click-through; never covers the answer buttons; never in the reviewer card area.

- **Skin.** A small parchment tag with a 1 px ink border, the pixel mana spark icon and the text ("+10 ✨" becomes the spark icon plus "+10"; the bell form "+100 mana · Bell 14 · Nature 6: 61/150").
- **No escalation (VR-03).** The toast looks the same for every review or bell: no combo counter, no growing size, no "streak" colour, no extra sparkle for fast answers.
- In the browser build, the same toast component appears over `FlashcardReviewer`'s top-right, outside the card.

## 11.6 The Rift chance meter

`RiftPanel` keeps its contents (GDD 27.5 and 36.3 item 9). The meter gets art:

- **Dial.** A 160 × 96 half-circle brass dial (`ui/chance_dial.png`) with a parchment face, ticks every 5% and numbers every 25%.
- **Needle** (`ui/chance_needle.png`, rotated in code) points at the chance of a safe return; the number is printed large under it.
- **Best-odds cap** for the chosen destination: a red notch on the dial rim with a small padlock icon, and the zone above it hatched.
- **Safe odds** marker: a green notch.
- **Modifiers.** The six Draft 8 modifiers are listed under the dial as rows with an icon, a signed number and a short reason, exactly as the panel shows them now.
- **Fortune** is shown separately as a small clover counter beside the dial, not on it (GDD 27.5 keeps them apart).
- **Motion.** The needle eases to its new value in 300 ms when the team changes; with reduce motion it jumps. The needle never wobbles or "rolls"; this is a forecast, not a slot machine.

## 11.7 Roster cards with portraits

- Each card: the 64 × 64 portrait (Section 6.8) in a round frame coloured by current school (glyph in the frame's bottom edge), name and title, a status chip (Student, Master, Faculty, Adventurer, Injured, Away, Alumnus) with icon, the career emblem, mastery pips, morale as a small face icon plus number, and the need bars with GDD 14.5 labels.
- The constellation (GDD 36.3 item 3) is unchanged in meaning; it gets a night-sky backdrop and star sprites in 4 sizes by interval band.
- A **"Show on map"** button on every card pans the camera to that character and starts follow.
- Recruitment applicant cards get the same portrait (generated from their appearance), so the player can see who they are enrolling.

## 11.8 Other screens

Build menu entries show the room dressing at 1× and furniture sprites at 2× (the "art" GDD 36.3 item 5 asks for). Draft books are six pixel spines in deck colours, and drawn cards use a frame per rarity. Menagerie cards show the creature's idle animation at 3×. The arrival summary gets a parchment letter frame with the wizard's portrait.


# 12. Asset Pipeline and Asset List

> **Replaces GDD 37.2's "SVG sprite sheet generated as part of the build" and GDD 38.3's `web/sprites.svg`.** Art ships as PNG atlases under `web/assets/`, with code-drawn fallbacks.

## 12.1 Three tiers of art, one resolver

| Tier | Name | What it is | When it is used |
|---|---|---|---|
| 0 | **Forge** | Code-drawn placeholder art: tiny pixel maps written as strings in TypeScript, rasterised into textures at start-up | Always shipped. Used for anything that has no file yet, or if a file fails to load |
| 1 | **CC0 packs** | Public-domain (CC0 1.0) pixel art, recoloured to the palette | Props, crops, icons, UI bits where a pack fits the style and the grid |
| 2 | **Studio art** | AI-generated or hand-made art, post-processed into the palette and grid by the pipeline (12.5) | Rooms, characters, creatures, furniture: the main look |

`assets/resolver.ts` looks up every sprite by **id** (for example `furniture/bookshelf`) and returns the best available texture: tier 2, then tier 1, then tier 0. The manifest (12.4) says which tiers exist for each id. The game never asks for a file path directly. This is what makes VR-08 ("always runs") true and lets art land piece by piece without code changes.

## 12.2 Tier 0: the forge

The forge makes every id drawable on day one.

- **Pixel maps.** A sprite is a small string grid plus a key that maps each character to a palette shade (for example `w` = wood shade 0, `b` = arcane shade 2), rasterised by `rasterize.ts`.
- **Generators** draw the rest procedurally so the forge stays small:
  - **Room shells:** tier wall skins (stone blocks, plaster, planks, panels, gilding) drawn with seeded noise and the neutral ramps; doorways, stairs, ledges, roofs.
  - **Room dressings:** a generic dressing per category with 1–3 signature props from the room's look in Appendix A.1 (for example the Greenhouse gets glass panes and planters, the Observatory a dome slit and telescope).
  - **Furniture:** 12 shape families (box, shelf, table, bed, chair, cauldron, lamp, plant, banner, frame, crystal, statue). Each furniture id maps to a family, two palette colours and an optional glyph, so all 114 entries get a recognisable forge sprite.
  - **Characters:** a forge paper doll with all layers (simple shapes), all animations (offset-based: bob, step, arm raise).
  - **Creatures:** 6 body plans (quadruped, bird, fish, blob, serpent, insect) × size × colours from the creature's school and habitat, with a feature (horns, wings, shell, glow).
  - **Icons:** all UI icons from Section 11.3 as 16 × 16 pixel maps.
- **Budget:** the forge is code, around 150–250 KB of TypeScript before minification, and draws all of its textures in under 150 ms on a mid-range laptop (generated at start-up into one atlas, and cached in memory).

## 12.3 Tier 1: CC0 packs

All named packs are published by Kenney under CC0 1.0 (public domain; no attribution required, credit given anyway in the add-on's credits file).

| Pack | What to use | Notes |
|---|---|---|
| **Pixel Platformer** (Kenney) | Side-view props, foliage, background hills and clouds, small items, simple critters for reference | 18 × 18 tiles: do not use as the room grid. Re-cut props onto the 16 px furniture grid and recolour to the palette |
| **Pixel Platformer Farm Expansion** (Kenney) | Crops (growth stages), fences, greenhouse pieces, tools | Fits the Vegetable Patch, Herb Garden, Greenhouse, Orchard and Meadow Paddock |
| **Pixel Platformer Food Expansion** (Kenney) | Food items for Refectory and Kitchen props, meal bowls, output pops | Recolour |
| **Game Icons** and **Game Icons (Expansion)** (Kenney) | UI verb icons (settings, close, arrows, locks) | Vector-style; downscale and redraw to 16 px pixel icons, or use only as reference |
| **1-Bit Pack** (Kenney) | Pictogram ideas for badges and status bubbles | Recolour with the palette |

Rules for tier 1:

- Keep the original pack's licence file in `assets/licenses/` with the pack name and source page, even though CC0 does not require it.
- Never mix CC0 art unprocessed: everything goes through the same palette snap and outline pass (12.5) so it matches.
- Packs with other licences (CC-BY, CC-BY-SA, GPL, "free for personal use") are **not** used. CC-BY-SA in particular would affect how the add-on's art may be shared. Only CC0.
- CC0 side-on castle interiors at this grid size are scarce, which is why tier 2 carries rooms and characters.

## 12.4 Manifest and file naming

All paths are under `public/assets/` in the Vite project and end up in `web/assets/` in the add-on.

```
assets/
  manifest.json                 # id → { tier, atlas, frame(s), anchor, size, frames, fps }
  atlases/                      # packed PNG atlases + JSON (Pixi spritesheet format)
    world-rooms-0.png/.json     # skins, dressings, roofs, doorways, stairs
    world-furniture-0.png/.json
    chars-layers-0.png/.json    # paper-doll layer sheets (index colours)
    creatures-0.png/.json
    fx-0.png/.json              # glows, particles, Veil, weather-free effects
    ui-0.png/.json              # icons, sigils, badges, bubbles
  ui/                           # DOM-skin images (9-slice frames, ribbons, dial)
  fonts/                        # WOFF2 + OFL.txt for each font
  licenses/                     # CC0 pack licence copies, credits.md
  src/                          # NOT shipped: source PNGs and prompts (12.5)
```

**Naming.** Lowercase snake case, ids from the GDD content files.

| Kind | Id pattern | Example |
|---|---|---|
| Tier skin | `skin/{tier}_{category}` | `skin/cozy_living` |
| Room dressing | `rooms/{roomId}` (+ `_l2`, `_l3` optional variants) | `rooms/greenhouse`, `rooms/greenhouse_l3` |
| Roof | `roof/{style}` | `roof/dome`, `roof/spire` |
| Construction stage | `site/{area}_{stage}` | `site/castle_3` |
| Furniture | `furniture/{furnitureId}` (+ `_{variant}`) | `furniture/bookshelf`, `furniture/habitat_module_tide` |
| Character layer | `char/{layer}/{option}` | `char/robe/long`, `char/hair/braid` |
| Creature | `creatures/{creatureId}` | `creatures/mossback_tortoise` |
| Egg | `creatures/eggs/egg_{rarity}` | `creatures/eggs/egg_rare` |
| Effect | `fx/{name}` | `fx/sparkle`, `fx/glow_warm` |
| Icon | `icon/{name}` | `icon/school_nature`, `icon/career_tamer` |
| Sigil | `sigil/{id}` | `sigil/star8` |

**Animation frames** are named `{id}#{anim}:{frame}` inside atlas JSON (for example `char/robe/long#walk:3`). Frame order and counts are the ones in Sections 6.4 and 8.2 and Appendix A.

## 12.5 Tier 2 pipeline: from generated image to game sprite

Image generators do not produce exact pixel art. The pipeline turns their output into sprites that obey the grid and the palette. It runs offline in Node (`scripts/art/`, using `sharp`, or `pngjs` if `sharp` cannot be installed), never in the game.

1. **Generate** with the prompts in Appendix B, at a large size (for example 1024 × 1024), on a flat magenta (#FF00FF) background, one subject per image, side view, light from top-left.
2. **Key out** the background (magenta within a tolerance) to 1-bit alpha.
3. **Downscale** to the target art size (for example 16 × 28 for a character, 64 × 48 per room cell) with nearest-neighbour after a box pre-filter, or a "pixelate by mode colour per block" filter, which keeps edges cleaner.
4. **Palette snap**: map every pixel to the nearest Appendix C palette colour in a perceptual colour space (OKLab). For layers that need recolouring (robes, hair, skin), map the main ramp to the four **index greys** instead (Section 6.2).
5. **Outline pass**: add a 1 px selective outline (darkest shade of the neighbouring colour), and remove stray single pixels.
6. **Slice and align**: cut frames to the exact frame size; align feet to the bottom row (characters), bottom-centre for furniture; check that layers line up with the base body (a script overlays each layer on the body and fails if any opaque pixel sits outside the body's allowed mask).
7. **Hand fix.** Generated frames rarely line up, so generate **one** key frame per layer and derive the other frames by editing it (offset limbs, robe sway).
8. **Pack** into atlases (max 2048 × 2048 per atlas, 2 px padding, no trimming for animation frames) and write `manifest.json`.
9. **Validate** (`npm run art:check`): every id in the GDD content files has a manifest entry or a forge fallback; frame counts match; sizes match; total size within budget (12.7).

AI Studio can do steps 2–9 in code. Step 1 (generation) is done by the owner or a separate image tool, using Appendix B; the pipeline accepts whatever lands in `assets/src/`.

## 12.6 Recolouring at bake time

- Layer sheets use four reserved **index greys** per recolourable ramp: `#202020`, `#606060`, `#A0A0A0`, `#E0E0E0` for the robe; a second set (`#212121`…) for hair; a third for skin.
- At bake time the layer is drawn to an offscreen canvas, its pixels are read (`getImageData`), index greys are swapped for the chosen ramp, and the result is uploaded as a texture. This is CPU-only and runs at most 4 times per frame (Section 6.3).
- The same method recolours furniture trim and room skins by category.

## 12.7 Size budget

| Group | Approx. contents | Budget |
|---|---|---|
| World rooms | 25 tier skins (5 tiers × 5 base categories, the rest by recolour), 56 dressings at 1–3 levels, roofs, stairs, sites | 2.5 MB |
| Furniture | 114 entries + variants, most 16 × 16 / 16 × 24, animated strips | 1.0 MB |
| Character layers | ~70 layer sheets × 14 rows | 1.5 MB |
| Creatures | 40 sheets + 5 eggs | 1.0 MB |
| FX and UI atlases | Effects, icons, sigils, bubbles, 9-slices, dial | 0.8 MB |
| Fonts | Two families, WOFF2 subsets (Latin) | 0.4 MB |
| **Total target** | | **≤ 8 MB** (hard cap **15 MB**) |

PNG atlases with indexed colour (8-bit palette PNG, since all art uses ≤ 64 colours) keep files small. The add-on as a whole (Python, web build, assets, content) should stay under 20 MB.

## 12.8 Asset list

The full per-id list for rooms (56), furniture (114 entries) and creatures (40) is in **Appendix A**, with sizes, frame counts and file names. The remaining groups:

| Group | Ids | Size (art px) | Frames | Count |
|---|---|---|---|---|
| Tier skins | `skin/{bare,plain,cozy,fine,splendid}_{neutral,warm,school,craft,rift}` | 64 × 48 tileable | 1 | 25 |
| Roofs | `roof/{battlement,spire,glass,dome,cupola,flat}` | 64 × 24 | 1 (dome: 4 for shutter) | 6 |
| Doorway, ledge, ladder, stair segment | `struct/{door,ledge,ladder,stair_spiral,stair_study,pillar}` | 14 × 30 to 64 × 48 | 1 | 6 |
| Construction | `site/{castle,grounds}_{1..5}`, `site/tarp`, `site/scaffold` | 64 × 48 tileable | 1 | 12 |
| Level trim | `trim/{l2,l3}_{cornice,window,emblem}` | 64 × 8 to 16 × 16 | 1 | 6 |
| Cleanliness decals | `decal/{a,b,c}_{1..3}` | 16 × 8 | 1 | 9 |
| Character body | `char/body/{shape1..4}_{adult,student}` | 16 × 28 per frame | 56 | 8 |
| Character robe | `char/robe/{short,long,wizard,tunic}` | 16 × 28 | 56 | 4 |
| Character hair | `char/hair/{01..12}_{back,front}` | 16 × 28 | 56 | 24 |
| Faces | `char/face/{shape1..4}` with 6 expression columns | 16 × 28 | 6 | 4 |
| Hats | `char/hat/{pointed,floppy,wide,hood,circlet,cap,flowers}` | 16 × 28 | 56 | 7 |
| Role marks | `char/mark/{scarf,stole,starpin,sigil_hat,cloak,pack,cape}` | 16 × 28 | 56 | 7 |
| Held items | `char/item/{staff1..6,book,tray,lantern,broom,can,hammer,quill,crate,bucket,brush}` | 16 × 28 | per animation | 16 |
| Bubbles | `ui/bubble/{injury_*,need_*,mastery,heart,crowd}` | 12 × 12 | 1 | 14 |
| Pips and emblems | `icon/school_*` (5), `icon/career_*` (9) | 3 × 3 and 10 × 10 | 1 | 28 |
| Sigils | `sigil/{24 ids}` | 16 × 16 | 1 | 24 |
| Effects | `fx/{sparkle,dust,poof,glow_warm,glow_cool,heart,z,splash,flame,smoke,spark_<school>,portal}` | 8 × 8 to 64 × 48 | 4–8 | ~18 |
| Sky | `sky/{hills_far,hills_near,cloud1..6,sun,moon_phase1..8,aurora}` | up to 512 × 96 | 1–4 | ~18 |
| Veil | `fx/veil_edge`, `fx/veil_noise`, `fx/veil_tear` | 64 × 64 tileable | 1–4 | 3 |
| Rift Gate | `rooms/rift_gate` + `fx/portal` | 128 × 96 / 48 × 64 | 1 / 8 | 2 |
| Messenger owl | `fx/owl` | 16 × 16 | 6 (fly) + 2 (perch) | 1 |
| UI frames | `ui/panel_{light,dark}`, `ui/ribbon_*`, `ui/chance_dial`, `ui/chance_needle`, `ui/card_frame_{rarity}`, `ui/book_spine_{deck}` | various | 1 | ~22 |


# 13. Rendering Architecture, Modules and Data Hooks

## 13.1 Recommendation: a PixiJS world layer under the React UI

**Use PixiJS v8 (the latest 8.x) for the world, and keep React for everything else.** The castle, grounds, sky, agents, effects and the overlay are drawn on one `<canvas>` by Pixi. React still owns the TopBar, panels, modals, toasts, character creation and all text-heavy UI, layered on top of the canvas with normal DOM.

Why this option:

- **PixiJS v8 (chosen).** Batched sprite rendering handles hundreds of animated sprites, nearest-neighbour scaling keeps pixels crisp, render textures make paper-doll baking cheap, filters cover the Veil, and its scene graph matches the layers in Section 3.2. It is a renderer, not a game framework, so it does not fight React or the engine. It tries WebGL first, can use WebGPU, and falls back automatically to an experimental Canvas 2D renderer, which VR-08 needs on older Qt WebEngine builds.
- **DOM/SVG (the GDD 37.2 approach), rejected.** 60 characters with 14 animations, plus furniture, effects and badges, means thousands of nodes and stuttering layout work.
- **Raw Canvas 2D, rejected as the main path.** Batching, hit-testing, render textures and a scene graph would all be hand-written. It is kept as the static fallback (13.7).
- **Phaser or another engine, rejected.** Its own scene system, input and state would clash with React and with an authoritative engine.
- **`@pixi/react`, not used for the world.** The world changes every frame under the Choreographer; reconciling each sprite through React is wasted work. One React component owns the Pixi `Application`, and everything inside it is imperative.

## 13.2 How it fits the existing app

- `App.tsx` keeps rendering `<CastleGrid state={state} onSelectRoom={…} selectedRoomId={…} />` on the `castle` tab. **`CastleGrid` keeps its props.** Its body becomes `<AcademyCanvas … />` plus a small DOM toolbar (zoom, Fit, Home, Names, lens menu).
- `AcademyCanvas` creates one Pixi `Application` on mount (`await app.init({ resizeTo: container, antialias: false, resolution: devicePixelRatio, autoDensity: true, backgroundAlpha: 0, preference: 'webgl' })`), sets `TextureStyle.defaultOptions.scaleMode = 'nearest'`, and destroys it on unmount.
- **Keep the canvas alive across tabs.** Tabs other than `castle` show panels over the map (GDD 36.2). If the current build unmounts `CastleGrid` when switching tabs, change the layout so the map stays mounted behind the panels and is only hidden (`visibility`) for the `reviewer` tab. This avoids re-creating the GPU context and re-baking sprites.
- **State in, nothing out.** `AcademyCanvas` receives `state` as a prop. On each new `state` object it calls `world.setSnapshot(state)`. The world never calls `setState`. Clicks come back out only through `onSelectRoom(room)` and two new optional callbacks, `onSelectCharacter?(id)` and `onSelectCreature?(id)`, which `App.tsx` maps to opening `RosterPanel` or the Menagerie view.
- **Inside Anki** the engine is Python (GDD 38.2) and the web UI receives snapshots through `AC.push` / `AC.reply`. The same `setSnapshot(state)` call is fed from that bridge, so the visual layer works the same in the browser build and in Anki.

## 13.3 Module structure

```
src/visual/
  AcademyCanvas.tsx            # React component: mounts Pixi, forwards props, toolbar
  VisualRoot.ts                # creates World, AssetStore, Choreographer; owns the ticker
  VisualSettings.ts            # visual settings type, defaults, localStorage helpers
  world/
    World.ts                   # setSnapshot(), layer containers, update loop
    Camera.ts                  # integer zoom, pan, fit, home, follow, saved view
    layers.ts                  # sky, shell, rooms, agents, roofs, front, overlay
    hitTest.ts                 # pointer → room / character / creature
  layout/
    gridToWorld.ts             # cell ↔ world maths (Section 3.1)
    groundsLayout.ts           # plot index ↔ side/position (Section 3.5) — shared with engine
    roomLayouts.ts             # per-room slot anchors and spots (Section 5.3)
    defaultLayout.ts           # generated layouts for rooms without a hand layout
    navGraph.ts                # graph from rooms + reachability (Section 7.7)
    pathfind.ts                # Dijkstra + route cache
  agents/
    Choreographer.ts           # owns agents, ticks the resolver, pools sprites
    AgentFSM.ts                # per-agent state machine (Section 7.3)
    activityRules.ts           # resolveActivity() (Section 7.2), pure
    schedule.ts                # lively / clock phases (Section 7.4)
    crowding.ts                # caps, "+N" badges (Section 7.8)
    CharacterAgent.ts  CreatureAgent.ts  WizardAgent.ts
  sprites/
    forge/                     # tier-0 pixel maps and generators (Section 12.2)
      pixelMaps.ts  generators/*.ts  palettes.ts  rasterize.ts
    paperDoll.ts               # layer selection + bake (Section 6.3)
    recolor.ts                 # index-grey ramp swap (Section 12.6)
    animations.ts              # animation table (rows, frames, fps)
  rooms/
    RoomView.ts                # skin + dressing + trim + furniture + decals
    buildStages.ts             # construction stage art (Section 5.6)
    furniturePlacement.ts      # slotKind → anchor
  creatures/
    CreatureBehaviour.ts       # pen wander, movement styles (Section 8.2)
  fx/
    particles.ts               # pooled particle bursts
    dayNight.ts                # clock phase → tint, lights (Section 4.1)
    sky.ts                     # gradient, stars, clouds, hills, sun/moon
    veil.ts                    # dome mesh + shimmer filter (Section 4.4)
    vignettes.ts               # hazard and misbehavior vignettes (Section 9.3)
  events/
    visualEvents.ts            # snapshot diff + notices → VisualEvent queue (Section 9)
  assets/
    manifest.ts  loader.ts  resolver.ts   # tiered lookup (Section 12.1)
  ui/skin/                     # DOM skin pieces used by panels
    Icon.tsx  NineSlice.tsx  Portrait.tsx  ChanceMeter.tsx  ManaToast.tsx  SchoolGlyph.tsx
  onboarding/
    WelcomePage.tsx  CharacterCreation.tsx  AcademyNaming.tsx  FoundingScene.ts
    TourOverlay.tsx  freshStart.ts         # createNewAcademy() (Section 10.3)
  dev/
    VisualSandbox.tsx          # dev-only page: spawn agents, scrub time, force Veil band
src/utils/
  reachability.ts              # computeReachability() — shared (Section 13.4)
  veilBand.ts                  # getVeilBand() if not already in formulas.ts
scripts/art/                   # offline pipeline (Section 12.5), not shipped
public/assets/                 # shipped art (Section 12.4)
```

## 13.4 Shared pure helpers (used by the engine and the visuals)

Two small helpers implement GDD rules that the engine needs anyway. They change no rule; they make sure the picture and the game agree.

| Helper | Implements | Engine use | Visual use |
|---|---|---|---|
| `computeReachability(rooms)` → `Map<roomId, { reachable, distance }>` | GDD 15.3 BFS (Entrance Hall root; same-floor wall-edge links; stacked Spiral Stairs; the Study's floors 0–1 stair; grounds via the Entrance Hall) | Pass `isReachable` into `calculateRoomEfficiency` (today it defaults to `true`); adjacency rules that use BFS distance | Doorways, Unreachable badge, Reachability lens, nav graph |
| `groundsLayout` (`plotSide(index)`, `unlockedPlotIndices(plotCount)`, `adjacentPlots(a, b)`) | GDD 15.2 grounds left and right of the castle and P7 adjacency | Placement bounds and multi-plot adjacency | Plot positions |

Both get unit tests with the GDD's own examples. In the Anki build, the Python `core/grid.py` is authoritative and `state_view.py` should include each room's `reachable` and `distance` in the snapshot, so the web side reads it instead of recomputing.

## 13.5 Data hooks: small, optional additions to state

All additions are **optional fields** with defaults, added by the save migration. None changes a rule.

| Addition | Type | Written by | Read by | Why |
|---|---|---|---|---|
| `wizard.appearance` | `{ bodyShape, skin, hairStyle, hairColor, robeColor, hat, staff }` | Character creation; Wizard screen appearance editor | Paper doll | GDD 7.2 appearance, currently missing from `WizardState` |
| `wizard.foundingSchool` | `SchoolType` | Creation | Tutorial Step 2, starting kit | Section 10.2 |
| `wizard.foundedAt` | ISO date string | Creation | Headmaster panel | GDD 7.2 "founding date" |
| `wizard.sigil` | sigil id string (existing field, new values) | Creation | Crest banner, hat mark | Map old emoji values on load |
| `notices[].data` | `{ roomId?, characterIds?, creatureId?, hazardId?, incidentId?, outcome? }` | Engine, when it writes a notice | `visualEvents.ts` | Place vignettes correctly (Section 9.1) |
| `presenceRoomId` | `number \| undefined`, per bell | Engine (Headmaster's Presence, GDD 29.3) | `WizardAgent` | VR-05: the +5% room must be the room the wizard is drawn in |
| `characters[].detentionUntilBell` | `number \| undefined` | Engine (GDD 20.4) | Activity resolver | Show detention honestly |
| `creatures[].looseRoomId` | `number \| undefined` | Engine, if it tracks where a Loose creature is | `CreatureAgent` | VR-05 where it matters; otherwise cosmetic wandering |
| `healingPlaceFor(character, state)` | pure helper | Engine (GDD 23.3 place factor) | Activity resolver | The bed the visuals show must be the one the place factor uses |
| `settings.visual` | `{ animate, visualSchedule, visualTime, showNames, theme, maxAgents, quality }` | Settings panel | Visual layer | Section 14.3 |

`presenceRoomId` must be chosen with the engine's seeded random at each bell (GDD 38.11), not by the visual layer. Until the engine provides it, the wizard stays in the Study and the Presence effect is whatever the engine already does.

## 13.6 The frame loop

- One Pixi ticker. Per frame: advance agent FSMs (positions, frames), particles and shaders; every 2 s (staggered) run the activity resolver; every 60 s update the clock phase.
- **Snapshot updates** (`setSnapshot`) are cheap: diff for visual events, update room views whose inputs changed (hash per room), schedule bakes for changed characters, rebuild the nav graph only if the room hash changed.
- **Veil shader**: a small Pixi `Filter` on the dome mesh using a tiling noise texture scrolled over time; the uniform `strength` comes from state; `reduceMotion` freezes time.
- **Fixed rates.** Animation clocks use real elapsed time only. Nothing in the loop reads review counts or rates (VR-03).

## 13.7 Fallbacks

| Situation | Behaviour |
|---|---|
| WebGL and WebGPU unavailable | Pixi's Canvas renderer (automatic). Filters (Veil shimmer, glows) are replaced by static sprites; everything else works |
| Pixi fails to initialise at all | `CastleGrid` renders a **static fallback**: one Canvas 2D drawing of rooms, furniture and a still sprite per character at their home spot, using forge textures drawn with `drawImage`. No animation. Click handling via a simple box hit test |
| An atlas fails to load | The resolver serves the forge version of every id in it; a single console warning; no user-facing error |
| Low frame rate (under 30 fps for 5 s) | Automatically halve particle counts, then lower the agent cap to 30, then stop ambient room loops. Shown in Settings as "Quality: auto-reduced" |


# 14. Performance, Accessibility and Settings

## 14.1 Performance targets and caps

| Item | Target |
|---|---|
| Frame rate while the map is visible and animating | 60 fps on a mid-range laptop at 1280 × 800; never below 30 fps |
| Frame rate when nothing is moving (everyone performing, no effects) | Drop to **30 fps** |
| Frame rate with a panel open over the map | 15 fps |
| Window hidden, minimised, or `document.hidden` | **Ticker stopped** (0 fps); resume on visibility |
| `reviewer` tab or Anki reviewer focused | Ticker stopped; the game never competes with reviewing |
| Window open to first paint (GDD 38.17) | ≤ 500 ms: draw forge art and the current snapshot first, then swap in atlases as they load |
| Visible character agents | ≤ **60** (excess shown by "+N", Section 7.8) |
| Visible creature agents | ≤ **40** |
| Particles alive at once | ≤ 200 across the map; ≤ 3 sparkle particles per Splendid room |
| Draw calls per frame | Target ≤ 40 (atlases keep batching high) |
| GPU memory | ≤ 128 MB (atlases ~30 MB + baked characters ~6 MB + render targets) |
| Bakes per frame | ≤ 4 (Section 6.3) |
| Nav graph rebuild | ≤ 5 ms for the largest castle (14 × 11 + 18 plots) |
| Activity resolver tick | ≤ 1 ms for 60 agents (staggered) |

## 14.2 Pooling and culling

- **Sprite pooling.** Agents, bubbles, badges and particles come from pools. When an agent is hidden (crowding, off-map), its sprite returns to the pool. Pools are pre-warmed for 60 characters, 40 creatures and 200 particles.
- **Culling.** Rooms and agents outside the camera rectangle plus one cell margin are not rendered (`renderable = false`), but agents keep their logical position so they are in the right place when the camera arrives.
- **Static caching.** A room's skin, dressing, trim and non-animated furniture are rendered once into a cached texture per room (`cacheAsTexture` in Pixi v8) and only re-rendered when the room's inputs change. Animated furniture sits on top as live sprites.

## 14.3 Visual settings

Added to Settings → Display & accessibility (GDD 36.3 item 11). Stored as `settings.visual` (Section 13.5).

| Setting | Values | Default |
|---|---|---|
| Animate the Academy | On / Off | On (Off = everyone at their home spot, still frames) |
| Reduce motion | Existing `settings.reduceMotion` | Off. When on, overrides everything below (VR-09) |
| Schedule style | Lively (10-minute loop) / Follow my clock | Lively |
| Time of day | Follow my clock / Always day / Always night | Follow my clock |
| Theme | Follow Anki / Light / Dark | Follow Anki |
| Show names on the map | On / Off | Off |
| Maximum people shown | 20 / 40 / 60 | 60 |
| Effects quality | Auto / Low / High | Auto |
| Celebrations | Full / Small / Off | Full (sizes per event, never per review count) |

## 14.4 Accessibility

- **Reduce motion (VR-09)**: no walking (instant moves), no idle loops (frame 0 only), no particles, no shimmer, no camera easing, no screen-space effects. The world is still fully informative through badges and bubbles.
- **Colour-blind safety (GDD 36.5)**: school glyphs with every school colour, patterns in lenses, distinct bubble shapes, tier bars beside tier colours.
- **Keyboard (GDD 36.5)**: the canvas container is focusable (`tabIndex=0`, `role="application"`, `aria-label="Academy map"`). Arrow keys pan; Shift+arrows move the selected room in grid order; Enter opens the Room panel; `C` cycles through characters in the selected room; Esc clears selection.
- **Screen readers.** The canvas has no readable content of its own, so a visually hidden **map summary** list sits next to it: one entry per room ("Greenhouse, floor 2, Cozy, efficiency 112%, 3 people, construction 60%") and per Loose creature. It updates (debounced 2 s) with an `aria-live="polite"` region for important visual events (a room finished, a student became a master).
- **Text scaling** affects all DOM text and the overlay labels (they are DOM or Pixi text built from the same scale), never pixel art.
- **Flashing.** No effect flashes more than 3 times per second; the Rift return flare and level-up bursts are single soft pulses.

# 15. Running Inside Anki

## 15.1 Packaging the web build

- **Vite config.** Set `base: './'` so every asset URL is relative, and output to `dist/`. The add-on's build script copies `dist/` into the add-on's `web/` folder (replacing GDD 38.3's `web/index.html app.js views/*.js styles.css sprites.svg fonts/` with the Vite output plus `web/assets/`).
- **Web exports.** In the add-on's `__init__.py`, allow the webview to load the files:

```python
from aqt import mw
mw.addonManager.setWebExports(__name__, r"web/.*")
```

  Files are then served by Anki's local media server under `/_addons/<add-on folder name>/web/...`. The game window loads `index.html` from that path, built from `mw.serverURL()` plus `_addons/<folder>/web/index.html`. Check both calls against the minimum supported Anki version (GDD 38.1: 2.1.66+) during implementation.
- **No network.** All art, fonts and scripts are bundled. No CDN fonts, no remote images, no analytics. The game must work offline.
- **Pixi in Qt WebEngine.** Qt6 builds of Anki ship a Chromium-based WebEngine with WebGL in normal conditions. Pixi's automatic fallback chain (WebGL → WebGPU where available → Canvas) and the static fallback (13.7) cover machines where GPU acceleration is disabled.
- **Night mode.** The Python side passes `theme_manager.night_mode` into the page at load (for example as a query parameter `?theme=dark`) and pushes changes through `AC.push`. The web side sets `data-theme` (Section 2.5).
- **Content Security.** Pixi v8 does not need `eval`. If the add-on sets a Content-Security-Policy, allow `blob:` for workers and `data:` for generated textures.

## 15.2 Size budget in the add-on

| Part | Budget |
|---|---|
| Python package (core, adapters, storage, ui, content JSON) | ≤ 2 MB |
| Web build (JS + CSS), minified and gzip-friendly | ≤ 2.5 MB (Pixi v8 core ~0.5 MB minified, React, app code, forge) |
| Assets (Section 12.7) | ≤ 8 MB target, 15 MB hard cap |
| **Whole `.ankiaddon`** | **≤ 20 MB** |

## 15.3 Bridge and the visual layer

- The web UI gets state from `AC.reply` / `AC.push` (GDD 38.16), throttled to ≤ 4 pushes per second. Each push calls `world.setSnapshot(state)`.
- The visual layer sends **no bridge commands** of its own. Clicks on the map open panels; panels send the existing intents (`build.place`, `furniture.place`, `creature.assign_tamer` and so on).
- **Only the game window renders the world.** The dock panel (GDD 36.1, optional) shows the portrait and numbers only, and the post-review toast is the Qt overlay the GDD describes, skinned to match (Section 11.5). Nothing in the reviewer webview changes (VR-07).
- **When the game window is closed** the visual layer does not exist. Opening it rebuilds everything from the snapshot (VR-02) within the first-paint budget.


# 16. Milestones V1–V6 and Acceptance Criteria

Each milestone ships a working app. Every milestone also has to pass the **standing checks** at the end of this section.

## V1 — "Walking around" slice

**Goal:** open the game and see your own wizard and your students walking around a real, side-on castle drawn from state.

Build: `pixi.js` v8; the V1 modules from Section 13.3 (canvas, world, camera, layout, nav graph, Choreographer with the `lively` schedule, forge-only resolver); forge room shells, stairs, roofs, plots and sky; the forge paper doll with `idle`, `walk`, `walk_front`, `climb`, `sit_study`, `eat` and `sleep`; `CastleGrid` wrapping `AcademyCanvas` with the same props; `computeReachability` with doorways and the Unreachable badge; zoom, pan, Fit and Home; class, work, meal, sleep and free-time activities; a minimal creation screen (name, title, pronouns, robe colour, hat, founding school) with `createNewAcademy()` (Section 10.4) and the "Choose your look" prompt for old saves; reduce-motion support.

Acceptance:

- [ ] A new player sees: the welcome text, a creation screen, then a castle with exactly the GDD 15.2 rooms, 0 mana, 0 Renown, all wizard levels 0, no creatures, no pending events and the GDD 25.1 stock.
- [ ] With the dev sandbox's "12 students + 3 faculty" scenario, agents visibly move between Dormitory, Classroom and Refectory using the Spiral Stair; nobody walks through a wall or into an unreachable room.
- [ ] Clicking any room opens the existing Room panel for that room.
- [ ] Removing the stair that links a floor makes that floor's rooms show Unreachable, and agents stop going there within one resolver tick.
- [ ] The state-immutability test (Section 17.1) passes.
- [ ] With reduce motion on, nothing moves on screen for 60 s while the Academy still updates when state changes.

## V2 — Rooms, furniture, tiers and construction

Build: Section 5 in full (dressings, tier skins, layouts for all 56 rooms, furniture at anchors, Unfinished ghosts, damage, level trims, cleanliness, locks, construction stages and progress ring), with forge art.

Acceptance:

- [ ] Every room id in `ROOM_DEFINITIONS` and every furniture id in `FURNITURE_DEFINITIONS` draws without an error or a missing texture (an automated test walks the catalog).
- [ ] Adding furniture that moves a room from Plain to Cozy changes the wall skin to Cozy, matching `calculateRoomQuality`.
- [ ] A site's stage art matches `buildProgress / buildRequired` at 0.1, 0.3, 0.5, 0.7, 0.9 and on completion.
- [ ] A paused site shows the tarp and its stage underneath when resumed; progress is unchanged.
- [ ] The "reviews to go" number matches the Build panel's number.

## V3 — Characters in full, portraits and character creation

Build: Section 6 in full (all layers and options, recolouring, animations, marks, pips, bubbles, portraits in the panels) and Section 10 in full (creation screen, Founding Day, tour, tutorial staging).

Acceptance:

- [ ] In a screenshot of a busy Academy, a tester can point out the wizard, a faculty member, a resident master and a student without hovering (checked with three people unfamiliar with the build).
- [ ] An injured character shows the right injury bubble and goes to the healing place `healingPlaceFor` returns.
- [ ] Every GDD 7.2 appearance option can be chosen and is visible in the preview and on the map.
- [ ] A save from the old hard-coded start loads without losing progress and asks only for appearance.

## V4 — Creatures and grounds

Build: Section 8 in full and the grounds parts of Section 3.5 (plot dressings, crop stages, front path, Rift Gate states).

Acceptance:

- [ ] Each creature status (`egg`, `wary`, `tamed`, `loose`, `away`) is drawn as specified, and a creature is never drawn somewhere its status says it is not.
- [ ] Taming ring fraction equals `tamingProgress / requirement` for the creature's rarity.
- [ ] A Loose creature never leaves the world and goes home when its status changes.
- [ ] Six Meadow, Tide, Sky, Gloom, Ember and Crystal creatures in one Academy move visibly differently.

## V5 — Atmosphere and events

Build: Section 4 (day/night, sky, Veil) and Section 9 (visual events, all vignettes), plus the `notices[].data`, `presenceRoomId` and detention hooks.

Acceptance:

- [ ] Setting the system clock to 13:00, 18:30 and 23:00 gives day, dusk and night looks; "Always day" overrides.
- [ ] Forcing `veil.strength` to 90, 60, 35 and 10 gives Strong, Thinning, Thin and Torn domes; reopening after an away gap shows the same band as before.
- [ ] Every hazard id and incident id in the GDD has a vignette that plays only after its notice or state change.
- [ ] Reviewing 50 cards quickly with the window open plays at most one meal window per 5 minutes and no per-review effects in the world.

## V6 — UI skin, final art, performance and Anki packaging

Build: Section 11 (UI skin), tier-1 and tier-2 art through the pipeline with `art:check` (Section 12), Section 14 performance and accessibility work, the static fallback, and Section 15 packaging.

Acceptance:

- [ ] Performance targets in Section 14.1 met with 60 characters, 40 creatures and the largest castle.
- [ ] With all PNG atlases deleted, the game still runs with forge art (VR-08).
- [ ] With WebGL disabled, the game runs (Canvas renderer or static fallback).
- [ ] The packaged add-on loads the game window offline in Anki, follows night mode, and is within the size budget.
- [ ] `art:check` passes: every content id has art or a forge fallback with correct frame counts.

## Standing checks (every milestone)

- [ ] No engine rule, constant or formula changed (diff review of `engine.ts`, `formulas.ts`, `content.ts` limited to the hooks in Section 13.4–13.5).
- [ ] The visual layer never writes state (Section 17.1).
- [ ] No visual depends on review count or speed (Section 17.2).
- [ ] `settings.reduceMotion` disables motion everywhere.
- [ ] `FlashcardReviewer` and the reviewer flow behave exactly as before.

# 17. Testing the Visual Layer

## 17.1 Read-only guarantee

- **Deep-freeze test.** In tests, `Object.freeze` the snapshot deeply before passing it to `World.setSnapshot` and run 10,000 simulated frames plus resolver ticks. Any write throws.
- **Equality test.** Run the engine on a fixed review script twice: once with the visual layer attached and receiving every snapshot, once without. The final `FullGameState` must be deep-equal.
- **Import rule.** A lint rule (or a simple test that scans imports) fails if anything under `src/visual/` (except `onboarding/freshStart.ts`) imports `engine.ts` or calls `setState`.

## 17.2 No reward for review count or speed

- Feed the visual layer the same sequence of state changes at two speeds (1 review per 10 s and 1 review per 0.5 s). Record emitted visual events and particle counts. Celebrations per event must be identical; meal windows must respect the 5-minute debounce; no event type may exist for "review".
- A test asserts the animation table has no rate that is a function of anything except constants.

## 17.3 Geometry and navigation

- `gridToWorld` round-trips for all cells of the 8 × 5 and 14 × 11 grids.
- `computeReachability` matches hand-worked cases: the GDD 15.2 start (all reachable), a floor-1 room with no stair (unreachable), stacked stairs to floor 4, the Study's internal stair, a 2-plot room on each side.
- The nav graph's reachable set equals `computeReachability`'s reachable set for 500 random valid layouts.
- Every route ends at a spot inside the destination room's box on a floor line.
- `groundsLayout`: unlocked plots for 6, 10, 14, 16 and 18 plots; 8 and 9 are not adjacent.

## 17.4 Rendering and assets

A catalog walk draws every room, furniture item, creature and character option with forge art only and again with atlases, with no missing-texture warnings. The dev sandbox renders fixed scenes (the start Academy at noon, a busy Academy at night, a Torn Veil, a site at 50%) to PNG in a headless browser for comparison with approved references. The three fallbacks are tested: atlases removed, `preference: 'canvas'`, and Pixi init forced to fail.

## 17.5 Onboarding

- `createNewAcademy()` output checked field by field against Section 10.4.
- An old save without `wizard.appearance` loads with all progress intact and triggers "Choose your look".
- Grounds migration maps `x: 0` and `x: 1` to `8` and `9` once, and is idempotent.

## 17.6 Performance

- A scripted benchmark in the dev sandbox spawns 60 characters and 40 creatures in a 14 × 11 castle and logs fps, draw calls and frame time for 60 s at 1280 × 800.


# 18. Decisions for the Owner to Confirm

These are choices this addendum made where the GDD was silent or where the visuals needed a precise answer. Each one is safe to build as written; confirm or change before the milestone listed.

| ID | Decision | Default in this addendum | Alternatives | Needed by |
|---|---|---|---|---|
| **D-01** | **Founding school** at character creation | Added. It only pre-selects the first orb in the tutorial, picks the school of the starting T1 grimoire (GDD 29.1) and sets the default robe colour. No level, mana or bonus | Drop it and keep the GDD's "Nature is suggested" in Step 2 | V1 |
| **D-02** | **Art style and grid** | Cozy storybook pixel art; grid cell 64 × 48 art px; integer zoom 1×–4×, default 2× | Higher-resolution painted art (bigger downloads, harder to generate consistently); 48 × 48 cells | V1 |
| **D-03** | **Rendering** | PixiJS v8 canvas world under the React UI | DOM/SVG per GDD 37.2 (simpler, will not scale to a lively castle) | V1 |
| **D-04** | **Grounds plot layout** | 18 fixed positions, 9 per side; unlocked outward from the castle; 2-plot rooms on one side only; old `x: 0`/`1` map to `8`/`9` | All plots on one side; or alternate sides by index | V1 |
| **D-05** | **Schedule style default** | "Lively" 10-minute loop (something to see whenever the window opens) | "Follow my clock" as default (more realistic, mostly asleep at night) | V1 |
| **D-06** | **Time of day** | Real local clock, fixed hour bands (no sunrise/sunset by location) | Sunrise/sunset by a latitude the user sets | V5 |
| **D-07** | **World art in dark mode** | World art identical in both themes; only UI changes | Slightly darker world in dark mode | V5 |
| **D-08** | **Wizard's on-map position** | The engine provides `presenceRoomId` each bell (Headmaster's Presence has a real +5% effect); until then the wizard stays in the Study | Make Headmaster's Presence purely cosmetic in the GDD so the visuals can choose (a rules change; not recommended) | V5 |
| **D-09** | **Meal window debounce** | At most one meal scene per 5 real minutes, whatever the meal bells | Show every meal bell (would make the castle busier when reviewing faster, against BR-03's spirit) | V1 |
| **D-10** | **Fonts** | Pixelify Sans (display) and Atkinson Hyperlegible Next (body), both SIL OFL 1.1, bundled | Another OFL storybook serif for display | V6 |
| **D-11** | **Art sources** | Forge (code-drawn) always; Kenney CC0 packs for props, crops and icons; AI-generated art post-processed into the palette for rooms, characters and creatures | Commission an artist for tier 2 (best quality and consistency; costs money) | V6 |
| **D-12** | **Asset budget** | ≤ 8 MB target, 15 MB hard cap; whole add-on ≤ 20 MB | Larger budget for higher-detail art | V6 |
| **D-13** | **Shared helpers in the engine** | `computeReachability` and `groundsLayout` added and used by the engine (implements GDD 15.3 and P7; today the build treats every room as reachable) | Visual-only reachability (risks the picture and the rules disagreeing) | V1 |
| **D-14** | **Old saves** | Never reset; ask for appearance only; offer "Found a new Academy" in Settings | Force a new Academy for everyone on the visual-overhaul update | V1 |
| **D-15** | **Celebration size** | Sized by event type only; setting Full / Small / Off | — | V5 |


# Appendix A — Visual Catalogs

These tables cover every room, furniture item and creature in the GDD catalogs (Sections 16, 17 and 22), using the GDD's content ids. File paths are relative to `public/assets/` in the web build and to `web/assets/` in the add-on (Section 12.4). Sizes are in **art pixels** (1 grid cell = 64 × 48 art px; Section 2.3).

## A.1 Rooms (56)

Each room has one **dressing** image (transparent PNG drawn on top of the shared tier wall skin, Section 5.2). Size = room cells × (64 × 48) art px. A grounds plot is one cell (64 × 48 art px) plus up to 48 px of sky overhang for trees, arches and towers, so plot images are 64 × 96 per plot with the ground line 48 px from the top.

File for every room: `rooms/{id}.png` (optional `_l2`, `_l3` variants).

| ID | Room | Size (cells) | Art px | Look | Ambient animation (cosmetic) |
|---|---|---|---|---|---|
| `entrance_hall` | Entrance Hall | 2×1 | 128×48 | Vaulted stone hall, grand double doors at the left/right outer wall, crest banner with the player's sigil | Door swings open as agents enter; sigil banner sways |
| `wizard_study` | Wizard's Study | 1×2 | 64×96 | Tall two-floor tower room, internal spiral stair on one side, bookshelves, orb stand by a round window | The active orb glows in its school colour and pulses with session progress |
| `spiral_stair` | Spiral Stair | 1×1 | 64×48 | Narrow stone stair column with a visible helix of steps and a slit window | Agents climb in back view; torch flickers |
| `corridor` | Corridor | 1×1 | 64×48 | Short flagstone passage with a wall sconce and arched ceiling | Sconce flicker |
| `support_pillar` | Support Pillar | 1×1, structural | 64×48 | Solid masonry pier with a carved capital; no interior | None (static) |
| `storage_vault` | Storage Vault | 1×1 | 64×48 | Barrel-vaulted cellar with crates, sacks and a ledger desk; stock piles grow with resources | Crate pile height steps with storage fill (0/25/50/75/100%) |
| `dormitory` | Dormitory | 2×1 | 128×48 | Bunk alcoves, small round windows, trunks at bed feet | Blankets rise and fall on sleepers; night-lamp glow |
| `grand_dormitory` | Grand Dormitory | 3×1 | 192×48 | Long dorm with a central stove and canopy curtains between beds | Stove ember glow |
| `faculty_quarters` | Faculty Quarters | 2×1 | 128×48 | Two private nooks with a shared hearth and a bookcase partition | Hearth flicker |
| `faculty_lounge` | Faculty Lounge | 2×1 | 128×48 | Armchairs, tea table, framed portraits, tall window | Steam from teapot |
| `refectory` | Refectory | 3×1 | 192×48 | Long trestle tables, serving hatch to the kitchen side, hanging lanterns | Food steam at mealtimes; plates appear on tables only during meals |
| `kitchen` | Kitchen | 1×1 | 64×48 | Range, hanging pots, herb bundles, chopping block | Pot steam; range fire |
| `common_room` | Common Room | 2×1 | 128×48 | Rug, couch, fireplace, game table, notice board | Fire flicker; board notes flutter |
| `bathhouse` | Bathhouse | 2×1 | 128×48 | Tiled tubs, steam, towel racks, green tiles | Rising steam particles |
| `class_arcane` | Glyph Classroom | 2×1 | 128×48 | Violet glyph-chalkboard, star charts, rows of desks | Glyphs on the board slowly re-draw during lessons |
| `class_nature` | Grove Classroom | 2×1 | 128×48 | Living wall of vines, potted seedlings on desks, leafy window | Leaves sway; seedlings bob |
| `class_light` | Dawn Classroom | 2×1 | 128×48 | Gold-trimmed room with a sun window casting a light shaft | Light shaft dust motes |
| `class_shadow` | Hush Classroom | 2×1 | 128×48 | Indigo room with heavy drapes, rune candles, a quiet bell | Candle flames lean as agents pass |
| `class_alchemy` | Bench Classroom | 2×1 | 128×48 | Workbenches with small cauldrons and copper pipes | Bubbling cauldrons, puffs of coloured smoke |
| `hall_arcane` | Hall of Stars | 3×1 | 192×48 | Domed hall with a floating star map over tiered seats | Rotating star map |
| `hall_nature` | Grove Hall | 3×1 | 192×48 | Hall with a living tree trunk growing through the floor, moss seats | Falling leaves |
| `hall_light` | Dawn Hall | 3×1 | 192×48 | Bright hall with stained glass and a golden lectern | Coloured light patches drift |
| `hall_shadow` | Hall of Whispers | 3×1 | 192×48 | Hall of whisper-niches and hanging silver bells | Faint bell sway; shadow wisps in corners |
| `hall_alchemy` | Crucible Hall | 3×1 | 192×48 | Hall around a big brass crucible with gauges | Crucible glow and gauge needle wobble |
| `library` | Library | 2×1 | 128×48 | Floor-to-ceiling shelves, rolling ladder, reading desk, globe | Pages turn; ladder slides when a scholar works |
| `observatory` | Observatory | 1×2, needs sky | 64×96 | Two-floor dome with an opening roof and a great telescope | Roof slit opens at night; telescope slowly swivels |
| `scriptorium` | Scriptorium | 2×1 | 128×48 | Scribe desks with candles, hanging scrolls | Quill bob; candle flicker |
| `greenhouse` | Greenhouse | 2×1, needs sky | 128×48 | Glass roof and walls, planter beds, watering cans; crop sprites per bed | Crops show 4 growth stages by bell progress; misting sparkles |
| `meadow_paddock` | Meadow Paddock | 2 plots | 128×96 | Fenced grassy pen with a shelter and trough on the grounds | Grass sway; creatures graze |
| `tide_tank` | Tide Tank | 2×1, floor 0 | 128×48 | Floor-0 room with a big glass tank, bubbles and kelp | Bubbles; kelp sway; water caustics |
| `menagerie` | Menagerie | 3×2 | 192×96 | Large 3×2 hall split into habitat modules, walkways and a keeper's desk | Module-specific ambience (grass, water, glow, embers) |
| `infirmary` | Infirmary | 2×1 | 128×48 | White beds with curtains, remedy cabinet, a basin | Curtain flutter; healer glow on treated beds |
| `aviary` | Aviary | 1×2, needs sky | 64×96 | Two-floor cage of wooden perches open to the sky | Birds hop between perches |
| `sunlit_sanctum` | Sunlit Sanctum | 2×1 | 128×48 | Sun altar under a round skylight, cushions | Sunbeam pulse |
| `warding_chamber` | Warding Chamber | 1×1 | 64×48 | Circle of runes on the floor, lantern posts | Rune ring rotates slowly; ward radius ring on the Hazards lens |
| `gloom_hutch` | Gloom Hutch | 1×1 | 64×48 | Dark burrow room with moss and glowing mushrooms | Mushroom glow pulses |
| `detention_hall` | Detention Hall | 1×1 | 64×48 | Plain benches, a stern clock, lines-writing slates | Clock pendulum; chalk scratches when occupied |
| `alchemy_lab` | Alchemy Lab | 2×1 | 128×48 | Cauldrons, shelves of coloured bottles, fume hood | Bubbles per active brew; colour = potion tier |
| `ember_pit` | Ember Pit | 1×1, floors 0–1 | 64×48 | Floor-0/1 pit of warm coals with a brazier nest | Ember particles; heat shimmer |
| `workshop` | Workshop | 2×1 | 128×48 | Workbench, tool wall, sawdust, a half-built crate | Hammer sparks when a builder works |
| `glassworks` | Glassworks | 1×1 | 64×48 | Small furnace and glowing glass gobs on pipes | Furnace glow |
| `weaving_room` | Weaving Room | 1×1 | 64×48 | Loom, yarn baskets, drying cloth | Shuttle moves when producing |
| `crystal_vivarium` | Crystal Vivarium | 1×1 | 64×48 | Glass case with geode beds and violet light | Crystal twinkle |
| `rift_gate` | Rift Gate | 2 plots | 128×96 | Stone arch on two grounds plots with a swirling portal | Portal swirl speed and colour by destination of the active expedition; idle shimmer when none |
| `training_yard` | Training Yard | 2 plots | 128×96 | Practice dummies, weapon rack, sand ring | Dummies wobble when struck |
| `trophy_hall` | Trophy Hall | 2×1 | 128×48 | Plinths with spotlights and a red carpet | Displayed artifacts glint |
| `vegetable_patch` | Vegetable Patch | 1 plot | 64×96 | Tilled rows with cabbages and a small fence | Crop growth stages |
| `herb_garden` | Herb Garden | 1 plot | 64×96 | Raised herb beds with labels | Herbs sway |
| `woodlot` | Woodlot | 1 plot | 64×96 | A stand of trees and a chopping stump | Leaves rustle; log pile grows with Timber production |
| `quarry` | Quarry | 1 plot | 64×96 | Cut rock face with a crane and stone blocks | Occasional dust puff |
| `pond` | Pond | 2 plots | 128×96 | Two-plot pond with reeds and a little jetty | Ripples; fish jump |
| `orchard` | Orchard | 2 plots | 128×96 | Fruit trees in a row with a ladder | Fruit appears and is picked |
| `apiary` | Apiary | 1 plot | 64×96 | Beehive boxes among flowers | Bees orbit |
| `courtyard_garden` | Courtyard Garden | 1 plot | 64×96 | Hedges, a bench and a small fountain | Fountain spray |
| `standing_stones` | Standing Stones | 1 plot | 64×96 | Ring of tall runestones | Runes glow faintly at night |
| `moonwell` | Moonwell | 1 plot | 64×96 | Stone well that reflects the moon | Silver shimmer, stronger at night |

## A.2 Furniture (114 entries)

Two-slot items are marked **(2)** in GDD Section 17 and use a 32 px wide sprite. Anchors: **floor** = bottom-centre on the room's floor line; **wall** = centre 26 px above the floor line; **ceiling** = top-centre at the ceiling line. Animated items have 4 frames at 4–6 fps in one horizontal strip; damaged items use the `_damaged` frame (one extra frame at the end of the strip, Section 5.5). The `grand_focus` entry has 5 school variants and `habitat_module` has 6 habitat variants, so they appear as 5 and 6 strips.

File for every item: `furniture/{id}.png`, except `grand_focus_{school}` (5 files) and `habitat_module_{habitat}` (6 files).

| ID | Item | Slots | Sprite (art px) | Anchor | Frames |
|---|---|---|---|---|---|
| `potted_fern` | Potted Fern | 1 | 16×16 | floor | 1 + damaged |
| `candle_sconce` | Candle Sconce | 1 | 16×16 | wall | 4 + damaged |
| `woven_rug` | Woven Rug | 1 | 16×16 | floor | 1 + damaged |
| `tapestry` | Tapestry | 1 | 16×16 | wall | 1 + damaged |
| `bookshelf` | Bookshelf | 1 | 16×24 | floor | 1 + damaged |
| `academy_banner` | Academy Banner | 1 | 16×16 | wall | 1 + damaged |
| `grandfather_clock` | Grandfather Clock | 1 | 16×24 | floor | 4 + damaged |
| `founders_portrait` | Portrait of the Founder | 1 | 16×16 | wall | 1 + damaged |
| `glow_lantern` | Glow Lantern | 1 | 16×16 | ceiling | 4 + damaged |
| `window_box` | Window Box of Herbs | 1 | 16×16 | wall | 1 + damaged |
| `fish_bowl` | Fish Bowl | 1 | 16×16 | floor | 4 + damaged |
| `hush_chimes` | Wind Chimes of Hush | 1 | 16×16 | ceiling | 4 + damaged |
| `radiant_lamp` | Radiant Lamp | 1 | 16×16 | floor | 4 + damaged |
| `enchanted_broom` | Enchanted Broom | 1 | 16×16 | floor | 4 + damaged |
| `familiar_statue` | Statue of a Familiar | 1 | 16×24 | floor | 1 + damaged |
| `floating_candles` | Floating Candles | 1 | 16×16 | ceiling | 4 + damaged |
| `simple_cot` | Simple Cot | 1 | 16×16 | floor | 1 + damaged |
| `feather_bed` | Feather Bed | 1 | 32×16 | floor | 1 + damaged |
| `faculty_bed` | Faculty Bed | 1 | 32×16 | floor | 1 + damaged |
| `canopy_bed` | Canopy Bed | 1 | 32×16 | floor | 1 + damaged |
| `dreamcatcher_bed` | Dreamcatcher Bed | 1 | 32×16 | floor | 1 + damaged |
| `mossbed` | Mossbed | 1 | 32×16 | floor | 1 + damaged |
| `wardrobe` | Wardrobe | 1 | 16×24 | floor | 1 + damaged |
| `footlocker` | Footlocker | 1 | 16×16 | floor | 1 + damaged |
| `moon_curtains` | Moon-Shroud Curtains | 1 | 16×16 | wall | 4 + damaged |
| `writing_desk` | Writing Desk | 1 | 16×16 | floor | 1 + damaged |
| `armchair` | Armchair | 1 | 16×16 | floor | 1 + damaged |
| `couch` | Couch | 1 | 32×16 | floor | 1 + damaged |
| `hammock` | Hammock | 1 | 16×16 | floor | 1 + damaged |
| `tea_service` | Tea Service | 1 | 16×16 | floor | 4 + damaged |
| `wizard_chess` | Wizard's Chess Table | 1 | 16×16 | floor | 1 + damaged |
| `music_box` | Music Box of Calm | 1 | 16×16 | floor | 4 + damaged |
| `hex_darts` | Dartboard of Harmless Hexes | 1 | 16×16 | floor | 1 + damaged |
| `warm_hearthstone` | Warm Hearthstone | 1 | 16×16 | floor | 4 + damaged |
| `long_table` | Long Table | 1 | 32×16 | floor | 1 + damaged |
| `hearth` | Hearth | 1 | 16×24 | floor | 4 + damaged |
| `cooking_range` | Cooking Range | 1 | 16×24 | floor | 4 + damaged |
| `spice_rack` | Spice Rack | 1 | 16×16 | wall | 1 + damaged |
| `frostbox` | Frostbox | 1 | 16×24 | floor | 1 + damaged |
| `stewpot` | Bottomless Stewpot | 1 | 16×16 | floor | 4 + damaged |
| `banquet_bell` | Banquet Bell | 1 | 16×16 | floor | 1 + damaged |
| `teachers_lectern` | Teacher's Lectern | 1 | 16×24 | floor | 1 + damaged |
| `orrery_globe` | Orrery Globe | 1 | 16×24 | floor | 4 + damaged |
| `potting_bench` | Potting Bench | 1 | 16×16 | floor | 1 + damaged |
| `sun_altar` | Sun Altar | 1 | 16×24 | floor | 1 + damaged |
| `veiled_mirror` | Veiled Mirror | 1 | 16×24 | floor | 1 + damaged |
| `bench_cauldron` | Bench Cauldron | 1 | 16×16 | floor | 4 + damaged |
| `student_desks` | Student Desks (set) | 1 | 32×16 | floor | 1 + damaged |
| `chalkboard` | Chalkboard | 1 | 16×16 | wall | 1 + damaged |
| `star_chart` | Star Chart | 1 | 16×16 | wall | 1 + damaged |
| `specimen_jars` | Specimen Jars | 1 | 16×16 | wall | 1 + damaged |
| `master_lectern` | Master Lectern | 1 | 16×24 | floor | 1 + damaged |
| `grand_focus` | Grand focus (Star Orrery / Living Tree / Dawn Organ / Obsidian Mirror / Great Athanor) | 2 | 32×32 | floor | 4 + damaged |
| `inspiring_quote` | Framed Inspiring Quote | 1 | 16×16 | wall | 1 + damaged |
| `reading_desk` | Reading Desk | 1 | 16×16 | floor | 1 + damaged |
| `rolling_ladder` | Rolling Ladder | 1 | 16×24 | floor | 1 + damaged |
| `great_telescope` | Great Telescope | 2 | 32×32 | floor | 4 + damaged |
| `scribes_desk` | Scribe's Desk | 1 | 16×16 | floor | 1 + damaged |
| `globe_elsewhere` | Globe of Elsewhere | 1 | 16×16 | floor | 1 + damaged |
| `silent_quill` | Self-Writing Quill | 1 | 16×16 | floor | 4 + damaged |
| `map_table` | Expedition Map Table | 2 | 32×16 | floor | 1 + damaged |
| `planter_bed` | Planter Bed | 1 | 32×16 | floor | 1 + damaged |
| `rain_cistern` | Rain Cistern | 1 | 16×16 | floor | 4 + damaged |
| `compost_bin` | Compost Bin | 1 | 16×16 | floor | 1 + damaged |
| `glowcap_lamp` | Glowcap Grow-Lamp | 1 | 16×16 | ceiling | 4 + damaged |
| `feeding_trough` | Feeding Trough | 1 | 32×16 | floor | 1 + damaged |
| `glass_tank` | Glass Tank | 2 | 32×32 | floor | 4 + damaged |
| `perch_tree` | Perch Tree | 1 | 16×24 | floor | 1 + damaged |
| `lightless_burrow` | Lightless Burrow | 1 | 16×16 | floor | 1 + damaged |
| `brazier_nest` | Brazier Nest | 1 | 16×16 | floor | 4 + damaged |
| `geode_bed` | Geode Bed | 1 | 32×16 | floor | 1 + damaged |
| `habitat_module` | Habitat Module (choose: Meadow, Tide, Sky, Gloom, Ember, Crystal) | 2 | 32×16 | floor | 4 + damaged |
| `creature_toybox` | Creature Toybox | 1 | 16×16 | floor | 1 + damaged |
| `treat_dispenser` | Treat Dispenser | 1 | 16×16 | floor | 4 + damaged |
| `warm_rock` | Sunning Rock | 1 | 16×16 | floor | 1 + damaged |
| `infirmary_cot` | Infirmary Cot | 1 | 32×16 | floor | 1 + damaged |
| `remedy_cabinet` | Remedy Cabinet | 1 | 16×24 | floor | 1 + damaged |
| `healing_basin` | Healing Spring Basin | 2 | 32×16 | floor | 4 + damaged |
| `sun_window` | Sun Window | 1 | 16×16 | wall | 4 + damaged |
| `meditation_cushions` | Meditation Cushions | 1 | 16×16 | floor | 1 + damaged |
| `soaking_tub` | Soaking Tub | 2 | 32×16 | floor | 4 + damaged |
| `halo_candles` | Halo Candles | 1 | 16×16 | ceiling | 4 + damaged |
| `ward_circle` | Ward Circle | 1 | 16×16 | floor | 4 + damaged |
| `ward_lantern` | Ward Lantern | 1 | 16×16 | floor | 4 + damaged |
| `penitent_benches` | Penitent Benches | 1 | 32×16 | floor | 1 + damaged |
| `silence_bell` | Silence Bell | 1 | 16×16 | ceiling | 4 + damaged |
| `shadow_ledger` | Shadow Ledger | 1 | 16×16 | wall | 1 + damaged |
| `nightglass` | Nightglass Pane | 1 | 16×16 | floor | 4 + damaged |
| `brewing_cauldron` | Brewing Cauldron | 1 | 16×24 | floor | 4 + damaged |
| `ingredient_rack` | Ingredient Rack | 1 | 16×24 | floor | 1 + damaged |
| `fume_hood` | Fume Hood | 1 | 16×24 | floor | 4 + damaged |
| `alembic_array` | Alembic Array | 2 | 32×32 | floor | 4 + damaged |
| `workbench` | Workbench | 1 | 32×16 | floor | 1 + damaged |
| `tool_wall` | Tool Wall | 1 | 16×24 | floor | 1 + damaged |
| `kiln` | Kiln | 1 | 16×24 | floor | 4 + damaged |
| `loom` | Loom | 1 | 16×24 | floor | 4 + damaged |
| `shelving` | Shelving | 1 | 16×24 | floor | 1 + damaged |
| `practice_dummies` | Practice Dummies | 1 | 16×24 | floor | 1 + damaged |
| `supply_chest` | Supply Chest | 1 | 16×16 | floor | 1 + damaged |
| `artifact_plinth` | Artifact Plinth | 1 | 16×24 | floor | 1 + damaged |
| `garden_gnome` | Enchanted Gnome | 1 | 16×16 | floor | 1 + damaged |
| `bird_bath` | Bird Bath | 1 | 16×24 | floor | 1 + damaged |
| `scarecrow` | Hexed Scarecrow | 1 | 16×24 | floor | 1 + damaged |
| `stone_lantern` | Stone Lantern | 1 | 16×24 | floor | 1 + damaged |
| `beehive_box` | Beehive Box | 1 | 16×24 | floor | 4 + damaged |
| `windmill_charm` | Windmill Charm | 1 | 16×24 | floor | 4 + damaged |
| `fairy_ring` | Fairy Ring | 1 | 16×16 | floor | 4 + damaged |
| `rune_marker` | Rune Marker | 1 | 16×16 | floor | 4 + damaged |
| `starfall_chandelier` | Starfall Chandelier | 1 | 16×16 | ceiling | 4 + damaged |
| `heartwood_bench` | Living Heartwood Bench | 2 | 32×16 | floor | 1 + damaged |
| `choir_bells` | Choir of Bells | 1 | 16×16 | ceiling | 4 + damaged |
| `veilweaver_loom` | Veilweaver Loom | 2 | 32×32 | floor | 4 + damaged |
| `everburning_athanor` | Everburning Athanor | 2 | 32×32 | floor | 4 + damaged |
| `phoenix_hearth` | Phoenix Hearth | 1 | 16×24 | floor | 4 + damaged |

## A.3 Creatures (40)

Sheets are 5 rows (idle, move, eat, sleep, trouble), facing right (flip for left). Frame counts per row: idle 4, move 6 (walk, hop, swim or fly by habitat), eat 2, sleep 2, trouble 4. Legendary creatures add a 6th row, `aura` (4 frames, additive blend). Eggs use the shared egg sheets (Section 8.4).

File for every creature: `creatures/{id}.png`.

| # | ID | Creature | School | Rarity | Habitat | Frame (art px) | Idle behaviour |
|---|---|---|---|---|---|---|---|
| 1 | `mossback_tortoise` | Mossback Tortoise | Nature | Common | Meadow | 16×16 | Grazes, wanders the pen floor, naps in the shelter |
| 2 | `thistle_hare` | Thistle Hare | Nature | Common | Meadow | 16×16 | Grazes, wanders the pen floor, naps in the shelter |
| 3 | `bramblefox` | Bramblefox | Nature | Uncommon | Meadow | 16×16 | Grazes, wanders the pen floor, naps in the shelter |
| 4 | `moonsheep` | Moonsheep | Nature | Uncommon | Meadow | 16×16 | Grazes, wanders the pen floor, naps in the shelter |
| 5 | `puddlewyrm` | Puddlewyrm | Nature | Uncommon | Tide | 16×16 | Swims loops in the tank, surfaces to blow bubbles |
| 6 | `glimmerhorn_stag` | Glimmerhorn Stag | Nature | Rare | Meadow | 24×24 | Grazes, wanders the pen floor, naps in the shelter |
| 7 | `coral_kelpie` | Coral Kelpie | Nature | Rare | Tide | 24×24 | Swims loops in the tank, surfaces to blow bubbles |
| 8 | `verdant_drake` | Verdant Drake | Nature | Epic | Meadow | 32×32 | Grazes, wanders the pen floor, naps in the shelter |
| 9 | `elder_treant_sprout` | Elder Treant Sprout | Nature | Legendary | Meadow | 32×32 | Grazes, wanders the pen floor, naps in the shelter |
| 10 | `inkling_wisp` | Inkling Wisp | Arcane | Common | Crystal | 16×16 | Hovers near geodes, twinkles, slowly orbits |
| 11 | `orrery_moth` | Orrery Moth | Arcane | Common | Sky | 16×16 | Hops between perches, short flights in the open sky above the pen |
| 12 | `glyph_cat` | Glyph Cat | Arcane | Uncommon | Crystal | 16×16 | Hovers near geodes, twinkles, slowly orbits |
| 13 | `prism_beetle` | Prism Beetle | Arcane | Uncommon | Crystal | 16×16 | Hovers near geodes, twinkles, slowly orbits |
| 14 | `star_heron` | Star Heron | Arcane | Rare | Sky | 24×24 | Hops between perches, short flights in the open sky above the pen |
| 15 | `phase_ferret` | Phase Ferret | Arcane | Rare | Crystal | 24×24 | Hovers near geodes, twinkles, slowly orbits |
| 16 | `aether_serpent` | Aether Serpent | Arcane | Epic | Crystal | 32×32 | Hovers near geodes, twinkles, slowly orbits |
| 17 | `chronoflare_owl` | Chronoflare Owl | Arcane | Legendary | Sky | 32×32 | Hops between perches, short flights in the open sky above the pen |
| 18 | `lantern_moth` | Lantern Moth | Light | Common | Sky | 16×16 | Hops between perches, short flights in the open sky above the pen |
| 19 | `dawn_finch` | Dawn Finch | Light | Common | Sky | 16×16 | Hops between perches, short flights in the open sky above the pen |
| 20 | `halo_lamb` | Halo Lamb | Light | Uncommon | Meadow | 16×16 | Grazes, wanders the pen floor, naps in the shelter |
| 21 | `gilded_pangolin` | Gilded Pangolin | Light | Uncommon | Ember | 16×16 | Basks on coals, flickers, curls up in the brazier nest |
| 22 | `dawnhart_gryphon` | Dawnhart Gryphon | Light | Rare | Sky | 24×24 | Hops between perches, short flights in the open sky above the pen |
| 23 | `sunlit_unicorn` | Sunlit Unicorn | Light | Epic | Meadow | 32×32 | Grazes, wanders the pen floor, naps in the shelter |
| 24 | `ember_phoenix` | Ember Phoenix | Light | Legendary | Ember or Sky | 32×32 | Basks on coals, flickers, curls up in the brazier nest |
| 25 | `duskmouse` | Duskmouse | Shadow | Common | Gloom | 16×16 | Lurks in shadow with glowing eyes, darts between burrows |
| 26 | `hush_raven` | Hush Raven | Shadow | Common | Gloom or Sky | 16×16 | Lurks in shadow with glowing eyes, darts between burrows |
| 27 | `velvet_bat_swarm` | Velvet Bat Swarm | Shadow | Uncommon | Gloom | 16×16 | Lurks in shadow with glowing eyes, darts between burrows |
| 28 | `shade_hound` | Shade Hound | Shadow | Uncommon | Gloom | 16×16 | Lurks in shadow with glowing eyes, darts between burrows |
| 29 | `night_lynx` | Night Lynx | Shadow | Rare | Gloom | 24×24 | Lurks in shadow with glowing eyes, darts between burrows |
| 30 | `umbral_wyrmling` | Umbral Wyrmling | Shadow | Epic | Gloom | 32×32 | Lurks in shadow with glowing eyes, darts between burrows |
| 31 | `moonless_kitsune` | Moonless Kitsune | Shadow | Legendary | Gloom | 32×32 | Lurks in shadow with glowing eyes, darts between burrows |
| 32 | `cinder_newt` | Cinder Newt | Alchemy | Common | Ember | 16×16 | Basks on coals, flickers, curls up in the brazier nest |
| 33 | `mopslime` | Mopslime | Alchemy | Common | Tide | 16×16 | Swims loops in the tank, surfaces to blow bubbles |
| 34 | `bellows_toad` | Bellows Toad | Alchemy | Uncommon | Ember | 16×16 | Basks on coals, flickers, curls up in the brazier nest |
| 35 | `quicksilver_otter` | Quicksilver Otter | Alchemy | Uncommon | Tide | 16×16 | Swims loops in the tank, surfaces to blow bubbles |
| 36 | `alembic_salamander` | Alembic Salamander | Alchemy | Rare | Ember | 24×24 | Basks on coals, flickers, curls up in the brazier nest |
| 37 | `philosophers_chimera` | Philosopher's Chimera | Alchemy | Legendary | Menagerie only (needs Ember + Crystal modules) | 48×32 | Wanders its module in the Menagerie |
| 38 | `fen_sprite` | Fen Sprite | Nature | Uncommon | Meadow or Tide | 16×16 | Grazes, wanders the pen floor, naps in the shelter |
| 39 | `mistfeather_owl` | Mistfeather Owl | Arcane | Rare | Sky | 24×24 | Hops between perches, short flights in the open sky above the pen |
| 40 | `geode_golem` | Geode Golem | Alchemy | Rare | Crystal | 24×24 | Sits like a boulder, then slowly stands and shuffles; sparkles when it helps a build |

## A.4 Sigils (24)

16 × 16 art px, single frame, drawn in the player's robe-colour ramp on the crest banner and in gold on the wizard's hat. Files `sigil/{id}.png` in the UI atlas.

| ID | Sigil | ID | Sigil | ID | Sigil |
|---|---|---|---|---|---|
| `star8` | Eight-point star | `crescent` | Crescent moon | `sun` | Sun disc |
| `leaf` | Oak leaf | `flask` | Flask | `eye` | Open eye |
| `key` | Key | `owl` | Owl | `cat` | Cat |
| `raven` | Raven | `stag` | Stag | `fox` | Fox |
| `tower` | Tower | `book` | Open book | `quill` | Quill |
| `candle` | Candle | `crown` | Crown | `rose` | Rose |
| `mushroom` | Mushroom | `wave` | Wave | `flame` | Flame |
| `crystal` | Crystal | `comet` | Comet | `spiral` | Spiral |


# Appendix B — AI Image Prompt Library

These prompts produce **source images** for the tier-2 pipeline (Section 12.5). They are written to give consistent, easy-to-process results: one subject, side view, flat magenta background, light from the top-left, limited palette. Generated images are always post-processed (downscale, palette snap, outline, slice); they are never shipped raw. Do not ask for the style of any named artist or game.

## B.1 Shared style block

Append this to every prompt:

```text
Style: cozy storybook pixel art, side view, clean readable silhouette, chunky pixels,
limited palette of soft warm colours, 1-pixel darker outline (not black), light coming
from the top-left, no text, no letters, no watermark, no border, no drop shadow,
centred single subject on a flat solid magenta (#FF00FF) background, no gradient
in the background, orthographic side-on view.
```

## B.2 Room dressings (one per room, Appendix A.1)

Template:

```text
Side-on cutaway interior of a small magic school room, as if the front wall were
removed, seen straight on. The room is {W} cells wide and {H} cells tall, in a
{W*4}:{H*3} aspect ratio. Room: {ROOM NAME}. Show: {LOOK from Appendix A.1}.
Back wall and fixed features only, NO movable furniture, NO people, NO creatures.
Floor line along the bottom edge, ceiling beam along the top edge. School accent
colour: {SCHOOL KEY COLOUR NAME}. {SHARED STYLE BLOCK}
```

## B.3 Tier wall skins

```text
Seamless tileable texture of an interior back wall and floor strip for a cozy magic
castle, side view, 4:3 tile. Tier: {Bare: rough grey stone blocks and flagstones |
Plain: off-white plaster over a stone base and smooth flagstones | Cozy: warm
limewash above wooden wainscot, honey wood plank floor | Fine: full wood panelling
with a picture rail, polished boards | Splendid: panelling with gilded trim and an
arched niche, parquet floor}. Neutral colours only, so trim can be recoloured later.
Must tile seamlessly left-right. {SHARED STYLE BLOCK}
```

## B.4 Furniture (Appendix A.2)

```text
Single piece of furniture for a cozy magic school, side view, standing on the
ground line at the bottom of the image. Item: {ITEM NAME}. {One-line description
from GDD Section 17, without numbers}. Size proportion: {1 slot: about as wide as
it is tall | tall 1 slot: twice as tall as wide | 2 slots: twice as wide as tall}.
{If animated: "Draw it in its resting state; it will be animated later."}
{SHARED STYLE BLOCK}
```

## B.5 Character layers

Generate **one key frame per layer**, then derive the other frames by hand or in code (Section 12.5 step 7).

Base body:

```text
Full-body chibi character base for a pixel-art side-view game, standing in a relaxed
idle pose facing right, simple neutral grey underclothes, bald smooth head, no hair,
no hat, no robe, arms slightly away from the body, feet together on the bottom edge.
Proportions: head one third of total height, short legs. Body shape: {slim | average
| broad | round}. Height: {adult | young student, slightly shorter}. Plain mid-grey
skin (will be recoloured). {SHARED STYLE BLOCK}
```

Robe layer:

```text
Only the robe for the character base above, same pose and size, facing right: {short
knee-length student robe with a wide collar | long floor-length faculty robe with
wide sleeves | flowing wizard robe with a short shoulder cape | plain civilian tunic}.
Draw the robe in four flat shades of grey from dark to light (will be recoloured).
Nothing else in the image. {SHARED STYLE BLOCK}
```

Hair and hats:

```text
Only the hair for the character base above, same pose and size, facing right. Style:
{one of: short messy | long straight | braid | twin buns | curly bob | pixie | long
wavy | ponytail | shaved sides | big afro | side part | top knot}. Four flat grey
shades (will be recoloured). Nothing else. {SHARED STYLE BLOCK}
```

```text
Only the hat for the character base above, same pose and size, facing right: {tall
pointed wizard hat with a soft bend | floppy hat | wide-brim hat | hood | thin
circlet | soft cap | flower crown}. {SHARED STYLE BLOCK}
```

Role marks: as above, "Only the {student scarf with a small blank badge | long
stole hanging from both shoulders | small star pin | travel cloak with a rolled
pack}".

## B.6 Creatures (Appendix A.3)

```text
A single small magical creature for a cozy pixel-art game, side view, facing right,
standing (or {swimming | perched | hovering}) on the bottom edge. Creature: {NAME}.
{Short look from GDD 22.7: species idea, colours from its school: {SCHOOL KEY COLOUR
NAMES}}. Friendly, rounded, readable at very small size; one distinctive feature
({e.g. mossy shell, glowing tail, crystal horns}). Rarity feel: {common: simple |
rare: a little ornate | legendary: majestic but still cute}. {SHARED STYLE BLOCK}
```

## B.7 Effects, sky and UI

Use the same shared block with: "Pixel-art {effect}, {N} frames in one horizontal strip, evenly spaced" for effects; "distant rolling hills silhouette, wide 6:1 strip, seamless left-right" for the sky; "parchment page frame for 9-slice scaling, distinct corners, plain repeatable edges" for panels; and "half-circle brass dial with a cream face and tick marks, no numbers, no needle" for the chance meter.

## B.8 Review checklist for generated art

- One subject, centred; background is pure magenta; no text or signatures.
- Silhouette readable when shrunk to the target size (check the downscaled result, not the source).
- Light from the top-left; outline darker than the fill, not black.
- After palette snap, no more than 8 colours per sprite (16 for room dressings).
- Feet or base on the bottom row; nothing cut off.


# Appendix C — Palette Tables

All art is snapped to this master palette. Hex values marked **(GDD)** come from GDD 37.3 and are the key shades.

## C.1 School and Veil ramps

| Ramp | Shade 0 (shadow) | Shade 1 | Shade 2 (key) | Shade 3 (highlight) |
|---|---|---|---|---|
| Arcane | #2E2160 | #4B3796 | #6B4FBB **(GDD)** | #9C86E0 |
| Arcane accent | #5A5F69 | #8A909B | #C9CED6 **(GDD)** | #EEF1F5 |
| Nature | #24451C | #3A6B2C | #4E8B3A **(GDD)** | #7DB861 |
| Nature accent | #6E4A14 | #9C6A1E | #E0A33A **(GDD)** | #F5CE7A |
| Light | #8F7420 | #C4A233 | #E8C547 **(GDD)** | #F6E08C |
| Light accent | #C9B88A | #E6D9B0 | #FFF6DC **(GDD)** | #FFFFFF |
| Shadow | #151A38 | #222B57 | #2F3A73 **(GDD)** | #4C5BA3 |
| Shadow accent | #123B3B | #1C5757 | #2E8B8B **(GDD)** | #5FC2C2 |
| Alchemy | #5E3410 | #8A4C17 | #B5651D **(GDD)** | #DB8C46 |
| Alchemy accent | #5C1A0E | #8F2A17 | #D9472B **(GDD)** | #F07A5C |
| Veil | #3D2856 **(GDD Torn)** | #7D5BA6 **(GDD Thin)** | #B9A6FF **(GDD Thinning)** | #9BD4FF **(GDD Strong)** |

## C.2 Neutrals, skin and hair

| Ramp | 0 | 1 | 2 | 3 |
|---|---|---|---|---|
| Stone | #3B3A40 | #5E5D66 | #8A8994 | #B9B8C2 |
| Plaster | #9E958A | #C4BBAE | #E3DBCE | #F6F1E8 |
| Wood | #4A2E1C | #6E4529 | #96633B | #C28E5C |
| Slate (roofs) | #2A3340 | #3E4A5C | #57677D | #7C8DA3 |
| Earth and grass | #3A2A1E / #2F5A2A | #5A4030 / #4A7D3A | #7A5A40 / #6BA34F | #9C7A58 / #9CCB72 |
| Gold trim | #7A5A12 | #B08A22 | #DDB843 | #F7E39A |
| Ink and parchment (UI) | #1B1822 | #2A2533 **(GDD dark)** | #E9DDC7 | #F4EBD9 **(GDD light)** |

**Skin tones (8).** Each is a 4-shade ramp; key shades: #F6D7C3, #EDC0A0, #D9A07A, #C08560, #A06A48, #845236, #643C26, #4A2A1A.

**Hair colours (10).** Key shades: #1E1A1A (black), #4A2E1E (dark brown), #7A4A2A (brown), #B07A3A (light brown), #E0B860 (blond), #F2E2B0 (platinum), #B8402A (red), #D8D8D8 (white), #6B4FBB (violet), #2E8B8B (teal).

## C.3 Robe colours (12)

The five school keys, plus seven others: Arcane #6B4FBB, Nature #4E8B3A, Light #E8C547, Shadow #2F3A73, Alchemy #B5651D, Crimson #9E2A3A, Rose #D97A9A, Sky #5A9AD6, Forest #2F5A3A, Charcoal #3B3A40, Cream #E9DDC7, Plum #5A2A5A. Each expands to a 4-shade ramp by the same lightness steps as the school ramps.

## C.4 Career emblem colours

| Career | Emblem | Colour |
|---|---|---|
| Teacher | Open book | Gold #DDB843 |
| Scholar | Quill and scroll | Arcane accent #C9CED6 |
| Gardener | Sprout | Nature #7DB861 |
| Tamer | Paw | Nature accent #E0A33A |
| Healer | Leaf and cross | Light #FFF6DC |
| Warder | Shield | Shadow accent #5FC2C2 |
| Alchemist | Flask | Alchemy accent #F07A5C |
| Builder | Hammer | Wood #C28E5C |
| Adventurer | Compass | Veil #9BD4FF |

## C.5 Status colours (always paired with a shape and icon)

| Status | Colour | Shape |
|---|---|---|
| Injury | #B8402A | Round bubble |
| Critical need (0–24) | #D9472B rim | Square bubble |
| Warning need (25–49) | #8A8994 rim | Square bubble |
| Mastery-ready | #DDB843 | Star |
| Happy | #D97A9A | Heart |
| Unreachable | #5E5D66 | Circle with bar |
| Locked | #2F3A73 | Padlock |
| Unfinished | #E0A33A | Dashed outline with "+" |
| Dirty | #7A5A40 | Footprint |
| Hazard | #D9472B | Triangle |
