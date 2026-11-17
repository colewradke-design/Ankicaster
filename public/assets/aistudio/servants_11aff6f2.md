# Servants

The Builder career is removed. Menial work is done by servants the wizard summons. A servant is one worker. The player assigns them to a built workplace, and that workplace decides what they do.

There are no Builder saves to migrate. The career is simply gone from hiring, the faculty list, and the debug career list.

## What a servant is

A servant is not a student, not faculty, and not a bestiary creature. It has no pen, no diet, no bond, and it cannot escape, teach, brew, or go through the Rift. It does not eat, and it does not count toward the faculty limit.

Each servant has a name drawn from a short goblin list, a small look, and one assignment or none. A new servant starts idle. Nothing is assigned for the player.

## The queue panel

A Queue button sits beside Build. It opens a panel locked to the left edge, the same way Build mode does. The castle stays up. The panel has two lists.

**Build queue**, on top. Every construction site, in the order they will be worked. Up and down reorder them. A paused site stays in the list, keeps its progress, and is skipped until it is resumed. Shelved sites are not listed.

**Services queue**, on the bottom. The wizard's work: orb ponders, grimoire studies, and servant summons, in one list. Up and down reorder them. Only the top item advances. The wizard does not ponder and summon in the same review. Starting a summon, a ponder, or a grimoire study adds it to this list. If the list is empty, it starts immediately. If something is already running, the new one waits.

While the wizard is assigned to the Workshop and is actually on a construction site, the services queue does not advance. The wizard is on the scaffold with the servant animation until that site finishes or the wizard is taken off the Workshop. Then the top of the services queue resumes from the progress it already had.

## Summoning Chamber

Servants can be summoned only in a built, finished Summoning Chamber. The Workshop and the Wizard's Study cannot do it. Shelving the chamber or leaving it unfinished stops new summons. Servants already summoned stay.

The chamber is a standard plan. It is not an Alchemy room. The plan unlocks when any one school reaches level 5.

| | |
|---|---|
| Size | 2×1, castle |
| Cost | 400 mana, 30 timber, 25 stone, 10 reagents |
| Build | 50 reviews |
| Veil | 4 |
| Required | 1 Summoning Circle |
| Optional | 2 |

Its tiers follow how many schools are at level 5 or higher. Renovate pays the normal renovate price. The button stays locked until the school count is met.

| Level | Requires | Summoning |
|---|---|---|
| 1 | Any 1 school at level 5, and the chamber built | 500 mana for the first servant, plus 100 mana for each servant already owned. 30 reviews. |
| 2 | A 2nd school at level 5 | Mana is 20% less, rounded up. Reviews stay 30. |
| 3 | A 3rd school at level 5 | The level-2 mana cut remains. Reviews drop by 10, to 20. |

There is no cap on how many servants can exist.

Mana is paid when the summon reaches the top of the services queue and starts. Cancelling it before it starts costs nothing. Cancelling it after it has started returns the mana and leaves no servant. Progress is honest reviews, the same step that advances an orb session. Closing the panel does not cancel it.

The chamber window shows the ritual and the servant roster. Assigning them is done from the roster and from each workplace. The queue panel does not assign workers.

## Workplaces

One servant, one workplace. Assigning them somewhere else moves them. Clearing the assignment leaves them idle. A shelved or demolished workplace drops its servants back to idle.

The wizard may be assigned to the Workshop as well. That is the only job the wizard can take. While they are on a site they cannot run the services queue, and they play the same work animation as a servant.

### Workshop

The Workshop stays. It is no longer a faculty career. Servants assigned here are the construction crew. They walk to the first unpaused site in the build queue and work it. When it completes, they move to the next site in that order. They do not pick a site themselves.

Up to four bodies can be on sites at once: servants assigned to the Workshop, plus the wizard if the wizard is assigned there. A fifth waits at the Workshop until a site frees a body.

A servant and the wizard build at the same speed. Nothing about who is working changes the rate. Not Alchemy level, not a trait, and not furniture. The Workshop's tier sets the base. Potions and creatures add on top of that.

| Workshop level | Points per worker per honest review |
|---|---|
| 1 | 1 |
| 2 | 1.25 |
| 3 | 1.5 |

Bellows Toad adds 5% per copy. Geode Golem adds 10% per copy. Those stack on the workshop rate, with the same cap they have today. Quickmortar adds 20 progress to one site. The Quickening spell still adds 25 to the site at the front of the build queue. Quick Hands no longer affects construction. Its brewing bonus stays. Tool Wall no longer changes construction speed.

On the site, each worker plays a repeating work animation: a swing, a pause, a swing. The rate of the swing does not follow the review rate. Two workers on one site stand apart. They leave when the site completes.

### Grounds

A plot with no servant yields 25% of its bell output. A servant assigned to that plot brings it to full. Two servants cannot share a plot.

Plots: Vegetable Patch, Herb Garden, Woodlot, Quarry, Pond, Orchard, Apiary.

Gardeners stay on the Greenhouse. They no longer add their bonus to these plots. Rare greenhouse crops that already require an assigned gardener still do.

### Kitchen and Refectory

The Refectory serves meals exactly as it does today when nobody is assigned there. A servant assigned to it makes people eat twice as fast. Hunger recovers at double the current meal rate. The meal still costs the same food.

The Kitchen gives nothing unless a servant is assigned there. No hearty meal, no cheaper food, no adjacency bonus. Staffed, it gives the bonuses it gives today.

### Glassworks and Weaving Room

Unstaffed, each produces 25% of its bell output. A servant assigned there brings it to full. One servant each.

### Janitor's Closet

A new room in the Foundation deck. Servants assigned here are janitors.

| | |
|---|---|
| Size | 1×1, castle |
| Deck | Foundation |
| Cost | 200 mana, 20 timber |
| Build | 30 reviews |
| Veil | 2 |
| Required | 1 Broom Cupboard |
| Optional | 1 |

| Level | Janitors |
|---|---|
| 1 | 1 |
| 2 | 2 |
| 3 | 3 |

A janitor's job never finishes. Rooms get dirty, so the janitor walks to the dirtiest room that is not already being cleaned, and cleans it until that room is back to 100%. Then they pick the dirtiest room again. Two janitors never clean the same room. If every room is clean, they wait in the closet.

Each review a janitor spends in a room restores cleanliness there. They do not add a flat bonus to every room at once. The Mopslime still cleans on its own.

## What this does not change

Servants do not appear in the bestiary, do not hatch from eggs, and are not lured. Meals are not a new resource. The summon pays mana only. It does not spend reagents after the chamber itself has been built.
