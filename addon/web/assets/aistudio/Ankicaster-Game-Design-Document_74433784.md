---
title: "Ankicaster — Game Design Document & Implementation Specification"
subtitle: "An Anki add-on school-of-magic game, inspired by the base game of Spellcaster University"
version: "GDD v1.0 (expands Concept Draft 8)"
date: "9 November 2026"
---

# Ankicaster — Game Design Document & Implementation Specification

**Version:** GDD v1.0, expanding approved Concept Draft 8
**Date:** 9 November 2026
**Platform:** Anki desktop add-on (Anki 2.1.66+ / 23.x / 24.x / 25.x, Qt6), Python + aqt/PyQt6, HTML/JS front end in an `AnkiWebView`
**Inspiration credit:** Ankicaster's school-building loop, room-and-furniture logic, card draft, creatures and alchemy are *inspired by* the base game of *Spellcaster University* (Sneaky Yak Studio / Lion's Shade). No DLC content is used. Ankicaster contains no assets, text, names of specific cards, or code from that game; every room, item, creature and number in this document is original to Ankicaster.

## How to use this document

This document is two things at once:

1. **A game design document** — what Ankicaster is, why it is fun, and how every system works, with concrete content (rooms, furniture, creatures, potions, events, spells) and numbers.
2. **An implementation specification** — the data model, algorithms, hooks, files, milestones and tests an AI coding assistant (or a human developer) needs to build a working, genuinely playable first version.

If you are an AI builder, read **Section 1 (Instructions for the AI Builder)** first, then **Section 2 (Binding Rules Register)**. Every other section can be implemented in the milestone order given in **Section 39**. Content catalogs (rooms, furniture, creatures, etc.) are written as tables so they can be converted directly into the JSON content files listed in **Section 38.15**.

Conventions used throughout:

- **"Anki card"** always means a flashcard in the user's collection. **"Draft card"** always means an in-game card drawn from a draft deck. Code must never mix the two (`anki_card_id` vs `draft_card_id`).
- **"Review"** means one honest answer to an Anki card that Anki logged, made after Ankicaster was installed (full definition in Section 5.2).
- **"Bell"** is the game's simulation tick: one bell rings every **10 honest reviews**. The school only "lives" (needs, production, hazards) when bells ring. Real-calendar days matter only for the systems the concept explicitly ties to days (Veil upkeep, teacher delay, intervals).
- **"Day"** means the Anki scheduling day (respecting the user's "next day starts at" setting), not the midnight clock.
- **Rule IDs** like **BR-07** refer to the Binding Rules Register (Section 2). Never implement anything that breaks a BR rule.
- All numbers in this document are **starting values to tune**. This is stated once here and again in the Economy section (Section 33); it is not repeated on every line.

## Table of contents

1. Instructions for the AI Builder
2. Binding Rules Register
3. Vision, Pillars and Player Fantasy
4. Glossary
5. The Honest Mana Economy
6. Core Loops and the Shape of a Session
7. The Player Wizard
8. The Five Schools of Magic
9. Students and Card Linking
10. Skill, Mastery and the Master Title
11. Careers and Faculty
12. Enrollment, Recruitment and the Enrollment Tracker
13. Retirement and Alumni
14. Student Traits, Personalities and Needs
15. The School Map, Construction and Room Quality
16. Room Catalog
17. Furniture and Decor Catalog
18. The Veil and Upkeep
19. Hazards and Wards
20. Misbehavior
21. Food, Gardens and the Greenhouse
22. Creatures and Taming (Bestiary)
23. Injuries, Health and Healers
24. Alchemy and Potions
25. Materials, Essences and Artifacts
26. The Card Draft
27. The Rift and Expeditions
28. Random School Events
29. Wizard Spells and Abilities
30. Game Modes: Timed Term and Endless School; Reset Rules
31. Spellbooks and Alumni Bonuses (Meta Progression)
32. Achievements and Milestones
33. Economy Balance Tables
34. Progression Pacing
35. Tutorial and Onboarding
36. UI/UX Specification
37. Art Direction and Audio
38. Technical Implementation Specification
39. Build Milestones and Acceptance Criteria
40. Testing Plan
41. Appendix A — Formula Reference
42. Appendix B — Design Decisions Made in This GDD (for review)

# 1. Instructions for the AI Builder

Read this section before writing any code. It tells you what to build first, what must never break, and how to make decisions when this document is silent.

## 1.1 What you are building

Ankicaster is an Anki desktop add-on. While the user studies normally in Anki, every honest review they answer earns **neutral mana**. In a separate game window (opened from Anki's **Tools** menu or a toolbar button) the user spends that mana to train their own wizard or witch, build a magic school room by room, furnish it, enroll students who are each *linked to a set of the user's own young Anki cards*, raise those students to mastery as the linked cards mature, give masters careers, tame creatures, brew potions, keep the protective **Veil** paid, and eventually send adventurers through **the Rift**.

The game is cozy, idle-flavoured and slow-burning. It is meant to be opened for two to ten minutes before or after a study session, and to make the user feel that their real learning is building something visible.

## 1.2 Build order (do it in this order)

Build in vertical slices. Each slice must be playable and must pass its acceptance criteria (Section 39) before you start the next.

| Order | Slice | Why first |
|---|---|---|
| 1 | **Mana ledger** from honest reviews (revlog-verified, post-install only, undo-safe) and the post-review toast | Everything depends on it; it is where the guardrails live |
| 2 | **Save system** (SQLite in `user_files/`, per Anki profile, migrations) | Nothing else is safe without durable state |
| 3 | **Wizard and training sessions** (orb sessions, 25×n reviews per level, buffs at 6–10) | The idle early game; playable on day one |
| 4 | **School grid and construction** (standard plans, materials, mana cost, build time in reviews) | Gives the user something to do with mana |
| 5 | **Students, card linking, enrollment tracker, skill and mastery** | The heart of the concept |
| 6 | **Daily tick, Veil upkeep and break handling** | Required before anything can "go wrong" |
| 7 | Needs, food, refectory, dorms, greenhouse | Makes the school feel alive |
| 8 | Careers and faculty limit, teacher delay | Turns masters into a second engine |
| 9 | Furniture and room quality | The main decorating/optimizing toy |
| 10 | Card draft | Variety and surprise |
| 11 | Creatures and taming | Collection fun |
| 12 | Hazards, wards, misbehavior, injuries, infirmary | Light pressure |
| 13 | Alchemy and potions | Crafting layer |
| 14 | The Rift | Late-game adventure |
| 15 | Events, spells, achievements, game modes, meta progression | Long-term retention |

The **MVP slice** that should be shown to the user first is orders 1–6 plus the Dormitory, Refectory, one Classroom per school, Faculty Quarters, Storage, Woodlot, Quarry and Vegetable Patch. It must already be fun: training, building, enrolling, watching skill bars rise.

## 1.3 Guardrails you must never break

These come from the user's approved concept and are non-negotiable. They are also listed with IDs in Section 2. If any instruction anywhere else seems to conflict with these, these win.

1. **Never write to the Anki collection.** No scheduling changes, no edits to cards, notes, decks, tags, flags, revlog or config. All collection access is read-only (`SELECT` only). Do not call any scheduler method that changes state. Do not add, bury, suspend, reschedule, or "set due date". Do not hook into the answer path in a way that changes the answer.
2. **Mana comes only from honest reviews made after install.** Past history grants nothing, ever: no backfill, no "welcome bonus based on your collection", no retroactive mana for imported revlogs.
3. **The game never rewards review count, review speed, adding cards, or pressing Good over Again.** All answer buttons earn identical mana. There are no streaks, no combo multipliers, no "do 200 reviews today" goals, no achievements for review totals, no bonuses for answering fast, no rewards for new cards added. Training and construction progress by reviews because the concept says so, but nothing escalates the reward for doing *more* reviews per day.
4. **Breaks never delete progress.** If the user stops studying for a day, a month or a year, nothing is lost: no characters, card links, titles, buildings, furniture, creatures, wizard levels, spellbooks, alumni or banked mana are deleted. The school "sleeps".
5. **Card intervals are read, never written.** Student skill, mastery and retirement are derived from `cards.ivl` (days) as Anki reports it.
6. **Cards are never shared between characters.** One Anki card can be linked to at most one character at a time.
7. **No deaths.** Characters and creatures can be injured or cursed on a Rift expedition, or escape for a while; they always recover or come back.
8. **The add-on must never crash or slow down reviewing.** All game work triggered from a review hook must finish in under 5 ms on the hook thread; anything heavier is deferred (`mw.progress.single_shot` / `QTimer`) and wrapped in `try/except` that logs and continues. A game bug must never block the user from studying.

## 1.4 How to make decisions this document does not cover

- Prefer the option that is **kinder to a user who took a break**.
- Prefer **data-driven content** (JSON in `content/`) over hard-coded content, so numbers can be tuned without code changes.
- Prefer **deterministic, seeded randomness** (Section 38.11) so bugs are reproducible and save-scumming gains nothing.
- Prefer **fewer, clearer numbers** on screen. Every modifier a player sees must show its source in a tooltip.
- If a feature would require writing to the collection, **drop the feature**.

## 1.5 Definition of "workable and genuinely fun" for v1

A first version is acceptable when a user can install it, study as usual, and over the first week: see mana arrive after reviews; train their wizard to level 5 in a school; build at least six room types and furnish them; enroll students whose skill bars visibly follow their real cards; get a creature; meet at least three random events; and never once be told they did something wrong by studying honestly. Over the first two months they should reach their first master and see the Rift on the horizon.

# 2. Binding Rules Register

Every rule below is a decision from approved Concept Draft 8 and is binding. This GDD expands them but does not change them. Code reviews and tests should cite these IDs.

| ID | Rule | Where expanded |
|---|---|---|
| BR-01 | There is one **neutral mana pool**. Mana is earned only from honest reviews done **after install**. Past Anki history grants nothing. | 5 |
| BR-02 | Ankicaster **never alters Anki scheduling** or any collection data. | 1.3, 38.4 |
| BR-03 | The game **never rewards review count or speed, adding cards, or pressing Good over Again**. | 5.4 |
| BR-04 | **Breaks never delete progress.** | 18.5, 38.10 |
| BR-05 | The player has their **own wizard or witch**. The early game is idle-style. | 7 |
| BR-06 | **Training sessions** (pondering an orb, studying a grimoire) cost mana and finish after N reviews. | 7.3 |
| BR-07 | Wizard **level n needs 25×n reviews** (25 to 250; 1,375 reviews to reach level 10). Maximum level **10 per school**. | 7.4 |
| BR-08 | Wizard **level 5 in a school unlocks teaching that school**. | 7.5 |
| BR-09 | Wizard levels **6–10 give percentage buffs** per level: **Arcane +2% mana**; **Nature +3% food, herbs and taming**; **Light +3% recovery and teaching**; **Shadow −3% Veil cost and −3% hazards and misbehavior**; **Alchemy −3% build time and materials, +3% potion yield**. | 7.6 |
| BR-10 | **Five schools:** Arcane, Nature, Light, Shadow, Alchemy. | 8 |
| BR-11 | **Careers:** teacher, scholar, gardener, tamer, healer, warder, alchemist, builder; **adventurer** from any school. | 11 |
| BR-12 | Each **student links to the 50 youngest free Anki cards**. The number is a setting (**default 50**) and **applies to all students**. | 9, 38.14 |
| BR-13 | **Cards are never shared** between characters. | 9.3 |
| BR-14 | **Card age = review interval.** | 9.2 |
| BR-15 | **Skill tracks intervals and falls on lapses.** | 10.1 |
| BR-16 | **Mastery** happens when **all** of a student's cards are **over 30 days** **plus** a **teacher delay** = **30 − the average interval of the teacher's 20 teaching cards**, in **real days**; the delay is **0 once all 20 teaching cards are over 30 days**. | 10.3 |
| BR-17 | The **master title is permanent**. | 10.5 |
| BR-18 | **Careers add the 20 youngest free cards** each. (Young free cards are taken first; older free cards are used only when not enough young ones exist. This fallback is a GDD decision.) | 9.4, 11.2 |
| BR-19 | **Career switching** is only for **masters of 2+ schools**; **old career cards are kept**. | 11.5 |
| BR-20 | **Second-school enrollment adds a fresh card set.** | 12.6 |
| BR-21 | **Retirement** happens when **all** of a character's cards pass **retirement age** (setting, default **90** days). | 13 |
| BR-22 | **Faculty limit** comes from **wizard levels, housing, classrooms and student count**. | 11.6 |
| BR-23 | The **enrollment tracker** shows **free young cards vs needed** and **blocks enrollment** when there are not enough. | 12.3 |
| BR-24 | **Veil upkeep** is daily mana that scales with **school size (buildings, rooms, grounds)**, **not headcount**. It is lowered by **Shadow wizard levels, warders, some creatures, Arcane research and draft cards**. | 18.2 |
| BR-25 | **Unpaid Veil thins**: hazards and **Rift breaches** become more likely; **nothing is deleted**. | 18.4, 19.4 |
| BR-26 | **While away**, banked mana auto-pays the Veil until the bank falls to **10% of what it was at the last review**; then payments stop and the **Veil holds where it is (it does not thin)**. | 18.5 |
| BR-27 | **The Rift opens at 3 masters.** Only **adventurers** go. **Teams of 1–3** (3 is best). **Five destinations**, one per tier (**easy / mild / medium / hard / deadly**), with a **chance meter**, odds, modifiers, a "when it goes wrong" table, and **no deaths: nobody dies or is lost; the worst case is a long infirmary recovery**. | 27 |
| BR-31 | **Rift destinations.** Skill needed = the **average interval of the party's adventurer career cards**. Safe odds = the chance of returning unscathed for a team of three at exactly that skill. Best odds = the cap. Mossy Hollow: Easy, 0 days, 85%, 95%, 50 reviews, herbs, timber, common eggs. Whispering Fen: Mild, 10 days, 75%, 90%, 100 reviews, rare herbs, owls and sprites. Crystal Caverns: Medium, 20 days, 65%, 85%, 150 reviews, crystals, stone, golem cores. Ashen Wastes: Hard, 30 days, 55%, 80%, 250 reviews, fire creatures, rare materials. The Shattered Spire: Deadly, 45 days, 45%, 70%, 400 reviews, rare cards, artifacts, legendary eggs. **Mana cost grows with each tier.** | 27.3, 27.4 |
| BR-32 | **Rift odds modifiers:** each 5 days of skill below needed −10%; each 5 days above +5%, up to the cap; team of two −10%; going alone −25%; Rift Elixir +10%, up to the cap; Thin Veil at home −5%. | 27.5 |
| BR-33 | **When it goes wrong** (Easy–Medium / Hard–Deadly): minor injury with full rewards 60% / 40%; serious injury with half rewards 25% / 30%; curse on one adventurer 10% / 20%; retreat with nothing 5% / 10%. | 27.6 |
| BR-34 | **Timed-term reset detail:** buildings, materials, unspent mana, students, faculty and creatures reset (their cards become free again). Wizard levels, alumni bonuses and spellbooks carry over. **Anki cards are never touched.** | 30.4 |
| BR-35 | **Settings defaults:** cards per student **50** (applies to all students), retirement age **90** days, exam timer **off**. | 30.2, 38.14 |
| BR-28 | Systems in scope: **food/greenhouse; creatures/taming; injuries/healers; misbehavior; hazards/wards; construction (blueprint + materials + mana + build time in reviews); potions; student needs; card draft**. | 14–26 |
| BR-29 | **Two modes:** **timed term** (exam timer optional) vs **endless school**. | 30 |
| BR-30 | **Reset rules:** in timed terms **creatures and characters reset**; **wizard levels, alumni bonuses and spellbooks carry over**. | 30.4 |

BR-01 to BR-35 have been checked against the Draft 8 page. Where this GDD adds detail inside a binding rule (for example, Rift mana costs or the young-first career fallback), the addition is marked as a GDD decision and listed in Appendix B.
# 3. Vision, Pillars and Player Fantasy

## 3.1 Elevator pitch

*Your flashcards are your students.* Every honest review you do in Anki pours a little neutral mana into your tower. Spend it to train your own wizard or witch through five schools of magic, raise a castle-school room by room, and enroll students who are each bound to fifty of your youngest cards. As your real memories mature, your students grow into masters, take careers, tame creatures, brew potions, and finally step through the Rift. Take a week off and the school simply sleeps under its Veil; nothing is lost.

## 3.2 Player fantasy

- **"I am a wizard, and I am getting better."** The player's own character is the first thing that grows, quickly and visibly, before any students exist.
- **"My learning is building something."** The school is a physical, cross-section castle that gets taller, fuller and more beautiful as the user studies. Each student's skill bar is a mirror of real cards.
- **"I run a magic school."** Classic school-sim pleasures inspired by Spellcaster University's base game: picking rooms from a draft, fitting them into a grid, furnishing them for quality, keeping students fed, rested and out of trouble, collecting creatures, brewing potions, and sending a party into a dangerous place for loot.
- **"It never nags me."** No streaks, no guilt, no lost progress. The Veil protects the school while the user is away.

## 3.3 Design pillars

| Pillar | Meaning | Concrete test |
|---|---|---|
| **Honest study is the only fuel** | Mana is a by-product of normal reviewing. The game must never change *how* a user studies. | A user who presses Again on every lapse earns exactly the same mana as one who presses Good. |
| **The cards are the clock** | Student progress, mastery and retirement come from real card intervals; the game reads them, never writes them. | A student's skill bar can be reproduced from `cards.ivl` alone. |
| **Cozy pressure, never punishment** | Hazards, misbehavior and hunger create small, readable problems that are fun to fix. Nothing permanent is ever taken away. | No code path deletes a character, card link, building, creature or banked mana. |
| **A school worth looking at** | Rooms and furniture visibly change the castle; quality tiers have different art; creatures wander. | A screenshot of week four looks very different from day one. |
| **Short visits, long arcs** | Every visit has a 2-minute action (collect, queue, place) and every month has a milestone (master, creature, Rift). | Each session ends with at least one "next thing" queued. |

## 3.4 What Ankicaster borrows from Spellcaster University (inspiration only)

| Spellcaster University base-game idea | Ankicaster translation |
|---|---|
| Side-on cross-section school built room by room, with footprints, connections and "air above" rooms | School map grid with footprints, support, connections and sky-access rooms (Section 15) |
| Draw three cards, keep one, prices rising per draw | Draft decks per school plus a Foundation deck, draw-3-keep-1, prices that rise with recent draws (Section 26) |
| Duplicate room cards level a room (+10% efficiency per level) | Duplicate blueprints level rooms to L2/L3 (+10% per level) (Section 15.7) |
| Item slots and furniture that change room effectiveness | Required and optional furniture with room stats and quality tiers (Section 17) |
| Five schools of magic, each with its own colored mana | Five schools; mana is neutral (BR-01), but each school's students produce a school **essence** material (Section 25) |
| Students with traits, needs (hunger, tiredness, boredom, health, sanity) and misbehavior | Students with personalities, traits, and needs (Hunger, Rest, Leisure, Health, Composure) (Section 14) |
| Graduation into Futures with permanent alumni bonuses that carry across a campaign | Retirement and term-end graduation into alumni bonuses that carry over (Sections 13, 31) |
| Familiars and creatures that give buffs | Bestiary of 32 creatures with pens, taming, diets and escape trouble (Section 22) |
| Ingredients combined three at a time into potions | Alchemy lab recipes of three ingredients, discovered by experiment (Section 24) |
| Dungeon delves with a party of students | The Rift: teams of 1–3 adventurers, five destinations from Easy to Deadly, gated by how well the user really remembers the adventurers' cards (Section 27) |
| A looming clock (the Dark Lord) | Replaced by the gentle Veil upkeep and the optional exam timer of a Timed Term (Sections 18, 30) |
| Spell Books chosen between maps based on stars earned | Spellbooks earned from term charters and Endless milestones (Section 31) |

What Ankicaster deliberately does **not** borrow: a hard fail clock in Endless mode, death as an outcome, gold and wages, faction reputation diplomacy, and anything from DLCs.

## 3.5 Target user and session shape

The reference user does **100–200 reviews per day** in sessions of 15–45 minutes and adds new cards regularly (roughly 10–25 new cards a day). The game must also be pleasant for a user at 30 reviews/day (slower, but nothing breaks) and must not become trivially exploitable at 800 reviews/day (the only gain from more reviews is the same linear mana everyone gets).

# 4. Glossary

| Term | Definition |
|---|---|
| **Honest review** | An answer to an Anki card logged in the revlog after install, made through normal studying, that passes the honesty checks in Section 5.2. |
| **Mana** | The single neutral currency, earned only from honest reviews. Stored in the **mana bank**. |
| **Bell** | Simulation tick; rings once per 10 honest reviews. Needs, production, yields, hazards and misbehavior are evaluated per bell. |
| **Day tick** | Processing that runs once per Anki day rollover: Veil upkeep, interval refresh, mastery and retirement checks, applicant board refresh, daily events. |
| **Wizard** | The player's own character (wizard or witch, player's choice of name, look and pronouns). Has a level 0–10 in each school. |
| **Training session** | A mana-paid activity on the wizard ("Ponder an Orb" for school levels, "Study a Grimoire" for spells) that completes after N honest reviews. |
| **School** | One of Arcane, Nature, Light, Shadow, Alchemy. Also refers to the player's whole institution ("the school"); context disambiguates, and the UI calls the institution "your Academy" to avoid confusion. |
| **Academy** | The player's institution: castle grid plus grounds. |
| **Character** | Any student, faculty member or alumnus other than the wizard. |
| **Student** | A character enrolled in a school, linked to a study set of Anki cards. |
| **Master** | A character who has mastered at least one school. Title is permanent. |
| **Career** | A job taken by a master (teacher, scholar, gardener, tamer, healer, warder, alchemist, builder, adventurer). Adds 20 career cards. |
| **Faculty** | Characters holding careers. |
| **Card link** | The binding between one Anki card and one character, in one **card set** (study set or career set). |
| **Free card** | An eligible Anki card not linked to any character. |
| **Young card** | A card whose interval is ≤ 30 days (setting `young_threshold_days`). |
| **Skill** | 0–100 score per study set derived from linked card intervals. |
| **Teacher delay** | Real days a mastery-ready student must wait, derived from the teacher's career-card intervals (BR-16). |
| **Retirement age** | Interval every linked card must exceed for a character to retire (default 90 days). |
| **Alumni** | Retired characters (and, in Timed Terms, term-end graduates). Grant permanent alumni bonuses. |
| **Veil** | The protective enchantment over the Academy. Costs daily mana upkeep based on Academy size. Has a **strength** 0–100. |
| **Hazard** | A Veil-related magical problem (e.g., wild growth, poltergeist). |
| **Breach** | A serious hazard possible only when the Veil is thin: something gets in. |
| **Misbehavior** | Student-caused trouble (pranks, spills, unauthorized summoning). |
| **Room** | A placed building unit on the grid or grounds, with footprint, level, furniture, cleanliness and efficiency. |
| **Plot** | A grounds room (outdoor), e.g., Woodlot, Quarry, Paddock. |
| **Furniture** | Placeable items inside rooms; required or optional; add room stats. |
| **Room stats** | Comfort, Focus, Order, Aura, Charm. |
| **Quality** | A room's furniture score, giving a tier (Bare → Splendid) and an efficiency bonus. |
| **Blueprint** | A draft card or standard plan that permits building a room. |
| **Materials** | Timber, Stone, Glass, Cloth (common) and rare materials (Crystal, Moonsilk, Starmetal, etc.). |
| **Essences** | School-specific materials produced by students' lessons: Insight (Arcane), Herbs (Nature), Radiance (Light), Umbra (Shadow), Reagents (Alchemy). |
| **Provisions / Greens / Fish / Nectar** | Food types. Provisions feed people; creatures eat various foods and essences. |
| **Draft** | Pay mana to draw 3 draft cards from a deck and keep 1. |
| **Rift** | The late-game expedition system that opens at 3 masters. |
| **Expedition** | A Rift trip by a team of 1–3 adventurers to one destination (each destination has its own tier); resolves after that destination's number of reviews. |
| **Chance meter** | The displayed chance that a planned expedition returns safely (unscathed, full rewards). |
| **Renown** | The Academy's standing; earned from masters, alumni, decor, achievements. Unlocks applicant quality and draft rarity weights. Never affects mana. |
| **Timed Term** | A mode with a charter (goals), an optional exam timer, and a reset at the end. |
| **Endless School** | A mode with no reset. |
| **Spellbook** | A permanent meta-progression passive, carried across terms. |

# 5. The Honest Mana Economy

## 5.1 Role and player goal

Mana is the only currency that comes from outside the game. It is the bridge between real study and the Academy. The player's goal is to spend a steady, honest trickle of mana well: training the wizard, building, drafting, keeping the Veil paid, and funding expeditions. The design goal is that the *only* way to get mana is to study the way you would have studied anyway.

## 5.2 What counts as an honest review

A review grants mana if and only if **all** of these are true. The check is performed against the **revlog** (the source of truth), not against the UI event alone.

| # | Check | Rule | Reason |
|---|---|---|---|
| H1 | Post-install | `revlog.id` (a millisecond timestamp) is greater than `install_ms`, recorded the first time Ankicaster ever runs on this profile. | BR-01: past history grants nothing. |
| H2 | Real answer | `revlog.ease` is 1, 2, 3 or 4. | Excludes manual reschedules, "set due date", resets and other non-answers. |
| H3 | Study entry type | `revlog.type` is learn (0), review (1), relearn (2) or filtered/early review (3). Any other type (manual, rescheduled, future types) is ignored. | Only genuine study answers. |
| H4 | Not already counted | `revlog.id` is not already in the mana ledger. | Idempotence across hooks, sync catch-up and restarts. |
| H5 | Not a mash | `revlog.time` (answer time in ms) ≥ `min_answer_ms` (setting, default **800 ms**). Entries below this are logged as "too quick to count" and grant nothing. | Discourages button-mashing without rewarding speed; normal answers are never affected. |
| H6 | Per-card daily ceiling | At most `max_counted_answers_per_card_per_day` (default **6**) answers to the same Anki card count per Anki day. | Stops "review the same card in a loop" exploits; ordinary learning steps stay below this. |
| H7 | Card still exists | The card id exists in `cards` at the time of counting (or existed at the time of the hook). | Deleted-card spam cannot farm mana. |

All four answer buttons are equal. **Again, Hard, Good and Easy grant identical mana** (BR-03). The answer time affects nothing except check H5.

## 5.3 How much mana

| Quantity | Starting value |
|---|---|
| Base mana per honest review | **10** |
| Arcane wizard buff (levels 6–10) | +2% per level, up to **+10%** (BR-09) |
| Other mana multipliers (spellbooks, alumni) | Listed in Section 31; combined with Arcane they are capped at **+25%** total |
| Mana bank cap | None |
| Fractional mana | Tracked as a float; displayed rounded down |

Formula: `mana_gain = mana_per_review × (1 + min(0.25, arcane_bonus + other_bonuses))`.

There is deliberately **no** daily bonus, first-review-of-the-day bonus, streak, combo, accuracy bonus, speed bonus, "review goal" chest or new-card bonus (BR-03).

## 5.4 Anti-incentive guarantees (BR-03)

| Temptation the game must not create | How Ankicaster avoids it |
|---|---|
| Press Good instead of Again to keep a student's skill up | Skill falls when the interval falls, which is the honest outcome of a lapse, but mana is identical for every button and **no student, building or creature is ever harmed by a lapse**. The UI explicitly says "Lapses are part of learning — your student will relearn with you." There is no penalty event triggered by lapses. |
| Do more reviews to unlock things faster | Rewards scale linearly with honest reviews and nothing else. There are no review-count achievements, no daily review goals and no escalating multipliers. |
| Rush through reviews | No speed reward. Too-fast answers (< 0.8 s) earn nothing. |
| Add lots of cards to get more students | Adding cards earns nothing. More young cards only *permit* enrollment (BR-23); they do not grant mana or resources. The enrollment tracker never says "add more cards"; it says "students will be able to enroll as you learn new cards". |
| Use custom study / review-ahead to farm | Allowed (they are real reviews) but capped by check H6, and early reviews do not raise intervals much, so they cannot speed mastery. |
| Suspend or delete hard young cards to speed mastery | Handled by the linking rules in Section 9.6 (suspended cards stay linked; deleted cards are replaced by the next youngest free card). |

## 5.5 Where mana comes from in practice

1. **Live reviews on desktop:** detected through `gui_hooks.reviewer_did_answer_card`. The hook only records the card id and schedules a deferred revlog check (Section 38.6).
2. **Reviews done on other devices (AnkiMobile, AnkiDroid, AnkiWeb) after install:** these are honest post-install reviews. When the setting `count_reviews_from_other_devices` is on (default **on**), after each sync and on profile open the add-on scans the revlog for entries newer than the ledger watermark and newer than `install_ms`, applies H1–H7, grants mana and advances bells. A toast says "+370 mana from 37 reviews on other devices".
3. Nothing else. No potion, creature, event, spellbook or alumni bonus creates mana from nothing; they can only multiply honest review mana (capped at +25%) or reduce costs.

## 5.6 Undo

If the user presses Undo in the reviewer (`gui_hooks.review_did_undo`) or uses Edit → Undo, Anki removes the revlog entry. On the undo hook (and on every ledger reconciliation) the add-on checks whether each recently counted revlog id still exists. For each missing one it reverses exactly what that review granted: the mana, one review of progress on each session, construction, taming and expedition that the review advanced, and the bell counter. If the mana has already been spent, the shortfall becomes **mana debt** that is paid off from the next earnings; the bank never displays a negative number, and nothing already bought is taken back.

## 5.7 Mana sinks (overview)

| Sink | Typical size | Section |
|---|---|---|
| Wizard training sessions (orbs) | 80 × level (80–800 per level) | 7 |
| Grimoire study (spells) | 150–1,200 per spell | 29 |
| Construction | 25–2,500 per room | 15–16 |
| Furniture | 20–900 per item | 17 |
| Veil upkeep | ~40–900 per day depending on Academy size | 18 |
| Card draft | 120–600 per draw | 26 |
| Spell casting | 30–400 per cast | 29 |
| Rift expedition launch | 150–1,200 per expedition | 27 |
| Applicant board reroll | 100 | 12 |
| Recipe research, creature lures, misc. | 50–300 | 22, 24 |

## 5.8 Design purpose and tensions

The economy has one faucet and many sinks. The faucet is honest and linear; the fun is in allocation. Early on, nearly all mana goes into training and the first rooms. In the mid game the Veil becomes a meaningful fixed cost that makes the player think about Academy size, warding, and the Shadow school. Late game, the draft and the Rift absorb surplus. Because the Veil auto-pays while away only down to 10% of the bank (BR-26), a large bank is a buffer for holidays, not just a score.

# 6. Core Loops and the Shape of a Session

## 6.1 Nested loops

| Loop | Time scale | What happens | Player decisions |
|---|---|---|---|
| **A. Review loop** | Seconds | User answers an Anki card → honest-review check → +10 mana → every 10th review rings a **bell**. | None (the user just studies). |
| **B. Bell loop** | Every 10 reviews | Active training, constructions, taming and expeditions advance (they advance per review; bells just batch the UI). Needs decay and are serviced; gardens, plots and lessons produce; hazards, misbehavior and creature escape rolls happen; meals every 5th bell. | None in real time; outcomes queue as notices. |
| **C. Visit loop** | A 2–10 minute game visit, usually after a study session | Collect notices; queue training; start/finish builds; place furniture; enroll applicants; assign careers; brew; tame; resolve events; plan expeditions. | Almost all decisions live here. |
| **D. Day loop** | Each Anki day rollover | Veil upkeep is charged; intervals are refreshed from Anki; skill recomputed; mastery countdowns advance; retirements checked; applicant board refreshes; daily event roll. | Respond to the day's summary. |
| **E. Arc loop** | Weeks to months | First students (week 1), first creature (week 1–2), all five schools teachable (weeks 3–6), first master (weeks 6–10), the Rift (weeks 8–14), first retirement (months 4–7). | Long-term specialization and layout choices. |
| **F. Meta loop** | Terms / forever | Timed Term ends with a charter score, alumni, spellbook choice and reset; Endless School grows forever and earns spellbooks at milestones. | Mode choice; spellbook picks. |

## 6.2 Feedback structure

**Positive loops (growth):**

1. Reviews → mana → wizard levels → buffs (Arcane +mana, Alchemy −build cost) → more efficient spending.
2. Reviews → mana → rooms → more beds and seats → more students → more essences → more furniture and potions → higher room quality → better yields.
3. Real learning → mature intervals → masters → careers (gardeners, builders, alchemists…) → stronger production → more Academy.
4. Masters → the Rift → rare materials, blueprints, creatures and artifacts → late-game rooms.
5. Retirements → alumni bonuses → permanently easier future play.

**Negative loops (pressure, all gentle):**

1. Academy size → Veil upkeep (BR-24). Building more costs more every day.
2. More students → more food, beds, leisure needed → service shortfalls → lower morale → more misbehavior.
3. Unpaid or thin Veil → hazards and breaches → injuries and dirty rooms → healer and warder demand.
4. Faculty limit (BR-22) caps how many careers can run at once.
5. The enrollment tracker (BR-23) caps students by the user's own supply of young cards.
6. Draft prices rise with recent draws from the same deck.

## 6.3 The shape of a typical visit (mid game)

1. **Arrival summary** (modal card, dismissible): "Since your last visit: 142 reviews, +1,420 mana, 14 bells. Built: Common Room. Training: Nature 7 (61/175). Events: 2 waiting. Veil: Strong (paid 410)."
2. **Notices tray:** finished builds, mastery achieved, creature tamed, expedition returned, hazards resolved automatically, items waiting.
3. **Decide:** queue the next orb, place the furniture you drafted, enroll an applicant (tracker shows 63 free young cards, need 50), brew two Mending Draughts, answer an event.
4. **Leave something running:** a construction, a training session, a taming, maybe an expedition. The next study session will move all of them.

## 6.4 Illustrative first week (not measured data)

Day 1: the user installs, creates a witch named Hazel, and studies 140 cards. The first 8 reviews buy "Ponder the Verdant Orb" (Nature 1, 80 mana); it completes at review 33. By the end of the session Hazel is Nature 2 and halfway through Nature 3, and the user has placed a Vegetable Patch. Day 2: Nature 4 (finished at review 258 overall), a Dormitory is under construction, and a Mossback Tortoise wanders onto the grounds. Day 3: Nature 5 at review 383 overall. The Nature Classroom plan unlocks, the tracker shows 71 free young cards, and the first student, a gentle apprentice called Tamsin Reed, is linked to 50 of them. Day 6: two more students; a Refectory; Arcane training begins. Day 7: the first random event (an owl delivers a misaddressed letter).

# 7. The Player Wizard

## 7.1 Role and player goal

The wizard (or witch, or any title the player chooses) is the player's avatar and the first thing that grows. In the idle-style early game (BR-05) there are no students: the wizard ponders orbs, gains levels, and lays the first stones. Later the wizard becomes the Academy's headmaster: a stand-in teacher, a builder when no builders exist, a spellcaster for emergencies, and the source of the five school buffs that shape the whole economy.

## 7.2 Creation

On first launch the player creates their character (all choices changeable later in the Wizard screen except the founding date):

| Field | Options |
|---|---|
| Name | Free text, 1–24 characters |
| Title | Wizard, Witch, Mage, Sorcerer, Sorceress, Warlock, Magus, or custom |
| Pronouns | she/her, he/him, they/them, custom |
| Appearance | Body shape (4), skin tone (8), hair style (12), hair colour (10), robe colour (12), hat (8, including "no hat"), staff (6) |
| Sigil | Choose from 24 sigils; used as the Academy crest |
| Academy name | Free text, default "Ankicaster Academy" |
| Mode | Endless School (default) or Timed Term (Section 30) |

## 7.3 Training sessions (BR-06)

Training happens at the **Wizard's Study** (a pre-built room). There are two kinds of session:

| Session | What it trains | Cost | Completes after | Requirements |
|---|---|---|---|---|
| **Ponder an Orb** | +1 level in one school | **80 × n** mana for level n | **25 × n** honest reviews (BR-07) | Current level n−1 in that school; the school's Orb is on the Study's orb stand (all five Orbs are part of the starting kit). |
| **Study a Grimoire** | Learn one wizard spell | Listed per spell (Section 29), 150–1,200 mana | Listed per spell, 40–250 honest reviews | The grimoire item (from the draft, the Library, or the Rift) and the spell's school-level requirement. |

Rules:

1. **One active session at a time.** Only the active session advances; each honest review adds 1 progress point (Alchemy buffs do **not** affect training; nothing speeds training, so that BR-07's numbers always hold).
2. **Queue.** The Study holds a queue: 1 queued session at Study level 1, 2 at level 2, 4 at level 3. When the active session finishes, the next queued session starts automatically **if it is already paid**. Mana is paid when a session is queued.
3. **Pause and switch.** The player can pause the active session and start another; paused progress is kept forever (BR-04). There is no penalty for switching.
4. **Cancel.** Cancelling a session with zero progress refunds 100% of its mana. Cancelling a session with progress is not allowed (the player can pause instead), so mana and progress can never be lost.
5. **Completion** triggers a level-up animation in the Study and a toast ("Nature 6 — your gardens grow 3% more").
6. Breaks: sessions simply wait; nothing decays.

## 7.4 Level costs (BR-07)

| Level | Reviews needed | Cumulative reviews | Mana cost | Cumulative mana |
|---|---|---|---|---|
| 1 | 25 | 25 | 80 | 80 |
| 2 | 50 | 75 | 160 | 240 |
| 3 | 75 | 150 | 240 | 480 |
| 4 | 100 | 250 | 320 | 800 |
| 5 | 125 | 375 | 400 | 1,200 |
| 6 | 150 | 525 | 480 | 1,680 |
| 7 | 175 | 700 | 560 | 2,240 |
| 8 | 200 | 900 | 640 | 2,880 |
| 9 | 225 | 1,125 | 720 | 3,600 |
| 10 | 250 | 1,375 | 800 | 4,400 |

All five schools to level 10: 6,875 reviews and 22,000 mana.

## 7.5 What each level unlocks (per school)

| Level | Unlock |
|---|---|
| 1 | That school's **draft deck** opens (common cards). The school's tier-1 grimoire appears in the Library shop. |
| 2 | That school's **utility room standard plan**: Arcane → Library; Nature → Greenhouse; Light → Infirmary; Shadow → Warding Chamber; Alchemy → Alchemy Lab. |
| 3 | That school's **creature habitat** plan (Arcane → Crystal Vivarium; Nature → Meadow Paddock and Tide Tank; Light → Aviary; Shadow → Gloom Hutch; Alchemy → Ember Pit). Uncommon draft cards. Tier-2 grimoires. |
| 4 | Rare draft cards begin to appear. The school's **special room** blueprint can be drafted (Observatory, Menagerie, Sunlit Sanctum, Detention Hall, Workshop). |
| **5** | **Teaching unlocked (BR-08):** the school's **Classroom** standard plan; students can enroll in that school; masters of that school may take that school's careers; the wizard can personally teach one classroom of that school. Tier-3 grimoires. |
| 6 | First buff step (Section 7.6). |
| 7 | Buff step. That school's **Advanced Hall** blueprint can be drafted. Epic draft cards begin to appear. |
| 8 | Buff step. Tier-4 grimoires. |
| 9 | Buff step. Legendary draft cards can appear. |
| 10 | Buff step. Title **"Archmagus of [School]"** (cosmetic aura on the wizard sprite). The school's **capstone spell** grimoire becomes available. |

Wizard-wide unlocks by **total level** (sum across schools, 0–50):

| Total level | Unlock |
|---|---|
| 3 | Grounds expansion plan I (+4 plots) |
| 8 | Castle expansion plan I (+2 columns, +2 floors) |
| 15 | Study level 2 (queue 2) |
| 20 | Grounds expansion plan II (+4 plots) |
| 25 | Castle expansion plan II (+2 columns, +2 floors) |
| 30 | Study level 3 (queue 4) |
| 40 | Castle expansion plan III (+2 columns, +2 floors) |
| 50 | Title "Grand Magus"; final cosmetic tower spire |

## 7.6 Buffs at levels 6–10 (BR-09)

Each level from 6 to 10 adds one step. Five steps maximum per school.

| School | Per level (6–10) | At level 10 | Exactly what it modifies |
|---|---|---|---|
| Arcane | +2% mana | +10% mana | Multiplies honest-review mana (inside the +25% global cap). |
| Nature | +3% food, herbs and taming | +15% | Food output of plots/greenhouses/ponds/orchards; Herbs from all sources; taming progress per review (×1.15 at L10). |
| Light | +3% recovery and teaching | +15% | Recovery: injury healing speed and need recovery from service rooms. Teaching: teacher delay is multiplied by (1 − 0.03 × steps), and classroom essence yields +3% per step. |
| Shadow | −3% Veil cost, −3% hazards and misbehavior | −15% | Daily Veil upkeep; per-bell hazard chance; per-bell misbehavior chance. |
| Alchemy | −3% build time and materials, +3% potion yield | −15% / +15% | Reviews required for constructions and furniture crafting; material costs of rooms and furniture; potions produced per brew (fractional yield accumulates). |

Buff percentages are additive within a school and multiplicative with other sources unless stated in Appendix A.

## 7.7 The wizard's roles in the Academy

| Role | Rule |
|---|---|
| **Stand-in teacher** | For each school at L5+, the wizard can personally teach **one** classroom of that school. Wizard-taught students use the **wizard teaching delay**: `20 − 2 × (L − 5)` days (L5: 20, L10: 10), reduced by Light's teaching buff. |
| **Builder** | The wizard always occupies construction slot 1 and advances it at 1 point per honest review. |
| **Tamer of commons** | With Nature L3+, the wizard can tame common creatures at 50% speed when no tamer is free. |
| **Spellcaster** | The wizard casts known spells (Section 29) for mana. |
| **Headmaster** | The wizard's total level contributes to the faculty limit (Section 11.6). |

The wizard never gets injured, never misbehaves, and never goes through the Rift; they are the safe heart of the Academy.

## 7.8 Design purpose and tensions

Because BR-07 fixes training at 25×n reviews and only one session runs at a time, the wizard's full growth takes about 6,875 reviews (roughly 7 weeks at 150 reviews a day if the player trains continuously and can afford it). In practice mana competes with construction and the Veil, so most players will finish their fifth school in months 2–3, about when the first masters appear. The key early decision is order: Nature first (food and taming), Alchemy first (cheaper building), Arcane first (mana), Shadow first (cheaper Veil) or Light first (faster teaching). The tutorial recommends Nature first but does not enforce it.

# 8. The Five Schools of Magic

## 8.1 Overview

| School | Theme | Colour | Essence produced by lessons | Careers | Utility room (L2) | Habitat (L3) | Special room (L4 draft) |
|---|---|---|---|---|---|---|---|
| **Arcane** | Stars, glyphs, time and pure magic | Deep violet and silver | **Insight** | Scholar | Library | Crystal Vivarium | Observatory |
| **Nature** | Growth, beasts, weather | Moss green and amber | **Herbs** | Gardener, Tamer | Greenhouse | Meadow Paddock, Tide Tank | Menagerie |
| **Light** | Healing, courage, warmth | Gold and white | **Radiance** | Healer | Infirmary | Aviary | Sunlit Sanctum |
| **Shadow** | Wards, secrets, discipline, night | Indigo and teal | **Umbra** | Warder | Warding Chamber | Gloom Hutch | Detention Hall |
| **Alchemy** | Transmutation, craft, potions | Copper and vermilion | **Reagents** | Alchemist, Builder | Alchemy Lab | Ember Pit | Workshop |

**Teacher** and **Adventurer** careers are available from every school.

## 8.2 School identities

**Arcane** is the economist's school. Its wizard buff is the only mana multiplier; its essence (Insight) powers draft rerolls, recipe research and spell study discounts; scholars run the Library and Observatory, giving foresight on events and extra Rift Fortune (never better odds). Arcane creatures tend to manipulate luck and information.

**Nature** is the provider. Its buff feeds people and creatures and speeds taming; gardeners and tamers keep the Academy fed and collect the largest share of the bestiary. Herbs are the most common potion ingredient.

**Light** is the carer. Its buff shortens teacher delay and speeds recovery; healers run the Infirmary and make injuries trivial; Radiance improves morale-oriented furniture and sanctum rituals. Light is the school that makes mastery arrive sooner once cards are mature.

**Shadow** is the guardian. Its buff is the only one that reduces the Veil's daily cost, and it suppresses hazards and misbehavior. Warders reinforce the Veil and handle breaches. Umbra is used for wards and some potent potions.

**Alchemy** is the maker. Its buff cuts build time and material costs and raises potion yields; alchemists brew, builders add construction slots and maintain cleanliness. Reagents appear in most furniture recipes beyond the basics.

## 8.3 Lessons and essence yields

Each student enrolled in a school and seated in a **staffed** classroom of that school produces essence every bell:

`essence_per_bell = 0.20 × room_efficiency × morale_factor × (1 + teaching_buff)`

where `morale_factor` is 0.6 at morale 0 rising linearly to 1.2 at morale 100 (Section 14.6). A full basic classroom (5 students, efficiency 1.0, morale 70) yields about 1.0 essence per bell — roughly 15 per day at 150 reviews. Advanced Halls yield ×1.5.

Lessons never affect skill or mastery: those come only from card intervals (BR-14 to BR-16). Lessons are how students contribute to the *game* economy while their real cards mature.

## 8.4 Cross-school synergies (design intent)

| Pair | Synergy |
|---|---|
| Nature + Alchemy | Herbs + Reagents are the two most common potion inputs; gardeners feed the alchemy lab. |
| Shadow + Arcane | Wards and foresight: Observatory warnings let warders pre-empt hazards. |
| Light + Nature | Healers and tamers: injured creatures and students recover in the same Infirmary wing. |
| Alchemy + Arcane | Cheaper buildings plus Insight-driven draft rerolls make the best layouts. |
| Light + Shadow | Morale plus Order: the lowest-misbehavior combination. |

# 9. Students and Card Linking

## 9.1 Role and player goal

Students are the emotional centre of Ankicaster: each one is a little person whose growth is literally the growth of a slice of the user's memory. The player's goal is to enroll students when the Academy can house and seat them, keep them well (needs, morale), and watch them become masters as their linked cards mature.

## 9.2 Card sets

Every character holds one or more **card sets**:

| Set kind | Size | Created when | Used for |
|---|---|---|---|
| **Study set** (one per school enrolled) | `cards_per_student` (setting, default **50**, applies to **all** students, BR-12) | The character enrolls in a school | Skill and mastery of that school |
| **Career set** (one per career ever taken) | **20** (BR-18) | The character takes a career | Career proficiency; teacher delay if the career is Teacher |

**Card age is the review interval** (BR-14), read from Anki. For each linked card the game uses the **honest interval**:

`honest_ivl = max(0, min(cards.ivl, last_answer_ivl))`

- `cards.ivl` is the card's current interval in days (0 for new and learning cards).
- `last_answer_ivl` is the `revlog.ivl` of the card's most recent revlog entry of type 0–3 (a real answer); negative values (seconds, used for learning steps) count as 0.
- The `min` means intervals stretched by manual rescheduling tools ("set due date", bulk reschedules) do not count until the card is genuinely answered at that interval, while intervals *shortened* by rescheduling are respected. This is a read-only calculation and is controlled by the setting `honest_intervals_only` (default on).

## 9.3 Eligible and free cards

A card is **eligible** for linking when all of these hold:

1. It belongs to a deck inside the linking scope (setting `deck_scope`: "all decks" by default, or a list of deck ids; subdecks included).
2. It is not suspended (`queue != -1`). Buried cards are eligible (burying is temporary).
3. It has been studied at least once (`type` in 1 learning, 2 review, 3 relearning). New, never-studied cards are excluded unless the setting `link_new_cards` is on (default off), because a student bound to cards the user has not started would be stuck.
4. It is not already linked to any character (BR-13). A card is linked to at most one character and one set at a time.

A **free young card** is an eligible card with `honest_ivl ≤ young_threshold_days` (default 30).

## 9.4 The linking algorithm ("youngest free cards")

```
function pick_youngest_free(n, require_young):
    candidates = eligible cards not in card_links
    if require_young: candidates = candidates where honest_ivl <= young_threshold_days
    order candidates by honest_ivl ascending,
                        then by first_studied_at descending (most recently started first),
                        then by card id ascending (stable tie-break)
    if avoid_siblings (setting, default on):
        walk the ordered list, skipping a card if another card of the same note
        is already chosen for this set, unless skipping would leave fewer than n
    return the first n cards
```

- **Students** (study sets) use `require_young = true`. If fewer than `n` free young cards exist, enrollment is blocked (BR-23); partial sets are never created.
- **Careers** take the 20 youngest free cards (BR-18): first `require_young = true`; if fewer than 20 free young cards exist, the remaining slots fall back to the youngest free older cards (`require_young = false`). The fallback is shown on the career screen ("12 young + 8 older cards").
- **Changing `cards_per_student`** applies to every student (BR-12), not just new ones. At the next day tick, each current study set is resized. When the number rises, each set is topped up with the youngest free young cards; if there are not enough, the set fills as cards become free, and the enrollment tracker shows the shortfall. When it falls, each set releases its most recently linked cards. Master titles already earned are permanent (BR-17). A student who was not yet a master is re-checked against the new set size.
- Linking is done in a single database transaction in the add-on's own save file; the Anki collection is only read.

## 9.5 Refreshing intervals

Intervals are read in bulk with read-only SQL (`SELECT id, ivl, type, queue, nid FROM cards WHERE id IN (...)`, chunked 500 ids at a time) and the latest real answer per card from the revlog. Refresh happens:

- at every day tick,
- when the game window opens (if the last refresh is more than 10 minutes old),
- for the single answered card right after each honest review (cheap, deferred),
- after a sync.

The result is cached in `card_links.cached_ivl` with a timestamp; the UI never queries Anki directly.

## 9.6 Special cases (deleted, suspended, reset, moved)

| Situation | Detection | Rule | Why |
|---|---|---|---|
| **Card deleted** | Linked id missing from `cards` at refresh | Link marked `missing`. At the next day tick it is replaced by the youngest free young card (students) or youngest free card (careers). Until replaced, the slot counts as interval 0. If no replacement exists, the slot waits and the UI shows "1 slot waiting for a card". | Deleting cards never speeds mastery or retirement, and never deletes the character. |
| **Card suspended** | `queue == -1` | Stays linked and counts at its current honest interval. If it remains suspended for more than `suspended_release_days` (default 30) it is released and replaced as for deleted cards. The UI shows a moon icon on suspended links. | Suspending hard cards cannot speed anything up; long-term suspension frees the slot so the character is never stuck forever. |
| **Card reset / forgotten** | `type == 0` or interval drops to 0 | Stays linked; skill falls honestly. If the card stays new (never re-studied) for more than 30 days it is released and replaced. | Honest; never punitive. |
| **Card moved to another deck** | — | Stays linked. Deck scope applies only to new links. | Reorganising decks never disturbs students. |
| **Card rescheduled manually** | Revlog entry of type outside 0–3 | Honest-interval rule (Section 9.2) applies. | Prevents instant mastery by "set due date". |
| **Note type changed / card regenerated with a new id** | Old id missing | Treated as deleted. | Simple and safe. |
| **Collection fully replaced (full sync download, restore backup)** | Many links missing at once (>25% of all links) | The game pauses replacement, shows a dialog: "Many linked cards are missing. If you restored a backup or are mid-sync, choose Wait. Choose Relink to replace them." Nothing is deleted either way. | Prevents mass relinking during a temporary state. |
| **Manual swap** | Player action on the character card | The player may release a **suspended, missing or new** card in exchange for the youngest free young card. Mature cards cannot be swapped. | Gives control without enabling exploits. |

## 9.7 Student identity

| Attribute | Notes |
|---|---|
| Name | Generated from a fantasy name list (given name + family name); editable |
| Appearance | Generated sprite parameters (body, skin, hair, robe trim in their school's colour, accessory) |
| Personality | One of eight (Section 14.2) |
| Traits | 1–3 traits (Section 14.3) |
| School(s) | Current study school; mastered schools |
| Card sets | Study and career sets with live skill bars |
| Needs | Hunger, Rest, Leisure, Health, Composure (0–100) |
| Morale | Derived from needs and modifiers |
| Assignments | Bed, classroom seat, workplace (if faculty), expedition (if adventurer) |
| Status | Student, Master (resident), Faculty, Away (Rift), Injured, Alumnus |
| History | Enrolled day, mastery days, career history, notable events (a short chronicle) |

The character card in the Roster shows the study set as a **"constellation"** of 50 small dots, each dot coloured by the linked card's interval (grey = learning, then a gradient to gold at 30+ days). Hovering a dot shows the card's front text (first 60 characters, read-only) and interval, so the user can see *which* of their cards the student is struggling with.

## 9.8 Design purpose and tensions

Linking to the *youngest* free cards means every new student is genuinely a beginner and mirrors what the user is learning *right now*. Because cards are never shared, the user's supply of young cards (not their review count) is the natural limit on how many students the Academy can hold, and the enrollment tracker makes that limit visible and fair. Enrollment needs no extra effort from the user beyond normal study.

# 10. Skill, Mastery and the Master Title

## 10.1 Skill (BR-15)

For each card set:

`skill = round(100 × mean over slots of min(honest_ivl, 30) / 30)`

Missing slots count as 0. Skill therefore rises as intervals grow and **falls when a lapse shortens a card's interval**, exactly mirroring the user's real memory. There is no other input: no game item, potion, spell or creature changes skill.

| Skill | Band | Sprite cue |
|---|---|---|
| 0–19 | Novice | Plain robe, L-plate badge |
| 20–39 | Apprentice | Robe trim |
| 40–59 | Journeyman | Sash |
| 60–79 | Adept | Cape |
| 80–99 | Expert | Glowing trim |
| Ready | Mastery-ready (all cards > 30 days) | Sparkling outline; countdown badge |

A second, thinner bar shows **seasoning**: `round(100 × mean(min(honest_ivl, retirement_age) / retirement_age))` across **all** of the character's cards. It shows progress toward retirement (Section 13).

**Lapse messaging.** When a linked card lapses, the character's bubble shows a gentle line ("Oops — I'll get that one next time!") at most once per character per day. The game never shows a red warning, never removes anything, and never asks the user to avoid pressing Again.

## 10.2 Mastery-ready

A student is **mastery-ready** in a school when **every** slot of that study set is filled and has `honest_ivl > 30` days (strictly over 30, BR-16). With default Anki settings this is usually 5–9 weeks after the youngest card was first studied, longer if cards lapse.

## 10.3 Teacher delay (BR-16)

Mastery also requires waiting a **teacher delay** in real days after becoming ready.

| Who teaches the student | Delay formula (days) |
|---|---|
| A **Teacher** (career) | `max(0, 30 − mean(honest_ivl of the teacher's 20 teaching cards))`; **0 once all 20 teaching cards are over 30 days** |
| The **wizard** (stand-in) | `20 − 2 × (L − 5)` where L is the wizard's level in that school (20 at L5, 10 at L10) |
| Nobody (unstaffed classroom) | 30 |

Then the Light teaching buff applies: `delay × (1 − 0.03 × light_steps)`, rounded **up** to whole days (Light L10 → ×0.85).

The teacher's 20 teaching cards are that teacher's **career set** for the Teacher career. A brand-new teacher has young teaching cards, so their delay starts near 30 days and shrinks as *their* cards mature: experienced teachers really do graduate students faster.

## 10.4 Mastery countdown

At each day tick, for each student:

```
if mastery_ready(student, school):
    student.ready_days += elapsed_days       # real days since the last tick (usually 1)
    D = current_teacher_delay(student)        # recomputed daily
    if student.ready_days >= ceil(D):
        grant_mastery(student, school)
else:
    pass                                      # ready_days is kept (paused), never reset
```

- `ready_days` **pauses** (does not reset) if a lapse makes the student not-ready; it resumes when they are ready again. This is the gentle reading of the concept: a lapse costs time, never past progress.
- Away days count as real days. Intervals do not change while the user is away, so a student who was ready when the user left keeps counting toward mastery.
- If the teacher changes, the next day's D uses the new teacher.

## 10.5 The master title (BR-17)

On mastery the student gains the title **Master of [School]** permanently. A later lapse never removes it. The ceremony is a short scene in the Entrance Hall (robes change colour, the crest above the door gets a new star). Effects:

| Effect | Value |
|---|---|
| Renown | +10 |
| Counts toward the Rift's 3-master threshold (BR-27) | Yes (counts characters, not titles) |
| Career eligibility | That school's careers + Teacher + Adventurer |
| Resident tutor bonus (if no career) | +5% essence yield to that school's classrooms, up to 3 tutors per school |
| Study set | Stays linked and keeps maturing toward retirement |

Multi-school titles: 2 schools "Double Master", 3 "Triple Master", 4 "Grand Master", 5 "Paragon". A Paragon adds +1 Rift Fortune to any expedition they join (Section 27.9; Fortune never changes the odds).

## 10.6 After mastery: options

1. **Take a career** (Section 11) if the faculty limit allows.
2. **Enroll in a second school** (Section 12.6): adds a fresh 50-card study set (BR-20).
3. **Remain a resident master** (tutor bonus, can still be an adventurer later).

# 11. Careers and Faculty

## 11.1 Role and player goal

Masters become the Academy's workforce. Careers are the mid-game engine: each one automates or boosts a system (teaching, food, creatures, healing, wards, potions, construction, expeditions). The player's goal is to pick careers that fix their current bottleneck while staying within the faculty limit.

## 11.2 Taking a career (BR-18)

Requirements: the character is a master of a qualifying school; the faculty limit (Section 11.6) has room; a workplace slot of the right kind exists; a faculty bed is free (Faculty Quarters). On acceptance the character gains a **career set of the 20 youngest free cards** (BR-18): the youngest free *young* cards (honest interval ≤ 30 days) are taken first, and only if there are not 20 free young cards does the set fall back to the youngest free older cards. If fewer than 20 free cards exist at all, the career cannot start (the career screen says how many are free, and how many of them are young).

## 11.3 Career proficiency

Each career's output is scaled by the skill of its own career set:

`proficiency_factor = 0.75 + 0.5 × career_skill / 100` (0.75 at skill 0, 1.25 at skill 100)

So new faculty work at three-quarters strength and improve as their 20 cards mature. For Teachers, career skill also drives teacher delay (Section 10.3).

## 11.4 Career catalog

| Career | Qualifying school(s) | Workplace | Slots per workplace | Effect (at proficiency 1.0) |
|---|---|---|---|---|
| **Teacher** | Any mastered school (teaches that school) | Classroom or Advanced Hall of that school | 1 | Staffs the classroom (full essence yield, ×0.5 when unstaffed). Students in that room use this teacher's delay. +5% room efficiency at career skill 100. |
| **Scholar** | Arcane | Library, Observatory, Scriptorium | 2 / 1 / 1 | +1 Insight per bell (Library); event foresight and +1 Rift Fortune per scholar in an Observatory (max 2); crafts scrolls (Scriptorium); −10% recipe research cost per scholar (max −30%). |
| **Gardener** | Nature | Greenhouse (1), or up to 3 garden plots | 1 | +50% output of the assigned greenhouse or plots; unlocks Rare Seed crops; reduces wild-growth hazard on assigned rooms by 50%. |
| **Tamer** | Nature | Any creature habitat or the Menagerie | 1 per 2 habitats | Tames creatures (Section 22.4) at 1.0 progress per review; −50% escape chance in assigned habitats; recaptures escaped creatures. |
| **Healer** | Light | Infirmary, Sunlit Sanctum | 1 per infirmary, 1 per sanctum | Heals injuries at ×2 speed; cures Hexed injuries; +1 Composure per bell to everyone in the Sanctum. |
| **Warder** | Shadow | Warding Chamber, Detention Hall | 1 / 1 | +5 Veil strength per active day; Veil cost −3% each (max 3 warders); −10% hazard and misbehavior chance each (max −40% combined); auto-resolves breaches; supervises Detention. |
| **Alchemist** | Alchemy | Alchemy Lab | 1 | Required to brew advanced potions; brewing time ×0.5; −50% lab explosion chance; +1 potion per 4 brews. |
| **Builder** | Alchemy | Workshop | 2 | Adds one construction slot each (max 4 slots including the wizard's); a builder's slot advances 1.25 per review; idle builders clean 4 cleanliness per bell across the Academy. |
| **Adventurer** | Any (BR-11) | Training Yard (resting), the Rift (on expedition) | 3 per yard | Goes on Rift expeditions (Section 27). The mean interval of the adventurer's 20 career cards is their **Rift skill** in days, which sets the odds against each destination's skill requirement. Drilled teams get +1 Rift Fortune per Training Yard level. |

## 11.5 Career switching (BR-19)

- Only **masters of two or more schools** may switch to a different career.
- **Old career cards are kept.** The character keeps every career set they have ever had (they keep maturing toward retirement), and the new career adds a new set of 20.
- Masters of a single school may take a **sabbatical** (leave their workplace, stay faculty-housed) and later **resume the same career** with the same set; they may not take a different career.
- Switching is instant and free in mana; its real cost is 20 more cards bound to the character, which also delays that character's retirement.

## 11.6 Faculty limit (BR-22)

The number of characters holding active careers may not exceed:

`faculty_limit = min(A, B, C, D)`

| Term | Source | Formula |
|---|---|---|
| A | Wizard levels | `1 + floor(total_wizard_levels / 4)` (max 13 at total 50) |
| B | Housing | Faculty beds (2 per Faculty Quarters, +1 per level above 1) |
| C | Classrooms | `1 + 2 × number_of_classrooms` (basic and advanced halls of any school) |
| D | Student count | `1 + floor(current_students / 3)` |

The Faculty panel shows all four terms, highlights the smallest, and explains it ("Your limit is 3 because you have 6 students. Each 3 students support one more faculty member."). Workplace slots are a separate, per-career constraint.

## 11.7 Design purpose and tensions

Careers convert matured memory into automation, but each career binds 20 more cards to a character, delaying their retirement and using up free cards that could have enrolled students. The faculty limit stops the Academy from becoming all staff and no students. Teachers are the most important early career because they unlock more classrooms' full yields and, as their cards mature, shrink teacher delay to zero.

# 12. Enrollment, Recruitment and the Enrollment Tracker

## 12.1 Role and player goal

Recruitment is where the Academy grows. The player chooses which applicants to admit into which school, within the limits of beds, seats, and, above all, the user's supply of free young cards.

## 12.2 Requirements to enroll a new student in school X

| # | Requirement | Shown in |
|---|---|---|
| 1 | Wizard level 5 in X (BR-08) | Recruitment screen tab is locked otherwise |
| 2 | At least `cards_per_student` (50) **free young cards** (BR-23) | Enrollment tracker |
| 3 | A free student bed (Dormitory or Grand Dormitory) | Capacity chip |
| 4 | A free seat in a classroom of school X | Capacity chip |
| 5 | 60 mana ("robes, wand and a welcome cake") | Button |

## 12.3 The enrollment tracker (BR-23)

The tracker is a permanent widget at the top of the Recruitment screen and a small chip on the Academy map:

```
 Free young cards   63 / 50 needed   ✔ one student can enroll
 ───────────────────────────────────────────────
  Eligible young cards (≤30 d) .......... 412
  Linked to characters .................. 349
  Free young cards ...................... 63
  Beds free 2 · Arcane seats free 1 · Nature seats free 3
```

- When free young cards < 50, the Enroll buttons are disabled and the tracker reads, for example: **"38 / 50 free young cards. New students can enroll when more of your cards are in their first month."** It never suggests adding cards (BR-03).
- The tracker recalculates on window open, after each day tick, and after linking/unlinking.
- Clicking the tracker opens a breakdown by deck (read-only), so the user understands which decks feed enrollment.

## 12.4 The applicant board

At each day tick the board offers **3 applicants per teachable school** (max 15). Each applicant shows: name, portrait, personality, traits (1–3), a one-line backstory, and a "fit" hint (e.g., "Would love a Greenhouse"). Unchosen applicants leave at the next day tick (no penalty). The player may **reroll** one school's applicants for 100 mana (or 15 Insight). Renown (Section 32.4) improves applicant quality: at higher Renown, more applicants have positive traits and fewer have troublesome ones.

Applicant trait roll weights:

| Renown | Positive traits | Neutral/quirky | Troublesome |
|---|---|---|---|
| 0–49 | 40% | 35% | 25% |
| 50–149 | 50% | 32% | 18% |
| 150–299 | 58% | 30% | 12% |
| 300+ | 65% | 28% | 7% |

## 12.5 Seating and beds

- A student occupies **one bed** and **one seat** in a classroom of their current study school. If a classroom is demolished or locked by a hazard, students keep their enrollment and are "between rooms" (their essence yield is 0 until reseated; nothing else is affected).
- Beds and seats are auto-assigned (nearest free), and the player can drag a student to another seat/bed in the Roster.

## 12.6 Second-school enrollment (BR-20)

A character who is a master of at least one school may enroll in another teachable school. This adds a **fresh study set of 50 free young cards** (the same tracker check applies) and requires a seat in that school's classroom. They keep their bed (student dorm or faculty bed) and any career. A character studies at most one new school at a time.

## 12.7 Design purpose and tensions

Enrollment is self-limiting in a way that reflects real study: an Academy can only hold as many beginners as the user is genuinely beginning. Users who add few new cards will have a smaller, older, more masterful Academy; users who learn lots of new material will run a bustling school. Both are valid. Beds and seats make construction choices matter; the applicant board adds personality and choice.

# 13. Retirement and Alumni

## 13.1 Rule (BR-21)

A character **retires** when **every card in every one of their card sets** has `honest_ivl > retirement_age_days` (setting, default **90**). The check runs at each day tick. Retirement is automatic and celebratory, not a loss.

## 13.2 What happens on retirement

1. A farewell scene in the Entrance Hall; the character's portrait is hung in the **Alumni Gallery** (a panel of the Roster, and a decor wall in the Trophy Hall if built).
2. All of their card links are **released** (the cards become free; being mature, they will not count as young).
3. Their bed, seat and workplace free up.
4. The Academy gains an **alumni bonus** chosen from that character's history (Section 31.3) and +5 Renown.
5. The alumnus is kept forever in the save (name, portrait, titles, chronicle). In a Timed Term, alumni bonuses carry over (BR-30).

## 13.3 Alumni visits

Each day tick there is a 3% chance (max one per day) that an alumnus visits, bringing a small gift linked to their career (e.g., a retired gardener brings 20 Greens and a Rare Seed; a retired adventurer brings a Rift map fragment). Visits are pure upside.

## 13.4 Expected timing

With default Anki settings, a card typically passes 90 days about 4–6 months after first being studied, so a student who never takes a career can retire around months 5–8 after enrollment; faculty retire later because their career sets are younger. A retirement-age setting of 60 makes retirements more frequent; 180 makes them rarer and grander (the alumni bonus is scaled by `retirement_age / 90`, clamped 0.67–2.0, so the setting is a style choice rather than an exploit).

# 14. Student Traits, Personalities and Needs

## 14.1 Role and player goal

Personalities and traits make each student a character; needs make the Academy a place. Needs never affect skill or mastery (those are card intervals only). They affect **morale**, which drives essence yields, misbehavior, career output and Rift odds. The player's goal is to keep services ahead of headcount and to place the right furniture for the right people.

## 14.2 Personalities (one per character)

| Personality | Flavour | Need modifiers | Misbehavior × | Loves (morale +5 if the Academy has it) | Dislikes (morale −5 when adjacent/assigned) | Rift note |
|---|---|---|---|---|---|---|
| **Bookish** | Lives in the stacks | Leisure decays ×0.8 if a Library exists | ×0.6 | Library | Noisy rooms (Workshop next to dorm) | +1 Rift Fortune at the Crystal Caverns |
| **Mischievous** | Pranks with a heart of gold | Leisure decays ×1.3 | ×2.0 | Common Room | Detention Hall | +1 Rift Fortune at the Shattered Spire |
| **Gentle** | Soft-spoken, loved by animals | Composure decays ×0.8 | ×0.7 | Any creature habitat | Training Yard | +4 taming speed as tamer |
| **Bold** | First through any door | Rest decays ×1.2 | ×1.2 | Training Yard | Bare rooms (quality tier Bare) | +1 Rift Fortune on every expedition |
| **Dreamy** | Head in the clouds | Hunger decays ×0.9 | ×0.9 | Observatory | Windowless rooms (no Glass furniture) | +1 Rift Fortune at the Whispering Fen |
| **Steadfast** | Calm and reliable | All needs ×0.9 | ×0.5 | Sanctum | — | Recovers from Rift injuries 25% faster |
| **Social** | Knows everyone | Leisure decays ×1.2; Composure ×0.8 when Common Room exists | ×1.1 | Common Room, Refectory | Dorms below Cozy | +2 team bonus when in a team of 3 |
| **Curious** | Pokes everything | Composure decays ×1.1 | ×1.3 | Alchemy Lab, Menagerie | — | +1 Rift Fortune at Mossy Hollow and the Ashen Wastes |

## 14.3 Traits (1–3 per character)

**Positive**

| Trait | Effect |
|---|---|
| Green Thumb | +20% output when gardener or when seated in a Nature room |
| Beast Whisperer | +25% taming speed; creatures on their floor escape 30% less |
| Night Owl | Rest decays 20% slower; +5% hazard detection (hazards on their floor resolve faster) |
| Tidy | Rooms they use lose cleanliness 30% slower |
| Brave | +1 Rift Fortune as adventurer; all injuries heal 15% faster |
| Kind Heart | +3 Composure per bell to roommates (dorm) |
| Iron Stomach | Hunger decays 30% slower |
| Lucky | +1 loot roll on successful expeditions; −20% chance of being hit by hazards |
| Quick Hands | Builder or alchemist output +15% |
| Steady Hand | Alchemy Lab explosion chance −50% when present |
| Sunny | +5 morale; +2 Composure per bell to classmates |
| Warded | Immune to Hexed injuries |
| Star-Touched | +10% Insight yield; Observatory foresight +1 day |
| Well-Read | +10% essence yield in any classroom with a Bookshelf |
| Hardy | Healing time −30% |

**Neutral / quirky**

| Trait | Effect |
|---|---|
| Collector | Occasionally (2%/day) brings back a trinket (random common material) |
| Early Riser | Rest decays faster (×1.1) but Leisure slower (×0.9) |
| Picky Eater | Needs a Kitchen for full Hunger recovery (else target −20) |
| Homesick | −5 morale for the first 7 days after enrolling; +5 after 30 days |
| Chatterbox | +Leisure for roommates, −Focus (−2 room Focus) in classrooms |
| Animal Allergy | −5 Composure when a creature habitat is adjacent to their dorm |
| Cat Person / Bird Person / Bug Person | +10 morale with that creature family present, −3 otherwise |
| Show-off | +1 Rift Fortune in a team of 3, −1 alone |
| Sleepwalker | 1% per bell to wander into a random room (harmless; small Composure loss to roommates) |

**Troublesome**

| Trait | Effect |
|---|---|
| Prankster | Misbehavior ×1.5; pranks are funnier (event text) and slightly messier |
| Firebug | Alchemy Lab and Kitchen fire hazard ×2 when present |
| Lazy | Essence yield −15%; Rest decays slower |
| Glutton | Eats 2 Provisions per meal |
| Butterfingers | 3% per bell to break a fragile furniture item (it becomes "Damaged", −50% stats until repaired for 25% of its cost; never destroyed) |
| Nervous | Composure decays ×1.4; −1 Rift Fortune |
| Loudmouth | −5 Composure to roommates when morale < 40 |
| Rule-Bender | Detention Hall effects ×0.5; misbehavior ×1.3 |
| Summoner-at-Heart | 0.3% per bell to open an unauthorized minor portal (a hazard) |
| Daredevil | +1 Rift Fortune, but recovers from Rift injuries 25% slower |

Traits may be gained or lost through events, Detention Hall rehabilitation, the Sunlit Sanctum, certain furniture and spells (each source states which).

## 14.4 Needs

All characters except the wizard have five needs, each 0–100.

| Need | Served by | Target value when served | Target when not served |
|---|---|---|---|
| **Hunger** | Refectory seats + 1 Provision per character per meal (every 5 bells) | 100 (110 with Kitchen "Hearty" meals, capped 100 but grants Well-Fed) | 25 (no food) / 50 (food but no seat — eating standing) |
| **Rest** | A bed (Dormitory, Grand Dormitory, Faculty Quarters) | `55 + 45 × min(1, (room_efficiency − 0.5))` | 25 (no bed) |
| **Leisure** | Common Room, Faculty Lounge, Bathhouse, Orchard, decor Charm | `30 + 70 × min(1, leisure_capacity / headcount)` | 30 |
| **Composure** | Sanctum, Bathhouse, Charm, creatures, a strong Veil | `60 + sanctum_bonus (≤ +15) + charm_bonus (≤ +20) + creature_bonus (≤ +10) + veil_modifier (0 / −10 / −20 / −35)` | — |
| **Health** | Baseline 100; reduced by injuries (Section 23) | 100 | Capped by injury severity |

**Update rule each bell:** `need += (target − need) × 0.25 − decay × personality_multiplier × trait_multipliers`, where base decay is Hunger 4, Rest 3, Leisure 3, Composure 1 per bell (Health has no decay). Values are clamped 0–100.

**Meals:** every 5th bell. Refectory meal capacity = seats × 2 (two sittings). Provisions are consumed first-come (faculty and students alike). If Provisions run short, the shortfall characters get the "no food" target until the next meal. Nobody ever starves to death or leaves; hunger only lowers morale.

**Creatures** have their own food rules (Section 22).

## 14.5 Need-state labels (for UI)

| Range | Hunger | Rest | Leisure | Composure |
|---|---|---|---|---|
| 80–100 | Well-fed | Rested | Cheerful | Serene |
| 50–79 | Fine | Fine | Fine | Steady |
| 25–49 | Peckish | Tired | Bored | Jittery |
| 0–24 | Hungry | Exhausted | Restless | Rattled |

## 14.6 Morale

`morale = 0.25 Hunger + 0.25 Rest + 0.20 Leisure + 0.20 Composure + 0.10 Health + personality_loves_bonus + trait_modifiers` (clamped 0–100).

| Morale | Essence yield factor | Misbehavior × | Career output × | Rift modifier |
|---|---|---|---|---|
| 0–29 | 0.6–0.8 (linear) | ×2.0 | ×0.85 | −5 |
| 30–59 | 0.8–1.0 | ×1.25 | ×1.0 | 0 |
| 60–79 | 1.0–1.1 | ×1.0 | ×1.0 | 0 |
| 80–100 | 1.1–1.2 | ×0.6 | ×1.05 | +5 |

## 14.7 Away behaviour

Needs **do not tick** on days without reviews (no bells ring). When the user returns, needs are exactly as they were. This is the "the school sleeps under the Veil" rule (BR-04).

# 15. The School Map, Construction and Room Quality

## 15.1 Role and player goal

Construction is where mana becomes something you can see. The Academy is a side-on cross-section castle (rooms stacked on floors) plus a strip of outdoor grounds. The player's goal is a connected, compact Academy where every room is reachable, services sit near the people who use them, special rooms get the sky or ground they need, and furniture lifts rooms from Bare to Splendid, all without letting the Veil's daily cost run away.

## 15.2 The grid

| Area | Start size | Expansions | Maximum |
|---|---|---|---|
| **Castle** (cross-section) | 8 columns × 5 floors (floor 0 = ground) | +2 columns and +2 floors at wizard total level 8, 25 and 40 (Castle Expansion plans I–III; each costs mana and Stone, see 33.5) | 14 columns × 11 floors |
| **Grounds** (outdoor strip, left and right of the castle) | 6 plots | +4 plots at total level 3 and 20; +2 per "Land Grant" draft card (max 2 cards) | 18 plots |

The starting Academy is pre-built: **Entrance Hall** (floor 0, columns 3–4), **Wizard's Study** (column 5, floors 0–1, with an internal stair), one **Spiral Stair** (column 2, floor 0), a **Storage Vault** (column 1, floor 0), and on the grounds a **Vegetable Patch** and a **Woodlot**.

## 15.3 Placement rules

| ID | Rule | Detail |
|---|---|---|
| P1 | Bounds | All tiles inside the current grid. Grounds rooms only on plots; castle rooms only in the castle. |
| P2 | Free tiles | No overlap with rooms or construction sites. |
| P3 | Support | Every tile of the room's bottom row is on floor 0 or directly above an occupied tile (a room, construction site or **Support Pillar**). |
| P4 | Connection | A castle room must share a vertical wall edge with a reachable room on the same floor, **or** be a Spiral Stair stacked on/under a reachable stair. Rooms that fail P4 can still be built but show **Unreachable** and run at 0% until connected. |
| P5 | Sky access | Rooms flagged `needs_sky` (Greenhouse, Observatory, Aviary) must have nothing above any of their tiles, now or later. The build tool blocks placing anything over them. |
| P6 | Floor limits | Some rooms are restricted: Tide Tank floor 0 only; Ember Pit floors 0–1; Observatory must be on the highest built floor of its column when placed. |
| P7 | Grounds | Plots are always reachable (the grounds path connects to the Entrance Hall). Multi-plot rooms need adjacent plots. |

**Reachability** is computed by BFS from the Entrance Hall: same-floor rooms that share a wall edge are linked; vertical travel happens only through stacked Spiral Stairs (the Wizard's Study's internal stair links floors 0–1 of its column). Distance in BFS steps is used by some adjacency and service rules (Section 15.9).

## 15.4 Construction flow (BR-28: blueprint + materials + mana + build time in reviews)

1. **Choose a blueprint** from the Build menu: a **standard plan** (always available once unlocked, unlimited uses) or a **blueprint draft card** from the player's hand (consumed on placement).
2. **Place a ghost** on the grid; the tool shows rule violations in red and adjacency effects in green/orange.
3. **Confirm**: pay mana and materials immediately (Alchemy buff reduces materials by 3% per step, rounded down per material, minimum 1).
4. A **construction site** appears and joins the **construction queue**.
5. **Build time** is measured in honest reviews. Each active construction slot advances by 1 point per honest review (1.25 for a builder's slot). Alchemy reduces the required points by 3% per step.
6. On completion the room appears with its required furniture **empty**; a prompt offers to place required furniture (Section 17). Rooms with missing required furniture are **Unfinished** and run at 0%.

**Construction slots:** 1 (the wizard) + 1 per Builder (max 4 total). Sites beyond the slot count wait in order; the player can reorder.

**Cancel / pause / demolish:**

| Action | When | Refund |
|---|---|---|
| Cancel | Before any progress | 100% mana and materials; blueprint card returned to hand |
| Pause | Any time | Nothing lost; progress kept forever |
| Demolish a finished room | Any time (not during an active hazard in that room) | 50% materials, 0% mana; furniture returned to inventory; occupants reassigned. A drafted blueprint is not returned. |

Demolition is always a deliberate player action with a confirmation dialog. No system ever demolishes or damages a room on its own (BR-04, BR-25).

## 15.5 Room levels

Rooms have levels 1–3.

| Level | How | Effect |
|---|---|---|
| 1 | Built | — |
| 2 | Play a **duplicate blueprint card** of the same room on it, **or** (standard plans only) **Renovate** for 1.5 × the base mana and materials and 50% of the base build time | +10% efficiency, +capacity (per room), +1 optional furniture slot, improved art |
| 3 | As above, from level 2; requires wizard level 6 in the room's school (Foundation rooms: total level 20) | Another +10% efficiency, +capacity, +1 slot, best art; some rooms gain a **level-3 perk** (listed in Section 16) |

## 15.6 Room stats and quality

Every furniture item adds points to five **room stats**:

| Stat | Represents | Typical sources |
|---|---|---|
| **Comfort** | Softness, warmth, rest | Beds, rugs, couches, hearths |
| **Focus** | Light to work by, quiet, tools | Desks, lecterns, candles, bookshelves |
| **Order** | Tidiness, discipline, storage | Shelves, wardrobes, wards, clocks |
| **Aura** | Ambient magic | Focus items, crystals, altars, cauldrons |
| **Charm** | Beauty and personality | Plants, tapestries, portraits, statues |

Each room type has **two primary stats** and **one secondary stat** (Section 16). Its **quality score**:

`Q = Σ over furniture of (points in primary stats) + 0.5 × (points in secondary stat)`

Other stats on the furniture still count toward the Academy-wide Charm total (Section 14.4) but not toward that room's Q.

| Q | Quality tier | Art | Quality factor |
|---|---|---|---|
| 0–9 | **Bare** | Stone walls, single torch | `1 + Q/160` |
| 10–24 | **Plain** | Plastered walls | (same formula) |
| 25–44 | **Cozy** | Warm lighting, rugs | |
| 45–69 | **Fine** | Panelled walls, banners | |
| 70+ | **Splendid** | Gilded trim, floating lights, sparkle particles | capped at Q = 80 → ×1.5 |

## 15.7 Room efficiency

`efficiency = level_factor × quality_factor × cleanliness_factor × staff_factor × adjacency_factor`

| Factor | Values |
|---|---|
| level_factor | 1.0 / 1.1 / 1.2 |
| quality_factor | `1 + min(Q, 80) / 160` (1.0–1.5) |
| cleanliness_factor | `0.7 + 0.3 × cleanliness / 100` (0.7–1.0) |
| staff_factor | 1.0 if the room's workplace is staffed (or needs no staff); 0.5 if a staffable room has no staff |
| adjacency_factor | Product of the adjacency bonuses/penalties in Section 15.9 (clamped 0.8–1.3) |
| Overrides | 0 if Unfinished (missing required furniture), Unreachable, or Locked by a hazard |

Efficiency multiplies the room's outputs (yields, healing, meal sittings counted as capacity × efficiency rounded down, etc.) as described for each room.

## 15.8 Cleanliness

Each room has cleanliness 0–100 (starts at 100).

- **Dirt per bell:** `0.5 + 0.3 × occupants_this_bell` (×0.7 if any occupant is Tidy; ×1.5 for Alchemy Lab, Kitchen and habitats).
- **Cleaning:** each idle Builder cleans 4 points per bell (to the dirtiest rooms first); Mopslime creatures 3 per bell; an Enchanted Broom 1 per bell in its room; the spell *Tidy Wind* restores a floor to 100; the Polishing Spirit potion restores one room to 100.
- Misbehavior and hazards can dirty a room by 10–40 at once.
- Cleanliness never affects anything except efficiency (minimum ×0.7). A dirty room is never damaged.

## 15.9 Adjacency and layout effects

"Adjacent" means sharing a wall edge on the same floor (castle) or neighbouring plots (grounds). "Within N" means BFS distance ≤ N rooms.

| Effect | Rule |
|---|---|
| Kitchen ↔ Refectory | A Kitchen adjacent to a Refectory serves **Hearty meals** (Well-Fed: +5 morale for 5 bells) and cuts Provisions use by 10%. A Kitchen not adjacent to a Refectory works at 50%. |
| Greenhouse ↔ Kitchen | Greenhouse +10%. |
| Library ↔ Classroom | Each adjacent classroom +5% (max +10% from two libraries). |
| Classroom wings | Each same-school classroom adjacent to another +5% (max +10%). |
| Alchemy Lab / Workshop ↔ Dorm or Faculty Quarters | The dorm/quarters loses 10 Comfort-equivalent Q (noise and fumes). A Fume Hood in the Lab removes the Lab's penalty. |
| Habitat ↔ Classroom | Classroom −5% (noise) unless the habitat contains only Gentle-favoured creatures (Section 22). |
| Menagerie ↔ Common Room | Common Room +10% leisure capacity. |
| Infirmary ↔ Sunlit Sanctum | Both +10%. |
| Detention Hall ↔ Classroom | That classroom's misbehavior −10%. |
| Warding Chamber radius | Rooms within 3 BFS steps: hazards −20%. |
| Observatory on the highest floor of the castle | +10%. |
| Dormitory within 4 of a Refectory | Residents' Hunger target +5 (short walk to meals). |
| Dormitory more than 8 from any Common Room | Residents' Leisure target −10 (long walk). |

## 15.10 Academy size (for the Veil)

Veil upkeep (Section 18) uses **Academy size**, never headcount (BR-24):

`size_points = Σ over castle rooms of room.veil + Σ over grounds rooms of room.veil`

where each room's `veil` value is listed in Section 16 and scales with level (+25% per level above 1). Construction sites count at 50%.

## 15.11 Design purpose and tensions

The grid creates the central spatial puzzle of Spellcaster-style games, kept simple enough for an AI to implement: support, edge connection, stairs, sky access and a handful of adjacency rules. The tension is height and width versus daily Veil cost: every room adds upkeep, so a well-furnished, levelled room is often better than two Bare ones. Furniture quality lets the player improve without growing the Veil bill, which is the intended mid-game optimization.

# 16. Room Catalog

**Cost key:** m = mana; T = Timber; S = Stone; G = Glass; C = Cloth; In = Insight; He = Herbs; Ra = Radiance; Um = Umbra; Re = Reagents; Cr = Crystal; Hw = Heartwood; Ss = Sunstone; Vp = Void Pearl; Es = Ember Salt; Ms = Moonsilk; Sm = Starmetal. **Build** is in honest reviews. **Veil** is the room's contribution to daily Veil upkeep at level 1 (+25% per level above 1). **Size** is width × height in tiles (castle) or plots (grounds). **Stats** lists primary stats, then the secondary stat in brackets. **Unlock:** *Start* = pre-built or available from day one; *Std (X Ln)* = standard plan at wizard level n in school X; *Draft (deck, rarity)* = blueprint draft card; *Grant* = given by a milestone.

There are **56 room types**: 6 core and circulation, 8 living, 10 teaching, 3 knowledge, 4 nature, 3 light, 3 shadow, 6 craft and habitat, 3 Rift and display, and 10 grounds plots.

## 16.1 Core and circulation

| ID | Room | Unlock | Size | Capacity | Cost | Build | Veil |
|---|---|---|---|---|---|---|---|
| `entrance_hall` | Entrance Hall | Start (pre-built) | 2×1 | — | — | — | 4 |
| `wizard_study` | Wizard's Study | Start (pre-built) | 1×2 | Wizard | L2: 600m·40S·20G; L3: 1,500m·60S·30G·5Cr | L2 60 / L3 120 | 6 |
| `spiral_stair` | Spiral Stair | Start | 1×1 | — | 40m·10S | 5 | 1 |
| `corridor` | Corridor | Start | 1×1 | — | 25m·8T | 4 | 1 |
| `support_pillar` | Support Pillar | Start | 1×1 (structural, no interior) | — | 15m·6S | 3 | 0.5 |
| `storage_vault` | Storage Vault | Start (one pre-built) | 1×1 | +200 material cap (+150/level) | 120m·20T·10S | 20 | 2 |

| Room | Required furniture | Opt. slots | Stats | Effect, placement and level perks |
|---|---|---|---|---|
| Entrance Hall | Grand Doors (built-in) | 4 | Charm, Order [Comfort] | Root of reachability. Ceremonies (mastery, retirement) play here. Charm placed here counts double toward Renown from decor. Cannot be demolished. |
| Wizard's Study | Orb Stand, Lectern (built-in) | 3 | Focus, Aura [Charm] | Training sessions (Section 7.3). Level = Study level (queue 1/2/4); L2 needs total wizard level 15, L3 needs 30. L3 perk: the wizard's spells cost 10% less. Has an internal stair linking its two floors. Cannot be demolished. |
| Spiral Stair | — | 0 | — | The only vertical connector. Stack stairs to reach higher floors. |
| Corridor | — | 1 (decor only) | Charm [—] | Horizontal connector; lets you space noisy rooms apart. |
| Support Pillar | — | 0 | — | Satisfies support (P3) for rooms above; not walkable, not a connector. |
| Storage Vault | Shelving | 2 | Order [Aura] | Raises the cap on every common material (Timber, Stone, Glass, Cloth, Provisions, Greens, Fish, Nectar) by 200 each (+150 per level). Base cap without vaults: 300 each. Essences and rare materials are uncapped. L3 perk: the vault auto-sorts, so every builder cleans 1 extra point per bell. |

## 16.2 Living

| ID | Room | Unlock | Size | Capacity | Cost | Build | Veil |
|---|---|---|---|---|---|---|---|
| `dormitory` | Dormitory | Start | 2×1 | 4 beds (+1/level) | 250m·30T·10S | 40 | 4 |
| `grand_dormitory` | Grand Dormitory | Draft (Foundation, uncommon) | 3×1 | 7 beds (+1/level) | 650m·60T·25S·10C | 80 | 6 |
| `faculty_quarters` | Faculty Quarters | Std (appears with the first master) | 2×1 | 2 faculty beds (+1/level) | 350m·30T·15S·5C | 50 | 4 |
| `faculty_lounge` | Faculty Lounge | Draft (Foundation, common) | 2×1 | 4 faculty leisure seats (+1/level) | 300m·25T·10C | 40 | 4 |
| `refectory` | Refectory | Start | 3×1 | 12 seats (+3/level); meal capacity = seats × 2 | 400m·40T·20S | 60 | 5 |
| `kitchen` | Kitchen | Draft (Foundation, common); Std at Nature L4 | 1×1 | — | 250m·15T·15S | 30 | 3 |
| `common_room` | Common Room | Start | 2×1 | 6 leisure seats (+2/level) | 300m·30T·10C | 45 | 4 |
| `bathhouse` | Bathhouse | Draft (Foundation, uncommon) | 2×1 | 4 (+1/level) | 450m·20S·15G | 60 | 5 |

| Room | Required furniture | Opt. slots | Stats | Effect, placement and level perks |
|---|---|---|---|---|
| Dormitory | Beds (any bed item), up to capacity; at least 1 | 4 | Comfort, Charm [Order] | Student beds. Capacity = beds placed (max per level). Rest target from efficiency (Section 14.4). L3 perk: roommates share Kind Heart / Sunny effects at double strength. |
| Grand Dormitory | Beds, at least 1 | 5 | Comfort, Charm [Order] | As Dormitory; −15% Veil per bed compared with small dorms. L3 perk: +5 Leisure target for residents (a little common nook). |
| Faculty Quarters | 2 Faculty Beds, Writing Desk | 4 | Comfort, Focus [Order] | Faculty beds (BR-22 housing term). Faculty Rest target +10. L3 perk: residents' career proficiency +5 (flat). |
| Faculty Lounge | 2 Armchairs | 4 | Comfort, Charm [Focus] | Faculty-only Leisure and Composure. At Fine quality or better: all career outputs +3%. |
| Refectory | Long Table, Hearth | 5 | Comfort, Order [Charm] | Serves meals every 5 bells. Meals use 1 Provision per diner. L3 perk: meals restore +5 Composure. |
| Kitchen | Cooking Range | 2 | Order, Aura [Comfort] | Adjacent to a Refectory: Hearty meals (Well-Fed) and −10% Provisions per meal. Otherwise 50% effect. Fire hazard ×1.5 in this room. |
| Common Room | Hearth **or** Couch | 5 | Comfort, Charm [Order] | Leisure capacity. Social and Mischievous students love it. L3 perk: misbehavior Academy-wide −5%. |
| Bathhouse | Soaking Tub | 4 | Comfort, Aura [Charm] | Users' Rest target +10, Composure +5; injured users heal 10% faster. |

## 16.3 Teaching (BR-08)

Five basic classrooms (standard plan at wizard level 5 in their school) and five Advanced Halls (school draft deck, rare, wizard level 7).

| ID | Room | School | Unlock | Size | Seats | Cost | Build | Veil |
|---|---|---|---|---|---|---|---|---|
| `class_arcane` | Glyph Classroom | Arcane | Std (Arcane L5) | 2×1 | 5 (+1/level) | 300m·25T·15S | 45 | 5 |
| `class_nature` | Grove Classroom | Nature | Std (Nature L5) | 2×1 | 5 (+1/level) | 300m·25T·15S | 45 | 5 |
| `class_light` | Dawn Classroom | Light | Std (Light L5) | 2×1 | 5 (+1/level) | 300m·25T·15S | 45 | 5 |
| `class_shadow` | Hush Classroom | Shadow | Std (Shadow L5) | 2×1 | 5 (+1/level) | 300m·25T·15S | 45 | 5 |
| `class_alchemy` | Bench Classroom | Alchemy | Std (Alchemy L5) | 2×1 | 5 (+1/level) | 300m·25T·15S | 45 | 5 |
| `hall_arcane` | Hall of Stars | Arcane | Draft (Arcane, rare; L7) | 3×1 | 8 (+1/level) | 900m·50T·40S·20In·3Cr | 100 | 9 |
| `hall_nature` | Grove Hall | Nature | Draft (Nature, rare; L7) | 3×1 | 8 (+1/level) | 900m·50T·40S·20He·3Hw | 100 | 9 |
| `hall_light` | Dawn Hall | Light | Draft (Light, rare; L7) | 3×1 | 8 (+1/level) | 900m·50T·40S·20Ra·3Ss | 100 | 9 |
| `hall_shadow` | Hall of Whispers | Shadow | Draft (Shadow, rare; L7) | 3×1 | 8 (+1/level) | 900m·50T·40S·20Um·3Vp | 100 | 9 |
| `hall_alchemy` | Crucible Hall | Alchemy | Draft (Alchemy, rare; L7) | 3×1 | 8 (+1/level) | 900m·50T·40S·20Re·3Es | 100 | 9 |

| Room | Required furniture | Opt. slots | Stats | Effect, placement and level perks |
|---|---|---|---|---|
| Basic classrooms | Teacher's Lectern + the school's focus item (Arcane: Orrery Globe; Nature: Potting Bench; Light: Sun Altar; Shadow: Veiled Mirror; Alchemy: Bench Cauldron) | 4 | Focus, Aura [Order] | Seats students of that school; teacher workplace (1). Each seated student yields 0.20 essence/bell × efficiency × morale factor (Section 8.3). 1% chance per bell per staffed classroom to also yield 1 of the school's rare material (Cr / Hw / Ss / Vp / Es). L3 perk: +1 tutor slot (resident masters) and +5% essence. |
| Advanced Halls | Master Lectern + the school's grand focus (Arcane: Star Orrery; Nature: Living Tree; Light: Dawn Organ; Shadow: Obsidian Mirror; Alchemy: Great Athanor) | 6 | Focus, Aura [Charm] | As basic, yield ×1.5, rare-material chance 2%. The teacher here gets +10 career proficiency points. L3 perk: +10% essence yield and the Hall's teacher gains a further +5 career proficiency points. (Nothing in Ankicaster alters the teacher-delay formula except the Light buff, BR-16.) |

## 16.4 Knowledge (Arcane)

| ID | Room | Unlock | Size | Capacity | Cost | Build | Veil |
|---|---|---|---|---|---|---|---|
| `library` | Library | Std (Arcane L2) | 2×1 | 4 readers (+1/level); 2 scholar slots | 500m·40T·10G | 70 | 5 |
| `observatory` | Observatory | Draft (Arcane, uncommon; L4) | 1×2, needs sky | 1 scholar slot | 650m·20S·25G·3Cr | 80 | 7 |
| `scriptorium` | Scriptorium | Draft (Arcane, uncommon; L3) | 2×1 | 1 scholar slot | 450m·30T·10C·10In | 60 | 5 |

| Room | Required furniture | Opt. slots | Stats | Effect, placement and level perks |
|---|---|---|---|---|
| Library | 2 Bookshelves, Reading Desk | 4 | Focus, Order [Charm] | Readers count as Leisure capacity. +1 Insight/bell per scholar. Sells known grimoires (Section 29) and lets the wizard research recipes and *Veil Theory* (Section 18.2) (Section 24.5). Adjacent classrooms +5%. L3 perk: grimoire study costs −10% mana. |
| Observatory | Great Telescope | 2 | Aura, Focus [Charm] | **Foresight:** the next day's random event is shown in advance and can be warded or prepared for. With a scholar: +1 Rift Fortune (max 2 scholars across observatories) and +1 Insight/bell. +10% on the highest castle floor. |
| Scriptorium | Scribe's Desk | 3 | Focus, Order [Aura] | Crafts scrolls with a scholar (Section 25.4): Rift Map, Ward Scroll, Recipe Notes, Calming Verse. |

## 16.5 Nature

| ID | Room | Unlock | Size | Capacity | Cost | Build | Veil |
|---|---|---|---|---|---|---|---|
| `greenhouse` | Greenhouse | Std (Nature L2) | 2×1, needs sky | 2 crop beds (+1/level); 1 gardener | 450m·30T·25G | 60 | 5 |
| `meadow_paddock` | Meadow Paddock | Std (Nature L3) | 2 plots (grounds) | 3 creatures (+1/level), Meadow habitat | 200m·30T | 30 | 3 |
| `tide_tank` | Tide Tank | Std (Nature L3) | 2×1, floor 0 only | 2 creatures (+1/level), Tide habitat | 400m·20S·30G | 50 | 4 |
| `menagerie` | Menagerie | Draft (Nature, rare; L4) | 3×2 | 6 creatures (+2/level), any habitat with modules | 1,400m·60T·40S·40G·5Hw | 140 | 12 |

| Room | Required furniture | Opt. slots | Stats | Effect, placement and level perks |
|---|---|---|---|---|
| Greenhouse | 2 Planter Beds | 3 | Aura, Comfort [Charm] | Each crop bed grows one crop (Section 21.3). Base output per bed per bell: 0.75 Provisions + 0.25 Herbs (or the crop's listed output). Gardener ×1.5. L3 perk: a third crop type can be planted in each bed (mixed planting). |
| Meadow Paddock | Feeding Trough | 2 | Comfort, Charm [Order] | Meadow creatures. Grounds rooms have no cleanliness penalty from creatures. |
| Tide Tank | Glass Tank | 2 | Aura, Comfort [Order] | Tide creatures. Must sit on floor 0. |
| Menagerie | 2 Habitat Modules (max 4; each gives one habitat type) | 4 | Comfort, Charm [Aura] | Creatures here give +10% buff strength. Visitors count as 6 Leisure capacity. Adjacent Common Room +10%. L3 perk: wary (untamed) creatures here escape 50% less. |

## 16.6 Light

| ID | Room | Unlock | Size | Capacity | Cost | Build | Veil |
|---|---|---|---|---|---|---|---|
| `infirmary` | Infirmary | Std (Light L2) | 2×1 | 3 patient beds (+1/level); 1 healer | 450m·25T·10C·10G | 60 | 5 |
| `aviary` | Aviary | Std (Light L3) | 1×2, needs sky | 3 creatures (+1/level), Sky habitat | 350m·25T·15G | 45 | 4 |
| `sunlit_sanctum` | Sunlit Sanctum | Draft (Light, uncommon; L4) | 2×1 | 6 seats (+2/level); 1 healer | 600m·30S·15G·15Ra | 70 | 6 |

| Room | Required furniture | Opt. slots | Stats | Effect, placement and level perks |
|---|---|---|---|---|
| Infirmary | 2 Infirmary Cots, Remedy Cabinet | 3 | Comfort, Order [Aura] | Injured characters are admitted automatically. Healing per review = efficiency × (1 + healer) × Light recovery buff (Section 23.3). Hexed injuries need a healer or a potion. Adjacent Sanctum +10%. L3 perk: also treats injured creatures (otherwise they rest in their habitat at half speed). |
| Aviary | Perch Tree | 2 | Charm, Aura [Comfort] | Sky creatures. Needs sky. |
| Sunlit Sanctum | Sun Window, 2 Meditation Cushions | 4 | Aura, Charm [Comfort] | Composure target +15 × min(1, seats / headcount). With a healer: +1 Composure per bell to users. **Rite of Renewal** (once per 7 days, 50 Radiance): remove one troublesome trait from a chosen student. |

## 16.7 Shadow

| ID | Room | Unlock | Size | Capacity | Cost | Build | Veil |
|---|---|---|---|---|---|---|---|
| `warding_chamber` | Warding Chamber | Std (Shadow L2) | 1×1 | 1 warder | 400m·25S·5G | 50 | 4 |
| `gloom_hutch` | Gloom Hutch | Std (Shadow L3) | 1×1 | 2 creatures (+1/level), Gloom habitat | 250m·15T·15S | 35 | 3 |
| `detention_hall` | Detention Hall | Draft (Shadow, uncommon; L4) | 1×1 | 3 detainees; 1 warder | 350m·25S | 45 | 3 |

| Room | Required furniture | Opt. slots | Stats | Effect, placement and level perks |
|---|---|---|---|---|
| Warding Chamber | Ward Circle | 2 | Order, Aura [Focus] | −5% daily Veil cost per chamber (max 3 chambers count). Rooms within 3 BFS steps: hazards −20%. With a warder: +5 Veil strength per active day; −10% hazards Academy-wide. L3 perk: breaches are auto-contained (Section 19.4) in this chamber's radius. |
| Gloom Hutch | Lightless Burrow | 2 | Comfort, Order [Aura] | Gloom creatures. Must not be adjacent to an Aviary (both rooms −10%). |
| Detention Hall | Penitent Benches | 2 | Order, Focus [—] | Misbehaving students are sent here for 3 bells (no lesson yield) and are 50% less likely to misbehave for the next 30 bells. With a warder: 5% per detention to remove Prankster or Rule-Bender. Adjacent classroom misbehavior −10%. |

## 16.8 Craft and habitats (Alchemy and Arcane)

| ID | Room | Unlock | Size | Capacity | Cost | Build | Veil |
|---|---|---|---|---|---|---|---|
| `alchemy_lab` | Alchemy Lab | Std (Alchemy L2) | 2×1 | 1 alchemist; 2 brewing stations | 450m·20S·20G | 60 | 6 |
| `ember_pit` | Ember Pit | Std (Alchemy L3) | 1×1, floors 0–1 | 2 creatures (+1/level), Ember habitat | 300m·25S·5G | 40 | 4 |
| `workshop` | Workshop | Draft (Alchemy, uncommon; L4); the first Alchemy draft after L4 always offers it | 2×1 | 2 builders | 500m·40T·20S | 60 | 5 |
| `glassworks` | Glassworks | Draft (Alchemy, common; L3) | 1×1 | — | 350m·30S | 40 | 3 |
| `weaving_room` | Weaving Room | Draft (Foundation, common) | 1×1 | — | 250m·20T | 30 | 2 |
| `crystal_vivarium` | Crystal Vivarium | Std (Arcane L3) | 1×1 | 2 creatures (+1/level), Crystal habitat | 350m·10S·20G | 40 | 4 |

| Room | Required furniture | Opt. slots | Stats | Effect, placement and level perks |
|---|---|---|---|---|
| Alchemy Lab | Brewing Cauldron, Ingredient Rack | 3 | Aura, Order [Focus] | Brewing (Section 24). Without an alchemist only basic recipes can be brewed, at normal speed. Explosion hazard (Section 19). Adjacency noise penalty to dorms unless a Fume Hood is installed. L3 perk: a third brewing station. |
| Ember Pit | Brazier Nest | 2 | Aura, Comfort [Order] | Ember creatures. Floors 0–1 only. |
| Workshop | Workbench | 3 | Order, Focus [Aura] | Builder workplace (2). Each builder adds a construction slot. Furniture costs −10% materials while a Workshop exists. Repairs Damaged furniture for 25% of its cost. L3 perk: builder slots advance 1.4 per review instead of 1.25. |
| Glassworks | Kiln | 1 | Aura, Order [—] | Converts 2 Stone → 1 Glass per bell × efficiency (toggle on/off). |
| Weaving Room | Loom | 2 | Order, Charm [Comfort] | 0.5 Cloth per bell × efficiency; ×2 with a tamed Moonsheep. With Moonsilk input (1 per 20 bells) also makes Moonsilk Cloth for rare furniture. |
| Crystal Vivarium | Geode Bed | 2 | Aura, Charm [Focus] | Crystal creatures. |

## 16.9 Rift and display

| ID | Room | Unlock | Size | Capacity | Cost | Build | Veil |
|---|---|---|---|---|---|---|---|
| `rift_gate` | Rift Gate | Grant (when the Academy has 3 masters, BR-27) | 2 plots (grounds) | 1 expedition at a time (+1 at level 3) | 1,000m·60S·20G·5Cr | 120 | 10 |
| `training_yard` | Training Yard | Std (with the Rift Gate) | 2 plots (grounds) | 3 adventurers (+1/level) | 300m·30T·10S | 40 | 2 |
| `trophy_hall` | Trophy Hall | Draft (Foundation, rare) | 2×1 | 4 artifact plinths (+1/level) | 700m·40S·20G | 80 | 5 |

| Room | Required furniture | Opt. slots | Stats | Effect, placement and level perks |
|---|---|---|---|---|
| Rift Gate | Gate Arch, Anchor Stones (both granted with the blueprint) | 2 | Aura, Order [—] | Launches expeditions (Section 27). Level 2: +1 Rift Fortune; level 3: +2 Rift Fortune and a second simultaneous expedition (the level-3 renovation also needs 2 Golem Cores). Gate levels never change the odds. Levels via Rift Gate blueprint duplicates (Rift loot) or Renovation. |
| Training Yard | Practice Dummies | 3 | Order, Focus [Comfort] | Adventurers between expeditions rest here; each yard level gives drilled teams +1 Rift Fortune (max +3). |
| Trophy Hall | Artifact Plinths (any number, up to capacity) | 2 | Charm, Aura [Order] | **Artifacts only work while displayed** (Section 25.5). +2 Renown per displayed artifact. Hosts the Alumni Gallery wall. |

## 16.10 Grounds plots

| ID | Plot | Unlock | Size | Output per bell (× efficiency) | Cost | Build | Veil |
|---|---|---|---|---|---|---|---|
| `vegetable_patch` | Vegetable Patch | Start (one pre-built) | 1 plot | 1.0 Provisions + 0.2 Greens | 60m·10T | 15 | 2 |
| `herb_garden` | Herb Garden | Std (Nature L1) | 1 plot | 0.6 Herbs | 80m·10T | 20 | 2 |
| `woodlot` | Woodlot | Start (one pre-built) | 1 plot | 2 Timber; 0.5% Heartwood | 50m·5S | 15 | 2 |
| `quarry` | Quarry | Start | 1 plot | 1 Stone; 2% Crystal | 80m·10T | 20 | 2 |
| `pond` | Pond | Std (Nature L2) | 2 plots | 0.8 Fish; Tide creatures may visit | 150m·20S | 30 | 3 |
| `orchard` | Orchard | Draft (Nature, common) | 2 plots | 0.8 Provisions + 0.3 Nectar; +4 Leisure capacity | 250m·30T | 50 | 3 |
| `apiary` | Apiary | Draft (Nature, uncommon) | 1 plot | 0.5 Nectar; adjacent plots +5% | 200m·20T | 30 | 2 |
| `courtyard_garden` | Courtyard Garden | Draft (Foundation, common) | 1 plot | +3 Leisure capacity; +3 Academy Charm | 120m·15S | 20 | 1 |
| `standing_stones` | Standing Stones | Draft (Shadow, uncommon) | 1 plot | Grounds hazards −50%; breach chance −25%; +2 Veil strength per active day | 400m·40S | 50 | 2 |
| `moonwell` | Moonwell | Draft (Light, rare) | 1 plot | Injury healing +20% Academy-wide; Composure target +5 | 500m·30S·10Ra | 60 | 3 |

Plots have no furniture slots, except that each plot accepts **one** outdoor decor item (Section 17.10). Gardeners can be assigned to up to 3 food/herb plots (×1.5 output). Plots are always reachable and never dirty.

# 17. Furniture and Decor Catalog

## 17.1 Rules

- **Placing furniture is instant**: pay mana and materials, choose a free slot, done. (The Alchemy buff and a Workshop reduce material costs; nothing reduces mana cost except the Library L3 perk for grimoires and spellbooks that say so.)
- **Slots.** Each room has **required slots** (one per required item listed in Section 16, plus bed slots in dorms and plinths in the Trophy Hall) and **optional slots** (number listed per room, +1 per room level). Most items take 1 optional slot; items marked **(2)** take 2.
- **Required items** must be present for the room to function. A required item can be replaced by an upgraded item of the same role (e.g., any bed in a bed slot; the Master Lectern can replace a Teacher's Lectern).
- **Stacking.** Stat points from every item always add up. **Special effects** of the *same item* do not stack within one room unless the entry says so; across rooms they stack, subject to global caps (Section 33.6).
- **Moving and selling.** Items can be moved between rooms freely (instant). Removing an item returns it to inventory; selling it to the "Curio Cart" returns 25% of its mana cost.
- **Damage.** Some events and the Butterfingers trait can mark an item **Damaged** (−50% stats and effects). Repair at a Workshop for 25% of the item's cost, or with the *Mend Object* spell. Items are never destroyed.
- **Unlock sources:** *Std* = always buyable (optionally after a level gate); *Draft (deck, rarity)* = a furniture draft card grants one copy (more copies via more cards or by spending its "pattern" after the first copy — see 26.6); *Rift (destination)* = expedition loot; *Grant* = milestone or achievement.

Stat abbreviations: **Cmf** Comfort, **Foc** Focus, **Ord** Order, **Aur** Aura, **Chm** Charm.

There are **114 catalog entries** (the grand-focus entry comes in 5 school variants and the Habitat Module in 6 habitat variants, so there are 123 distinct placeable pieces): 16 general decor, 9 beds and bedroom pieces, 9 faculty and leisure, 7 refectory and kitchen, 13 classroom, 7 knowledge, 14 nature and habitat, 7 light, 6 shadow, 12 craft, storage and Rift, 8 outdoor decor, and 6 Rift-legendary pieces.

## 17.2 General decor (any room with a free optional slot)

| ID | Item | Cost | Stats | Special effect | Unlock |
|---|---|---|---|---|---|
| `potted_fern` | Potted Fern | 30m·2T | Chm 2 | — | Std |
| `candle_sconce` | Candle Sconce | 40m·2S | Foc 1, Chm 1 | — | Std |
| `woven_rug` | Woven Rug | 60m·3C | Cmf 3 | — | Std |
| `tapestry` | Tapestry | 80m·4C | Chm 4, Cmf 1 | — | Std |
| `bookshelf` | Bookshelf | 100m·10T | Foc 3, Ord 1 | Counts for Well-Read trait | Std |
| `academy_banner` | Academy Banner | 100m·5C | Chm 4 | +1 Renown each (max 5 banners Academy-wide) | Std |
| `grandfather_clock` | Grandfather Clock | 180m·10T·2G | Ord 4 | — | Std (total level 10) |
| `founders_portrait` | Portrait of the Founder | 120m·3T·2C | Chm 5 | +1 Composure target to occupants (it's you!) | Grant (first master) |
| `glow_lantern` | Glow Lantern | 90m·2G·2In | Foc 2, Aur 1 | — | Draft (Arcane, common) |
| `window_box` | Window Box of Herbs | 70m·3T·2He | Chm 2, Cmf 1 | +0.05 Herbs/bell | Draft (Nature, common) |
| `fish_bowl` | Fish Bowl | 90m·3G·2 Fish | Chm 3 | +1 Composure target to occupants | Draft (Nature, common) |
| `hush_chimes` | Wind Chimes of Hush | 110m·3G·3Um | Ord 3 | Misbehavior in room −10% | Draft (Shadow, common) |
| `radiant_lamp` | Radiant Lamp | 160m·2G·5Ra | Chm 3, Aur 2 | — | Draft (Light, common) |
| `enchanted_broom` | Enchanted Broom | 150m·5T·5Re | Ord 2 | Cleans 1/bell in its room | Draft (Alchemy, common) |
| `familiar_statue` | Statue of a Familiar | 300m·20S | Chm 6 | — | Draft (Foundation, uncommon) |
| `floating_candles` | Floating Candles | 150m·5In | Foc 2, Chm 2 | — | Draft (Arcane, common) |

## 17.3 Beds and bedroom pieces (Dormitory, Grand Dormitory, Faculty Quarters)

| ID | Item | Role | Cost | Stats | Special effect | Unlock |
|---|---|---|---|---|---|---|
| `simple_cot` | Simple Cot | Bed | 30m·5T | Cmf 1 | — | Std |
| `feather_bed` | Feather Bed | Bed | 90m·6T·3C | Cmf 3 | — | Std |
| `faculty_bed` | Faculty Bed | Faculty bed | 100m·8T·3C | Cmf 3 | Faculty Quarters only | Std |
| `canopy_bed` | Canopy Bed | Bed | 220m·8T·6C·1Ms | Cmf 5, Chm 2 | Occupant Rest target +5 | Draft (Foundation, uncommon) |
| `dreamcatcher_bed` | Dreamcatcher Bed | Bed | 300m·8T·4C·5In | Cmf 4 | Occupant Composure target +5 | Draft (Arcane, uncommon) |
| `mossbed` | Mossbed | Bed | 180m·6T·10He | Cmf 4 | Occupant heals 20% faster | Draft (Nature, uncommon) |
| `wardrobe` | Wardrobe | Optional | 70m·8T | Ord 2, Cmf 1 | — | Std |
| `footlocker` | Footlocker | Optional | 40m·4T | Ord 1 | — | Std |
| `moon_curtains` | Moon-Shroud Curtains | Optional | 140m·6C·4Um | Ord 2 | Dorm Rest target +5 (dark sleep) | Draft (Shadow, common) |

## 17.4 Faculty and leisure (Faculty Quarters, Faculty Lounge, Common Room, Bathhouse)

| ID | Item | Role | Cost | Stats | Special effect | Unlock |
|---|---|---|---|---|---|---|
| `writing_desk` | Writing Desk | Req (Faculty Quarters) | 90m·8T | Foc 3 | — | Std |
| `armchair` | Armchair | Req (Faculty Lounge) | 80m·6T·3C | Cmf 3 | — | Std |
| `couch` | Couch | Req-alt (Common Room) | 90m·8T·4C | Cmf 3 | — | Std |
| `hammock` | Hammock | Optional | 60m·4C | Cmf 2 | — | Std |
| `tea_service` | Tea Service | Optional | 120m·2G·2He | Cmf 2, Chm 2 | Lounge: career outputs +1% (stacks to 2) | Draft (Light, common) |
| `wizard_chess` | Wizard's Chess Table | Optional | 140m·10T·2In | Chm 2 | +2 Leisure capacity | Draft (Arcane, common) |
| `music_box` | Music Box of Calm | Optional | 160m·3G·3Ra | Chm 2 | Occupants +3 Composure target | Draft (Light, common) |
| `hex_darts` | Dartboard of Harmless Hexes | Optional | 120m·6T·3Um | Chm 1 | Misbehavior Academy-wide −5% (max 2 boards) | Draft (Shadow, common) |
| `warm_hearthstone` | Warm Hearthstone | Optional (dorms, Common Room, Lounge) | 160m·10S·3Re | Cmf 3 | Halves Cold Snap effects in its room | Draft (Alchemy, common) |

## 17.5 Refectory and kitchen

| ID | Item | Role | Cost | Stats | Special effect | Unlock |
|---|---|---|---|---|---|---|
| `long_table` | Long Table | Req (Refectory) | 120m·15T | Ord 2 | — | Std |
| `hearth` | Hearth | Req (Refectory), Req-alt (Common Room) | 150m·20S | Cmf 3 | — | Std |
| `cooking_range` | Cooking Range | Req (Kitchen) | 180m·15S·2G | Ord 2, Aur 1 | — | Std |
| `spice_rack` | Spice Rack | Optional | 70m·5T·3He | Chm 1 | Hearty meals give +2 extra morale | Draft (Nature, common) |
| `frostbox` | Frostbox | Optional (Kitchen) | 200m·5S·5G·3In | Ord 2 | +100 Provisions cap | Draft (Arcane, common) |
| `stewpot` | Bottomless Stewpot | Optional (Kitchen) | 400m·10S·10Re·2Es | Aur 2 | Meals use 20% fewer Provisions (stacks with Kitchen's 10%) | Draft (Alchemy, rare) |
| `banquet_bell` | Banquet Bell | Optional (Refectory) | 250m·10S·3G | Chm 3 | Once per 7 days, ring for a Feast: next meal gives Well-Fed to all and +5 Leisure | Draft (Foundation, uncommon) |

## 17.6 Classroom items

| ID | Item | Role | Cost | Stats | Special effect | Unlock |
|---|---|---|---|---|---|---|
| `teachers_lectern` | Teacher's Lectern | Req (basic classrooms) | 80m·8T | Foc 2 | — | Std |
| `orrery_globe` | Orrery Globe | Req (Glyph Classroom) | 160m·5S·5G | Aur 3, Foc 1 | — | Std (Arcane L5) |
| `potting_bench` | Potting Bench | Req (Grove Classroom) | 120m·10T·3He | Aur 3, Cmf 1 | — | Std (Nature L5) |
| `sun_altar` | Sun Altar | Req (Dawn Classroom) | 150m·10S·2G | Aur 3, Chm 1 | — | Std (Light L5) |
| `veiled_mirror` | Veiled Mirror | Req (Hush Classroom) | 150m·3G·3C | Aur 3, Ord 1 | — | Std (Shadow L5) |
| `bench_cauldron` | Bench Cauldron | Req (Bench Classroom) | 150m·10S·2G | Aur 3, Ord 1 | — | Std (Alchemy L5) |
| `student_desks` | Student Desks (set) | Optional | 100m·12T | Foc 3 | — | Std |
| `chalkboard` | Chalkboard | Optional | 60m·5T·2S | Foc 2, Ord 1 | — | Std |
| `star_chart` | Star Chart | Optional | 120m·3C·5In | Foc 3 (Arcane rooms ×2) | — | Draft (Arcane, common) |
| `specimen_jars` | Specimen Jars | Optional | 110m·4G·3He | Aur 2, Foc 1 | Nature and Alchemy classrooms +3% yield | Draft (Nature, common) |
| `master_lectern` | Master Lectern | Req (Advanced Halls) | 400m·15T·10 (school essence)·2 (school rare) | Foc 4, Chm 2 | — | Grant (with any Advanced Hall blueprint) |
| `grand_focus` | Grand focus (Star Orrery / Living Tree / Dawn Organ / Obsidian Mirror / Great Athanor) **(2)** | Req (matching Advanced Hall) | 600m·20S·25 (school essence)·3 (school rare) | Aur 6, Chm 2 | — | Grant (with the Hall blueprint) |
| `inspiring_quote` | Framed Inspiring Quote | Optional | 50m·2T·1C | Foc 1, Chm 1 | — | Std |

## 17.7 Knowledge

| ID | Item | Role | Cost | Stats | Special effect | Unlock |
|---|---|---|---|---|---|---|
| `reading_desk` | Reading Desk | Req (Library) | 90m·8T | Foc 3 | — | Std |
| `rolling_ladder` | Rolling Ladder | Optional (Library) | 80m·8T | Ord 1 | Library capacity +1 | Std |
| `great_telescope` | Great Telescope **(2)** | Req (Observatory) | 400m·10S·15G·2Cr | Aur 5 | — | Grant (with the blueprint) |
| `scribes_desk` | Scribe's Desk | Req (Scriptorium) | 150m·10T·3C | Foc 3 | — | Grant (with the blueprint) |
| `globe_elsewhere` | Globe of Elsewhere | Optional | 350m·5G·10In·1Cr | Aur 3 | +0.2 Insight/bell | Draft (Arcane, rare) |
| `silent_quill` | Self-Writing Quill | Optional | 220m·2Ms·5In | Foc 3 | Scriptorium crafts 25% faster | Draft (Arcane, uncommon) |
| `map_table` | Expedition Map Table **(2)** | Optional (Library or Training Yard) | 300m·10T·5C·5In | Foc 2, Ord 2 | Rift Fortune +1 (max 1) | Draft (Arcane, uncommon) |

## 17.8 Nature and habitats

| ID | Item | Role | Cost | Stats | Special effect | Unlock |
|---|---|---|---|---|---|---|
| `planter_bed` | Planter Bed | Req (Greenhouse crop bed) | 60m·8T | Aur 1 | Holds one crop | Std |
| `rain_cistern` | Rain Cistern | Optional (Greenhouse) | 140m·10S·3G | Cmf 1 | Greenhouse +10% | Std (Nature L4) |
| `compost_bin` | Compost Bin | Optional (Greenhouse) | 50m·6T | Ord 1 | Greenhouse +5%; turns Murky Sludge into Herbs (1:2) | Std |
| `glowcap_lamp` | Glowcap Grow-Lamp | Optional (Greenhouse) | 180m·3G·5He·2In | Aur 2 | Greenhouse +15% | Draft (Nature, uncommon) |
| `feeding_trough` | Feeding Trough | Req (Meadow Paddock) | 60m·8T | Ord 1 | — | Std |
| `glass_tank` | Glass Tank **(2)** | Req (Tide Tank) | 200m·20G | Aur 2 | — | Std (Nature L3) |
| `perch_tree` | Perch Tree | Req (Aviary) | 120m·10T | Chm 2 | — | Std (Light L3) |
| `lightless_burrow` | Lightless Burrow | Req (Gloom Hutch) | 100m·10S·2C | Cmf 2 | — | Std (Shadow L3) |
| `brazier_nest` | Brazier Nest | Req (Ember Pit) | 140m·15S | Aur 2 | — | Std (Alchemy L3) |
| `geode_bed` | Geode Bed | Req (Crystal Vivarium) | 160m·10S·1Cr | Aur 2 | — | Std (Arcane L3) |
| `habitat_module` | Habitat Module (choose: Meadow, Tide, Sky, Gloom, Ember, Crystal) **(2)** | Req (Menagerie, 2–4) | 250m + that habitat's required item cost | Cmf 2 | Adds one habitat type to the Menagerie | Grant (with the blueprint) |
| `creature_toybox` | Creature Toybox | Optional (any habitat) | 90m·6T·3C | Chm 2 | Escape chance in room −20% | Draft (Nature, common) |
| `treat_dispenser` | Treat Dispenser | Optional (any habitat) | 120m·5S·2Re | Ord 1 | Creatures here eat 25% less (rounded down, min 1) | Draft (Alchemy, uncommon) |
| `warm_rock` | Sunning Rock | Optional (any habitat) | 80m·10S | Cmf 2 | Taming in this room +10% | Draft (Nature, common) |

## 17.9 Light

| ID | Item | Role | Cost | Stats | Special effect | Unlock |
|---|---|---|---|---|---|---|
| `infirmary_cot` | Infirmary Cot | Req (Infirmary bed) | 90m·6T·3C | Cmf 2 | — | Std |
| `remedy_cabinet` | Remedy Cabinet | Req (Infirmary) | 150m·8T·4G | Ord 2 | Healing +10% | Std |
| `healing_basin` | Healing Spring Basin **(2)** | Optional (Infirmary, Bathhouse) | 350m·15S·10Ra | Aur 3 | Healing +25% | Draft (Light, rare) |
| `sun_window` | Sun Window | Req (Sunlit Sanctum) | 200m·15G·5Ra | Chm 3, Aur 3 | — | Grant (with the blueprint) |
| `meditation_cushions` | Meditation Cushions | Req ×2 (Sanctum); optional elsewhere | 60m·4C | Cmf 2 | Sanctum capacity +1 | Std |
| `soaking_tub` | Soaking Tub **(2)** | Req (Bathhouse) | 220m·10S·5G | Cmf 4 | — | Grant (with the blueprint) |
| `halo_candles` | Halo Candles | Optional | 130m·2G·4Ra | Aur 2, Chm 1 | Composure target +2 in room | Draft (Light, common) |

## 17.10 Shadow

| ID | Item | Role | Cost | Stats | Special effect | Unlock |
|---|---|---|---|---|---|---|
| `ward_circle` | Ward Circle | Req (Warding Chamber) | 200m·10S·2G | Ord 3, Aur 2 | — | Std (Shadow L2) |
| `ward_lantern` | Ward Lantern | Optional | 160m·5G·5Um | Ord 2 | Hazards in room −30%, adjacent rooms −10% | Draft (Shadow, common) |
| `penitent_benches` | Penitent Benches | Req (Detention Hall) | 100m·10T | Ord 2 | — | Grant (with the blueprint) |
| `silence_bell` | Silence Bell | Optional | 250m·5S·8Um | Ord 3 | Misbehavior in adjacent rooms −15% | Draft (Shadow, uncommon) |
| `shadow_ledger` | Shadow Ledger | Optional (Warding Chamber) | 300m·10C·10Um | Ord 2 | Shows the next hazard roll's target room on the map | Draft (Shadow, uncommon) |
| `nightglass` | Nightglass Pane | Optional | 180m·10G·4Um | Aur 2, Chm 1 | Gloom creatures in adjacent habitats +10% buff | Draft (Shadow, common) |

## 17.11 Craft, storage, Rift and outdoor decor

| ID | Item | Role | Cost | Stats | Special effect | Unlock |
|---|---|---|---|---|---|---|
| `brewing_cauldron` | Brewing Cauldron | Req (Alchemy Lab) | 220m·15S·2G | Aur 3 | — | Std (Alchemy L2) |
| `ingredient_rack` | Ingredient Rack | Req (Alchemy Lab) | 100m·8T·2G | Ord 2 | — | Std (Alchemy L2) |
| `fume_hood` | Fume Hood | Optional (Alchemy Lab) | 250m·10S·10G·3Re | Ord 2 | Explosion chance −40%; removes the Lab's noise penalty | Draft (Alchemy, uncommon) |
| `alembic_array` | Alembic Array **(2)** | Optional (Alchemy Lab) | 450m·20G·10Re·2Es | Aur 4 | Potion yield +10%, brew time −20% | Draft (Alchemy, rare) |
| `workbench` | Workbench | Req (Workshop) | 150m·15T·5S | Ord 2, Foc 1 | — | Grant (with the blueprint) |
| `tool_wall` | Tool Wall | Optional (Workshop) | 90m·8T·3S | Ord 2 | Builder slots +5% speed | Std (Alchemy L4) |
| `kiln` | Kiln | Req (Glassworks) | 200m·25S | Aur 2 | — | Grant (with the blueprint) |
| `loom` | Loom | Req (Weaving Room) | 150m·15T | Ord 1 | — | Grant (with the blueprint) |
| `shelving` | Shelving | Req (Storage Vault) | 50m·8T | Ord 1 | — | Std |
| `practice_dummies` | Practice Dummies | Req (Training Yard) | 80m·10T·2C | Ord 1 | — | Grant (with the Rift Gate) |
| `supply_chest` | Supply Chest | Optional (Training Yard) | 120m·10T | Ord 1 | Expeditions get +1 supply slot (max 1) | Std (after the Rift opens) |
| `artifact_plinth` | Artifact Plinth | Req (Trophy Hall, per artifact) | 150m·15S | Chm 2 | Displays one artifact | Std |
| *Outdoor decor (1 per plot):* | | | | | | |
| `garden_gnome` | Enchanted Gnome | Outdoor | 60m·5S | — | +1 Academy Charm; scares away 10% of grounds hazards | Std |
| `bird_bath` | Bird Bath | Outdoor | 80m·10S | — | Sky creatures +5% buff | Draft (Light, common) |
| `scarecrow` | Hexed Scarecrow | Outdoor | 90m·6T·2C·2Um | — | Plot output +5% | Draft (Shadow, common) |
| `stone_lantern` | Stone Lantern | Outdoor | 100m·12S | — | +2 Academy Charm | Std |
| `beehive_box` | Beehive Box | Outdoor (food plots only) | 120m·8T | — | +0.1 Nectar/bell | Draft (Nature, common) |
| `windmill_charm` | Windmill Charm | Outdoor | 150m·10T·3Re | — | Plot output +8% | Draft (Alchemy, uncommon) |
| `fairy_ring` | Fairy Ring | Outdoor | 250m·10He·5In | — | 5% per day: a wild common creature visits (Section 22.3) | Draft (Nature, uncommon) |
| `rune_marker` | Rune Marker | Outdoor | 200m·15S·5Um | — | Grounds hazards −15% | Draft (Shadow, uncommon) |

## 17.12 Legendary furniture (Rift-only)

| ID | Item | Room | Cost to place | Stats | Special effect | Source |
|---|---|---|---|---|---|---|
| `starfall_chandelier` | Starfall Chandelier | Any | 600m | Foc 6, Chm 6 | +0.3 Insight/bell | Rift: Ashen Wastes or Shattered Spire |
| `heartwood_bench` | Living Heartwood Bench **(2)** | Common Room, Lounge, Sanctum | 600m | Cmf 6, Chm 4 | Users' morale +5 | Rift: Ashen Wastes or Shattered Spire |
| `choir_bells` | Choir of Bells | Sanctum, Entrance Hall | 700m | Aur 5, Chm 5 | Composure target +5 Academy-wide | Rift: Ashen Wastes or Shattered Spire |
| `veilweaver_loom` | Veilweaver Loom **(2)** | Warding Chamber | 800m | Ord 6, Aur 4 | Veil cost −5% (inside the Veil reduction cap) | Rift: Shattered Spire |
| `everburning_athanor` | Everburning Athanor **(2)** | Alchemy Lab | 800m | Aur 8 | Potion yield +15%; basic brews complete instantly | Rift: Shattered Spire |
| `phoenix_hearth` | Phoenix Hearth | Refectory, Common Room | 700m | Cmf 6, Chm 4 | Meals are always Hearty; replaces the Hearth requirement | Rift: Shattered Spire |

# 18. The Veil and Upkeep

## 18.1 Role and player goal

The Veil is the shimmering enchantment that hides and protects the Academy. It is Ankicaster's one recurring fixed cost and its gentle replacement for Spellcaster University's looming Dark Lord: instead of a clock that ends the game, a daily bill that grows with the size of what you have built. The player's goal is to keep the Veil Strong at a cost that leaves room to grow, using Shadow levels, wards and warders to bring the bill down.

## 18.2 Daily upkeep (BR-24)

`veil_cost_per_day = round((40 + 3 × size_points) × (1 − veil_reduction))`

- `size_points` is the sum of room Veil values (Section 15.10). It depends only on **buildings, rooms and grounds**, never on how many characters or creatures live there.
- `veil_reduction` is the sum of every Veil-cost reduction, **capped at 50%**. Draft 8 names five kinds, and all five are present:

| Kind (Draft 8) | Sources in this GDD | Reduction |
|---|---|---|
| **Shadow wizard levels** | Shadow buff, levels 6–10 (BR-09) | 3% per level, max 15% |
| **Warders** | Each warder on duty in a Warding Chamber (Section 11) | 3% each, max 3 warders (9%); Warder alumni (Section 31.3) up to 10% |
| **Some creatures** | Umbral Wyrmling (5%), Velvet Bat Swarm (2%) | As listed in Section 22.7 |
| **Arcane research** | *Veil Theory* I / II / III, researched at a Library (below) | 3% per rank, max 9% |
| **Draft cards** | *Veil Thread* (Shadow, Uncommon boon: −10% for 7 Anki days); *Warding Primer* (Shadow, Rare: a permanent −3%, once); Veilweaver Loom pattern (5%) | As listed |
| Other buffs | Warding Chambers (5% each, max 3 counted); Ledger of Thin Places artifact (5%); spellbooks (Section 31) | As listed |

**Veil Theory (Arcane research).** At a Library, the wizard or a scholar researches one rank at a time. The research advances by honest reviews, like a training session, and does not block orb training.

| Rank | Requires | Cost | Research time | Effect |
|---|---|---|---|---|
| I | Arcane L3, a Library | 40 Insight + 150 mana | 60 reviews | Veil cost −3% |
| II | Arcane L6 | 80 Insight + 300 mana | 120 reviews | −3% more |
| III | Arcane L9 | 150 Insight + 600 mana | 200 reviews | −3% more |

| Example Academy | size_points | Cost before reductions | With Shadow L10 + 3 chambers (−30%) |
|---|---|---|---|
| Day 1 starting layout | 17 | 91 | 64 |
| Week 2 (dorm, refectory, 2 classrooms, greenhouse, a few plots) | 55 | 205 | 144 |
| Week 6 (≈20 rooms, 8 plots) | 110 | 370 | 259 |
| Month 4 (≈35 rooms, 14 plots) | 190 | 610 | 427 |
| Late game (≈55 rooms, 18 plots, Menagerie, Rift Gate) | 300 | 940 | 658 |

At 150 reviews a day (≈1,500 mana) the Veil takes roughly 6% of income on day 1, 15–25% in the mid game and 30–45% late, which is the intended pressure curve.

## 18.3 Veil strength

The Veil has a **strength** 0–100 (starts at 100).

| Band | Strength | Hazard chance × | Breaches | Composure modifier | Visual |
|---|---|---|---|---|---|
| **Strong** | 80–100 | ×1.0 | None | 0 | Faint shimmering dome |
| **Thinning** | 50–79 | ×1.5 | None | −10 | Dome flickers |
| **Thin** | 20–49 | ×2.5 | 1% per bell | −20 | Patchy dome, wisps outside |
| **Torn** | 0–19 | ×4.0 | 3% per bell | −35 | Visible tears, shadowy shapes |

Strength changes:

| Cause | Change |
|---|---|
| Active day, upkeep paid in full | +5 (up to 100) |
| Each Warder on duty (active day) | +5 |
| Standing Stones (active day) | +2 each |
| **Reinforce the Veil** (player action, pay 1× today's upkeep, any number of times) | +15 each |
| Veil Tonic potion | +15 |
| Active day, upkeep **not** paid | −20 × unpaid fraction |
| Breach "Veil Rent", Umbral Wyrmling escape | −10 |
| Away day (no reviews), paid or not | No change: the Veil never thins while the user is away (see 18.5) |

## 18.4 Charging and non-payment (BR-25)

At each day tick the game processes every elapsed Anki day since the last processed day, in order:

```
for each day d not yet processed:
    cost = veil_cost_per_day(d)
    if day_had_honest_reviews(d):                 # active day
        paid = min(bank, cost)
        bank -= paid
        if paid == cost: strength += 5 + warder_regen + stones_regen
        else:            strength -= 20 * (1 - paid / cost)
    else:                                          # away day (BR-26)
        floor = 0.10 * bank_at_last_review
        paid = clamp(bank - floor, 0, cost)
        bank -= paid
        # strength never changes on an away day: the Veil holds
    strength = clamp(strength, 0, 100)
    record ledger entry (day, cost, paid, strength_after, active/away)
```

What non-payment does: **only** lowers strength. A thin Veil makes hazards and breaches more likely during *future bells*. It never deletes, damages or removes anything (BR-25). The worst outcome of a Torn Veil is a busy few sessions of locked rooms, minor injuries and loose creatures, all of which resolve.

The payment policy can be set to **Auto-pay** (default) or **Ask me** (the arrival summary asks whether to pay; unpaid days thin the Veil as above). There is no way to accidentally drain the bank: Auto-pay on active days never takes more than one day's cost per day.

## 18.5 Breaks and the 10% floor (BR-26)

- `bank_at_last_review` is the mana bank value immediately after the most recent honest review.
- On away days (no honest reviews that Anki day), the Veil auto-pays from the bank **until the bank reaches 10% of `bank_at_last_review`**; after that, payments stop and the **Veil holds where it is**. It does not thin, even though upkeep is no longer paid: strength is frozen, no bells ring, no hazards or breaches can happen, needs do not tick, and nothing else changes.
- When the user returns and studies, the next active day resumes normal charging.
- Example: the bank was 12,000 after the last review; daily cost is 400. The user is away for 40 days. Days 1–27 are paid (10,800 total), leaving 1,200 (10%); on day 28 the remaining 0 is paid and from then the Veil holds. On return the bank shows 1,200 and the Veil is exactly as strong as when they left.

The arrival summary after a break says: "Welcome back! The Veil kept the Academy safe for 40 days (27 paid from your bank, then it held on its own). Everyone is exactly as you left them."

## 18.6 Design purpose and tensions

The Veil turns Academy size into an ongoing cost so that the player weighs breadth against quality, and gives the Shadow school and warders a clear job. The away rules make sure that a holiday costs at most 90% of the bank and never anything else, so a big bank is a comfortable cushion, not a score that can be wiped out.

# 19. Hazards and Wards

## 19.1 Role and player goal

Hazards are small magical problems that make the Academy feel alive and give wards, warders and the Shadow school a purpose. They are frequent enough to notice, rarely severe, and always temporary. The player's goal is to keep them rare (strong Veil, wards) and short (warders, spells, potions).

## 19.2 Hazard rolls

Once per bell the Academy rolls for a hazard:

`p_hazard = 0.02 × band_multiplier × (1 + size_points / 200) × (1 − hazard_reduction)`

- `band_multiplier` from the Veil band (Section 18.3).
- `hazard_reduction` = Shadow buff (3%/step) + warders (10% each) + creature buffs + artifacts + spellbooks, **capped at 75%**. Local reductions (Warding Chamber radius −20%, Ward Lantern −30%/−10%, Standing Stones and Rune Markers on grounds) apply when choosing and resolving the target room: a room's local reduction is the chance that a hazard aimed at it "fizzles" instead.

If a hazard occurs, pick its type by weight among types whose target rooms exist, then pick a target room (rooms weighted by their Veil value). Typical frequency: a mid-game Academy with a Strong Veil and some wards sees one hazard every 40–80 reviews.

## 19.3 Hazard catalog

Durations are in honest reviews. "Locked" rooms run at 0% for the duration; occupants are reassigned temporarily; nothing in them is lost.

| ID | Hazard | Targets | Weight | Effect | Duration | Faster resolution |
|---|---|---|---|---|---|---|
| `mana_static` | Mana Static | Any room | 10 | Furniture special effects in the room switch off | 20 | Warder: instant; *Dispel* spell |
| `poltergeist` | Poltergeist | Castle rooms | 10 | Cleanliness −30; occupants Composure −5 | 30 | Warder 10; Calming Verse scroll |
| `wild_growth` | Wild Growth | Greenhouse, plots, Nature rooms | 8 | Room locked by vines | 30 | Gardener 10. Silver lining: +5 Herbs when cleared |
| `hex_fog` | Hex Fog | A whole floor | 6 | Floor Composure −10; Focus −3 in its rooms | 40 | *Clear Skies* spell; Wardwater |
| `gravity_hiccup` | Gravity Hiccup | A whole floor | 5 | Rooms on the floor ×0.5 efficiency (everything floats) | 20 | None needed; very funny animation |
| `imp_infestation` | Imp Infestation | Storage, Kitchen | 6 | Imps **hide** 10% of Provisions (returned in full when cleared) | 40 | Warder 10; Shade Hound instant |
| `echo_loop` | Echo Loop | Library, Arcane rooms | 6 | Room yields 0 (everyone repeats the same sentence) | 20 | Scholar 5 |
| `wisp_swarm` | Will-o'-Wisp Swarm | Grounds | 6 | Plot outputs 0 on 2 plots | 30 | Silver lining: 25% chance a Lantern Moth stays as a visitor |
| `cold_snap` | Cold Snap | Greenhouse, dorms | 5 | Greenhouse −50%; dorm Rest target −10 | 40 | Hearth/Warm Hearthstone in the room halves it |
| `night_ink` | Spill of Night | A whole floor | 5 | Focus −5 in rooms on the floor | 20 | *Glow* spell |
| `bubbling_cauldron` | Bubbling Cauldron | Alchemy Lab (while brewing) | special | Cleanliness −40; 30% chance one occupant is Bruised. The brew continues. | — | Fume Hood, Steady Hand, alchemist reduce chance |
| `kitchen_fire` | Kitchen Fire | Kitchen, Refectory | 4 | Room locked; next meal at 50% capacity | 20 | Fireproof Salve prevents; Void-like *Douse* spell |
| `drafty_window` | Mischievous Draft | 3 random castle rooms | 6 | Cleanliness −15 each | — | — |
| `rift_tremor` | Rift Tremor | Rift Gate (after the Rift opens) | 4 | Gate locked; expeditions launched while it lasts get −1 Rift Fortune (running expeditions are unaffected) | 30 | Warder 10 |

## 19.4 Rift breaches (Thin and Torn Veil only)

| ID | Breach | Effect | Resolution |
|---|---|---|---|
| `shade_breach` | Shade Breach | A shade drifts into a room: room locked; each occupant 40% Bruised or 20% Hexed | A warder or the *Banish* spell resolves instantly; otherwise it leaves after 60 reviews |
| `gloom_pack` | Gloomhound Pack | Prowls the grounds: every habitat rolls escape ×5 this bell | Leaves after one bell; Shade Hound halves |
| `veil_rent` | Veil Rent | Strength −10; 3 random rooms locked | 30 reviews; Reinforce the Veil ends it immediately |
| `wanderer` | A Wanderer from Beyond | A strange, harmless-looking creature sits in the Entrance Hall: Composure −10 Academy-wide | Feed it 20 Provisions **or** a tamer can tame it (160 reviews) into a random rare creature of any school (silver lining) |

Breaches are the only events that can injure several characters at once. Injuries always heal (Section 23).

## 19.5 Wards summary

| Ward source | Effect |
|---|---|
| Shadow wizard levels 6–10 | −3% hazards per level (and −3% Veil cost, −3% misbehavior) |
| Warding Chamber | −5% Veil cost (max 3); −20% hazards within 3 BFS steps |
| Warder (career) | −10% hazards Academy-wide each; +5 Veil strength/day; instant resolution of most hazards; auto-resolves breaches |
| Ward Lantern | −30% in its room, −10% adjacent |
| Standing Stones, Rune Marker, Enchanted Gnome | Grounds hazards −50% / −15% / −10% |
| Ward Scroll | Prevents the next hazard on one floor |
| Wardwater potion | Prevents the next hazard on one floor; ends Hex Fog |
| Creatures (Glyph Cat, Velvet Bats, Night Lynx, Hush Raven) | See bestiary |
| Spells (*Ward Pulse*, *Dispel*, *Banish*) | See Section 29 |

# 20. Misbehavior

## 20.1 Role and player goal

Students are young wizards; they get up to things. Misbehavior is the student-driven counterpart to Veil hazards: personality-flavoured, often funny, occasionally useful, never cruel. The player's goal is to keep morale up, place Order furniture, and build a Detention Hall (and hire warders) when the Academy gets big.

## 20.2 Rolls

Each bell, each **student** (faculty do not misbehave) rolls:

`p_misbehave = 0.004 × personality_mult × trait_mults × morale_mult × (1 − misbehavior_reduction) × room_order_factor`

- `morale_mult` from Section 14.6 (×2.0 at low morale down to ×0.6 at high morale).
- `misbehavior_reduction` = Shadow buff (3%/step) + warders (10% each) + Common Room L3 (5%) + Dartboards (5% each, max 2) + Duskmouse (5%) + artifacts/spellbooks, **capped at 75%**.
- `room_order_factor` = `1 − min(0.3, room_Order_points / 100)` for the room the student is seated in (Order furniture helps), with Hush Chimes / Silence Bell / Detention adjacency applied here.

A typical 12-student mid-game Academy at morale 70 with light wards sees roughly one incident per 60–120 reviews.

## 20.3 Misbehavior catalog

| ID | Incident | Most likely from | Effect | Silver lining / resolution |
|---|---|---|---|---|
| `graffiti_glyphs` | Graffiti Glyphs | Mischievous, Prankster | Room cleanliness −20; room Charm −3 until cleaned to 80+ | Glyphs occasionally (10%) reveal one ingredient of an undiscovered recipe |
| `food_fight` | Food Fight | Social, Mischievous | Refectory cleanliness −40; next meal uses +5 Provisions | Leisure +10 for everyone involved |
| `unauthorized_summoning` | Unauthorized Summoning | Curious, Summoner-at-Heart | Triggers an Echo Loop or Imp Infestation hazard | 15% chance a common creature visitor appears |
| `sneaking_out` | Sneaking Out to the Woods | Bold, Curious | Student absent 20 reviews (no lesson yield) | Returns with 3–8 of a random common material |
| `hex_duel` | Hallway Hex Duel | Bold, Daredevil | Two students: 20% Bruised each | Both gain +1 Rift Fortune on their first expedition if they ever become adventurers (they "trained") |
| `creature_release` | Creature Release | Gentle (out of sympathy), Mischievous | One creature becomes Loose | — |
| `potion_prank` | Potion Prank | Curious, Prankster | A random cosmetic status for 1 day (green hair, floating, tiny voice) | Composure +5 for onlookers (it's hilarious) |
| `midnight_feast` | Midnight Feast | Social, Glutton | Provisions −10 (max 5% of stock) | Dorm Leisure +10 |
| `bell_prank` | The Bell Tower Prank | Mischievous | All students' Rest −5 | — |
| `library_fort` | Library Fort | Bookish (!), Dreamy | Library readers displaced for 20 reviews | +2 Insight |
| `portrait_mustache` | The Founder's Mustache | Prankster | Founder's Portrait Charm −2 until the room is cleaned | The wizard's sprite briefly wears the mustache. Achievement. |
| `broom_joyride` | Broom Joyride | Bold, Daredevil | 30% Bruised | Leisure +5 |
| `alchemy_dare` | Alchemy Dare | Curious, Firebug | Lab explosion chance ×3 next bell | — |
| `rift_peek` | Peeking Through the Rift | Curious, Bold (after the Rift opens) | Student wanders to the Gate; Gate locked 10 reviews | 10% chance they bring back a Mossy Hollow trinket (3–8 Timber or Herbs) |
| `secret_club` | A Secret Club | Social, Mischievous | 3 students: Leisure +10, misbehavior ×1.2 for 30 bells | The club gets a funny name in the chronicle |
| `dorm_swap` | Midnight Dorm Swap | Social | Bed assignments shuffled for 1 day | Roommates' Composure +3 (new friends) |

## 20.4 Detention and consequences

If a Detention Hall with a free spot exists, the offending student is sent there automatically for 3 bells (no lesson yield; Composure −5). Afterwards their misbehavior chance is halved for 30 bells. With a warder present, each detention has a 5% chance to remove Prankster or Rule-Bender. There is **no expulsion** and no permanent penalty; misbehavior can never affect card links, skill, mastery or anything else in Anki.

# 21. Food, Gardens and the Greenhouse

## 21.1 Role and player goal

Food is the Academy's first logistics chain: plots and greenhouses grow it, storage holds it, the refectory serves it, people and creatures eat it. The player's goal is to keep production a little ahead of headcount and to choose crops that also feed the potion and creature economies.

## 21.2 Food resources

| Resource | Eaten by | Main sources | Default cap |
|---|---|---|---|
| **Provisions** | All characters (1 per meal), omnivore creatures | Vegetable Patch, Greenhouse, Orchard, events, alumni | 300 (+200 per Storage Vault, +100 Frostbox) |
| **Greens** | Herbivore creatures; potions | Vegetable Patch (side output), Greenhouse crops, Featherfern | 300 (+200 per vault) |
| **Fish** | Fish-eating creatures; potions | Pond, Tide Tank side output (Puddlewyrm) | 300 (+200 per vault) |
| **Nectar** | Insects, birds, some Light creatures; potions | Orchard, Apiary, Beehive Box, Glimmerberry crop | 300 (+200 per vault) |
| **Herbs** (essence of Nature, also a crop) | Potions, some furniture | Herb Garden, Greenhouse, Nature lessons | Uncapped |

Overflow above the cap is not produced (production pauses); nothing is destroyed.

## 21.3 Greenhouse crops

Each Greenhouse crop bed grows one crop chosen by the player (changing crops is free and instant). Outputs are per bed per bell before efficiency, gardener (×1.5) and the Nature buff (+3%/step).

| Crop | Unlock | Output per bed per bell | Notes |
|---|---|---|---|
| Hearthroot | Start (with the Greenhouse) | 1.0 Provisions | The staple |
| Moonbeans | Start | 0.75 Provisions + 0.25 Greens | Default crop |
| Featherfern | Nature L3 | 0.8 Greens | For herbivore-heavy menageries |
| Silverleaf | Start | 0.6 Herbs | Potion staple |
| Glimmerberry | Draft (Nature, common) | 0.5 Provisions + 0.3 Nectar | Feeds moths and finches |
| Dreamthistle | Draft (Arcane, uncommon) | 0.4 Herbs + 0.05 Insight | Arcane cross-crop |
| Emberpepper | Draft (Alchemy, uncommon) | 0.6 Provisions + 0.05 Reagents | Kitchen-friendly |
| Shadecap Mushrooms | Draft (Shadow, uncommon) | 0.3 Herbs + 0.05 Umbra | Must be in a Greenhouse adjacent to a Gloom Hutch or on floor 0 |
| Sunwheat | Draft (Light, uncommon) | 1.2 Provisions | Needs a Rain Cistern in the Greenhouse |
| Starfruit | Rift (Crystal Caverns) — Rare Seed | 0.6 Provisions + 0.1 Insight + 0.02 Crystal | Gardener required |
| Heartwood Sapling | Rift (Whispering Fen, "rare herbs") — Rare Seed | 0.5 Herbs + 0.01 Heartwood | Gardener required |
| Lumen Lily | Rift (Whispering Fen, "rare herbs") — Rare Seed | 0.4 Herbs + 0.06 Radiance | Gardener required |

## 21.4 Plot outputs (recap)

| Plot | Output per bell |
|---|---|
| Vegetable Patch | 1.0 Provisions + 0.2 Greens |
| Herb Garden | 0.6 Herbs |
| Pond | 0.8 Fish |
| Orchard | 0.8 Provisions + 0.3 Nectar |
| Apiary | 0.5 Nectar (+5% to adjacent plots) |

Gardeners assigned to plots (up to 3 plots each) multiply output ×1.5 × proficiency.

## 21.5 Meals

Every 5th bell is a **mealtime** (Section 14.4): each character consumes 1 Provision (Glutton 2), reduced by Kitchen (−10%) and Bottomless Stewpot (−20%), rounded per meal across the whole Academy. Refectory meal capacity is `seats × 2 × efficiency` (rounded down). Creatures eat at the same mealtimes (Section 22.5).

**Food balance rule of thumb:** each character needs 0.2 Provisions per bell. One Vegetable Patch (1.0/bell) feeds 5 characters; a 2-bed Greenhouse of Hearthroot with a gardener at efficiency 1.2 (≈3.6/bell) feeds about 18.

## 21.6 Shortages

If Provisions run out at a mealtime, characters who did not eat get the "no food" Hunger target until the next meal. Morale drops; misbehavior rises. Nobody starves, leaves or is harmed. The arrival summary flags "3 students went hungry at the last meal — the pantry is empty" with a one-click link to the Build menu filtered to food rooms.

# 22. Creatures and Taming (Bestiary)

## 22.1 Role and player goal

Creatures are Ankicaster's collection layer, in the spirit of Spellcaster University's familiars and dragons: each one is a small living buff with its own home, diet and personality, and each causes a little trouble when it gets out. The player's goal is to fill habitats with complementary creatures, keep them fed and their pens pleasant, and chase rare and legendary ones through the Rift.

## 22.2 Habitats

| Habitat | Room(s) | Unlocked at |
|---|---|---|
| **Meadow** | Meadow Paddock (grounds), Menagerie module | Nature L3 |
| **Tide** | Tide Tank (floor 0), Menagerie module | Nature L3 |
| **Sky** | Aviary (needs sky), Menagerie module | Light L3 |
| **Gloom** | Gloom Hutch, Menagerie module | Shadow L3 |
| **Ember** | Ember Pit (floors 0–1), Menagerie module | Alchemy L3 |
| **Crystal** | Crystal Vivarium, Menagerie module | Arcane L3 |

## 22.3 How creatures arrive

| Source | Rarity | Rule |
|---|---|---|
| **Visitors** | Common, sometimes Uncommon | At each day tick, each habitat type with a free space has a 4% chance (+5% Fairy Ring, +Lure Musk guaranteed) that a wild creature of that habitat appears in the pen as **Wary**. Visitors that are not wanted can be released (no penalty). |
| **Lure cards** (draft) | Common–Rare | A school deck lure card summons a creature of that school (rarity on the card) into a matching free habitat. |
| **Silver linings** | Varies | Some hazards, breaches and misbehavior incidents bring a creature (e.g., Wisp Swarm → Lantern Moth; Wanderer → random rare). |
| **The Rift** | Common–Legendary | Expedition loot arrives as **eggs** that hatch in a matching habitat (Section 27.10): Common eggs from Mossy Hollow, owls and sprites from the Whispering Fen, Rares from the Crystal Caverns, fire and Epic eggs from the Ashen Wastes, Legendary eggs from the Shattered Spire. The Geode Golem is awakened from three Golem Cores. |
| **Events** | Varies | E.g., "A Basket on the Doorstep" (Section 28). |

A creature with nowhere to live waits in the Entrance Hall for 1 day ("Looking for a home"), then wanders off. Rift eggs and Rift creatures never wander off: they wait in Storage until a habitat is free.

## 22.4 Taming

1. A newly arrived creature is **Wary**: it eats, gives no buff, and escapes more easily.
2. Assign a **tamer** (career), or the **wizard** (Nature L3+, Common creatures only, 50% speed).
3. Each honest review adds taming progress: `1.0 × tamer_proficiency × (1 + nature_buff) × modifiers` (Gentle personality +4%, Beast Whisperer +25%, Sunning Rock +10%, Beast Biscuit +30 points at once).
4. When progress reaches the creature's taming requirement, it becomes **Tamed** and its buff turns on.
5. **Bond.** Tamed creatures gain Bond levels: Bond 2 after 150 more honest reviews, Bond 3 after 400. Buff strength ×1.25 at Bond 2, ×1.5 at Bond 3. Bond never decreases.

| Rarity | Taming requirement (reviews) | Escape chance per bell (Wary / Tamed) |
|---|---|---|
| Common | 40 | 1.5% / 0.20% |
| Uncommon | 90 | 1.5% / 0.20% |
| Rare | 160 | 2.0% / 0.25% |
| Epic | 260 | 2.5% / 0.30% |
| Legendary | 400 | 3.0% / 0.30% |

## 22.5 Food

At each mealtime (every 5 bells) each creature eats its diet from stock. A creature that cannot be fed becomes **Hungry**: buff halved, escape chance ×3 until fed. Creatures never die, sicken permanently or leave because of hunger.

## 22.6 Escapes and "trouble"

Each bell, each creature rolls its escape chance × modifiers (habitat quality: Bare ×1.5, Plain ×1.2, Cozy ×1.0, Fine ×0.8, Splendid ×0.5; Creature Toybox −20%; tamer assigned −50%; Hungry ×3; Shadow buff −3%/step). On escape:

1. The creature's **trouble** effect (bestiary column) happens once.
2. The creature becomes **Loose**: its sprite wanders the map; its buff is off.
3. It returns when a tamer or warder recaptures it (15 reviews of their time), when the wizard casts *Beckon* (instant), or on its own after 40 reviews if its habitat has food in stock.

Loose creatures are **never lost**. Any resource "hidden" by trouble is returned on recapture.

## 22.7 Bestiary

Buffs are at Bond 1 and apply only while the creature is Tamed and fed. Same-species buffs stack up to 2 copies unless stated. Diet is per meal.

| # | Creature | School | Rarity | Where found | Habitat | Taming | Diet | Buff | Escape trouble |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Mossback Tortoise | Nature | Common | Visitor; Nature lure | Meadow | 40 | 1 Greens | Greenhouse output +5% | Naps in the Vegetable Patch: that plot −50% for 10 reviews |
| 2 | Thistle Hare | Nature | Common | Visitor; Nature lure | Meadow | 40 | 1 Greens | +0.1 Herbs per bell | Hides 5 Herbs (returned on recapture) |
| 3 | Bramblefox | Nature | Uncommon | Visitor; Nature lure | Meadow | 90 | 1 Provisions | Grounds hazards −15% | Hides 5 Provisions |
| 4 | Moonsheep | Nature | Uncommon | Nature lure | Meadow | 90 | 2 Greens | Weaving Room ×2 output; 1 Moonsilk per 40 bells | Sleeps in a dorm bed: one student's Rest −15 |
| 5 | Puddlewyrm | Nature | Uncommon | Pond visitor; Nature lure | Tide | 90 | 1 Fish | Pond +15% | Floods a floor-0 room: cleanliness −30 |
| 6 | Glimmerhorn Stag | Nature | Rare | Rift egg: Crystal Caverns | Meadow | 160 | 3 Greens | Academy morale +3 | Knocks the paddock fence: every creature in its pen rolls escape |
| 7 | Coral Kelpie | Nature | Rare | Rift egg: Whispering Fen | Tide | 160 | 2 Fish | Bathhouse and Infirmary +10% | Soaks a student: Composure −10 |
| 8 | Verdant Drake | Nature | Epic | Rift egg: Ashen Wastes | Meadow | 260 | 2 Provisions + 2 Greens | Food and Herbs output +12% | Scorches the Greenhouse: locked 30 reviews |
| 9 | Elder Treant Sprout | Nature | Legendary | Rift egg: Shattered Spire | Meadow | 400 | 3 Greens + 1 Herbs | Gardener output +20% | Roots itself in a corridor: that corridor blocks movement for 20 reviews |
| 10 | Inkling Wisp | Arcane | Common | Visitor; Arcane lure | Crystal | 40 | 1 Insight | Library +5%; +0.05 Insight per bell | Hides 3 books: Library −20% for 15 reviews |
| 11 | Orrery Moth | Arcane | Common | Visitor; Arcane lure | Sky | 40 | 1 Nectar | Observatory +5%; Rift Fortune +1 (Section 27.9) | Nibbles curtains: one Cloth furniture item Damaged |
| 12 | Glyph Cat | Arcane | Uncommon | Arcane lure | Crystal | 90 | 1 Provisions | Hazards −8% | Teleports into a classroom: its yield is 0 for 10 reviews (everyone pets it) |
| 13 | Prism Beetle | Arcane | Uncommon | Quarry visitor; Arcane lure | Crystal | 90 | 1 Insight | 1 Crystal per 25 bells | Chews glass: one Glass furniture item Damaged |
| 14 | Star Heron | Arcane | Rare | Rift egg: Whispering Fen | Sky | 160 | 2 Fish | Foresight +1 day; Rift Fortune +1 | Perches on the Observatory: locked 15 reviews |
| 15 | Phase Ferret | Arcane | Rare | Rift egg: Crystal Caverns | Crystal | 160 | 2 Insight | Successful expeditions +1 loot roll | "Borrows" an artifact: inactive until recaptured |
| 16 | Aether Serpent | Arcane | Epic | Rift egg: Ashen Wastes | Crystal | 260 | 3 Insight | Draft prices −8% | Tears a tiny rift: Echo Loop hazard |
| 17 | Chronoflare Owl | Arcane | Legendary | Rift egg: Shattered Spire | Sky | 400 | 3 Insight | Once per day, a draft shows 4 cards instead of 3 | Stops the clocks: Grandfather Clocks and Foresight off for 20 reviews |
| 18 | Lantern Moth | Light | Common | Visitor; Wisp Swarm silver lining; Light lure | Sky | 40 | 1 Nectar | Academy Charm +3; Composure target +1 | Swarms a lamp: a room's Focus −5 for 10 reviews |
| 19 | Dawn Finch | Light | Common | Visitor; Light lure | Sky | 40 | 1 Greens | Composure target +2 | Sings at night: one dorm's Rest −5 |
| 20 | Halo Lamb | Light | Uncommon | Light lure | Meadow | 90 | 1 Greens | Healing +10% | Follows a student to class: room Focus −2 for 10 reviews |
| 21 | Gilded Pangolin | Light | Uncommon | Light lure; event | Ember | 90 | 1 Nectar | +5 Renown when tamed; Trophy Hall artifacts' Renown ×1.5 | Rolls off with 10 Glass (returned on recapture) |
| 22 | Dawnhart Gryphon | Light | Rare | Rift egg: Crystal Caverns | Sky | 160 | 3 Provisions | As a companion: expeditions return 15% sooner | Carries a student to the roof: 50% Bruised |
| 23 | Sunlit Unicorn | Light | Epic | Rift egg: Ashen Wastes | Meadow | 260 | 2 Greens + 1 Radiance | Healing +20%; Hexed injuries heal without a healer | Hides in the Sanctum: locked 20 reviews (Composure +5 nearby) |
| 24 | Ember Phoenix | Light | Legendary | Rift egg: Ashen Wastes (rare) or Shattered Spire | Ember or Sky | 400 | 2 Radiance + 1 Reagents | Recovery +10%; as a companion, heals the worst Rift injury on return | A small fire in its room: locked 15 reviews |
| 25 | Duskmouse | Shadow | Common | Visitor; Shadow lure | Gloom | 40 | 1 Provisions | Misbehavior −5% | Startles the Refectory: next meal −10% capacity |
| 26 | Hush Raven | Shadow | Common | Visitor; Shadow lure | Gloom or Sky | 40 | 1 Provisions | Hazards resolve 15% faster | Steals shinies: hides 5 Glass |
| 27 | Velvet Bat Swarm | Shadow | Uncommon | Shadow lure | Gloom | 90 | 1 Nectar | Hazards −8%; Veil cost −2% | Roosts in a dorm: residents' Rest −10 for 10 reviews |
| 28 | Shade Hound | Shadow | Uncommon | Shadow lure; may stay after a breach | Gloom | 90 | 1 Umbra | Breach effects −50%; clears Imp Infestations instantly | Howls: floor Composure −10 for 15 reviews |
| 29 | Night Lynx | Shadow | Rare | Rift egg: Crystal Caverns | Gloom | 160 | 2 Provisions | Hazards −15% | Hunts: another random creature becomes Loose |
| 30 | Umbral Wyrmling | Shadow | Epic | Rift egg: Ashen Wastes | Gloom | 260 | 3 Umbra | Veil cost −5% (inside the cap) | Gnaws the Veil: strength −10 |
| 31 | Moonless Kitsune | Shadow | Legendary | Rift egg: Shattered Spire | Gloom | 400 | 2 Umbra + 1 Nectar | Misbehavior −20% | Plays tricks: three students get a Potion Prank cosmetic status |
| 32 | Cinder Newt | Alchemy | Common | Visitor; Alchemy lure; Rift egg: Ashen Wastes | Ember | 40 | 1 Reagents | Potion yield +5% | Singes a room: cleanliness −15 |
| 33 | Mopslime | Alchemy | Common | Visitor; Alchemy lure | Tide | 40 | 1 Provisions | Cleans 3 points per bell Academy-wide | Absorbs 5 Provisions (returned on recapture) |
| 34 | Bellows Toad | Alchemy | Uncommon | Alchemy lure | Ember | 90 | 1 Fish | Construction slots +5% speed | Puffs up in the Workshop: locked 10 reviews |
| 35 | Quicksilver Otter | Alchemy | Uncommon | Pond visitor; Alchemy lure | Tide | 90 | 2 Fish | Glassworks and Weaving Room +15% | Slips into the Pond: Pond output 0 for 15 reviews |
| 36 | Alembic Salamander | Alchemy | Rare | Rift egg: Ashen Wastes | Ember | 160 | 2 Reagents | Potion yield +10%; lab explosions −30% | Starts a lab fire: Alchemy Lab locked 20 reviews |
| 37 | Philosopher's Chimera | Alchemy | Legendary | Rift egg: Shattered Spire | Menagerie only (needs Ember + Crystal modules) | 400 | 2 Reagents + 2 Provisions | Room and furniture materials −8% (inside the cap) | Transmutes a stack: up to 50 Timber become the same amount of Stone |
| 38 | Fen Sprite | Nature | Uncommon | Rift egg: Whispering Fen | Meadow or Tide | 90 | 1 Nectar | Herb Garden and Greenhouse +8% | Hides 5 Herbs in the reeds (returned on recapture) |
| 39 | Mistfeather Owl | Arcane | Rare | Rift egg: Whispering Fen | Sky | 160 | 2 Fish | Library and Scriptorium +10%; Foresight +1 day | Hoots in the Library: locked 10 reviews |
| 40 | Geode Golem | Alchemy | Rare | Awakened from 3 Golem Cores (Crystal Caverns) at a Workshop | Crystal | 160 | 2 Stone | Construction slots +10% speed; Storage caps +10% | Wanders into a corridor and sits down: that corridor blocks movement for 10 reviews |

**Totals:** 40 creatures — 10 Common, 12 Uncommon, 9 Rare, 4 Epic, 5 Legendary. Per school: Nature 10, Arcane 9, Light 7, Shadow 7, Alchemy 7. Every Common species can also hatch from a Mossy Hollow egg. Every Rift destination yields at least one egg type: Common (Hollow), owl and sprite (Fen), Rare (Caverns), fire and Epic (Wastes), Legendary (Spire).

## 22.8 Creature caps and stacking

- Percent buffs from creatures stack additively within a category and are included in that category's global cap (Section 33.6).
- At most **2** of the same species give their buff; extra copies are cosmetic (and still eat).
- Creatures carried on Rift expeditions as companions (Section 27.11) give Rift Fortune instead of their home buff while away.

# 23. Injuries, Health and Healers

## 23.1 Role and player goal

Injuries are the "cost" side of hazards, breaches, misbehavior and the Rift, and the reason the Infirmary and healers exist. They are temporary, readable and never lethal (BR-27: no deaths). The player's goal is to keep injured characters few and short-lived so that adventurers can go out again and careers keep running.

## 23.2 Injury types

| Injury | Typical causes | Health cap while injured | Heal requirement (points) | Effects while injured | Needs a healer or potion? |
|---|---|---|---|---|---|
| **Bruised** | Hex duels, joyrides, minor hazards, minor Rift injuries (Easy–Medium) | 85 | 30 | Career output −10% | No |
| **Sprained** | Minor Rift injuries (Hard–Deadly), serious Rift injuries at Mossy Hollow, gryphon rides | 70 | 80 | Cannot go on expeditions; career output −25% | No |
| **Hexed** | Shade Breach, Rift curses (Easy–Medium), potion accidents | 60 | 120 | Composure −10; cannot go on expeditions | Heals at 25% speed without a healer, Sunlit Unicorn, or a Mending Draught |
| **Broken Bone** | Serious Rift injuries (Whispering Fen and beyond) only | 50 | 200 | Cannot work or go on expeditions; stays in an Infirmary bed if available | No, but heals at 50% speed outside an Infirmary |
| **Rift-Touched** | Rift curses (Hard–Deadly), some Rift events | 80 | 100 | Faint glow; Composure −10; immune to Hex Fog (silver lining) | No |

Injury types are never shifted (the Rift's outcome table is binding). What changes is recovery: Brave heals all injuries 15% faster; Steadfast heals Rift injuries 25% faster and Daredevil 25% slower; a Courage Draught halves the recovery requirement of injuries and curses from its expedition; the Ember Phoenix companion heals the worst Rift injury on return.

## 23.3 Healing

Each honest review adds healing points to every injured character:

`heal_per_review = base × place_factor × healer_factor × (1 + light_recovery_buff) × modifiers`

| Factor | Value |
|---|---|
| base | 1.0 |
| place_factor | Infirmary bed: room efficiency; resting in own bed: 0.5; nowhere (no bed): 0.3 |
| healer_factor | ×2 × healer proficiency if a healer staffs that Infirmary; 1 otherwise |
| light_recovery_buff | +3% per Light step (BR-09) |
| modifiers | Mossbed +20% (own bed), Bathhouse +10%, Moonwell +20%, Halo Lamb +10%, Sunlit Unicorn +20%, Healing Spring Basin +25%, Remedy Cabinet +10%, Hardy trait ×1/0.7 heal requirement, artifacts |

Example: a Sprained adventurer in an Infirmary at efficiency 1.1 with a healer (proficiency 1.0) and Light L8 (+9%) heals 2.4 points per review: 80 points in about 34 reviews.

Infirmary admission is automatic (most severe first). Infirmaries at level 3 also treat creatures that were hurt on expeditions.

## 23.4 Health

Health is 100 unless injured; while injured it is set to the injury's cap and rises toward 100 as healing points accumulate. Health feeds morale (10% weight). There is no disease system and no permanent health loss.

## 23.5 Design purpose

Injuries create a light, satisfying chain — something happens, a healer fixes it, the character is back — without any risk of loss. They make Light useful for every playstyle and give the Rift's "when it goes wrong" table real but recoverable weight.

# 24. Alchemy and Potions

## 24.1 Role and player goal

Alchemy turns surplus ingredients into flexible one-shot tools: heal an injury now, push a construction over the line, calm a rowdy floor, top up the Veil, or prepare an expedition. Like Spellcaster University's cauldron, recipes combine **three different ingredients** and must be discovered. The player's goal is to discover the recipes that matter for their Academy and keep a small stock of emergency potions.

**Rule:** no potion, recipe or ingredient ever produces mana (BR-01).

## 24.2 Brewing

1. Requires an **Alchemy Lab** (2 brewing stations; 3 at L3). Basic recipes can be brewed without an alchemist; Advanced, Rare and Legendary recipes need an alchemist on duty.
2. Choose three **different** ingredients and a station. Ingredients are consumed (one unit each unless the recipe lists more).
3. Brewing takes honest reviews: Basic 20, Advanced 40, Rare 80, Legendary 120 (alchemist ×0.5; Alembic Array −20%; Everburning Athanor makes Basic instant).
4. Yield: **2 potions** base × (1 + Alchemy potion-yield buff 3%/step + Cinder Newt 5% + Alembic Salamander 10% + items) with fractional potions accumulating per recipe; an alchemist adds +1 potion every 4 brews.
5. While a station is brewing, each bell rolls a lab explosion chance of 0.5% (the *Bubbling Cauldron* hazard), reduced by alchemist (−50%), Steady Hand, Fume Hood (−40%) and Alembic Salamander (−30%), increased by Firebug and Alchemy Dare. An explosion never ruins the brew.

## 24.3 Discovery

- Recipes are **fixed** for a save by default (setting `randomize_recipes`, default off; when on, the ingredient triples are shuffled per Timed Term like Spellcaster University's per-run recipes).
- **Experimenting:** combining an unknown triple consumes the ingredients and either discovers the recipe (and brews it) or produces **Murky Sludge** (×2), which a Compost Bin turns into Herbs. Experiments are never a total loss.
- **Research:** at a Library, spend 30 Insight to reveal one ingredient of an undiscovered recipe (scholars reduce the cost). Recipe Notes scrolls do the same.
- **Hints:** Graffiti Glyphs (misbehavior) and some events reveal ingredients.

## 24.4 Recipe book

| # | Potion | Tier | Ingredients | Effect |
|---|---|---|---|---|
| 1 | Mending Draught | Basic | Herbs + Radiance + Greens | Fully heals one injury (including Hexed) |
| 2 | Calming Tonic | Basic | Herbs + Umbra + Nectar | Composure +30 for everyone in a room; ends a misbehavior chain there |
| 3 | Growth Elixir | Basic | Herbs + Reagents + Fish | One Greenhouse or plot ×2 output for 10 bells |
| 4 | Beast Biscuit | Basic | Greens + Fish + Reagents | +30 taming points to one creature; or instantly recaptures a Loose creature |
| 5 | Lure Musk | Basic | Nectar + Fish + Insight | Guarantees a visitor at the next day tick in a chosen habitat with space |
| 6 | Polishing Spirit | Basic | Reagents + Greens + Nectar | One room to 100 cleanliness; no dirt for 20 bells |
| 7 | Fireproof Salve | Basic | Reagents + Fish + Umbra | One room immune to fires and explosions for 50 bells |
| 8 | Dreamless Draught | Basic | Umbra + Nectar + Greens | Residents of one dorm: Rest +20 |
| 9 | Veil Tonic | Advanced | Umbra + Insight + Radiance | Veil strength +15 |
| 10 | Wardwater | Advanced | Umbra + Radiance + Fish | Prevents the next hazard on one floor; ends Hex Fog |
| 11 | Quickmortar | Advanced | Reagents + Crystal + Fish | +20 progress points to one construction site |
| 12 | Rift Elixir | Advanced | Insight + Herbs + Nectar | +10% safe odds on one expedition, up to the destination's best odds (drunk at launch; the only item that changes Rift odds) |
| 13 | Courage Draught | Advanced | Radiance + Reagents + Greens | One expedition: any injury or curse it causes needs half the usual recovery |
| 14 | Glass Flux | Advanced | Reagents + Herbs + Crystal | Produces 20 Glass |
| 15 | Elixir of Fellowship | Rare | Moonsilk + Nectar + Radiance | Academy morale +10 for 30 bells |
| 16 | Starlight Ink | Rare | Insight + Starmetal + Umbra | Grants 3 draft reroll tokens |
| 17 | Transmutation Salts | Rare | Ember Salt + Reagents + Insight | Convert 50 of one common material into 40 of another |
| 18 | Phoenix Draught | Legendary | Phoenix Ash + Radiance + Reagents | Instantly heals every injury and curse of one returned team |

Potions are stored in inventory (no cap) and used from the Inventory screen or directly from the relevant screen (e.g., the Rift planner offers the Rift Elixir and Courage Draught).

# 25. Materials, Essences and Artifacts

## 25.1 Common materials

| Material | Abbr. | Main sources | Main uses | Cap |
|---|---|---|---|---|
| Timber | T | Woodlot (2/bell) | Rooms, wooden furniture | 300 + vaults |
| Stone | S | Quarry (1/bell) | Rooms, stone furniture, Glassworks input | 300 + vaults |
| Glass | G | Glassworks (2 Stone → 1 Glass), Glass Flux, events | Greenhouses, labs, tanks, lamps | 300 + vaults |
| Cloth | C | Weaving Room (0.5/bell, ×2 with Moonsheep), events | Beds, rugs, banners, curtains | 300 + vaults |

Starting stock: 120 Timber, 60 Stone, 20 Glass, 20 Cloth, 40 Provisions, 10 Greens. (A starter kit, not a reward for past study.)

## 25.2 Essences (one per school)

| Essence | Abbr. | School | Produced by | Used for |
|---|---|---|---|---|
| Insight | In | Arcane | Arcane lessons, Library scholars, Observatory, Starfruit, Dreamthistle | Recipe research, scrolls, draft rerolls (15 per reroll), Arcane furniture, Inkling Wisp food |
| Herbs | He | Nature | Nature lessons, Herb Garden, Greenhouse, Thistle Hare | Most potions, Nature furniture |
| Radiance | Ra | Light | Light lessons, Lumen Lily | Healing potions, Sanctum rites, Light furniture |
| Umbra | Um | Shadow | Shadow lessons, Shadecap | Wards, Shadow furniture, Shade Hound food |
| Reagents | Re | Alchemy | Alchemy lessons, Emberpepper | Potions, Alchemy furniture, Cinder Newt food |

Essences are uncapped. Students produce them every bell (Section 8.3).

## 25.3 Rare materials

| Material | Abbr. | Sources (non-Rift) | Rift sources | Uses |
|---|---|---|---|---|
| Crystal | Cr | Quarry 2%/bell; Prism Beetle; Arcane classrooms 1%/bell | Crystal Caverns | Observatory, Rift Gate, Arcane hall, potions |
| Heartwood | Hw | Woodlot 0.5%/bell; Nature classrooms 1%/bell | Whispering Fen | Nature hall, Menagerie |
| Sunstone | Ss | Light classrooms 1%/bell | Ashen Wastes, Shattered Spire | Light hall |
| Void Pearl | Vp | Shadow classrooms 1%/bell | Ashen Wastes, Shattered Spire | Shadow hall |
| Ember Salt | Es | Alchemy classrooms 1%/bell | Ashen Wastes, Shattered Spire | Alchemy hall, Stewpot, Alembic Array, Transmutation Salts |
| Moonsilk | Ms | Moonsheep (1 per 40 bells) | Whispering Fen | Canopy Bed, Self-Writing Quill, Elixir of Fellowship |
| Starmetal | Sm | — | Crystal Caverns, Ashen Wastes, Shattered Spire | Starlight Ink, Rift Gate L3 renovation, late blueprints |
| Golem Core | Gc | — | Crystal Caverns | Awakening a Geode Golem (3 cores, Section 27.10); Rift Gate L3 renovation (2 cores) |
| Phoenix Ash | Pa | — | Ashen Wastes, Shattered Spire | Phoenix Draught |

## 25.4 Scrolls (Scriptorium)

| Scroll | Cost | Craft time (reviews, with scholar) | Effect |
|---|---|---|---|
| Rift Map | 20 In + 2 C | 30 | +2 Rift Fortune on one expedition (max 1 map per expedition; never changes the odds) |
| Ward Scroll | 15 In + 10 Um | 30 | Prevents the next hazard on one floor |
| Recipe Notes | 25 In | 20 | Reveals one ingredient of an undiscovered recipe |
| Calming Verse | 10 In + 10 Ra | 20 | Ends a misbehavior chain; Composure +20 in one room |

## 25.5 Artifacts

Artifacts are unique trophies found mainly in the Rift. **An artifact works only while displayed** on an Artifact Plinth in a Trophy Hall (4 plinths, +1 per level; multiple Trophy Halls allowed). Each displayed artifact also gives +2 Renown. Duplicates of the same artifact do not stack.

| # | Artifact | Source | Effect while displayed |
|---|---|---|---|
| 1 | Founder's Chalk | Ashen Wastes or Shattered Spire | Classroom essence yields +8% |
| 2 | Star Map of Many Doors | Ashen Wastes or Shattered Spire | Rift Fortune +1 |
| 3 | Abacus of the First Bursar | Shattered Spire | Mana +2% (inside the +25% cap) |
| 4 | Gemcutter's Loupe | Shattered Spire | Rare-material chances ×1.5 |
| 5 | Astrolabe of Unwritten Hours | Shattered Spire | School-deck drafts show 4 cards |
| 6 | Seedvault Acorn | Ashen Wastes or Shattered Spire | Food output +10% |
| 7 | Beastcaller Horn | Ashen Wastes or Shattered Spire | Taming +15% |
| 8 | Everfull Pantry Jar | Ashen Wastes or Shattered Spire | Meals use 10% fewer Provisions |
| 9 | Heart of the Wildwood | Shattered Spire | Creature buffs +10% |
| 10 | Tidebell | Ashen Wastes or Shattered Spire | Fish +20%; Tide creatures +10% |
| 11 | Mender's Satchel | Ashen Wastes or Shattered Spire | Healing +15% |
| 12 | Crown of Small Kindnesses | Ashen Wastes or Shattered Spire | Academy morale +3 |
| 13 | Bell of Returning | Shattered Spire | Loose creatures return 50% faster; expeditions return 10% sooner |
| 14 | Sunken Chapel Bell | Shattered Spire | Composure target +8 Academy-wide |
| 15 | Lantern of the Long Watch | Ashen Wastes or Shattered Spire | Hazards −10% |
| 16 | Orb of Quiet Corridors | Ashen Wastes or Shattered Spire | Misbehavior −10% |
| 17 | Ledger of Thin Places | Shattered Spire | Veil cost −5% (inside the cap) |
| 18 | Mirror of Second Sight | Shattered Spire | Once per day, reroll a random event's options |
| 19 | Umbral Keystone | Shattered Spire | Breaches cannot happen at Thin (only at Torn) |
| 20 | Crucible Shard | Ashen Wastes or Shattered Spire | Potion yield +8% |
| 21 | Builder's Plumb of Truth | Ashen Wastes or Shattered Spire | Build time −5% (inside the build-time cap) |
| 22 | Phoenix Feather Quill | Shattered Spire | Once per 30 days, instantly heals one injury or curse from the Rift |

# 26. The Card Draft

## 26.1 Role and player goal

The draft is Ankicaster's version of Spellcaster University's signature mechanic: spend currency to see three cards and keep one. It is how special rooms, rare furniture, creature lures, grimoires, crop seeds and one-shot boons enter the game, and it keeps every Academy different. The player's goal is to draft toward a plan (for example "a strong Shadow wing") while staying flexible.

## 26.2 Decks

| Deck | Unlocked | Pays with | Base price | Content |
|---|---|---|---|---|
| **Foundation** | Start | Mana | 120 | General rooms, comfort furniture, supplies, Academy boons |
| **Arcane** | Arcane L1 | Mana | 150 | Knowledge rooms, Arcane furniture, Arcane lures, grimoires, seeds |
| **Nature** | Nature L1 | Mana | 150 | Gardens, habitats, Nature lures, grimoires, seeds |
| **Light** | Light L1 | Mana | 150 | Care rooms, Light furniture and lures, grimoires |
| **Shadow** | Shadow L1 | Mana | 150 | Wards, Shadow furniture and lures, grimoires |
| **Alchemy** | Alchemy L1 | Mana | 150 | Craft rooms, Alchemy furniture and lures, recipes, grimoires |

## 26.3 Drawing

1. Choose a deck and pay its current price.
2. Three **different** cards are revealed. Each card's rarity is rolled from the deck's rarity weights (26.4), then a card is picked uniformly from the eligible cards of that rarity (cards whose unlock gates are met and that are not unique-and-owned).
3. Keep **one**. The other two return to the deck.
4. **Reroll** the three (once per draw) for 15 Insight or a reroll token.
5. The kept card goes to the **hand** (limit 8). If the hand is full, the player must play or discard a card first. Discarding a card returns a small salvage (common materials worth roughly 20% of the draw price; never mana).

**Price growth:** `price = base × 1.15^k`, where k is the number of draws from that deck in the last 7 Anki days, capped at 2.5 × base. Prices relax on their own as days pass. Aether Serpent −8%; spellbooks may reduce further (Section 31). This replaces Spellcaster University's ever-rising prices with a recent-use curve that cannot punish a long game.

**Pity rule:** at wizard level 4+ in the deck's school (Foundation: total level 20+), if 10 consecutive draws from a deck showed no Rare-or-better card, the next draw shows at least one.

**Guaranteed offers:** the first Alchemy draw after Alchemy L4 includes the Workshop; the first draw from a school deck after that school's L7 includes its Advanced Hall; the first Foundation draw after 6 students includes the Grand Dormitory.

## 26.4 Rarity weights

| Wizard level in the deck's school (Foundation: total level ÷ 5) | Common | Uncommon | Rare | Epic | Legendary |
|---|---|---|---|---|---|
| 1–2 | 85% | 15% | 0% | 0% | 0% |
| 3 | 65% | 30% | 5% | 0% | 0% |
| 4–6 | 55% | 32% | 13% | 0% | 0% |
| 7–8 | 45% | 33% | 17% | 5% | 0% |
| 9–10 | 40% | 32% | 18% | 8% | 2% |

Renown shifts 1 percentage point from Common to Rare per 50 Renown (max +6).

## 26.5 Card types

| Type | Played how | Notes |
|---|---|---|
| **Blueprint** | Place a room (consumed) or play on an existing room of the same type to level it | After a drafted room is built once, its plan becomes a **Known Plan**: further copies can be built from the Build menu at 1.5 × mana cost |
| **Furniture pattern** | Grants one copy now and unlocks the pattern | Further copies can be bought in the Build menu at the listed cost |
| **Lure** | Summons a creature of the stated rarity and school into a free matching habitat | Fizzles back into the hand if no habitat is free |
| **Grimoire** | Becomes available to study in the Wizard's Study | See Section 29 |
| **Seed** | Unlocks a greenhouse crop permanently | |
| **Recipe page** | Reveals one full recipe | |
| **Boon** | One-shot effect | Listed below |
| **Deed** | Land Grant (+2 plots), Renovation Deed (level a standard room without material cost) | |

## 26.6 Deck lists

**Foundation**

| Rarity | Cards |
|---|---|
| Common | Kitchen (blueprint); Faculty Lounge (blueprint); Weaving Room (blueprint); Courtyard Garden (blueprint); Crate of Supplies (boon: +40 Timber, +20 Stone, +10 Glass); Bountiful Harvest (boon: +60 Provisions); Spring Cleaning (boon: every room +30 cleanliness); Builder's Afternoon (boon: +30 progress to one construction) |
| Uncommon | Grand Dormitory; Bathhouse; Canopy Bed (pattern); Statue of a Familiar (pattern); Banquet Bell (pattern); Feast Day (boon: next meal Well-Fed for all); Open Day (boon: +3 applicants with 2 positive traits each); Mentor's Letter (boon: add a positive trait to one student) |
| Rare | Trophy Hall; Land Grant (deed); Renovation Deed; Fair Weather (boon: no hazards for 50 bells) |
| Epic | Grand Opening (boon: +25 Renown); Architect's Insight (boon: next 3 constructions need 30% fewer reviews) |

**Arcane**

| Rarity | Cards |
|---|---|
| Common | Glow Lantern; Floating Candles; Star Chart; Wizard's Chess Table; Frostbox (patterns); Arcane Lure (common); Moment of Clarity (boon: +20 Insight) |
| Uncommon | Scriptorium; Observatory (L4); Dreamcatcher Bed; Self-Writing Quill; Expedition Map Table (patterns); Dreamthistle (seed); Arcane Lure (uncommon); Grimoire (Arcane tier 2) |
| Rare | Hall of Stars (L7); Globe of Elsewhere (pattern); Grimoire (Arcane tier 3); Starlit Night (boon: Arcane yields ×2 for 20 bells); Renovation Deed |
| Epic | Grimoire (Arcane tier 4); Steady Prices (boon: your next 5 draws from any deck cost base price) |
| Legendary | Starfall Fragment (boon: +5 Crystal, +2 Starmetal) |

**Nature**

| Rarity | Cards |
|---|---|
| Common | Window Box of Herbs; Fish Bowl; Specimen Jars; Spice Rack; Creature Toybox; Sunning Rock (patterns); Orchard (blueprint); Glimmerberry (seed); Nature Lure (common) |
| Uncommon | Mossbed; Glowcap Grow-Lamp; Fairy Ring; Beehive Box (patterns); Apiary (blueprint); Nature Lure (uncommon); Grimoire (Nature tier 2); Rain Dance (boon: all plots ×2 for 10 bells) |
| Rare | Grove Hall (L7); Menagerie (L4); Grimoire (Nature tier 3); Wild Abundance (boon: +80 Provisions, +40 Greens, +20 Herbs) |
| Epic | Grimoire (Nature tier 4); Call of the Wild (boon: a Rare creature of a random school visits — the only non-Rift rare source) |
| Legendary | Heartwood Bough (boon: +5 Heartwood; one Heartwood Sapling seed) |

**Light**

| Rarity | Cards |
|---|---|
| Common | Radiant Lamp; Tea Service; Music Box of Calm; Halo Candles; Bird Bath (patterns); Light Lure (common); Warm Welcome (boon: all students Composure +20) |
| Uncommon | Sunlit Sanctum (L4); Sunwheat (seed); Light Lure (uncommon); Grimoire (Light tier 2); Day of Rest (boon: all injuries +50 healing points) |
| Rare | Dawn Hall (L7); Moonwell (blueprint); Healing Spring Basin (pattern); Grimoire (Light tier 3) |
| Epic | Grimoire (Light tier 4); Festival of Lanterns (boon: Academy morale +10 for 50 bells) |
| Legendary | Sunstone Reliquary (boon: +5 Sunstone, +30 Radiance) |

**Shadow**

| Rarity | Cards |
|---|---|
| Common | Wind Chimes of Hush; Moon-Shroud Curtains; Dartboard of Harmless Hexes; Ward Lantern; Nightglass Pane; Hexed Scarecrow (patterns); Shadow Lure (common); Quiet Night (boon: no misbehavior for 20 bells) |
| Uncommon | Detention Hall (L4); Standing Stones (blueprint); Silence Bell; Shadow Ledger; Rune Marker (patterns); Shadecap Mushrooms (seed); Shadow Lure (uncommon); Grimoire (Shadow tier 2); Veil Thread (boon: Veil cost −10% for 7 Anki days) |
| Rare | Hall of Whispers (L7); Grimoire (Shadow tier 3); Mending the Veil (boon: Veil strength to 100); Warding Primer (permanent Veil cost −3%, once per Academy) |
| Epic | Grimoire (Shadow tier 4); Long Night's Watch (boon: hazards −50% for 100 bells) |
| Legendary | Pearl of the Deep Dark (boon: +5 Void Pearl, +30 Umbra) |

**Alchemy**

| Rarity | Cards |
|---|---|
| Common | Enchanted Broom; Warm Hearthstone; Treat Dispenser (patterns); Glassworks (blueprint, L3); Alchemy Lure (common); Recipe Page (Basic); Bulk Reagents (boon: +25 Reagents) |
| Uncommon | Workshop (L4); Fume Hood; Windmill Charm (patterns); Emberpepper (seed); Alchemy Lure (uncommon); Recipe Page (Advanced); Grimoire (Alchemy tier 2) |
| Rare | Crucible Hall (L7); Bottomless Stewpot; Alembic Array (patterns); Grimoire (Alchemy tier 3); Recipe Page (Rare) |
| Epic | Grimoire (Alchemy tier 4); Master Builder's Week (boon: all construction slots ×2 progress for 100 reviews) |
| Legendary | Salt of the Earth's Heart (boon: +5 Ember Salt, +2 Starmetal) |

# 27. The Rift and Expeditions

> **Source.** The destinations, skill requirements, safe and best odds, return times, main rewards, odds modifiers and "when it goes wrong" table in Sections 27.3, 27.5 and 27.6 are copied from approved Concept Draft 8 and are binding (BR-27, BR-31 to BR-33). Mana costs, supplies, loot quantities, eggs, Fortune and the other details are this GDD's additions and are starting values to tune. The code reads every number from `content/rift.json`.

## 27.1 Role and player goal

The Rift is the late-game adventure: a shimmering tear on the grounds that leads to five strange places, each harder and richer than the last. Only adventurers go, in teams of one to three. It is the main source of creature eggs, golem cores, rare materials, rare draft cards, legendary furniture and artifacts, and the place where an Academy's masters get to be heroes.

What makes the Rift Ankicaster's own is how a team gets stronger. **A party's skill is the average interval of its adventurers' career cards.** An adventurer becomes able to brave the Ashen Wastes because the user has really remembered those 20 cards for a month. The player's goal is to read the chance meter, match the party to the destination, and decide how much risk to take for how much reward. Nobody ever dies or is lost.

## 27.2 Opening the Rift (BR-27)

When the Academy has **3 masters** (3 characters holding at least one master title, retired alumni excluded), a scripted event plays ("The Air Over the Orchard Tears Open") and the **Rift Gate** blueprint is granted. When the Gate is built, the **Adventurer** career becomes available to masters (any school, BR-11) and the **Training Yard** plan unlocks. If the master count later falls below 3 (for example through retirements), the Rift stays open.

All five destinations can be chosen as soon as the Gate stands. Nothing locks them: the skill requirement and the odds are the gate.

## 27.3 Destinations (Draft 8, binding)

**Skill needed** = the average interval of the party's adventurer career cards. **Safe odds** = the chance of returning unscathed for a team of three at exactly that skill. **Best odds** = the cap, so something can always go wrong.

| Destination | Tier | Skill needed | Safe odds | Best odds | Reviews to return | Main rewards |
|---|---|---|---|---|---|---|
| **Mossy Hollow** | Easy | 0 days | 85% | 95% | 50 | Herbs, timber, common eggs |
| **Whispering Fen** | Mild | 10 days | 75% | 90% | 100 | Rare herbs, owls and sprites |
| **Crystal Caverns** | Medium | 20 days | 65% | 85% | 150 | Crystals, stone, golem cores |
| **Ashen Wastes** | Hard | 30 days | 55% | 80% | 250 | Fire creatures, rare materials |
| **The Shattered Spire** | Deadly | 45 days | 45% | 70% | 400 | Rare cards, artifacts, legendary eggs |

Each destination has exactly one tier. The fixed column values above are binding; the flavour below is this GDD's.

| Destination | Look and feel | Signature finds (details in 27.8) |
|---|---|---|
| **Mossy Hollow** | A green, dripping hollow under giant roots, fireflies at noon | Timber, Herbs, Greens; eggs of every Common creature; common patterns |
| **Whispering Fen** | Mist-covered reed beds where the water talks back | Herbs in quantity; rare herb seeds (Lumen Lily, Heartwood Sapling); Moonsilk; owl and sprite eggs (Mistfeather Owl, Fen Sprite, Star Heron, Coral Kelpie) |
| **Crystal Caverns** | Echoing galleries of humming crystal and sleeping stone giants | Crystal, Stone, **Golem Cores**, Starmetal, Starfruit seed; Rare eggs (Phase Ferret, Night Lynx, Glimmerhorn Stag, Dawnhart Gryphon) |
| **Ashen Wastes** | Grey dunes, cooling lava rivers and a sky the colour of embers | Fire creature eggs (Cinder Newt, Alembic Salamander; rarely Ember Phoenix); Epic eggs (Verdant Drake, Aether Serpent, Sunlit Unicorn, Umbral Wyrmling); Ember Salt, Phoenix Ash, Sunstone, Void Pearl, Starmetal; minor artifacts; legendary furniture patterns |
| **The Shattered Spire** | Floating fragments of a broken tower, staircases into nothing | Rare, Epic and Legendary draft cards; all artifacts; legendary eggs (Elder Treant Sprout, Chronoflare Owl, Ember Phoenix, Moonless Kitsune, Philosopher's Chimera); legendary furniture |

## 27.4 Party skill, costs and logistics

**Party skill.** Each adventurer holds an Adventurer career card set: the 20 youngest free cards when the career was taken (BR-18, Section 11.2). An adventurer's **Rift skill** is the mean honest interval (Section 9.2) of those 20 cards, in days, *not* capped at 30. The **party skill** is the mean over every adventurer career card of every member (with 20 cards each, this is the average of the members' Rift skills). Skill is read at the day tick and when the planner opens, and it falls when those cards lapse (BR-15). Empty career-card slots count as interval 0.

| Destination | Launch cost (mana) | Supplies per member (Provisions) | Loot rolls (full rewards) | Supply slots |
|---|---|---|---|---|
| Mossy Hollow | 150 | 5 | 2 | 1 |
| Whispering Fen | 300 | 10 | 3 | 1 |
| Crystal Caverns | 500 | 15 | 4 | 2 |
| Ashen Wastes | 800 | 20 | 5 | 2 |
| The Shattered Spire | 1,200 | 30 | 6 | 3 |

- The mana cost rises with each tier, as Draft 8 requires. These five numbers are starting values to tune.
- **Supply slots** hold potions and scrolls taken along: the Rift Elixir (the only item that raises odds), Rift Map, Courage Draught and Mending Draught. The Supply Chest adds one slot.
- **One expedition at a time** (two with a level-3 Rift Gate). An expedition cannot be cancelled after launch. Characters on an expedition keep their beds, and their careers pause.
- **Who can go:** adventurers who are not injured. Bruised adventurers can go, and Bruised has no effect on odds.

## 27.5 The chance meter and odds (Draft 8, binding)

The planner shows a large semicircular **chance meter**: a needle and number for the chance of a **safe return**. It updates live as the player changes destination, team, supplies and companion. Every modifier is listed beneath it, for example "Party skill 27 days (needs 20): +5%".

**Calculation:**

```
base       = safe_odds[destination]                      # 85 / 75 / 65 / 55 / 45
diff       = party_skill_days - skill_needed[destination]
skill_mod  = -10 * floor(-diff / 5)  if diff < 0         # each full 5 days below: -10
             +5  * floor(diff / 5)   if diff >= 0        # each full 5 days above: +5
team_mod   = 0 (3 adventurers) | -10 (2) | -25 (alone)
elixir     = +10 if a Rift Elixir is taken
veil_mod   = -5 if the home Veil is Thin or Torn (strength < 50)
chance     = base + skill_mod + team_mod + elixir + veil_mod
chance     = min(chance, best_odds[destination])         # 95 / 90 / 85 / 80 / 70
chance     = max(chance, 5)                              # floor (GDD decision)
```

| Modifier (Draft 8) | Effect on safe odds |
|---|---|
| Each 5 days of party skill **below** what is needed | −10% |
| Each 5 days of party skill **above** what is needed | +5%, up to the destination's best odds |
| Team of two | −10% |
| Going alone | −25% |
| Rift Elixir | +10%, up to the best odds |
| Thin Veil at home | −5% |

- **These are the only things that change the odds.** Everything else that helps on expeditions (companions, personalities, traits, the Training Yard, Gate levels, scrolls, artifacts, spellbooks, alumni) adds **Rift Fortune** (Section 27.9), which improves rewards, return time or recovery but never the odds. This keeps the meter readable and makes the user's real memory the main lever.
- **Three is best** (BR-27): only a team of three gets the full safe odds.
- The "5 days" steps use whole steps. The planner shows how far the party is from the next step ("+1.8 days to the next +5%").
- "Thin Veil" means the Thin or Torn band (strength below 50; Section 18.3).

**Example.** A trio with party skill 27 days targets Crystal Caverns (needs 20): 65 + 5 (one full step above) = 70%. With a Rift Elixir it is 80%, below the 85% cap. The same trio at the Ashen Wastes (needs 30) is 3 days short, less than one full 5-day step, so it keeps the full 55%. At the Shattered Spire (needs 45, 18 days short, three full steps) it is 45 − 30 = 15%.

## 27.6 Resolution (Draft 8, binding)

The roll is made **at launch** with the seeded RNG (Section 38.11) and stored hidden. It is revealed when the expedition's review count completes, so reopening the game cannot change it.

1. Roll `r` from 1 to 100. If `r ≤ chance`: **Safe return.** Everyone comes home unscathed with **full rewards**.
2. Otherwise **something went wrong**. Roll again on the table for the destination's tier band:

| When it goes wrong | Easy–Medium (Mossy Hollow, Whispering Fen, Crystal Caverns) | Hard–Deadly (Ashen Wastes, Shattered Spire) | Rewards |
|---|---|---|---|
| **Minor injury** to one adventurer | 60% (d100 01–60) | 40% (01–40) | Full rewards |
| **Serious injury** to one adventurer | 25% (61–85) | 30% (41–70) | Half rewards |
| **Curse** on one adventurer | 10% (86–95) | 20% (71–90) | Half rewards (GDD decision) |
| **Retreat** with nothing | 5% (96–100) | 10% (91–100) | None (supplies used; launch mana spent) |

**Nobody dies or is lost.** The worst case is a long infirmary recovery. The injured or cursed adventurer is chosen at random from the team.

| Outcome | Injury applied (Section 23) |
|---|---|
| Minor injury | Bruised (Easy–Medium) or Sprained (Hard–Deadly) |
| Serious injury | Sprained (Mossy Hollow) or Broken Bone (all other destinations) |
| Curse | Hexed (Easy–Medium) or Rift-Touched (Hard–Deadly) |
| Retreat | No injury. Team morale −10 for 10 bells ("We'll get it next time") |

**Half rewards** means half the loot rolls, rounded up. An Easy expedition (2 rolls) still brings home 1.

## 27.7 Expected value at a glance

At the destinations' own safe odds (a trio at exactly the needed skill, no elixir), the chances of each outcome are:

| Destination | Safe return | Minor injury | Serious injury | Curse | Retreat |
|---|---|---|---|---|---|
| Mossy Hollow (85%) | 85% | 9.0% | 3.75% | 1.5% | 0.75% |
| Whispering Fen (75%) | 75% | 15.0% | 6.25% | 2.5% | 1.25% |
| Crystal Caverns (65%) | 65% | 21.0% | 8.75% | 3.5% | 1.75% |
| Ashen Wastes (55%) | 55% | 18.0% | 13.5% | 9.0% | 4.5% |
| The Shattered Spire (45%) | 45% | 22.0% | 16.5% | 11.0% | 5.5% |

Even at the Spire, 67% of expeditions bring home full rewards (safe return or a minor injury), and 94.5% bring home at least half.

## 27.8 Rewards and loot

Each loot roll picks a row from the destination's pool by weight. Quantities are scaled by Fortune (Section 27.9).

**Mossy Hollow**

| Weight | Reward |
|---|---|
| 35% | Timber 30–50 |
| 30% | Herbs 15–25 |
| 15% | Greens 15–25 or Provisions 15–25 |
| 15% | **Common egg** (any Common species, Section 22) |
| 5% | Common furniture pattern |

**Whispering Fen**

| Weight | Reward |
|---|---|
| 30% | Herbs 30–50 ("rare herbs": always includes 1 Dreamthistle or Shadecap seed) |
| 20% | **Owl or sprite egg:** Fen Sprite (Uncommon, 50%), Mistfeather Owl (Rare, 25%), Star Heron (Rare, 15%), Coral Kelpie (Rare, 10%) |
| 15% | Rare herb seed: Lumen Lily or Heartwood Sapling |
| 15% | Moonsilk 1–2 |
| 10% | Heartwood 1–2 |
| 10% | Uncommon furniture pattern or blueprint |

**Crystal Caverns**

| Weight | Reward |
|---|---|
| 30% | Crystal 3–6 |
| 25% | Stone 40–80 |
| 15% | **Golem Core** ×1 (three awaken a Geode Golem, Section 27.10) |
| 10% | Starmetal 1–2 |
| 10% | **Rare egg:** Phase Ferret, Night Lynx, Glimmerhorn Stag or Dawnhart Gryphon |
| 5% | Starfruit seed |
| 5% | Rare furniture pattern or blueprint |

**Ashen Wastes**

| Weight | Reward |
|---|---|
| 35% | Rare materials: Ember Salt 2–4, Phoenix Ash 1, Sunstone 2–3, Void Pearl 2–3 or Starmetal 2 (equal weights) |
| 20% | **Fire creature egg:** Cinder Newt (60%), Alembic Salamander (35%), Ember Phoenix (5%) |
| 12% | **Epic egg:** Verdant Drake, Aether Serpent, Sunlit Unicorn or Umbral Wyrmling |
| 15% | Reagents 30–50 |
| 10% | Legendary furniture pattern (the six Rift legendaries, Section 17) |
| 8% | Minor artifact (artifacts whose source lists the Ashen Wastes, Section 25.5) |

**The Shattered Spire**

| Weight | Reward |
|---|---|
| 30% | **Rare cards:** one Rare (70%), Epic (25%) or Legendary (5%) draft card from a random school deck, added to the hand |
| 20% | **Artifact** (any not yet owned) |
| 15% | **Legendary egg:** Elder Treant Sprout, Chronoflare Owl, Ember Phoenix, Moonless Kitsune or Philosopher's Chimera |
| 15% | Legendary furniture pattern |
| 20% | Rare materials ×2 of the Ashen Wastes amounts |

Duplicate artifacts and uniques are re-rolled into rare materials. The Lucky trait (+1 roll) and the Phase Ferret (+1 roll) apply whenever the expedition brings full rewards.

## 27.9 Rift Fortune (rewards, never odds)

**Fortune** is a separate score for each expedition, shown under the chance meter. Each point gives **+10% to all reward quantities** (rounded down per item) on any outcome that brings rewards. The maximum is 5 points (+50%).

| Source | Fortune |
|---|---|
| Companion creature: Common/Uncommon, Rare, Epic/Legendary | +1 / +2 / +3 |
| Team drilled at the Training Yard (every member rested ≥ 50 reviews there since their last expedition) | +1 per yard level (max +3) |
| Rift Map scroll | +2 |
| Expedition Map Table; Star Map of Many Doors (artifact); Field Guide to Elsewhere (spellbook) | +1 each |
| Each scholar in an Observatory (max 2); Star Heron or Orrery Moth tamed at home (max 1 from these) | +1 each |
| Rift Gate level 2 / 3 | +1 / +2 |
| Paragon in the team; Bold personality; Brave or Daredevil trait; Show-off in a team of 3; Social in a team of 3 | +1 each |
| Personality affinity: Dreamy at the Whispering Fen, Bookish at the Crystal Caverns, Curious at Mossy Hollow or the Ashen Wastes, Mischievous at the Shattered Spire | +1 each |
| Hex Duel veterans (Section 20.3) | +1 each, once |
| Adventurer alumni bonus; Rift Beacon spell; "Whispers from the Rift" event | Section 31; +3; +1 |
| Team average morale ≥ 80 / < 40 | +1 / −1 |
| Nervous trait; Show-off alone; Rift Tremor hazard active at launch | −1 each |

Separately from Fortune: the **Dawnhart Gryphon** companion makes the expedition return 15% sooner, and the Rift Beacon spell makes the next one return 25% sooner. A **Courage Draught** halves the recovery requirement of any injury or curse from that expedition. **Steadfast** adventurers recover from Rift injuries 25% faster; **Daredevil** adventurers 25% slower. The **Ember Phoenix** as companion heals the worst Rift injury on return.

## 27.10 Eggs and golem cores

- **Eggs** go to Storage. An egg is placed in a free slot of a matching habitat (Section 22.2) and **hatches after** 20 / 40 / 60 / 80 / 100 honest reviews for Common / Uncommon / Rare / Epic / Legendary. It hatches **Wary**, and taming starts as for any arrival. An egg never spoils, and it waits in Storage indefinitely.
- **Golem Cores** are a rare material. Three Golem Cores at a Workshop awaken a **Geode Golem** (Section 22.7) after 60 reviews of builder or wizard time. Golem Cores are also used in the Rift Gate level-3 renovation (2 cores).

## 27.11 Companions

One tamed creature may go along on each expedition. It leaves its habitat (its home buff turns off while it is away), adds Fortune, and shares the team's fate: it comes home tired (no buff for 10 bells) on any outcome other than a safe return, and it is never hurt. It eats nothing while away.

## 27.12 Expected progression

Adventurer career cards start young, so a new adventurer's Rift skill begins at a few days and rises as the user really learns those 20 cards. With default scheduling, a typical set averages about 10 days after 2–3 weeks, 20 days after 4–6 weeks, 30 days after 6–9 weeks and 45 days after 10–14 weeks. Lapses pull it down.

- **Right after the Rift opens:** Mossy Hollow at 85% with a trio is dependable. The Whispering Fen is a gamble (75 − 20 = 55% with a brand-new trio at skill 0–4).
- **About a month in:** the Fen is at or above its 75%, and the Crystal Caverns are within reach.
- **Two months in:** the Ashen Wastes at 55–65%. An elixir and a well-remembered set make it a real choice.
- **Three months and more:** the Shattered Spire. Even a perfect party is capped at 70% there, so its legendary eggs and artifacts always feel earned.

A solo adventurer always pays −25%, and a pair −10%, which is why three is best. A single, very experienced adventurer can still keep materials flowing from the Hollow: with 30 days of skill they reach 85 − 25 + 30 = 90%, while a trio with the same skill reaches the 95% cap.

## 27.13 `rift.json`

```json
{
  "opens_at_masters": 3, "team_size": [1, 3], "min_chance": 5,
  "skill_source": "adventurer_career_cards_mean_honest_ivl_uncapped",
  "destinations": [
    {"id": "mossy_hollow",    "tier": "easy",   "skill_needed": 0,  "safe": 85, "best": 95, "reviews": 50,
     "cost": 150,  "supplies": 5,  "loot_rolls": 2, "supply_slots": 1, "band": "low"},
    {"id": "whispering_fen",  "tier": "mild",   "skill_needed": 10, "safe": 75, "best": 90, "reviews": 100,
     "cost": 300,  "supplies": 10, "loot_rolls": 3, "supply_slots": 1, "band": "low"},
    {"id": "crystal_caverns", "tier": "medium", "skill_needed": 20, "safe": 65, "best": 85, "reviews": 150,
     "cost": 500,  "supplies": 15, "loot_rolls": 4, "supply_slots": 2, "band": "low"},
    {"id": "ashen_wastes",    "tier": "hard",   "skill_needed": 30, "safe": 55, "best": 80, "reviews": 250,
     "cost": 800,  "supplies": 20, "loot_rolls": 5, "supply_slots": 2, "band": "high"},
    {"id": "shattered_spire", "tier": "deadly", "skill_needed": 45, "safe": 45, "best": 70, "reviews": 400,
     "cost": 1200, "supplies": 30, "loot_rolls": 6, "supply_slots": 3, "band": "high"}
  ],
  "modifiers": {"per_5_days_below": -10, "per_5_days_above": 5, "team_of_two": -10, "alone": -25,
                "rift_elixir": 10, "thin_veil": -5, "thin_veil_below_strength": 50},
  "wrong_table": {
    "low":  [{"id": "minor_injury", "pct": 60, "rewards": 1.0}, {"id": "serious_injury", "pct": 25, "rewards": 0.5},
             {"id": "curse", "pct": 10, "rewards": 0.5}, {"id": "retreat", "pct": 5, "rewards": 0}],
    "high": [{"id": "minor_injury", "pct": 40, "rewards": 1.0}, {"id": "serious_injury", "pct": 30, "rewards": 0.5},
             {"id": "curse", "pct": 20, "rewards": 0.5}, {"id": "retreat", "pct": 10, "rewards": 0}]
  },
  "fortune": {"per_point_reward_pct": 10, "max_points": 5},
  "egg_hatch_reviews": {"common": 20, "uncommon": 40, "rare": 60, "epic": 80, "legendary": 100}
}
```
# 28. Random School Events

## 28.1 Role and rules

Events are short story cards with two or three choices that make the Academy feel inhabited, in the spirit of Spellcaster University's event board. They never punish and never require a fast response.

- **Daily roll:** at each day tick after an **active** day, 60% chance of one random event (Observatory foresight shows it a day early). No random events accumulate while the user is away (BR-04): after a break, at most one event is waiting.
- **Event board:** events wait on the left of the Academy screen for up to 3 days; if ignored they resolve with their **default** option, which is always harmless.
- **Eligibility:** each event has conditions (rooms, schools, Rift open, alumni existing). Weights are listed; an event cannot repeat within 10 days.
- **Scripted events** (always fire once, at the trigger): Founding Day (first launch), First Student, First Creature, First Master, The Rift Opens, First Thin Veil (explains the Veil kindly), Welcome Back (after 7+ days away), First Retirement.

## 28.2 Event catalog

| ID | Event | Conditions | Weight | Options (default first) |
|---|---|---|---|---|
| `misaddressed_owl` | A Misaddressed Owl | — | 10 | Send it on its way: +5 Renown · Peek at the letter: +10 Insight · Offer it a perch: a Hush Raven visits if a Gloom/Sky habitat is free |
| `peddler` | The Curio Cart | — | 8 | Browse later (nothing) · Buy one of three furniture patterns at its listed cost +50% (bypasses the draft) |
| `doorstep_basket` | A Basket on the Doorstep | Any habitat | 6 | Find it a home: a Common creature of a random school arrives as Wary · Pass it to the village: +5 Renown |
| `rainy_week` | A Rainy Week | Grounds plots | 6 | Wait it out: plots −20%, Greenhouse +10% for 30 bells · Cast *Clear Skies* (if known) |
| `guild_inspector` | The Hedge-Mage Guild Inspector | 8+ rooms | 5 | Show them around: if every room is Plain or better, +15 Renown; otherwise friendly advice naming your two lowest-quality rooms |
| `birthday` | A Student's Birthday | 1+ student | 8 | Sing: Composure +5 for the student · Bake a cake (20 Provisions): their dorm Leisure +20 and morale +5 |
| `lost_cat` | The Lost Cat | Crystal habitat | 4 | Put up posters: 50% a Glyph Cat visits · Leave milk out (5 Provisions): 80% |
| `lantern_festival` | Lantern Festival | 6+ characters | 5 | Watch from the windows: Composure +5 · Host it (100 mana): Academy morale +8 for 30 bells |
| `tutors_request` | A Master Offers to Tutor | A resident master | 5 | Gladly: their tutor bonus is doubled for 50 bells · Not now |
| `mysterious_seeds` | Mysterious Seeds | Greenhouse | 4 | Plant them: unlock a random crop seed you lack · Dry them: +30 Herbs |
| `old_map` | An Old Map in the Library | Library | 4 | File it: +20 Insight · Study it (Rift open): a Rift Map scroll |
| `ghostly_choir` | The Ghostly Choir | Veil below 80 or Shadow L3 | 4 | Listen: Composure +10 · Bottle the echo (Shadow L5): +15 Umbra |
| `glass_merchant` | The Glass Merchant | — | 5 | Trade 40 Stone for 20 Glass · Trade 20 Timber for 10 Cloth · No thanks |
| `frost_fairies` | Frost Fairies | Greenhouse | 3 | Let them be: Cold Snap hazard · Offer 10 Nectar: they leave 5 Crystal |
| `collapsing_shelf` | The Collapsing Shelf | Library | 3 | Fix it later: Library −10% until fixed from its panel (50 Timber) · Fix now: 50 Timber |
| `visiting_scholar` | A Visiting Scholar | Wizard total level 10+ | 4 | Host for tea: +5 Renown · Pay for a lecture (150 mana): reveal one recipe |
| `founders_day` | Founder's Day | Anniversary of install (scripted yearly) | — | Celebrate: +25 Renown and a free Foundation draw |
| `homesick` | A Homesick Student | A Homesick student | 6 | A friend helps: 30% they gain Kind Heart · Send a letter home (5 Cloth): morale +10 |
| `strange_egg` | A Strange Egg | Ember Pit or Menagerie | 3 | Keep it warm: hatches after 100 reviews into a random Uncommon (75%) or Rare (25%) creature · Return it to the woods: +5 Renown |
| `crop_blight` | A Touch of Blight | Greenhouse | 3 | Let it pass: Greenhouse −30% for 30 bells · Treat it (10 Herbs + 5 Reagents): no effect |
| `alumni_letter` | A Letter from an Alumnus | 1+ alumni | 4 | Read it: a gift related to their career (Section 13.3) |
| `rival_challenge` | A Friendly Rival Academy | 15+ rooms | 3 | Decline politely · Accept: choose a school; if your best room of that school is Fine or better, +20 Renown and a Rare draft card of that school, else +5 Renown for good sportsmanship |
| `midsummer` | Midsummer Night | Nature L3 | 3 | Dance: plots ×1.5 for 20 bells and a Fairy-Ring visitor roll |
| `veil_bell` | The Bell of the Veil Rings | Veil below 70 | 5 | Thank it (nothing) · Reinforce now: pay 1× upkeep for +20 strength |
| `wandering_bard` | A Wandering Bard | Common Room | 4 | Decline · Hire (80 mana): Leisure +20 Academy-wide |
| `overdue_notice` | The Library Overdue Notice | Library | 3 | Pay the fine (20 Insight) · Ignore it: Library −10% for 20 bells |
| `hidden_door` | A Door That Wasn't There | Castle 80%+ full | 2 | Explore: +30 Timber and +30 Stone · Brick it up: a free Support Pillar |
| `bake_off` | The Great Bake-Off | Kitchen | 3 | Spectate: Leisure +5 · Enter (30 Provisions + 10 Nectar): morale +10, +5 Renown |
| `shooting_star` | A Shooting Star | Observatory | 3 | Catch it: +2 Crystal · Make a wish: a random Boon card from any unlocked deck |
| `rift_whispers` | Whispers from the Rift | Rift open | 4 | Listen: next expedition +1 Rift Fortune · Seal the gate for the night: Rift Gate locked 10 reviews, Veil +10 |

# 29. Wizard Spells and Abilities

## 29.1 Rules

- Spells are learned by **Study a Grimoire** sessions (Section 7.3) and cast with mana from the Wizard screen or from context menus (e.g., right-click a hazard → *Dispel*).
- Grimoire tiers per school: **T1** (school L1, in the Library shop or starting kit for the first school), **T2** (L3), **T3** (L5), **T4** (L8), **Capstone** (L10). T2–T4 grimoires also appear as draft cards; once owned they can be studied any time.
- Study cost and time by tier: T1 150 mana / 40 reviews; T2 300 / 80; T3 500 / 120; T4 800 / 180; Capstone 1,200 / 250.
- Cooldowns are measured in honest reviews unless they say "per day". Cooldowns do not advance while away (no reviews) and nothing is lost.
- Spells never affect Anki, card links, skill or mastery, and never produce mana.

## 29.2 Spell list

| School | Tier | Spell | Cast cost | Cooldown | Effect |
|---|---|---|---|---|---|
| Arcane | T1 | Glow | 40 | 20 | Ends Spill of Night or Echo Loop on a floor |
| Arcane | T2 | Dispel | 120 | 60 | Ends any one hazard (not a breach) |
| Arcane | T3 | Foresight | 200 | 1 per day | Shows the next 3 days' events; skip one of them |
| Arcane | T4 | Rift Beacon | 300 | 200 | Next expedition: +3 Rift Fortune and returns 25% sooner (never changes the odds) |
| Arcane | Cap | Starlit Conjunction | 400 | 1 per 3 days | All essence yields ×1.5 for 50 bells |
| Nature | T1 | Beckon | 30 | 10 | A Loose creature returns home |
| Nature | T2 | Rain Dance | 120 | 60 | All plots ×1.5 for 10 bells |
| Nature | T3 | Clear Skies | 150 | 40 | Ends Cold Snap, Hex Fog and Rainy Week effects |
| Nature | T4 | Wild Kinship | 250 | 100 | +50 taming points, split among all Wary creatures |
| Nature | Cap | Verdant Surge | 400 | 1 per 3 days | Food and Herbs ×2 for 30 bells |
| Light | T1 | Mend | 40 | 15 | +30 healing points to one injured character |
| Light | T2 | Soothing Light | 100 | 40 | Composure +20 for everyone on a floor |
| Light | T3 | Mend Object | 80 | 20 | Repairs one Damaged furniture item |
| Light | T4 | Sunburst | 300 | 150 | +60 healing points to every injured character |
| Light | Cap | Dawn Blessing | 400 | 1 per 3 days | Academy morale +15 for 50 bells; lifts every Rift curse (Hexed and Rift-Touched characters heal at once) |
| Shadow | T1 | Hush | 30 | 10 | Ends a misbehavior chain in a room; Composure +5 there |
| Shadow | T2 | Ward Pulse | 150 | 80 | No hazards for 10 bells |
| Shadow | T3 | Banish | 200 | 60 | Resolves a breach instantly |
| Shadow | T4 | Veil Stitch | 0.8 × today's upkeep | 1 per day | Veil strength +20 |
| Shadow | Cap | Moonless Night | 400 | 1 per 3 days | Hazards and misbehavior −60% for 50 bells (outside the 75% cap) |
| Alchemy | T1 | Tidy Wind | 40 | 20 | Every room on a floor to 100 cleanliness |
| Alchemy | T2 | Douse | 60 | 20 | Ends a fire or explosion; that room is fireproof for 20 bells |
| Alchemy | T3 | Quickening | 250 | 60 | +25 progress points to one construction site |
| Alchemy | T4 | Transmute | 150 | 40 | Convert 60 of one common material into 50 of another |
| Alchemy | Cap | Philosopher's Hour | 400 | 1 per 3 days | The next 3 brews complete instantly with ×2 yield |

## 29.3 Passive wizard abilities

| Ability | Unlock | Effect |
|---|---|---|
| Headmaster's Presence | Start | The wizard's sprite visits a random room each bell; that room gets +5% efficiency that bell (purely cosmetic-feeling, small real effect) |
| Stand-in Teacher | Any school at L5 | Section 7.7 |
| Practised Builder | Alchemy L5 | The wizard's construction slot advances 1.1 per review |
| Kindly Tamer | Nature L3 | Wizard can tame Commons at 50% speed |
| Steady Gaze | Shadow L5 | Hazards in the Wizard's Study's column −25% |
| Warm Welcome | Light L5 | New students start with +10 morale for 7 days |
| Scholar's Eye | Arcane L5 | Draft rerolls cost 10 Insight instead of 15 |

# 30. Game Modes: Timed Term and Endless School; Reset Rules

## 30.1 Overview (BR-29)

| | Endless School (default) | Timed Term |
|---|---|---|
| Fantasy | Build one Academy forever | Run a term with goals, graduate a class, start again stronger |
| End | Never | When the exam timer ends (if on) or when the player calls Commencement |
| Goals | Milestones and achievements | A three-star **term charter** |
| Reset | Never | At term end (Section 30.4) |
| Meta rewards | Spellbooks at Renown milestones | Spellbook choice by stars earned; alumni from the term's masters |

The mode is chosen at creation and can be changed from Settings: Endless → Timed starts a new term *after* the player confirms the reset rules; Timed → Endless converts the current term into an Endless School with no reset.

## 30.2 Timed Term setup

| Setting | Options | Default |
|---|---|---|
| Term length (minimum before Commencement) | 60 / 90 / 120 / 180 / 365 real days | 120 |
| Exam timer | Off / On | **Off** |
| Charter | Pick 3 goals from 6 offered | — |
| Randomize recipes | Off / On | Off |

**Exam timer off (default):** the term can end at any time after the minimum length; the player presses **Commencement** in the Headmaster panel. There is no deadline pressure at all.

**Exam timer on:** the term ends automatically at the end of the chosen length (real Anki days). The countdown is shown on the Academy screen. Because the timer is real-calendar, a break uses term time; this is the only place where time away matters, and the player opts into it. The timer can be switched off at any time (it cannot be switched back on in the same term).

## 30.3 Term charter goals

At the start of a term, six goals are offered (drawn from this pool, scaled to term length); the player picks three. Each completed goal is one star.

| Goal | Scaling (120-day term) |
|---|---|
| Graduate N masters | 4 |
| Have masters in N different schools | 3 |
| Reach N Renown | 150 |
| Tame N creature species | 8 |
| Have N rooms at Fine quality or better | 6 |
| Bring N expeditions home safely | 3 (offered only if the Rift opened in a previous term or the term is ≥ 120 days) |
| Discover N potion recipes | 8 |
| Build an Advanced Hall | 1 |
| Keep the Veil Strong on N% of active days | 90% |
| Have N students enrolled at once | 12 |

## 30.4 Reset rules (BR-30)

At the end of a Timed Term (Draft 8, BR-30 and BR-34):

| Carries over | Resets |
|---|---|
| **Wizard levels** in all schools (with spells known and the Study's level, which belong to the wizard) | **Buildings** (rooms, furniture, grounds), back to the starting layout |
| **Alumni bonuses** (from retirements during the term **and** from every master at Commencement, who graduates as an alumnus) | **Materials** (and essences, potions, eggs, inventory), back to the starting stock (Section 25.1) |
| **Spellbooks** | **Unspent mana**: the bank goes to 0. Mana is earned again only from honest reviews (BR-01) |
| Achievements, the Alumni Gallery and the term record (meta records, not game state) | **Students and faculty** (all characters). Their card links are released, so **their Anki cards become free again** for the next term's students |
| | **Creatures** |
| | Known Plans and patterns (unless a spellbook says otherwise), recipes (when randomized), Renown, the Veil (back to Strong), the draft hand and price history, research ranks |

**Anki is never touched.** A reset only deletes rows in Ankicaster's own save (`card_links`, `characters`, `rooms` and so on). No Anki card, note, deck or scheduling value changes. The term record keeps a read-only summary of every reset character.

Each new term starts from the starting layout and starting stock with a 0 mana bank, but with the wizard already strong, so the early game moves faster and the interesting choices arrive sooner.

## 30.5 Endless School

Endless School never resets. Long-term goals come from milestones (Section 32), spellbook milestones (Section 31.1) and the bestiary/achievement collections. Breaks are handled exactly as in Sections 14.7 and 18.5.

# 31. Spellbooks and Alumni Bonuses (Meta Progression)

## 31.1 Earning spellbooks

| Mode | When | Choice |
|---|---|---|
| Timed Term | At Commencement, if at least one star was earned | Pick 1 of 3 random spellbooks from the tier equal to the stars (1–3) |
| Endless School | At Renown 100 (T1), 250 (T1), 400 (T2), 600 (T2), 850 (T3), 1,200 (T3), then every +400 Renown (T3) | Pick 1 of 3 random spellbooks of that tier not yet owned |

Spellbooks are permanent, carry over between terms (BR-30) and sit on a shelf in the Wizard's Study (each one visibly added). Owned books are never offered again; when a tier is exhausted, the next higher tier is offered, and when all are owned, a cosmetic "Gilded Edition" is offered.

## 31.2 Spellbook catalog

| Tier | Spellbook | Effect |
|---|---|---|
| 1 | Almanac of Kind Weather | Plot outputs +10%; Rainy Week and Cold Snap effects halved |
| 1 | Primer of Patience | Draft price growth ×1.12 per recent draw instead of ×1.15 |
| 1 | Little Book of Wards | Hazards −10% |
| 1 | Housekeeper's Hymnal | All dirt −25% |
| 1 | The Tamer's Pocketbook | Taming +15% |
| 1 | Cookery for Fifty | Meals use 10% fewer Provisions |
| 1 | Notes on Furnishing | Furniture materials −10% |
| 2 | Treatise on Thin Places | Veil cost −10% (inside the 50% cap) |
| 2 | Codex of Careful Hands | Lab explosions −50%; potion yield +10% |
| 2 | The Open Door | Applicant board +1 applicant per school; applicant quality one Renown band higher |
| 2 | Field Guide to Elsewhere | +1 Rift Fortune and +1 supply slot |
| 2 | Architect's Folio | Known Plans and furniture patterns persist across Timed Terms; build time −5% |
| 2 | Healer's Compendium | Healing +20% |
| 2 | The Quiet Corridor | Misbehavior −15% |
| 3 | The Eternal Index | Recent draws count half toward draft price growth |
| 3 | Atlas of the Unmapped | +1 loot roll on every expedition that brings full rewards |
| 3 | Book of Bright Mornings | Mana +3% (inside the +25% cap) |
| 3 | Covenant of the Veil | Veil cost −10% (inside the cap); breaches only at Torn |
| 3 | Menagerie Royale | Creature buffs +15%; up to 3 of a species give buffs |
| 3 | The Founder's Testament | Timed Terms start with ×3 starting materials and one Known Plan of choice |
| 3 | Grimoire of Swift Hands | Spell cooldowns −30% |

## 31.3 Alumni bonuses

Each alumnus grants one bonus based on their final career, plus a small bonus per extra mastered school. Bonuses are scaled by `clamp(retirement_age / 90, 0.67, 2.0)` and capped per category.

| Final career | Bonus per alumnus | Category cap |
|---|---|---|
| Teacher | Classroom essence yields +1% | +15% |
| Scholar | Mana +0.5% | +5% (and inside the global +25%) |
| Gardener | Food and Herbs +2% | +20% |
| Tamer | Taming +2% and creature buffs +1% | +20% / +10% |
| Healer | Healing +2% | +20% |
| Warder | Veil cost −1% | −10% (inside the 50% cap) |
| Alchemist | Potion yield +2% | +20% |
| Builder | Build time −1% | −10% (inside the build-time cap) |
| Adventurer | Rift Fortune +0.2 (summed, rounded down) | +1 |
| None (resident master) | Essence yield of their school +1% | +10% per school |
| Each extra school mastered | +5 Renown at the start of every term (Timed) or once (Endless) | — |

The Alumni Gallery lists every alumnus with portrait, titles, careers, retirement date and the bonus they gave.

# 32. Achievements and Milestones

## 32.1 Rules

- Achievements celebrate **play choices and the honest passage of learning**, never review totals, speed, streaks, accuracy or new cards (BR-03).
- Each achievement grants Renown (listed) and sometimes a cosmetic (robe colour, crest frame, title).
- Achievements persist across Timed Terms.

## 32.2 Achievement list

| ID | Achievement | Condition | Reward |
|---|---|---|---|
| `first_light` | First Light | Complete your first training session | +5 Renown; candle crest frame |
| `five_orbs` | The Five Orbs | Level 1 in every school | +10 |
| `archmagus` | Archmagus | Level 10 in any school | +15; school aura |
| `grand_magus` | Grand Magus | Level 10 in all five schools | +40; golden robe |
| `doors_open` | Doors Open | Enroll your first student | +5 |
| `full_house` | Full House | Every bed filled with at least 8 students | +10 |
| `master_class` | Master Class | Your first master | +15 |
| `triple_crown` | Triple Crown | Three masters (the Rift opens) | +20 |
| `paragon` | Paragon | One character masters all five schools | +40; "Paragon" banner |
| `long_game` | The Long Game | A character with 2+ career sets retires | +20 |
| `first_farewell` | First Farewell | Your first retirement | +10 |
| `hall_of_fame` | Hall of Fame | 10 alumni | +25 |
| `splendid` | Splendid! | Any room reaches Splendid quality | +10 |
| `every_room_a_joy` | Every Room a Joy | 10 rooms at Fine or better | +20 |
| `wing_commander` | Wing Commander | Three adjacent classrooms of the same school | +10 |
| `skyline` | Sky's the Limit | Build on the top floor of a fully expanded castle | +15 |
| `green_fingers` | Green Fingers | A Greenhouse with every bed planted and a gardener | +5 |
| `feast_for_all` | A Feast for All | Serve a meal to 20+ characters with nobody hungry | +10 |
| `calm_waters` | Calm Waters | An active day with 10+ students and no misbehavior | +10 |
| `veilkeeper` | Veilkeeper | Veil Strong for 30 consecutive days | +15 |
| `welcome_back` | Welcome Back | Return after 7+ days away (the Veil held!) | +5; "Seasoned Traveller" title |
| `first_friend` | First Friend | Tame your first creature | +5 |
| `menagerie_keeper` | Menagerie Keeper | 10 creatures tamed at once | +15 |
| `bestiary_25` | Naturalist | 25 different species tamed (lifetime) | +25 |
| `legend_keeper` | Keeper of Legends | Tame a Legendary creature | +30 |
| `bond_three` | Best of Friends | A creature reaches Bond 3 | +10 |
| `first_brew` | First Brew | Brew your first potion | +5 |
| `potion_master` | Potion Master | Discover all Basic recipes | +10 |
| `grand_alchemist` | Grand Alchemist | Discover all 18 recipes | +30 |
| `founders_mustache` | The Founder's Mustache | Suffer the portrait prank | +5 (and the mustache cosmetic) |
| `through_the_rift` | Through the Rift | Your first expedition returns | +10 |
| `hero_hollow` / `hero_fen` / `hero_caverns` / `hero_wastes` / `hero_spire` | Hero of [Destination] | A safe return from that destination | +10 each |
| `against_all_odds` | Against All Odds | A safe return from the Shattered Spire launched at 30% odds or less | +30 |
| `curator` | Curator | 10 artifacts displayed at once | +20 |
| `term_scholar` | Cum Laude / Magna / Summa | Finish a Timed Term with 1 / 2 / 3 stars | +10 / +20 / +30 |

## 32.3 Renown

Renown is the Academy's standing. It never affects mana.

| Source | Renown |
|---|---|
| Each new master title | +10 |
| Each retirement | +5 |
| Each displayed artifact | +2 (while displayed) |
| Academy Banners | +1 each (max 5) |
| Academy Charm | +1 per 50 Charm (Entrance Hall Charm counts double) |
| Achievements, events | As listed |

| Renown | Academy title | Unlocks |
|---|---|---|
| 0 | Hedge School | — |
| 100 | Respected Academy | Applicant band 2; first Endless spellbook |
| 300 | Renowned College | Applicant band 3; crest frame |
| 600 | Grand University | Gilded gate art |
| 1,000 | Legendary Athenaeum | Floating-lantern sky over the Academy |

## 32.4 Milestone track (shown in the Headmaster panel)

A list of the next three meaningful milestones with progress bars: e.g., "Nature 5 — teaching unlocks (61/125 reviews)", "First master — Tamsin: 41/50 cards over 30 days", "The Rift — 1/3 masters". Milestones are informational and never phrased as review targets ("Tamsin's cards are maturing" rather than "do more reviews").

# 33. Economy Balance Tables

> **All numbers in this document are starting values to tune.** They were chosen to be internally consistent for a reference user doing 100–200 honest reviews per day and adding roughly 10–25 new cards per day. Every number lives in `content/*.json` or `config.json`, never in code, so a balancing pass needs no code changes. The simulation harness (Section 40.4) should be used to retune them.

## 33.1 Income

| Honest reviews per day | Mana per day (no Arcane) | With Arcane L10 (+10%) | Bells per day | Mealtimes per day |
|---|---|---|---|---|
| 30 | 300 | 330 | 3 | 0–1 |
| 50 | 500 | 550 | 5 | 1 |
| 100 | 1,000 | 1,100 | 10 | 2 |
| 150 | 1,500 | 1,650 | 15 | 3 |
| 200 | 2,000 | 2,200 | 20 | 4 |
| 300 | 3,000 | 3,300 | 30 | 6 |

Because production, needs and meals are all per bell, the *ratio* of production to consumption is the same at every study volume; heavier studying simply moves the whole Academy faster. The only thing that differs by volume is how fast fixed daily costs (the Veil) are covered.

## 33.2 Spending reference

| Category | Item | Mana | Other |
|---|---|---|---|
| Training | Level n | 80 × n | 25 × n reviews |
| Spells | Study T1/T2/T3/T4/Cap | 150 / 300 / 500 / 800 / 1,200 | 40 / 80 / 120 / 180 / 250 reviews |
| Rooms | Corridor … Menagerie | 25 … 1,400 | See Section 16 |
| Furniture | Fern … Legendary | 30 … 800 | See Section 17 |
| Draft | Foundation / school deck base | 120 / 150 | ×1.15 per draw in the last 7 days, max ×2.5 |
| Enrollment | Per student | 60 | 50 free young cards, bed, seat |
| Applicant reroll | Per school | 100 | or 15 Insight |
| Rift | Mossy Hollow … Shattered Spire launch | 150 / 300 / 500 / 800 / 1,200 | Provisions 5–30 per member |
| Veil | Daily | `(40 + 3 × size) × (1 − reductions)` | — |
| Reinforce the Veil | Per use | 1 × today's upkeep | +15 strength |
| Expansions | Grounds I / II | 400 / 1,200 | 40 T / 80 T + 40 S |
| Expansions | Castle I / II / III | 1,500 / 3,000 / 5,000 | 100 S + 40 T / 200 S + 80 T + 10 G / 300 S + 120 T + 20 G + 10 Cr |

## 33.3 Where mana goes, by phase (target shares at 150 reviews/day)

| Phase | Days | Training | Construction & furniture | Veil | Draft | Rift, spells, misc. |
|---|---|---|---|---|---|---|
| Founding | 1–7 | 45% | 40% | 7% | 8% | 0% |
| Growing | 8–30 | 35% | 35% | 15% | 12% | 3% |
| Masters | 31–90 | 15% | 30% | 25% | 15% | 15% |
| Mature | 90+ | 5% (grimoires) | 25% | 35% | 15% | 20% |

## 33.4 Production reference (per bell, before efficiency and buffs)

| Source | Output |
|---|---|
| Student in a staffed classroom | 0.20 essence of their school |
| Vegetable Patch | 1.0 Provisions + 0.2 Greens |
| Greenhouse bed (Hearthroot) | 1.0 Provisions |
| Herb Garden | 0.6 Herbs |
| Woodlot / Quarry | 2 Timber / 1 Stone |
| Pond / Orchard / Apiary | 0.8 Fish / 0.8 Provisions + 0.3 Nectar / 0.5 Nectar |
| Glassworks / Weaving Room | 2 Stone → 1 Glass / 0.5 Cloth |
| Library scholar | +1 Insight |
| Consumption per character | 0.2 Provisions (1 per mealtime) |

## 33.5 Typical Academy at three points (150 reviews/day, illustrative)

| | Day 7 | Day 30 | Day 90 |
|---|---|---|---|
| Wizard total level | 9 | 27 | 50 |
| Rooms / plots | 9 / 4 | 22 / 8 | 40 / 14 |
| Students / faculty | 3 / 0 | 9 / 0 | 10 / 6 |
| Masters | 0 | 0 | 4 |
| Creatures | 1 | 5 | 12 |
| Daily Veil | ~140 | ~300 | ~420 (after reductions) |
| Bank (if the player spends steadily) | ~500 | ~1,500 | ~4,000 |

## 33.6 Global caps

| Category | Cap | Notes |
|---|---|---|
| Mana multiplier (Arcane + artifacts + spellbooks + alumni) | **+25%** | Only multiplies honest-review mana |
| Veil cost reduction | **50%** | |
| Hazard reduction | **75%** | Moonless Night is outside the cap (temporary) |
| Misbehavior reduction | **75%** | Moonless Night is outside the cap |
| Build-time reduction | **40%** | Boons (Architect's Insight, Master Builder's Week) are outside the cap |
| Material-cost reduction | **40%** | Minimum 1 of each listed material |
| Rift safe odds | Each destination's **best odds** (95 / 90 / 85 / 80 / 70%, Draft 8) | Floor 5%. Rift Fortune max 5 points (+50% reward quantities) |
| Food, herbs, essence, potion-yield percentage bonuses | **+100%** each | Gardener ×1.5 and efficiency are separate multipliers |
| Creature buff bonuses | **+50%** | Bond multipliers are separate |

## 33.7 Balance intentions (what to protect when tuning)

1. The first level-up must happen within the first ~35 reviews of a user's first session.
2. Teaching the first school must unlock within the first 2–4 days at 100–200 reviews/day.
3. Veil upkeep must never exceed ~45% of income for an average-size Academy at 150 reviews/day with reasonable wards.
4. A user at 30 reviews/day must be able to sustain a small Academy (≈10 rooms) indefinitely.
5. No setting or combination may make mana come from anything other than honest reviews.
6. The Shattered Spire is capped at 70% by Draft 8, and only the six Draft 8 modifiers change Rift odds. Never add an odds modifier when tuning; tune Fortune and rewards instead.

# 34. Progression Pacing

## 34.1 Assumptions

Default Anki scheduling (or FSRS at ~90% retention), 10–25 new cards per day, honest answering with ~10% lapses, the player training continuously and spending sensibly. "Free young cards at install" depends on the collection: an active learner typically has 200–800 cards with intervals ≤ 30 days at install. (Linking these existing young cards grants no mana or resources; it only allows enrollment, so BR-01 holds.)

## 34.2 Milestone timetable

| Milestone | What gates it | 100 reviews/day | 150 reviews/day | 200 reviews/day |
|---|---|---|---|---|
| First level-up (L1) | 8 reviews of mana + 25 reviews | Session 1 | Session 1 | Session 1 |
| First school at L5 (teaching) | 375 reviews | Day 4 | Day 3 | Day 2 |
| First student | L5 + Dormitory + Classroom + 50 free young cards | Day 4–5 | Day 3–4 | Day 2–3 |
| First creature | Habitat (L3 of a school) + visitor roll | Days 3–8 | Days 2–6 | Days 2–5 |
| All five schools teachable | 1,875 reviews of training (+ mana) | Days 19–22 | Days 13–16 | Days 10–12 |
| 10 students | Beds, seats, and ~500 free young cards (often card-limited) | Weeks 3–6 | Weeks 2–5 | Weeks 2–4 |
| First mastery-ready student | All 50 linked cards > 30 days | Days 35–60 | Days 35–60 | Days 35–60 |
| First master | + teacher delay (wizard L5–L10: 20–10 days, Light-reduced) | Days 45–75 | Days 42–70 | Days 40–68 |
| The Rift opens (3 masters) | Three masters | Days 55–90 | Days 50–85 | Days 48–80 |
| Wizard at L10 in all schools | 6,875 reviews (+22,000 mana) | ~Day 75–90 | ~Day 50–65 | ~Day 38–50 |
| First Ashen Wastes trip at full safe odds | Party skill 30 days (adventurer cards' real intervals; 6–9 weeks after the adventurers start) | Days 100–150 | Days 95–145 | Days 95–140 |
| First Legendary egg | Shattered Spire (party skill 45 days for full safe odds; earlier at lower odds) | Months 5–7 | Months 4–7 | Months 4–6 |
| Castle fully expanded | Total level 40 + materials | Months 2–3 | Months 2–3 | Month 2 |
| First retirement | Every linked card > 90 days | Months 5–8 | Months 5–8 | Months 5–8 |

Note how card-driven milestones (mastery, retirement) are the same at every review volume: they follow the user's real memory, not their effort level. Review volume changes only mana-and-review-driven milestones (wizard, construction, taming, expedition return times). Rift *odds* are card-driven too: party skill is the real average interval of the adventurers' cards.

## 34.3 The shape of each phase

| Phase | Player's main toys | Typical session |
|---|---|---|
| **Founding (days 1–7)** | Orbs, first rooms, first plot, first student and creature | Queue the next orb, place a room, admire the new student's constellation |
| **Growing (weeks 2–5)** | Five schools, dorm/refectory logistics, furniture quality, draft, first events, Veil bill | Fix the lowest-morale need, furnish a room to Cozy, draft once |
| **Masters (weeks 6–12)** | Careers, faculty limit, teacher delay, Rift opening, alchemy | Assign a new master, brew, plan the first expedition |
| **Mature (month 3+)** | Rift tiers, legendary hunts, Splendid rooms, retirements, spellbooks, terms | Launch an expedition, display an artifact, welcome an alumnus |

## 34.4 Avoiding dead zones

The riskiest gap is between "all five schools teachable" (~week 3) and "first master" (~week 7–10), when the wizard is nearly maxed and students are still maturing. Content placed there on purpose: grimoire study (25 spells), the draft's uncommon and rare tiers, the Menagerie and Advanced Halls (L7), creature bonds, furniture quality tiers, events and achievements, and the visible "constellations" filling with gold as cards mature. The milestone track (Section 32.4) always shows the next mastery-ready student and how many of their cards are past 30 days.

# 35. Tutorial and Onboarding

## 35.1 Principles

- Never interrupt reviewing. All tutorial content lives in the game window or in tiny toasts.
- One hint at a time, always dismissible; "Skip tutorial" is available on the first screen; every hint is also in the Codex.
- Make the honesty promise first and plainly.

## 35.2 Flow

**Step 0 — Install and first open (Tools → Ankicaster).**

A storybook welcome page:

> "Every honest review you do from today earns your Academy a little mana. Again, Hard, Good and Easy are worth exactly the same — answer however is true. Your past reviews don't count, nothing here ever changes your Anki scheduling, and taking a break never costs you anything: the Veil keeps your Academy safe while you're away."

Buttons: **Begin** / Skip tutorial. Then wizard creation (Section 7.2), then a 4-panel guided tour of the Academy (Study, Entrance Hall, grounds, top bar). The tutorial grants the starting kit and one **free Foundation draft** (taught right away with a fixed first draw: Courtyard Garden / Crate of Supplies / Bountiful Harvest).

First goal shown: **"Study in Anki as usual. Your first 8 reviews pay for your first orb."**

**Step 1 — First reviews.** After the first honest review, a toast: "+10 mana ✨". At 80 mana the toast says "You can afford to ponder an orb — open Ankicaster when you like." The game remembers; it does not nag again.

**Step 2 — First orb.** In the Study, the player chooses a school (Nature is suggested, with a one-line reason for each school). The session progress ring is explained: "This finishes after 25 more honest reviews."

**Step 3 — First build.** The Build menu opens on standard plans; the hint points at a Herb Garden or Quarry (cheap, useful). Construction progress is explained the same way.

**Step 4 — First level-up (≈ review 33).** Celebration, and the hint "Level 5 lets you teach this school. Until then, your Academy is just you, your tower and your gardens — enjoy the quiet."

**Step 5 — Level 3 of the first school.** Habitat plan unlocked; the tutorial guarantees a Common visitor of that school at the next day tick if a habitat is built (Mossback Tortoise for Nature).

**Step 6 — First day tick.** The arrival summary introduces the **Veil** with the first bill (small, ~60–90 mana): what it is, that it scales with buildings not people, that Shadow and wards reduce it, and that while you're away it pays itself down to 10% of your bank and then simply holds.

**Step 7 — Level 5 (teaching).** The Classroom plan and the **Recruitment** screen unlock. The enrollment tracker is explained: "Each student is linked to 50 of your youngest cards that no one else has. Right now you have 214 free young cards." The player enrolls their first student; the character card shows the constellation with the explanation: "Each dot is one of your cards. As your intervals grow, Tamsin grows. When every one of her cards is past 30 days, and her teacher's delay has passed, she becomes a Master."

**Step 8 — Needs and meals.** When the second student arrives, a hint introduces Hunger and Rest and points at the Refectory and Dormitory capacity chips.

**Step 9 — The draft.** After the second school reaches L1, a hint introduces school decks and the 3-keep-1 draw.

**Contextual hints later (fire once each):** first hazard; first misbehavior; first room reaching Cozy; first event; first mastery-ready student (explains teacher delay with that student's actual numbers); first master (careers, faculty limit); the Rift opening; first expedition planner (chance meter); first retirement; first time back after 7+ days (Welcome Back).

## 35.3 Codex (in-game help)

An illustrated book with one page per concept: Honest Mana, Bells, The Wizard, Schools, Students and Cards, Skill and Mastery, Teacher Delay, Careers, Faculty Limit, Enrollment Tracker, Retirement, Needs and Morale, Rooms and Quality, Furniture, The Veil, Hazards, Misbehavior, Food, Creatures, Injuries, Potions, Materials, The Draft, The Rift, Events, Spells, Modes, Spellbooks, Alumni, Settings, and "Our Promises" (the guardrails in plain language).

# 36. UI/UX Specification

## 36.1 How Ankicaster appears inside Anki

| Surface | Implementation | Behaviour |
|---|---|---|
| **Tools menu item** | `QAction("Ankicaster", mw)` added to `mw.form.menuTools` | Opens (or raises) the game window |
| **Top toolbar link** | `gui_hooks.top_toolbar_did_init_links` | A small "🔮 1,240" link (mana bank) that opens the window; hidden if the setting `show_toolbar_link` is off |
| **Keyboard shortcut** | Configurable, default `Ctrl+Shift+M` (checked against existing Anki shortcuts at startup; if taken, no shortcut is bound and Settings says so) | Opens the window |
| **Game window** | Non-modal `QDialog` (or `QMainWindow`) containing an `AnkiWebView`; default 1280×800, resizable, remembers geometry per profile | The full game. Closing it never affects reviewing |
| **Dock panel (optional)** | `QDockWidget` added to `mw` (right side), containing a compact `AnkiWebView` | "Tower card": mana bank, active session ring, next bell, construction progress, notices count, Veil gauge. Toggle in Settings (default off) |
| **Post-review toast** | A small frameless, click-through overlay widget anchored to the top-right of the main window (not `tooltip()`, which can cover the answer buttons), fades in 120 ms, holds 1.2 s, fades out | Frequency setting: `every_review` ("+10 ✨"), **`every_bell`** (default: "+100 mana · Bell 14 · Nature 6: 61/150"), `events_only` (level-ups, finished builds, masters, hazards), `off` |
| **Profile switch** | Saves and closes the game window; loads the next profile's save on open | — |

The game window is never opened automatically except once, after install, via a one-time "Open Ankicaster?" prompt on the Deck Browser.

## 36.2 Global layout of the game window

```
┌───────────────────────────────────────────────────────────────────────────┐
│ ✨ 1,240 mana │ Insight 42 · Herbs 77 · Radiance 18 · Umbra 9 · Reagents 30 │
│ Timber 210 · Stone 96 · Glass 31 · Cloth 12 · Provisions 64 │ Veil ████▒ Strong │
├────────┬──────────────────────────────────────────────────────┬──────────┤
│ EVENTS │                                                      │ NOTICES  │
│ board  │            ACADEMY MAP (castle + grounds)            │ tray     │
│ (left) │                                                      │ (right)  │
├────────┴──────────────────────────────────────────────────────┴──────────┤
│ [Build] [Roster] [Recruit] [Wizard] [Draft] [Alchemy] [Menagerie] [Rift]  │
│ [Headmaster] [Codex] [Settings]                Lens: Quality ▾  Bell 14   │
└───────────────────────────────────────────────────────────────────────────┘
```

Screens open as large panels over the map (the map stays visible behind a translucent veil). Esc closes the top panel.

## 36.3 Screens

**1. Academy map (home).** Side-on castle grid (64 px tiles, zoom 50–150%) with grounds to the left and right and sky above. Rooms are drawn with their quality-tier art, furniture icons, occupants (small sprites idling) and status badges (Unfinished, Unreachable, Locked, Dirty, Hazard). Creatures wander in their habitats; Loose creatures wander the map and can be clicked. Construction sites show scaffolding and a progress ring. **Lenses:** Quality (tier colour), Cleanliness, Hazards and wards (Warding Chamber radii), Reachability (BFS distance), Needs (per-room satisfaction), Veil (per-room contribution). Clicking a room opens the **Room panel**: name, level, efficiency with a factor breakdown (level × quality × cleanliness × staff × adjacency), room stats and Q, quality tier, required and optional furniture slots (drag from inventory or click "+"), occupants and staff, outputs per bell, level-up/renovate, demolish.

**2. Wizard.** Large portrait in the Study; five school dials (level, progress ring, current buff, next unlock); the training queue with drag-to-reorder and pause; spells (cast buttons with cooldown rings); spellbook shelf; titles; appearance editor.

**3. Roster.** Filterable grid (students, masters, faculty, adventurers, injured, alumni). Character card: portrait, personality, traits, the **constellation** (dots for each linked card coloured by interval; hover shows the card's front text and interval; dots for suspended or missing cards show a moon or empty ring), skill and seasoning bars, mastery-ready countdown with teacher delay explanation ("Ready for 4 of 12 days. Teacher: Prof. Alder — teaching cards average 22 days → delay 8 days, −9% Light → 8 days"), needs bars, morale, assignments (bed, seat, workplace), chronicle, actions (assign career, enroll second school, swap a suspended/missing card, move bed/seat, rename).

**4. Recruitment.** Enrollment tracker at the top (Section 12.3); one tab per teachable school with three applicant cards each; capacity chips (beds, seats); Enroll buttons (disabled with a reason when blocked); reroll.

**5. Build menu.** Category tabs (Core, Living, Teaching, Knowledge, Nature, Light, Shadow, Craft, Rift, Grounds, Expansions, Furniture). Each entry: art, size, cost (unaffordable parts in red), build time, Veil per day ("+12 Veil/day"), effects, placement notes. Hand blueprints appear in their categories with a card frame. Selecting enters placement mode (ghost, rule feedback, adjacency preview, Veil delta).

**6. Draft.** Six deck "books" on a shelf, each with price and rarity weights; the draw animation reveals three cards; click to keep; reroll button; the hand (8 slots) below with play/discard.

**7. Alchemy & Inventory.** Tabs: Materials (with caps), Essences, Potions (use buttons), Recipe Book (known recipes, partially revealed ones, experiment slots), Brewing stations (choose three ingredients, see whether the triple is known), Scrolls, Artifacts, Curios.

**8. Menagerie.** Habitat list with occupancy; creature cards (portrait, rarity, status Wary/Tamed/Hungry/Loose, taming progress, bond, diet, buff, trouble); assign tamer; release; bestiary collection grid (silhouettes for undiscovered species, with "found in" hints).

**9. Rift.** Five portal cards (Mossy Hollow to the Shattered Spire), each showing its tier, skill needed, safe and best odds, reviews to return, launch cost and main rewards; a **party skill** readout (each adventurer's Rift skill in days, the party average, and "+1.8 days to the next +5%"); the **team picker** (drag up to three adventurers; injured ones greyed with reason); companion slot; supply slots; the **chance meter** (needle and number for a safe return) with the six Draft 8 modifiers listed, the best-odds cap marked on the dial, and the Fortune score shown separately; launch cost; Launch button; active expedition card (progress in reviews, team portraits); expedition log with outcomes and loot.

**10. Headmaster.** Veil ledger (last 30 days: cost, paid, strength, active/away), faculty limit breakdown (Section 11.6), milestone track, term charter and timer (Timed Term), achievements, Alumni Gallery, statistics (mana earned per day, mana spent by category, rooms by quality tier, creatures tamed). There is deliberately **no** review-count leaderboard or streak display.

**11. Settings.** Every `config.json` option (Section 38.14) with plain-language descriptions, grouped: Honesty & counting, Students & cards, Veil, Notifications, Display & accessibility, Mode, Data (export save, backups, reset with double confirmation).

**12. Codex.** Section 35.3.

## 36.4 Arrival summary

Shown when the game window opens if anything happened since the last open: reviews counted (desktop and other devices), mana earned and spent automatically (Veil), bells rung, sessions/constructions/tamings/expeditions finished, masters, retirements, events waiting, hazards that happened and how they resolved. One "Got it" button; each line links to the relevant screen.

## 36.5 Accessibility and comfort

- Colour-blind-safe palette with icons and patterns on every colour-coded element (school colours always paired with school glyphs).
- Text scaling 80–150%; minimum 13 px.
- **Reduce motion** setting (disables wandering, particles, fades).
- Full keyboard navigation (Tab order, Enter/Space, arrow keys on the map); ARIA labels on all controls.
- Sound off by default.
- Dark and light themes following Anki's night mode (`theme_manager.night_mode`).

# 37. Art Direction and Audio

## 37.1 Direction

**Cozy storybook cross-section.** A warm, hand-drawn-looking castle cut open like a doll's house, against a sky that shifts with the Veil (clear twilight blue when Strong, flickering aurora when Thinning, inky with stars and drifting shapes when Thin or Torn). Think illustrated children's book rather than dark fantasy: rounded shapes, soft outlines, lamplight, plants everywhere.

## 37.2 Practical approach for v1 (AI-buildable)

- **Rendering:** HTML/CSS/SVG inside the `AnkiWebView`. The map is an absolutely positioned grid of room `div`s with layered backgrounds (wall tier, floor, furniture icons) or a single `<canvas>` if performance requires (target 60 rooms, 80 sprites).
- **Assets:** an SVG sprite sheet generated as part of the build (simple shapes: rooms as rounded rectangles with tier-specific wall patterns; furniture as 24–32 px icons; characters as layered "paper doll" SVGs: body, robe in school colour, hair, hat). Emoji may be used as placeholder icons in the MVP only.
- **Tile size:** 64 × 64 px at 100% zoom; rooms 1×1 to 3×2 tiles.
- **Quality tiers** change wall and floor art: Bare (grey stone), Plain (plaster), Cozy (warm wood, rug), Fine (panelling, banner), Splendid (gilding, floating candles, sparkle).
- **Animation:** CSS transitions only; idle bobbing for characters, wandering creatures (simple paths within their room), scaffolding progress, level-up sparkles. All disabled by Reduce motion.

## 37.3 Palette

| Element | Colour |
|---|---|
| Arcane | Violet #6B4FBB, silver #C9CED6 |
| Nature | Moss #4E8B3A, amber #E0A33A |
| Light | Gold #E8C547, ivory #FFF6DC |
| Shadow | Indigo #2F3A73, teal #2E8B8B |
| Alchemy | Copper #B5651D, vermilion #D9472B |
| UI parchment | #F4EBD9 (light theme), #2A2533 (dark theme) |
| Veil | Strong #9BD4FF, Thinning #B9A6FF, Thin #7D5BA6, Torn #3D2856 |

## 37.4 Typography

A readable humanist sans-serif for UI (system UI font stack) and a single display face for headings (bundle an open-licence storybook serif such as a SIL OFL font; include its licence file).

## 37.5 Audio (optional, off by default)

Soft bell chime per bell (only while the game window is open), page-turn for the draft, gentle "ding" on level-up, purr/chirp on taming. Never play sound in the reviewer.

# 38. Technical Implementation Specification

## 38.1 Target environment

| Item | Requirement |
|---|---|
| Anki | Desktop 2.1.66 or newer, including 23.x, 24.x and 25.x (Qt6 builds only) |
| Language | Python 3.9-compatible syntax (no `match`, no 3.10+ typing syntax such as `X | Y`; use `from __future__ import annotations` + `typing.Optional`) |
| UI toolkit | `aqt.qt` (PyQt6 via Anki's wrapper; never import `PyQt6` directly) |
| Web UI | `aqt.webview.AnkiWebView` with local HTML/CSS/JS served through `mw.addonManager.setWebExports` |
| JS | Vanilla ES2019 modules, no CDN, no build step required (a small bundled micro-framework of your own is fine) |
| Save storage | Python's standard `sqlite3`, one file per Anki profile in the add-on's `user_files/` folder |
| Dependencies | None beyond the standard library and Anki |

## 38.2 Architecture

```
              ┌────────────────────────── Anki (aqt) ──────────────────────────┐
   reviewer ──►  gui_hooks.reviewer_did_answer_card / review_did_undo           │
   sync     ──►  gui_hooks.sync_did_finish / profile_did_open / will_close      │
   ops      ──►  gui_hooks.operation_did_execute (cards changed)                │
              └───────────────┬────────────────────────────────────────────────┘
                              ▼
                   adapters/anki_bridge.py   ← the ONLY module that touches mw.col
                   (ReadOnlyCollection: SELECT-only queries, card snapshots)
                              ▼
          core/ (pure Python, no aqt imports, fully unit-testable)
          ledger · wizard · linking · characters · school/grid · rooms · furniture
          needs · food · creatures · hazards · misbehavior · injuries · alchemy
          draft · rift · events · spells · veil · tick · meta · rng · content
                              ▼
                   storage/ (SQLite save per profile, migrations, backups)
                              ▲
          ui/ (Qt window, dock, toast)  ◄──►  web/ (HTML/JS views)
          bridge: pycmd("ankicaster:{json}")  ⇄  web.eval("AC.reply/AC.push")
```

Rules:

1. `core/` never imports `aqt` or `anki`. It receives plain data (card snapshots, revlog rows, today's day number) and returns plain data (state changes, notices).
2. `adapters/anki_bridge.py` is the only code allowed to read the collection, and it can only read (Section 38.4).
3. The engine (Python) is authoritative. The web UI renders state and sends *intents*; every intent is validated in Python.

## 38.3 Suggested file structure

```
ankicaster/
├── __init__.py                 # entry point: registers hooks, menu action, web exports
├── manifest.json               # package metadata for .ankiaddon
├── config.json                 # global user preferences (Section 38.14)
├── config.md                   # help text for Anki's config dialog
├── adapters/
│   ├── anki_bridge.py          # ReadOnlyCollection, card/revlog snapshot queries
│   └── hooks.py                # hook handlers (thin; defer heavy work)
├── core/
│   ├── constants.py            # binding constants (25×n, 30 days, 20 career cards, 10% floor…)
│   ├── content.py              # loads and validates content/*.json
│   ├── rng.py                  # seeded, named RNG streams
│   ├── ledger.py               # honest-review checks, mana, undo, catch-up
│   ├── progress.py             # per-review progress dispatch (sessions, builds, taming…)
│   ├── bells.py                # bell processing order (Section 38.12)
│   ├── tick.py                 # day tick, break handling (Section 38.10)
│   ├── wizard.py               # levels, sessions, buffs, spells
│   ├── linking.py              # youngest-free-card selection, maintenance
│   ├── characters.py           # students, skill, mastery, careers, retirement
│   ├── enrollment.py           # tracker, applicants
│   ├── grid.py                 # placement rules, reachability BFS, adjacency
│   ├── rooms.py                # construction, levels, efficiency, quality
│   ├── furniture.py
│   ├── needs.py                # needs, meals, morale
│   ├── food.py                 # production, crops, storage caps
│   ├── creatures.py            # arrival, taming, feeding, escapes
│   ├── veil.py                 # upkeep, strength, away floor
│   ├── hazards.py
│   ├── misbehavior.py
│   ├── injuries.py
│   ├── alchemy.py
│   ├── draft.py
│   ├── rift.py
│   ├── events.py
│   ├── meta.py                 # modes, terms, spellbooks, alumni, achievements, renown
│   ├── modifiers.py            # collects buffs and applies global caps (Section 33.6)
│   └── state_view.py           # builds the JSON snapshot sent to the UI
├── storage/
│   ├── db.py                   # connection, transactions, backups
│   └── migrations/
│       ├── 001_initial.sql
│       └── …
├── ui/
│   ├── window.py               # game QDialog + AnkiWebView
│   ├── dock.py                 # optional QDockWidget
│   ├── toast.py                # click-through overlay toast
│   └── bridge.py               # pycmd router, reply/push helpers
├── content/                    # all tunable game data (Section 38.15)
│   ├── economy.json  rooms.json  furniture.json  creatures.json  crops.json
│   ├── potions.json  materials.json  artifacts.json  scrolls.json  hazards.json
│   ├── misbehavior.json  traits.json  personalities.json  events.json  spells.json
│   ├── spellbooks.json  alumni.json  achievements.json  draft_decks.json  rift.json
│   ├── wizard.json  names.json  tutorial.json  strings_en.json
├── web/
│   ├── index.html  app.js  views/*.js  styles.css  sprites.svg  fonts/
├── tests/
│   ├── test_ledger.py  test_linking.py  test_mastery.py  test_veil.py  test_grid.py
│   ├── test_rift.py  test_tick_breaks.py  test_readonly_guard.py  sim/simulate.py
└── user_files/                 # created at runtime; preserved by Anki on updates
    └── <profile name>/ankicaster.sqlite, backups/, logs/
```

## 38.4 Read-only collection access (BR-02)

All collection access goes through one class:

```python
class ReadOnlyCollection:
    """The only gateway to Anki data. SELECT statements only."""
    def __init__(self, col):
        self._col = col

    def _select(self, sql: str, *args):
        s = sql.lstrip().lower()
        if not s.startswith("select") or ";" in sql:
            raise RuntimeError("Ankicaster: non-SELECT query refused")
        return self._col.db.all(sql, *args)

    def today(self) -> int:            return self._col.sched.today
    def day_cutoff(self) -> int:       return self._col.sched.day_cutoff  # epoch seconds

    def card_rows(self, ids):          # chunked by 500
        ...  # SELECT id, nid, did, odid, type, queue, ivl FROM cards WHERE id IN (...)

    def last_answer_ivls(self, ids):
        ...  # SELECT cid, ivl FROM revlog WHERE cid IN (...) AND type BETWEEN 0 AND 3
             #   AND ease BETWEEN 1 AND 4 ORDER BY id   (keep the last per cid)

    def revlog_since(self, after_id):
        ...  # SELECT id, cid, ease, ivl, time, type FROM revlog WHERE id > ? ORDER BY id

    def revlog_entry(self, revlog_id): ...
    def latest_revlog_for_card(self, cid): ...
    def eligible_young_cards(self, deck_ids, young_days, exclude_ids): ...  # Section 38.9
    def deck_names(self): return self._col.decks.all_names_and_ids()
```

**Forbidden anywhere in the add-on** (enforce with a unit test that scans the source tree): `col.update_card`, `col.update_cards`, `card.flush`, `col.sched.answerCard`, `sched.answer_card`, `sched.suspend_cards`, `sched.bury_cards`, `sched.reschedule_cards`, `sched.set_due_date`, `sched.forget_cards`, `col.remove_cards`, `col.add_note`, `col.update_note`, `note.flush`, `col.decks.save`, `col.set_config`, `col.db.execute`, `col.db.executemany`, `col.save`, `mw.col.mod`, `checkpoint`, `col.modSchema`, any `UPDATE`/`INSERT`/`DELETE`/`REPLACE` string sent to `col.db`. The reviewer's answer flow must never be altered (no wrapping of `Reviewer._answerCard`, no monkey-patching).

Heavier reads (refreshing thousands of links) use `aqt.operations.QueryOp(parent=mw, op=lambda col: ..., success=...)` so they run off the main thread with proper collection locking and never freeze the UI.

## 38.5 Hooks used

| Hook | Handler | Work done on the hook thread (≤ 5 ms) |
|---|---|---|
| `gui_hooks.main_window_did_init` | Add Tools-menu action and shortcut; `setWebExports` | Trivial |
| `gui_hooks.profile_did_open` | Open the save for `mw.pm.name`; first-run install timestamp; schedule catch-up scan and day tick | Open DB only; defer the rest with `mw.progress.single_shot(500, …)` |
| `gui_hooks.profile_will_close` | Flush and close the save; close windows | Short |
| `gui_hooks.reviewer_did_answer_card(reviewer, card, ease)` | Record `card.id` and `time.time()` in a pending queue; schedule `process_pending()` in 50 ms | Append to a list |
| `gui_hooks.review_did_undo(card_id)` | Schedule ledger reconciliation for that card | Append |
| `gui_hooks.state_did_undo(changes)` | Schedule a broader ledger reconciliation (Edit → Undo) | Append |
| `gui_hooks.operation_did_execute(changes, handler)` | If `changes.card` or `changes.note` is true, mark links dirty for refresh at the next window open / day tick | Set a flag |
| `gui_hooks.sync_did_finish` | Schedule catch-up scan of revlog (other devices) and link refresh | Schedule only |
| `gui_hooks.top_toolbar_did_init_links(links, toolbar)` | Add the mana link | String append |

A `QTimer` (every 10 minutes while a profile is open) checks whether `col.sched.today` has advanced and runs the day tick if so, so a user who leaves Anki open overnight still gets their tick.

## 38.6 Review processing pipeline

```python
def process_pending():                      # runs ~50 ms after an answer, on the main thread
    for (cid, t) in drain(pending):
        row = ro.latest_revlog_for_card(cid)        # id, cid, ease, ivl, time, type
        if row is None: continue
        if ledger.has(row.id): continue             # H4 idempotence
        verdict = ledger.check_honest(row, install_ms, per_card_day_counts)   # H1–H7
        ledger.record(row, verdict, source="live")
        if verdict.ok:
            effects = engine.apply_honest_review(row)   # mana, progress, bells (38.12)
            ledger.attach_effects(row.id, effects)      # for undo
            toast.maybe_show(effects)
    engine.maybe_day_tick()

def catch_up_scan():                         # profile open, after sync
    for row in ro.revlog_since(max(ledger.watermark(), install_ms)):
        if ledger.has(row.id): continue
        verdict = ledger.check_honest(row, ...)
        ledger.record(row, verdict, source="catchup")
        if verdict.ok: engine.apply_honest_review(row, quiet=True)
    notices.add_summary("reviews on other devices")

def reconcile_undo(card_id=None):
    for entry in ledger.recent_counted(card_id, within_ms=3_600_000):
        if not ro.revlog_entry(entry.revlog_id):        # Anki removed it
            engine.reverse(entry.effects)               # mana (→ debt if spent), progress
            ledger.mark_reversed(entry.revlog_id)
```

Notes:

- The live path and the catch-up path share the same ledger, so a review is never counted twice.
- `apply_honest_review` is fast (O(active items)); bells and the day tick are deferred further if they exceed 5 ms.
- **Undo edge case (accepted):** if the undone review had *completed* something (a session, a build), the completion stands; only the review's own progress and mana are reversed (mana via debt). The internal `review_index` used for durations is monotonic and is never decremented.

## 38.7 Data model (SQLite schema)

One save file per Anki profile: `user_files/<profile>/ankicaster.sqlite` (WAL journal mode, `PRAGMA foreign_keys=ON`). JSON columns hold small structured values. All times are epoch milliseconds; all `day` values are Anki day numbers (`col.sched.today`).

```sql
-- 001_initial.sql
CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
-- keys: schema_version, install_ms, rng_seed, last_processed_day, last_review_ms,
--       bank_at_last_review, review_index, honest_review_count, last_bell_index,
--       mode ('endless'|'timed'), current_term_id, renown, tutorial_step

CREATE TABLE wallet (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  mana REAL NOT NULL DEFAULT 0, mana_debt REAL NOT NULL DEFAULT 0,
  lifetime_earned REAL NOT NULL DEFAULT 0, lifetime_spent REAL NOT NULL DEFAULT 0);

CREATE TABLE mana_ledger (
  revlog_id INTEGER PRIMARY KEY,          -- Anki revlog.id; guarantees no double counting
  card_id INTEGER NOT NULL, day INTEGER NOT NULL,
  source TEXT NOT NULL,                    -- 'live' | 'catchup'
  status TEXT NOT NULL,                    -- 'counted' | 'too_fast' | 'card_cap' | 'pre_install'
                                           -- | 'not_study' | 'reversed'
  mana REAL NOT NULL DEFAULT 0,
  effects_json TEXT,                       -- what this review advanced (for undo)
  counted_ms INTEGER NOT NULL);
CREATE INDEX ix_ledger_card_day ON mana_ledger(card_id, day);

CREATE TABLE day_log (
  day INTEGER PRIMARY KEY, honest_reviews INTEGER NOT NULL DEFAULT 0,
  mana_earned REAL NOT NULL DEFAULT 0, veil_cost INTEGER, veil_paid INTEGER,
  veil_strength_after INTEGER, was_active INTEGER, processed INTEGER NOT NULL DEFAULT 0);

CREATE TABLE wizard (
  id INTEGER PRIMARY KEY CHECK (id = 1), name TEXT, title TEXT, pronouns TEXT,
  appearance_json TEXT, sigil TEXT, academy_name TEXT, created_ms INTEGER,
  study_level INTEGER NOT NULL DEFAULT 1);
CREATE TABLE wizard_levels (school TEXT PRIMARY KEY, level INTEGER NOT NULL DEFAULT 0);

CREATE TABLE sessions (
  id INTEGER PRIMARY KEY, kind TEXT NOT NULL,             -- 'orb' | 'grimoire'
  school TEXT NOT NULL, target_level INTEGER, spell_id TEXT,
  cost_paid REAL NOT NULL, required INTEGER NOT NULL, progress REAL NOT NULL DEFAULT 0,
  state TEXT NOT NULL,                                     -- 'active'|'queued'|'paused'|'done'
  queue_pos INTEGER, created_ms INTEGER, completed_ms INTEGER);

CREATE TABLE spells_known (spell_id TEXT PRIMARY KEY, learned_day INTEGER,
  cooldown_until_index INTEGER DEFAULT 0, cooldown_until_day INTEGER DEFAULT 0);

CREATE TABLE characters (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, pronouns TEXT, appearance_json TEXT,
  personality TEXT NOT NULL, traits_json TEXT NOT NULL,
  status TEXT NOT NULL,             -- 'student'|'resident'|'faculty'|'away'|'alumnus'
  current_school TEXT,              -- school currently being studied (NULL if none)
  mastered_json TEXT NOT NULL DEFAULT '[]',
  career TEXT, career_state TEXT,   -- 'active'|'sabbatical'
  needs_json TEXT NOT NULL,         -- {"hunger":80,"rest":70,"leisure":60,"composure":75,"health":100}
  morale REAL NOT NULL DEFAULT 70,
  injury_json TEXT,                 -- {"type":"sprained","points":12,"required":80}
  bed_room_id INTEGER, seat_room_id INTEGER, workplace_room_id INTEGER,
  ready_days_json TEXT NOT NULL DEFAULT '{}',   -- per school: real days ready
  enrolled_day INTEGER, retired_day INTEGER,
  chronicle_json TEXT NOT NULL DEFAULT '[]', flags_json TEXT NOT NULL DEFAULT '{}');

CREATE TABLE card_sets (
  id INTEGER PRIMARY KEY, character_id INTEGER NOT NULL REFERENCES characters(id),
  kind TEXT NOT NULL,               -- 'study' | 'career'
  school TEXT, career TEXT, size INTEGER NOT NULL, created_day INTEGER NOT NULL,
  released INTEGER NOT NULL DEFAULT 0);

CREATE TABLE card_links (
  anki_card_id INTEGER PRIMARY KEY,           -- PRIMARY KEY enforces BR-13 (never shared)
  set_id INTEGER NOT NULL REFERENCES card_sets(id),
  slot INTEGER NOT NULL, linked_day INTEGER NOT NULL,
  cached_ivl INTEGER NOT NULL DEFAULT 0,      -- cards.ivl
  last_answer_ivl INTEGER NOT NULL DEFAULT 0, -- from revlog (type 0–3)
  honest_ivl INTEGER NOT NULL DEFAULT 0,      -- max(0, min(cached_ivl, last_answer_ivl))
  card_type INTEGER, card_queue INTEGER, note_id INTEGER,
  status TEXT NOT NULL DEFAULT 'ok',          -- 'ok'|'suspended'|'new'|'missing'
  status_since_day INTEGER, refreshed_ms INTEGER,
  UNIQUE (set_id, slot));
CREATE INDEX ix_links_set ON card_links(set_id);

CREATE TABLE rooms (
  id INTEGER PRIMARY KEY, type TEXT NOT NULL, area TEXT NOT NULL,   -- 'castle'|'grounds'
  x INTEGER NOT NULL, y INTEGER NOT NULL, w INTEGER NOT NULL, h INTEGER NOT NULL,
  level INTEGER NOT NULL DEFAULT 1, state TEXT NOT NULL,           -- 'site'|'built'
  build_required REAL, build_progress REAL DEFAULT 0, build_paused INTEGER DEFAULT 0,
  build_slot INTEGER, cleanliness REAL NOT NULL DEFAULT 100,
  locked_until_index INTEGER DEFAULT 0, lock_reason TEXT,
  settings_json TEXT NOT NULL DEFAULT '{}',   -- crops, habitat modules, toggles
  built_day INTEGER);

CREATE TABLE furniture (
  id INTEGER PRIMARY KEY, item_id TEXT NOT NULL, room_id INTEGER REFERENCES rooms(id),
  slot_kind TEXT,                    -- 'required:<role>' | 'optional' | 'bed' | 'plinth'
  slot_index INTEGER, damaged INTEGER NOT NULL DEFAULT 0, acquired_day INTEGER);

CREATE TABLE known_patterns (item_id TEXT PRIMARY KEY);
CREATE TABLE known_plans (room_type TEXT PRIMARY KEY);
CREATE TABLE inventory (item_id TEXT PRIMARY KEY, qty REAL NOT NULL DEFAULT 0);
CREATE TABLE hand (id INTEGER PRIMARY KEY, card_def_id TEXT NOT NULL, drawn_day INTEGER);
CREATE TABLE draft_history (id INTEGER PRIMARY KEY, deck TEXT, day INTEGER, price REAL,
  shown_json TEXT, kept TEXT);
CREATE TABLE draft_pity (deck TEXT PRIMARY KEY, draws_without_rare INTEGER DEFAULT 0);

CREATE TABLE creatures (
  id INTEGER PRIMARY KEY, species_id TEXT NOT NULL, nickname TEXT,
  room_id INTEGER REFERENCES rooms(id),
  status TEXT NOT NULL,              -- 'egg'|'wary'|'tamed'|'loose'|'away'|'crated'|'visitor_waiting'
  hatch_progress REAL DEFAULT 0,      -- eggs only (Section 27.10)
  hungry INTEGER NOT NULL DEFAULT 0, taming_progress REAL DEFAULT 0, tamer_id INTEGER,
  bond_level INTEGER DEFAULT 1, bond_progress REAL DEFAULT 0,
  loose_since_index INTEGER, hidden_json TEXT, arrived_day INTEGER);

CREATE TABLE expeditions (
  id INTEGER PRIMARY KEY, destination TEXT NOT NULL, tier TEXT NOT NULL,
  team_json TEXT NOT NULL, companion_id INTEGER, supplies_json TEXT,
  party_skill REAL NOT NULL,                           -- mean ivl of adventurer cards at launch
  chance INTEGER NOT NULL, fortune INTEGER NOT NULL DEFAULT 0,
  roll INTEGER NOT NULL, wrong_roll INTEGER NOT NULL,  -- both hidden from the UI
  breakdown_json TEXT NOT NULL, required INTEGER NOT NULL, progress REAL DEFAULT 0,
  state TEXT NOT NULL,                                 -- 'active'|'returned'
  outcome TEXT,               -- 'safe'|'minor_injury'|'serious_injury'|'curse'|'retreat'
  loot_json TEXT, injury_json TEXT, launched_day INTEGER, returned_day INTEGER);

CREATE TABLE events (id INTEGER PRIMARY KEY, event_id TEXT NOT NULL, created_day INTEGER,
  expires_day INTEGER, state TEXT NOT NULL, choice TEXT, result_json TEXT);
CREATE TABLE active_effects (id INTEGER PRIMARY KEY, kind TEXT, target TEXT,
  until_index INTEGER, until_day INTEGER, data_json TEXT);      -- hazards, boons, spells
CREATE TABLE applicants (id INTEGER PRIMARY KEY, school TEXT, day INTEGER, data_json TEXT);
CREATE TABLE notices (id INTEGER PRIMARY KEY, created_ms INTEGER, kind TEXT, text TEXT,
  data_json TEXT, seen INTEGER DEFAULT 0);
CREATE TABLE achievements (id TEXT PRIMARY KEY, unlocked_day INTEGER);
CREATE TABLE spellbooks (id TEXT PRIMARY KEY, acquired_day INTEGER, source TEXT);
CREATE TABLE alumni_bonuses (character_id INTEGER, category TEXT, value REAL);
CREATE TABLE recipes_known (recipe_id TEXT PRIMARY KEY, revealed_mask INTEGER NOT NULL);
CREATE TABLE research (id TEXT PRIMARY KEY, rank INTEGER NOT NULL DEFAULT 0,      -- e.g. 'veil_theory'
  active_rank INTEGER, progress REAL DEFAULT 0, required INTEGER, researcher_id INTEGER);
CREATE TABLE rng_streams (name TEXT PRIMARY KEY, counter INTEGER NOT NULL DEFAULT 0);
CREATE TABLE terms (id INTEGER PRIMARY KEY, started_day INTEGER, min_length_days INTEGER,
  exam_timer INTEGER, charter_json TEXT, ended_day INTEGER, stars INTEGER, record_json TEXT);
```

## 38.8 UI state snapshot (JSON)

`state_view.build()` returns one JSON object (≈ 20–150 KB) that the web UI renders. Deltas may be pushed after bells; a full snapshot is sent on window open.

```json
{
  "version": 1,
  "day": 20123, "reviewIndex": 4182, "bell": 418, "nextBellIn": 8,
  "wallet": {"mana": 1240.0, "debt": 0},
  "resources": {"timber": 210, "stone": 96, "glass": 31, "cloth": 12, "provisions": 64,
                "greens": 20, "fish": 0, "nectar": 4,
                "insight": 42, "herbs": 77, "radiance": 18, "umbra": 9, "reagents": 30,
                "crystal": 3}, "caps": {"timber": 500},
  "veil": {"strength": 86, "band": "strong", "costToday": 302, "reductions": [["Shadow L7", 0.06]]},
  "wizard": {"name": "Hazel", "levels": {"arcane": 3, "nature": 7, "light": 5, "shadow": 2, "alchemy": 5},
             "sessions": [{"id": 9, "kind": "orb", "school": "nature", "target": 8,
                           "progress": 61, "required": 200, "state": "active"}]},
  "grid": {"castle": {"w": 10, "h": 7}, "grounds": {"plots": 10}},
  "rooms": [{"id": 1, "type": "entrance_hall", "x": 3, "y": 0, "w": 2, "h": 1, "level": 1,
             "state": "built", "efficiency": 1.08, "quality": {"q": 18, "tier": "plain"},
             "clean": 92, "badges": []}],
  "characters": [{"id": 3, "name": "Tamsin Reed", "status": "student", "school": "nature",
                  "skill": 64, "seasoning": 22, "ready": false, "cardsOver30": 31,
                  "needs": {"hunger": 80, "rest": 72, "leisure": 55, "composure": 70, "health": 100},
                  "morale": 72}],
  "tracker": {"freeYoung": 63, "needed": 50, "bedsFree": 2, "seatsFree": {"nature": 3}},
  "creatures": [], "expeditions": [], "events": [], "notices": [], "hand": [],
  "settings": {"reduceMotion": false, "textScale": 1.0}
}
```

Card front text for constellation tooltips is fetched lazily (`character.card_preview`), stripped of HTML and truncated to 60 characters, and never stored in the save.

## 38.9 Card-linking algorithm (implementation)

```python
def pick_youngest_free(ro, store, n, require_young, deck_ids):
    linked = store.all_linked_card_ids()            # set[int]
    rows = ro.eligible_cards(deck_ids)              # see SQL below
    cands = []
    for r in rows:
        if r.id in linked: continue
        hon = honest_ivl(r.ivl, store.last_answer_ivl_cache.get(r.id, r.ivl))
        if require_young and hon > YOUNG_THRESHOLD_DAYS: continue
        cands.append((hon, -r.first_review_ms, r.id, r.nid))
    cands.sort()                                    # youngest, newest-started, stable id
    chosen, notes = [], set()
    for hon, _, cid, nid in cands:
        if settings.avoid_siblings and nid in notes: continue
        chosen.append(cid); notes.add(nid)
        if len(chosen) == n: return chosen
    if settings.avoid_siblings:                     # relax sibling rule if short
        for hon, _, cid, nid in cands:
            if cid not in chosen:
                chosen.append(cid)
                if len(chosen) == n: return chosen
    return None                                     # not enough: caller blocks (BR-23)
```

```sql
-- eligible cards (read-only). Deck scope uses the home deck for cards in filtered decks.
SELECT c.id, c.nid, c.ivl, c.type, c.queue,
       (SELECT MIN(r.id) FROM revlog r WHERE r.cid = c.id) AS first_review_ms
FROM cards c
WHERE c.queue != -1                          -- not suspended
  AND c.type IN (1, 2, 3)                    -- studied at least once (unless link_new_cards)
  AND (CASE WHEN c.odid != 0 THEN c.odid ELSE c.did END) IN (/* deck ids in scope */)
```

For large collections (100k+ cards) the query is run inside a `QueryOp`, and the `first_review_ms` subquery may be replaced by `c.id` ordering if it exceeds 300 ms (documented fallback).

**Link maintenance at each day tick:**

1. Refresh `cached_ivl`, `card_type`, `card_queue` for all links; refresh `last_answer_ivl` for links whose card was answered since the last refresh (from the ledger) or every 7 days for all.
2. Missing ids → status `missing` (`status_since_day` = today).
3. `queue == -1` → `suspended` (keep `status_since_day`); `type == 0` → `new`.
4. If more than 25% of all links became `missing` in one tick, stop and raise the "Many linked cards are missing" dialog (Section 9.6).
5. Release and refill: links `missing` (any age), `suspended` longer than `suspended_release_days`, `new` longer than 30 days → delete the link row and, for study sets, fill the slot with `pick_youngest_free(n=1, require_young=True)`; for career sets, `require_young=False`. If no card is available the slot stays empty (counts as interval 0).

## 38.10 Day tick and break handling

```python
def maybe_day_tick():
    today = ro.today()
    last = meta.last_processed_day
    if last is None: meta.last_processed_day = today; return
    if today <= last: return                       # same day, or clock moved backwards: ignore
    for d in range(last, today):                   # process every completed day [last, today)
        veil.charge_day(d, active=day_log.honest_reviews(d) > 0)   # Section 18.4
        if day_log.honest_reviews(d) > 0:
            events.daily_roll(d)                    # only after active days
    elapsed = today - last
    links.refresh_and_maintain(today)               # QueryOp; then continue in success()
    characters.recompute_skill()
    characters.advance_mastery(elapsed_days=elapsed) # ready_days += elapsed if ready now
    characters.check_retirements(today)
    enrollment.refresh_applicants(today)
    creatures.daily_visitors(today, active=day_log.honest_reviews(today - 1) > 0)
    meta.term_timer(today); meta.check_achievements()
    meta.last_processed_day = today
```

- **Long breaks:** the Veil loop is O(days) with trivial arithmetic; for breaks over 400 days use the closed form (pay `min(cost × days, bank − floor)` and stop). Nothing else iterates per day.
- **Away days** are days with zero honest reviews in `day_log`. Reviews from other devices arriving later are credited to their own day for mana, but a day already processed as away is not re-processed (no retroactive Veil changes).
- **Mapping a revlog id to an Anki day:** `day = today − floor((day_cutoff × 1000 − 1 − revlog_id) / 86_400_000)`.
- **Clock moved forward** (e.g., the system clock changes): treated like an away period. Card intervals cannot change without answers, so this cannot speed mastery-readiness; it only advances day-based countdowns, which is accepted for a single-player game.

## 38.11 Randomness and determinism

- A 64-bit `rng_seed` is created at save creation. Every random decision draws from a **named stream** (`"hazard"`, `"misbehavior"`, `"draft:arcane"`, `"rift"`, `"events"`, `"applicants"`, `"visitors"`, `"escape"`, `"loot"`, …): `value = PCG/xorshift(seed, hash(stream), counter++)`. Counters are persisted.
- Consequences: reopening the window or restarting Anki never rerolls anything; the Rift roll is fixed at launch; bug reports can include the seed and counters to reproduce behaviour.
- Tests can inject a fixed seed.

## 38.12 Per-review and per-bell processing order

**Every honest review** (in `apply_honest_review`):

1. Mana: `+mana_per_review × (1 + capped multiplier)`; pay off `mana_debt` first.
2. `review_index += 1`; `day_log[today].honest_reviews += 1`; `bank_at_last_review = mana`.
3. Progress +1 (with each item's own multiplier) to: the active training session; active research; each active construction slot; each taming; each egg; each healing; each brewing station; each scroll craft; each active expedition. Completions are queued as notices.
4. Expire `active_effects` whose `until_index` ≤ `review_index`.
5. If `review_index` crosses a multiple of 10 → **ring a bell**.

**Each bell:**

1. Gather modifiers (`modifiers.py`) once for the bell.
2. Needs update for every character (Section 14.4).
3. Production: plots, greenhouses, lessons (essence + rare chance), scholars, Glassworks, Weaving Room, creatures with production buffs; apply storage caps.
4. If `bell_index % 5 == 0`: mealtime — characters, then creatures.
5. Cleanliness: dirt, then cleaning (builders, Mopslime, brooms).
6. Hazard roll (and breach roll if Thin/Torn).
7. Misbehavior rolls.
8. Creature escape rolls; Loose creature auto-return checks; bond progress.
9. Morale recompute.
10. Achievement checks; push a UI delta if the window is open.

Target: one bell ≤ 30 ms for 60 rooms, 40 characters, 40 creatures.

## 38.13 Anti-exploit rules (summary)

| Exploit | Rule |
|---|---|
| Counting old history | Only `revlog.id > install_ms` (H1); install time recorded once per profile and never reset by reinstalling (stored in the save; if the save is deleted, the new install time is "now") |
| Mashing buttons | `revlog.time ≥ min_answer_ms` (H5) |
| Looping one card | Per-card per-day cap (H6) |
| Manual reschedule / "set due date" to fake maturity | Honest interval = min(current ivl, last answered ivl) (Section 9.2) |
| Suspending hard cards | Suspended cards stay linked at their interval; released after 30 days and replaced with a young card |
| Deleting young cards | Missing slots count as 0 until refilled with another young card |
| Forget/reset | Interval 0, honest |
| Undo after counting | Reversal via ledger; spent mana becomes debt |
| Double counting (hook + sync scan) | Ledger primary key on `revlog_id` |
| Rerolling randomness by restarting | Persisted RNG stream counters; Rift roll fixed at launch |
| Switching profiles | Saves and revlogs are per profile |
| Editing `config.json` to inflate mana | `mana_per_review` is bounded 1–20 and changes apply only to future reviews; a changed value shows a "custom economy" badge in the Headmaster panel |
| Importing another collection's recent revlog | Accepted residual risk; H1–H7 still apply |

## 38.14 `config.json` (global preferences)

Anki stores this per add-on (shared across profiles). Game state that belongs to a save (mode, term) lives in the save, not here.

```json
{
  "mana_per_review": 10,
  "min_answer_ms": 800,
  "max_counted_answers_per_card_per_day": 6,
  "count_reviews_from_other_devices": true,
  "cards_per_student": 50,
  "retirement_age_days": 90,
  "deck_scope": "all",
  "link_new_cards": false,
  "avoid_siblings": true,
  "honest_intervals_only": true,
  "suspended_release_days": 30,
  "veil_payment": "auto",
  "toast_mode": "every_bell",
  "show_toolbar_link": true,
  "dock_panel": false,
  "shortcut": "Ctrl+Shift+M",
  "reduce_motion": false,
  "sound": false,
  "text_scale": 1.0,
  "debug_logging": false
}
```

| Key | Allowed values | Notes |
|---|---|---|
| `mana_per_review` | 1–20 | Economy is balanced for 10 |
| `min_answer_ms` | 0–3000 | 0 disables H5 |
| `max_counted_answers_per_card_per_day` | 1–20 | |
| `cards_per_student` | 10–200 | BR-12 setting, default 50; applies to **all** students, existing and new (resize rule in Section 9.4) |
| `retirement_age_days` | 31–365 | BR-21 setting; must exceed 30 |
| `deck_scope` | `"all"` or list of deck ids | |
| `link_new_cards` | bool | Off by default |
| `veil_payment` | `"auto"` / `"ask"` | |
| `toast_mode` | `"every_review"`, `"every_bell"`, `"events_only"`, `"off"` | |

Fixed constants (not configurable, in `core/constants.py`, because they are binding): reviews per level `25 × n`; max level 10; teaching at level 5; buff percentages; mastery threshold 30 days; teacher delay formula; 20 teaching/career cards; away floor 10%; 3 masters to open the Rift; team size 1–3.

## 38.15 Content files

All game content is data. `core/content.py` loads every file at startup, validates it against a schema (required keys, referenced ids exist, numbers in range) and refuses to start the game (with a clear in-game message, never affecting reviewing) if validation fails.

| File | Contents |
|---|---|
| `economy.json` | Mana per review default, caps (Section 33.6), Veil formula constants, draft price constants, meal interval, bell size, starting kit |
| `wizard.json` | Level unlock table, total-level unlocks, Study levels, passive abilities |
| `rooms.json` | All 56 rooms (Section 16) |
| `furniture.json` | All furniture (Section 17) |
| `crops.json` | Greenhouse crops (Section 21.3) |
| `creatures.json` | Bestiary (Section 22.7) plus habitat definitions |
| `materials.json` | Materials and essences with caps and display info |
| `potions.json` | Recipes and effects (Section 24.4) |
| `scrolls.json`, `artifacts.json` | Sections 25.4–25.5 |
| `hazards.json`, `misbehavior.json` | Sections 19.3–19.4, 20.3 |
| `traits.json`, `personalities.json`, `names.json` | Section 14 |
| `events.json` | Section 28 |
| `spells.json` | Section 29 |
| `spellbooks.json`, `alumni.json`, `achievements.json` | Sections 31–32 |
| `draft_decks.json` | Section 26 |
| `research.json` | Arcane research projects (Veil Theory ranks: requirements, costs, review times) |
| `rift.json` | Destinations with tier, skill needed, safe/best odds, return reviews, costs; modifiers; "when it goes wrong" table; loot pools; Fortune; egg hatch times (Section 27.13) |
| `tutorial.json`, `strings_en.json` | Tutorial steps and all UI strings (localizable) |

**Effect vocabulary.** Effects are expressed with a small set of typed operations so the engine stays generic:

```json
{"op": "pct", "target": "food_output", "value": 0.05, "scope": "academy"}
{"op": "pct", "target": "room_efficiency", "value": 0.10, "scope": "room", "room_types": ["greenhouse"]}
{"op": "flat", "target": "composure_target", "value": 5, "scope": "room_occupants"}
{"op": "produce", "resource": "herbs", "per_bell": 0.1}
{"op": "chance_mult", "target": "hazard", "value": -0.08}
{"op": "fortune", "value": 1, "condition": {"destination": "crystal_caverns"}}
{"op": "special", "id": "cleans_room", "value": 1}
```

`modifiers.py` aggregates all active effects into category totals, applies the global caps, and records a human-readable source list for tooltips.

**Example entries**

```json
// rooms.json
{
  "id": "greenhouse", "name": "Greenhouse", "category": "nature", "area": "castle",
  "size": [2, 1], "needs_sky": true, "floor_rule": null,
  "unlock": {"type": "standard", "school": "nature", "level": 2},
  "cost": {"mana": 450, "timber": 30, "glass": 25}, "build_reviews": 60, "veil": 5,
  "capacity": {"crop_beds": 2, "per_level": 1}, "workplace": {"career": "gardener", "slots": 1},
  "required": [{"role": "planter_bed", "count": 2}], "optional_slots": 3,
  "stats": {"primary": ["aura", "comfort"], "secondary": "charm"},
  "outputs": [{"per_crop_bed": true}],
  "level3_perk": "mixed_planting"
}
```

```json
// furniture.json
{
  "id": "ward_lantern", "name": "Ward Lantern", "rooms": "any", "role": "optional", "slots": 1,
  "cost": {"mana": 160, "glass": 5, "umbra": 5},
  "stats": {"order": 2},
  "effects": [{"op": "chance_mult", "target": "hazard", "value": -0.30, "scope": "room"},
              {"op": "chance_mult", "target": "hazard", "value": -0.10, "scope": "adjacent"}],
  "unlock": {"type": "draft", "deck": "shadow", "rarity": "common"}
}
```

```json
// creatures.json
{
  "id": "mopslime", "name": "Mopslime", "school": "alchemy", "rarity": "common",
  "habitat": ["tide"], "taming": 40, "diet": {"provisions": 1},
  "sources": ["visitor", "lure:alchemy"],
  "buff": [{"op": "special", "id": "academy_clean_per_bell", "value": 3}],
  "trouble": {"id": "hide_resource", "resource": "provisions", "amount": 5},
  "companion_bonus": 3
}
```

The complete `rift.json` is given in Section 27.13.

## 38.16 Web UI bridge protocol

- **JS → Python:** `pycmd("ankicaster:" + JSON.stringify({id: 17, cmd: "build.place", args: {...}}))`. Register with `web.set_bridge_command(handler, context)`.
- **Python → JS (reply):** `web.eval("AC.reply(17, " + json + ")")` with `{"ok": true, "delta": {...}}` or `{"ok": false, "error": "not_enough_mana", "message": "You need 40 more mana."}`.
- **Python → JS (push):** `web.eval("AC.push(" + json + ")")` after bells, ticks and notices while the window is open (throttled to ≤ 4 per second).

| Command | Args | Effect |
|---|---|---|
| `state.get` | — | Full snapshot |
| `wizard.queue` / `wizard.pause` / `wizard.resume` / `wizard.cancel` / `wizard.reorder` | session data | Training management |
| `build.validate` | type, x, y, area | Returns rule violations, adjacency preview, Veil delta (no state change) |
| `build.place` / `build.cancel` / `build.pause` / `build.reorder` | … | Construction |
| `room.level` / `room.renovate` / `room.demolish` / `room.set_crop` / `room.toggle` | room id … | Room actions |
| `furniture.buy` / `furniture.place` / `furniture.move` / `furniture.remove` / `furniture.sell` / `furniture.repair` | … | Furniture |
| `recruit.enroll` / `recruit.reroll` | applicant id / school | Enrollment (re-validates the tracker server-side) |
| `character.assign_career` / `character.sabbatical` / `character.enroll_second` / `character.swap_card` / `character.move` / `character.rename` / `character.card_preview` | … | Roster actions |
| `draft.draw` / `draft.keep` / `draft.reroll` / `hand.play` / `hand.discard` | … | Draft |
| `alchemy.brew` / `potion.use` / `scroll.craft` / `recipe.research` | … | Crafting |
| `creature.assign_tamer` / `creature.release` / `creature.recapture` / `creature.rename` | … | Menagerie |
| `rift.plan` | destination, team, companion, supplies | Returns the chance and modifier breakdown (no state change) |
| `rift.launch` | same | Launches; fixes the hidden roll |
| `event.choose` | event id, option | Resolves an event |
| `spell.cast` | spell id, target | Casts |
| `veil.reinforce` / `veil.pay_now` | — | Veil actions |
| `research.start` / `research.cancel` | research id, researcher | Arcane research such as Veil Theory (Section 18.2) |
| `egg.place` / `golem.awaken` | egg id, habitat room / workshop id | Eggs and golem cores (Section 27.10) |
| `term.commence` / `term.start` | … | Modes |
| `settings.update` | key, value | Updates config or save settings |

Every mutating command runs inside one SQLite transaction; on any exception the transaction is rolled back and the error is returned to the UI.

## 38.17 Performance budgets

| Operation | Budget |
|---|---|
| Review hook (main thread) | ≤ 1 ms (append to queue) |
| `process_pending` per review | ≤ 5 ms |
| Bell | ≤ 30 ms (deferred, never inside the hook) |
| Day tick | ≤ 300 ms total, with collection reads in `QueryOp` |
| Window open to first paint | ≤ 500 ms |
| Save size after a year | ≤ 20 MB (ledger rows are compact; prune `notices` older than 60 days; archive ledger rows older than 400 days into `day_log` aggregates) |

## 38.18 Errors, logging, backups and migrations

- Every hook handler and bridge command is wrapped: exceptions are logged to `user_files/<profile>/logs/ankicaster.log` (rotating, 1 MB × 3) and surfaced only inside the game window as "Something went wrong in Ankicaster — your reviews are safe." Never show a modal during review.
- **Backups:** on the first profile open each day, copy the save to `backups/ankicaster-YYYYMMDD.sqlite`; keep the latest 7. Settings → Data offers export (JSON) and restore.
- **Migrations:** `meta.schema_version`; on open, apply `storage/migrations/NNN_*.sql` in order inside a transaction, after making a backup.
- **Content versioning:** saves store content ids, not content values, so retuning numbers takes effect immediately; removing an id requires a migration that maps it.

## 38.19 Profiles and sync

- One save per Anki profile, keyed by `mw.pm.name`. Renaming a profile: the add-on looks for the previous folder via a `profile_id` stored in the profile's own meta (fallback: ask the user to pick the folder).
- **The save is not synced by AnkiWeb.** Mana from mobile reviews still arrives on desktop via the revlog catch-up scan after sync (if enabled). Document: "Your Academy lives on this computer. Export your save to move it."
- Two desktop computers syncing the same collection would each run their own Academy; the catch-up scan would count each review on both. This is acceptable (each Academy is honest about the shared revlog) and documented.

## 38.20 Packaging

```json
// manifest.json
{
  "package": "ankicaster",
  "name": "Ankicaster",
  "mod": 0,
  "min_point_version": 66,
  "human_version": "1.0.0",
  "homepage": ""
}
```

Build a `.ankiaddon` by zipping the add-on folder contents (not the folder itself), excluding `user_files/`, `tests/` and `__pycache__/`.

# 39. Build Milestones and Acceptance Criteria

Each milestone must be playable, must keep all guardrail tests green (Section 40.1), and must meet its acceptance criteria before the next begins.

| # | Milestone | Scope | Acceptance criteria |
|---|---|---|---|
| **M0** | Skeleton | Add-on loads; Tools menu opens an empty AnkiWebView window; save DB created per profile; logging; content loader with validation | Installs on Anki 2.1.66 and the latest release without errors; opening/closing the window 20× leaks nothing; `test_readonly_guard` passes |
| **M1** | Honest mana | Ledger with H1–H7; live hook + deferred revlog check; undo reconciliation; catch-up scan; toast; top-bar mana link | (a) Pre-install revlog grants 0. (b) Again/Hard/Good/Easy each grant exactly 10. (c) Undo removes the mana. (d) A 300 ms answer grants 0. (e) The 7th answer to one card in a day grants 0. (f) Reviews synced from another device are counted once. (g) No collection writes: a scripted 200-review session produces identical dumps of the `cards`, `notes`, `revlog`, `decks` and `config` tables with the add-on enabled and disabled |
| **M2** | Wizard | Creation; Study; orb sessions with queue/pause; 25×n; buffs 6–10; level unlock table | Level n completes after exactly 25×n honest reviews; total to L10 = 1,375; buffs read correctly in the modifier breakdown |
| **M3** | Building | Grid, placement rules P1–P7, reachability BFS, construction slots, standard plans for MVP rooms, required furniture, efficiency formula, demolish | All placement rules have unit tests; an Unreachable room shows the badge and runs at 0%; construction completes after its review count |
| **M4** | Students | Linking algorithm; enrollment tracker; applicants; beds/seats; constellation UI; skill; mastery-ready; teacher delay (wizard); master title; link maintenance (missing/suspended/new) | Linking picks the youngest free young cards and never shares a card (DB constraint + test); tracker blocks enrollment below 50; skill equals the formula from `cards.ivl`; a forced lapse lowers skill; mastery requires all >30 and the delay |
| **M5** | Days, Veil, breaks | Day tick; Veil upkeep, strength, bands; away floor; arrival summary; Welcome Back | Simulated 40-day break matches the Section 18.5 example exactly; nothing in the save other than bank, Veil ledger and day log changes during a break |
| **MVP** | First playable | M0–M5 + Dormitory, Refectory, classrooms, Faculty Quarters, Storage, Woodlot, Quarry, Vegetable Patch; basic needs and meals | A tester can play a week; the "workable and fun" definition in Section 1.5 is met for days 1–7 |
| **M6** | Living Academy | Full needs, morale, food chain, greenhouse and crops, cleanliness, adjacency rules, Common Room, Kitchen, Bathhouse | Food balance (Sections 21.4–21.6 and 33.4) holds in the simulator: a 10-student Academy with two Vegetable Patches and one Kitchen never enters shortage at 150 reviews/day; morale responds to services as specified |
| **M7** | Careers | Careers, proficiency, faculty limit, teacher delay from teaching cards, career switching rules, sabbatical | Faculty limit equals min(A,B,C,D) in all tests; switching blocked for single-school masters; old career cards kept |
| **M8** | Furniture | Full furniture catalog, quality score and tiers, slots, damage/repair, patterns | Q and tier match hand calculations for 10 sample rooms |
| **M9** | Draft | Decks, prices, rarity weights, pity, guaranteed offers, hand, Known Plans | Price follows ×1.15^k with 7-day window; pity triggers on the 11th draw |
| **M10** | Creatures | Habitats, visitors, lures, taming, food, bond, escapes, recapture | Escaped creatures always return; hidden resources are returned |
| **M11** | Trouble | Hazards, breaches, wards, misbehavior, detention, injuries, Infirmary, healers, warders | No hazard or incident deletes anything (property test over 10,000 random bells) |
| **M12** | Alchemy | Lab, recipes, discovery, research, potions, scrolls | All 18 recipes brew; no potion grants mana |
| **M13** | The Rift | Opening at 3 masters, Gate, Yard, adventurers, party skill from adventurer career cards, planner with chance meter, resolution, "when it goes wrong" table, loot pools, eggs and golem cores, Fortune, companions | For every destination, chance equals Section 27.5 (safe odds, 5-day steps, team, elixir, Thin Veil, best-odds cap, 5% floor) in table tests; outcome fixed at launch; 100,000 simulated resolutions match the Draft 8 percentages within ±0.5%; Fortune never changes the chance; no character is ever removed |
| **M14** | Life and meta | Events, spells, achievements, Renown, alumni, spellbooks, Timed Term and Endless, term reset | Reset carries wizard levels, alumni bonuses and spellbooks and resets characters and creatures (and releases all card links) |
| **M15** | Polish | Art pass, animations, accessibility, Codex, tutorial, settings, performance budgets | Meets Section 38.17 budgets; tutorial completable; Reduce motion works |

# 40. Testing Plan

## 40.1 Guardrail tests (must always pass; run in CI on every change)

| Test | What it proves |
|---|---|
| `test_readonly_source_scan` | Greps the whole add-on source (excluding `tests/`) for every forbidden API in Section 38.4 (`col.db.execute`, `update_card`, `update_note`, `sched.answer`, `set_due_date`, `suspend`, `bury`, `forget`, `reschedule`, `add_note`, `remove_notes`, `col.set_config`, `mw.col.decks.save`, …) and fails on any hit outside `adapters/readonly.py` |
| `test_readonly_guard` | `ReadOnlyCollection` rejects any SQL that is not a single `SELECT` (including `WITH … DELETE`, `PRAGMA`, `;`-chained statements and `ATTACH`) |
| `test_collection_unchanged` | Scripted review session in a test profile; table dumps identical with the add-on on and off |
| `test_no_backfill` | A collection with 10,000 pre-install revlog rows grants 0 mana on install and after a catch-up scan |
| `test_equal_buttons` | Ease 1, 2, 3 and 4 each grant exactly `mana_per_review` |
| `test_no_count_rewards` | Static check: no content file has an effect keyed on review counts per day, streaks, speed or cards added; no achievement condition references `honest_review_count` |
| `test_breaks_delete_nothing` | Snapshot the save; simulate breaks of 1, 7, 40, 365 and 2,000 days; assert every row in `characters`, `card_links`, `rooms`, `furniture`, `creatures`, `wizard_levels`, `spellbooks`, `alumni_bonuses` still exists and only `wallet`, Veil, `day_log`, `notices` and applicants changed |
| `test_cards_never_shared` | Property test: 1,000 random enroll / career / retire / release sequences never produce a duplicate `anki_card_id` (also enforced by the primary key) |
| `test_no_deaths` | Property test over 10,000 random bells and 1,000 Rift resolutions: no character or creature row is deleted or set to a terminal state |
| `test_hook_budget` | The review hook returns in ≤ 1 ms (median) and process_pending ≤ 5 ms on the reference save |

## 40.2 Unit tests (core, no Anki needed)

Core modules take plain data, so they run under `pytest` without Anki.

- **Mana:** each honesty check H1–H7 accept/reject; multiplier cap; debt repayment; undo reversal with and without spending.
- **Day mapping:** revlog id → Anki day around the cutoff (one millisecond before/after), across DST changes.
- **Wizard:** 25×n per level; cumulative 1,375; queue behaviour; pause keeps progress; cancel refund rules; each school's buff at levels 6–10.
- **Linking:** youngest-first order; honest interval rule; sibling avoidance and relaxation; not enough cards → None; deck scope with filtered decks (`odid`).
- **Skill & mastery:** skill formula; lapse lowers skill; mastery-ready only when every card > 30; teacher delay for 20 teaching cards at intervals 0, 15, 30 and mixed; ready_days pauses not resets; title permanent after a later lapse.
- **Careers:** faculty limit min(); switching blocked for 1-school masters; old cards kept; sabbatical.
- **Retirement:** triggers only when every card of the character (all sets) exceeds `retirement_age_days`.
- **Veil:** cost formula; reductions capped at 50%; band thresholds; the 40-day example of Section 18.5 reproduced exactly; floor at 10% of `bank_at_last_review`.
- **Hazards/misbehavior:** probability formulas and caps; every outcome reversible.
- **Construction:** placement rules P1–P7; BFS reachability; build slots; level-ups; demolition refunds.
- **Quality:** Q, tiers and efficiency for sample rooms.
- **Draft:** price ×1.15^k over a rolling 7 days, cap 2.5×; rarity weights; pity.
- **Rift:** party skill = mean honest interval of all members' adventurer career cards (uncapped); safe odds per destination; −10 per full 5 days below and +5 per full 5 days above; team −10/−25; Rift Elixir +10; Thin Veil −5; best-odds cap; 5% floor; Draft 8 "when it goes wrong" percentages; half rewards rounded up; roll fixed at launch; Fortune affects rewards only.
- **RNG:** named streams reproduce the same sequence after save/reload.

## 40.3 Integration tests (inside Anki)

Use a throwaway profile and a generated collection (500 notes, varied intervals, some suspended cards, a filtered deck).

1. Install, open the window, create the wizard, review 30 cards, check 300 mana and the toast.
2. Undo the last review: mana −10, session progress −1.
3. Sync a review from a second test client; check catch-up counts it once.
4. Enroll a student; delete one linked card in the browser; next day tick replaces it.
5. Suspend a linked card; after 31 simulated days it is released and replaced.
6. Close Anki mid-bell (kill the process); reopen; the save is intact (transactions) and no review is counted twice.
7. Switch profiles; each has its own Academy.
8. Upgrade from the previous schema version with a real save; migrations run and a backup is created.

## 40.4 Simulation harness (`tests/sim/simulate.py`)

A headless simulator that drives the core with synthetic review streams. It is the main balancing tool.

- **Inputs:** reviews per day (constant, or a distribution such as 60–250), new cards per day, a card-maturation model (interval growth ×2.5 on pass, reset on lapse at a configurable lapse rate), break schedules, and a **policy** (a simple greedy bot that trains the cheapest useful level, builds rooms from a priority list, enrolls when possible, assigns careers, launches the safest Rift tier).
- **Outputs (CSV + summary):** day of each milestone in Section 34; mana income vs spending by category per week; idle mana (unspent bank) over time; Veil strength; food balance; number of hazards and incidents per week; Rift outcomes.
- **Balance checks** (fail the run if violated):
  - First master between day 40 and day 75 at 150 reviews/day (Section 34.2).
  - Rift open between day 48 and day 90 at 150 reviews/day.
  - After the tutorial, the bank never stays above 5,000 mana for more than 7 days with nothing to buy (the user should always have a goal).
  - Veil upkeep stays between 10% and 35% of daily income for a policy that builds steadily.
  - A 30-day break followed by return never leaves the Veil below Thinning on the day of return for a user who had at least 10 days of upkeep banked.
  - 100 vs 200 reviews/day: the 200 user reaches milestones sooner, but **no reward grows faster than linearly** with reviews (no escalation).

## 40.5 Manual QA checklist

- Toast does not steal focus or block the answer buttons; it is click-through.
- Every number with a modifier has a working source tooltip.
- Reduce motion stops all looping animation; text scale 1.5 keeps every screen usable at 1280×720.
- Keyboard navigation reaches every button; focus is visible.
- Light and dark Anki themes both render the window legibly.
- No string implies the user studied "too little", "too slowly" or should add cards.

# 41. Appendix A — Formula Reference

One place for every formula, so the builder can implement `core/formulas.py` from this page. All numbers are starting values to tune (Section 33) unless the formula is binding (marked **BR**).

| # | Quantity | Formula | Section |
|---|---|---|---|
| F1 | Mana per honest review | `mana_per_review × (1 + min(0.25, arcane_buff + other_mana_mults))`; Arcane buff = 0.02 × max(0, L_arcane − 5) (**BR-09**) | 5, 7 |
| F2 | Revlog id → Anki day | `today − floor((day_cutoff_ms − 1 − revlog_id) / 86_400_000)` | 38.10 |
| F3 | Reviews for wizard level n | `25 × n` (**BR-07**); cumulative to L10 = 1,375 | 7 |
| F4 | Orb cost for level n | `80 × n` mana | 7 |
| F5 | Buff steps in a school | `max(0, L − 5)` (0–5); per-step values per **BR-09** | 7 |
| F6 | Honest interval | `max(0, min(cards.ivl, ivl of last type 0–3 revlog))` | 9.2 |
| F7 | Skill | `100 × mean over linked cards of min(honest_ivl, 30) / 30` | 10 |
| F8 | Mastery-ready | every linked study card has honest_ivl > 30 (**BR-15**) | 10 |
| F9 | Teacher delay (teacher) | `max(0, 30 − mean(honest_ivl of the teacher's 20 teaching cards))`; 0 once all 20 are over 30 days, × (1 − 0.03 × Light steps), rounded up (**BR-16**) | 10 |
| F10 | Teacher delay (wizard stand-in) | `20 − 2 × (L_school − 5)`, × Light factor, rounded up; unstaffed classroom 30 | 7, 10 |
| F11 | Career proficiency | `0.75 + 0.5 × career_skill / 100` | 11.3 |
| F12 | Faculty limit | `min(1 + floor(total_levels/4), faculty_beds, 1 + 2 × classrooms, 1 + floor(students/3))` (**BR-22** inputs) | 11.6 |
| F13 | Retirement | every card of the character in every set has honest_ivl > `retirement_age_days` (default 90) (**BR-21**) | 13 |
| F14 | Alumni bonus scaling | `bonus × clamp(retirement_age_days / 90, 0.67, 2.0)` | 13 |
| F15 | Need update per bell | `need += (target − need) × 0.25 − decay × multipliers`, clamp 0–100; decay Hunger 4, Rest 3, Leisure 3, Composure 1 | 14.4 |
| F16 | Morale | `0.25 Hu + 0.25 Re + 0.20 Le + 0.20 Co + 0.10 He + bonuses`, clamp 0–100 | 14 |
| F17 | Morale factor | `0.6 + 0.6 × morale / 100` (0.6–1.2) | 8, 14 |
| F18 | Essence per bell (classroom) | `0.20 × efficiency × morale_factor × (1 + teaching_buff)` per student | 8 |
| F19 | Room quality | `Q = Σ primary-stat points + 0.5 × Σ secondary-stat points`; tiers Bare <10, Plain 10+, Cozy 25+, Fine 45+, Splendid 70+ | 15 |
| F20 | Quality factor | `1 + min(Q, 80) / 160` (1.0–1.5) | 15 |
| F21 | Room efficiency | `level × quality × (0.7 + 0.3 × cleanliness/100) × staff (1.0 or 0.5) × adjacency (clamp 0.8–1.3)`; 0 if Unreachable | 15 |
| F22 | Build time | `build_reviews × (1 − 0.03 × Alchemy steps)`; materials × the same factor (**BR-09**) | 15 |
| F23 | Veil daily cost | `(40 + 3 × size_points) × (1 − min(0.50, reductions))`; reductions from Shadow levels (−3%/step), warders (−3% each, max 3), creatures, Veil Theory research (−3%/rank) and draft cards (**BR-24**, **BR-09**) | 18 |
| F24 | Veil strength | paid day +5; unpaid day `−20 × unpaid_fraction`; Reinforce +15; clamp 0–100; bands Strong 80–100, Thinning 50–79, Thin 20–49, Torn 0–19; warders +5 and Standing Stones +2 per active day | 18 |
| F25 | Away payment | each away day pay `clamp(bank − 0.10 × bank_at_last_review, 0, cost)`; stop at the floor; strength never changes on an away day (**BR-26**) | 18.5 |
| F26 | Hazard chance per bell | `min(0.75, 0.02 × band_mult × (1 + size_points/200) × (1 − hazard_reduction))`; band_mult 1 / 1.5 / 2.5 / 4 | 19 |
| F27 | Misbehavior chance per student per bell | `0.004 × personality × traits × morale_mult × (1 − reduction) × room_order_factor` | 20 |
| F28 | Taming progress per review | `1.0 × tamer_proficiency × (1 + nature_buff) × modifiers` | 22 |
| F29 | Healing per review | `1.0 × place_factor × healer_factor × (1 + light_buff) × modifiers` | 23 |
| F30 | Potion yield | `2 × (1 + 0.03 × Alchemy steps + creature and item bonuses)`; fractions accumulate per recipe; an alchemist adds +1 potion every 4 brews | 24 |
| F31 | Draft price | `min(2.5, 1.15^k) × base`, k = draws from the deck in the last 7 days; Known Plan 1.5 × plan price | 26 |
| F32 | Rift party skill | mean honest_ivl (uncapped, days) over all adventurer career cards of the team members (**BR-31**) | 27.4 |
| F33 | Rift safe-return chance | `max(5, min(best, safe + skill_mod + team_mod + elixir + veil_mod))`; skill_mod = −10 per full 5 days below needed, +5 per full 5 days above; team −10 (two) / −25 (alone); Rift Elixir +10; Thin or Torn Veil −5 (**BR-32**) | 27.5 |
| F34 | Rift outcome | roll 1–100 at launch: ≤ chance → safe return (full rewards); else second roll on the Easy–Medium (60/25/10/5) or Hard–Deadly (40/30/20/10) table: minor injury (full) / serious injury (half) / curse (half) / retreat (none) (**BR-33**) | 27.6 |
| F35 | Rift Fortune | each point +10% to reward quantities, max 5 points; never changes the chance | 27.9 |
| F36 | Timed-term reset | bank → 0; buildings and materials → starting layout and stock; all characters and creatures removed and their card links released; wizard levels, alumni bonuses and spellbooks kept (**BR-30**, **BR-34**) | 30.4 |
| F37 | Egg hatching | 20 / 40 / 60 / 80 / 100 honest reviews (Common → Legendary) in a matching habitat | 27.10 |
# 42. Appendix B — Design Decisions Made in This GDD

The approved concept (Draft 8) fixed the rules listed in Section 2 (BR-01 to BR-35, checked against the Draft 8 page). Everything below was decided while writing this document, to fill gaps. Each item can be changed without breaking a binding rule. The owner should review this list.

## 42.1 Time, mana and honesty

1. **Bells.** One bell = 10 honest reviews. Needs, production, meals (every 5 bells), dirt, hazards, misbehavior and escapes all run on bells, so the Academy "lives" only while the user studies and sleeps while they are away.
2. **10 mana per review**, with every mana multiplier combined capped at +25%.
3. **Honesty checks H1–H7** beyond the binding ones: answers faster than 800 ms earn nothing; at most 6 counted answers per card per Anki day; reviews from other devices are counted through a catch-up revlog scan after sync (on by default, can be turned off).
4. **Undo** reverses a review's mana and progress; if the mana was already spent it becomes a debt paid from future reviews. Things a review completed stay completed.
5. **Honest interval** = the smaller of the card's current interval and the interval recorded at its last real answer, so "set due date" or manual rescheduling cannot fake maturity.
6. **Five school essences** (Insight, Herbs, Radiance, Umbra, Reagents) are produced by students' lessons and spent on school-flavoured items, so mana stays the one neutral currency.
7. **Renown** is a separate prestige stat from rooms, masters, achievements and alumni. It never affects mana.

## 42.2 Wizard

8. **Orb vs grimoire:** pondering an orb raises a school level; studying a grimoire teaches one of 25 wizard spells. One active session, plus a queue of 1, 2 or 4 by Study level; pausing keeps progress; cancelling refunds only if no progress was made.
9. **Orb cost** 80 × n mana for level n.
10. **The wizard can teach one classroom** per teachable school; teacher delay for the wizard = 20 − 2 × (level − 5) days; an unstaffed classroom's delay is 30 days.

## 42.3 Students, mastery and careers

11. **New (never-studied) cards are not linked** by default; "young" means an honest interval of 30 days or less; siblings are avoided when possible.
12. **Link maintenance:** deleted cards are replaced at the next day tick; cards suspended, or reset to new, for more than 30 days are released and replaced; if more than 25% of links vanish at once, the game stops and asks before changing anything.
13. **Career card sets** take the 20 youngest free *young* cards first (BR-18), and fall back to the youngest free older cards only when there are not 20 free young cards. The career screen shows the split.
14. **Skill** = average of min(interval, 30)/30 over linked cards, shown as 0–100.
15. **Mastery countdown pauses** (does not reset) when a lapse makes a student not ready.
16. **Faculty limit** = the smallest of: 1 + total wizard levels ÷ 4; faculty beds; 1 + 2 × classrooms; 1 + students ÷ 3.
17. **Career proficiency** 0.75–1.25 from career-card skill.
18. **Sabbatical** lets a faculty member pause a career and resume the same one later (keeping its cards).
19. **Enrollment fee** of 60 mana, plus a bed and a classroom seat; the applicant board shows 3 applicants per school, rerolled for 100 mana.
20. **Titles** go up to Paragon (masters of all five schools, +1 Rift Fortune), and a resident master can tutor (a small bonus to classmates).
21. **Alumni bonus size** scales with the retirement age setting (×0.67–×2.0) so a shorter retirement age is not a shortcut; alumni visit occasionally (3% per day).
22. **Eight personalities, about 34 traits, five needs** (Hunger, Rest, Leisure, Composure, Health). Needs never tick while away; there is no starvation, and shortages only lower morale.
23. **Changing cards per student** resizes every existing student's set at the next day tick (it applies to all students, BR-12). Growing sets take the youngest free young cards; shrinking sets release their most recently linked cards. Titles already earned are kept.

## 42.4 School, rooms and furniture

24. **Grid model:** castle starts 8×5 cells and expands to 14×11; grounds start at 6 plots and expand to 18; floors connect only by stairs; rooms must be reachable from the Entrance Hall.
25. **Room levels 1–3**, by a duplicate blueprint or renovation.
26. **Five room stats** (Comfort, Focus, Order, Aura, Charm), quality tiers Bare → Splendid, efficiency from level, quality, cleanliness, staff and adjacency.
27. **56 room types**, **114 furniture entries (123 distinct pieces)**, 6 legendary Rift furniture pieces, outdoor decor.

## 42.5 Veil, trouble and creatures

28. **Veil formula:** daily cost (40 + 3 × size points) mana, reductions capped at 50%; strength 0–100 with four bands that multiply hazards; paid day +5, unpaid −20 × unpaid share. Auto-pay by default; "ask" is an option. Strength never changes on an away day, paid or not (BR-26).
29. **Veil reductions for Draft 8's five kinds:**
    - Warders: −3% each, up to 3.
    - Creatures: Umbral Wyrmling −5%, Velvet Bat Swarm −2%.
    - Arcane research: *Veil Theory* I–III at the Library, −3% per rank.
    - Draft cards: *Veil Thread* (−10% for 7 days) and *Warding Primer* (permanent −3%).
    - Shadow wizard levels follow BR-09.
30. **Hazards and breaches never delete anything:** they lock a room for some reviews, hide resources that are later found, damage furniture (repairable), or cause injuries. Consumables can lose at most 5%, and only during active play.
31. **Misbehavior** comes in 16 incidents, each with a silver lining, plus detention.
32. **Creatures:** 40 species in five rarities. Three were added to match Draft 8's Rift rewards: the Fen Sprite and Mistfeather Owl ("owls and sprites") and the Geode Golem (awakened from "golem cores"). taming takes 40/90/160/260/400 reviews by rarity; three Bond levels that never decrease; escaped creatures always come back.
33. **Injuries:** five types healed by reviews, faster with a healer; no disease and no permanent harm.

## 42.6 Crafting, draft and Rift

34. **18 fixed potion recipes** of three ingredients each, discovered by brewing or research, optionally shuffled per Timed Term; no potion grants mana.
35. **22 artifacts** that work only while displayed in the Trophy Hall; 4 scrolls. Artifact, rare-material, seed and legendary-furniture sources were re-mapped to the five Draft 8 destinations: minor artifacts come from the Ashen Wastes or the Shattered Spire, and major ones only from the Spire.
36. **Card draft:** 6 decks; 120 mana for the Foundation deck and 150 for school decks; price × 1.15 per draw in the last 7 days (cap × 2.5); a pity rule; draft cards are consumed when played; Known Plans can be rebought at 1.5×.
37. **Rift details inside the Draft 8 rules** (the destinations, odds, modifiers and outcome table themselves are binding, BR-31 to BR-33):
    - **Mana costs:** launch costs of 150 / 300 / 500 / 800 / 1,200 mana.
    - **Logistics:** supplies of 5–30 Provisions per member, loot rolls of 2–6 and supply slots of 1–3.
    - **Party skill:** the mean honest interval of all members' adventurer career cards, not capped at 30 days. Empty slots count as 0.
    - **Skill steps:** the "each 5 days" modifiers use whole 5-day steps.
    - **Thin Veil:** means the Thin or Torn band (strength below 50).
    - **Odds floor:** the chance never drops below 5%.
    - **Curse rewards:** a curse brings half rewards. Draft 8 does not say.
    - **Injury mapping:**
      - Minor injury: Bruised (Easy–Medium) or Sprained (Hard–Deadly).
      - Serious injury: Sprained at Mossy Hollow, Broken Bone elsewhere.
      - Curse: Hexed (Easy–Medium) or Rift-Touched (Hard–Deadly).
      - Retreat: no injury, a short morale dip.
    - **Half rewards:** half the loot rolls, rounded up.
    - **Access:** all five destinations are open as soon as the Gate is built. The old "unlock the next tier" rule was dropped.
    - **Destination flavour and loot pools:** "Rare herbs" are Herbs plus rare herb seeds. "Rare cards" are Rare, Epic or Legendary draft cards.
38. **Rift Fortune.**
    - **Purpose:** every pre-existing expedition bonus (companions, personalities, traits, Training Yard, Gate levels, Rift Map, artifacts, spellbooks, alumni, spells, events) was converted into Fortune. Fortune is +10% reward quantity per point, up to 5 points.
    - **Odds untouched:** only Draft 8's six modifiers change the odds. The Rift Elixir replaces the old Clarity Philter as the one odds item.
    - **Recovery effects:** severity-shifting effects (Courage Draught, Brave, Steadfast, Daredevil, Ember Phoenix) now change recovery time, because injury types come from the binding table.
39. **Eggs and golem cores:**
    - Eggs hatch after 20–100 reviews in a matching habitat and never spoil.
    - Three Golem Cores awaken a Geode Golem. Two are used in the Rift Gate level-3 renovation.
40. **The Rift roll is made at launch** and stored hidden, with the second "when it goes wrong" roll, so reopening the game cannot reroll either.

## 42.7 Modes, meta and interface

41. **Timed Term:** default length 120 days, exam timer off by default, charter goals for stars. Within the binding reset (BR-34: buildings, materials, unspent mana, students, faculty and creatures), Renown, Known Plans, patterns, the draft history and research ranks also reset. Achievements and the Alumni Gallery are kept as meta records. Masters at term end become alumni. The new term starts with **0 mana**. The earlier "Term Purse" was removed because Draft 8 resets unspent mana, and because a free purse would conflict with BR-01.
42. **Endless School** earns spellbooks at Renown milestones.
43. **21 spellbooks**, about 40 achievements (none tied to review counts), 30 random events, 25 spells and 7 passives.
44. **Interface:** a non-modal window from Tools ▸ Ankicaster, a mana link in the top toolbar, Ctrl+Shift+M, an optional dock panel, a click-through toast after each bell by default; sound off by default.
45. **Art:** a flat, hand-drawn storybook look built from SVG and CSS so no large art pipeline is needed.
46. **Technical:** SQLite save per profile in `user_files/`, seeded named random streams, 7 daily backups, and all content in JSON files.
