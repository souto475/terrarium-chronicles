# Terrarium Chronicles

**[▶ Play it in your browser](https://souto475.github.io/terrarium-chronicles/)**

An artificial-life terrarium with a newspaper attached. Creatures with genes graze, compete,
breed with mutations and die. Over generations they drift apart into new species, and some of
them learn to eat the others. A chronicle watches the simulation and writes the history of the
world as headlines:

> **Year 7 · Predation.** Blood in the terrarium: Orxoto of the Zemur kills and eats Biorja of the Kiir. For the first time, one creature has fed on another.
> **Year 20 · New species.** A new species has taken hold: the Kato, who branched off from the Zemur in year 18, now number 19.
> **Year 31 · Predation.** A year of fear: 55% of all deaths last year came from predators.
> **Year 33 · Extinction.** The Ensu go extinct after 33 years. At their peak there were 708 of them.

The long-term goal is for creatures to form herds, then tribes with territory, conflict and
culture, with the chronicle turning all of it into a readable history.

## How this project is made

This is an experiment in letting an AI own a project.

- **Claude** (Anthropic's model, working through Claude Code) came up with the idea, chose the
  stack, designs the features and writes all of the code. Claude decides what gets built next.
- **[@souto475](https://github.com/souto475)** gives the project the tokens left over in their
  usage window, then plays with each version and reports bugs, annoyances and impressions.
  That feedback shapes the next session.

Development happens in short sessions whenever tokens are free. Each session is recorded in
[DEVLOG.md](DEVLOG.md): what changed, what was learned, and what to try next. The devlog is
also how Claude picks up where it left off, since each session starts with no memory of the last.

## Running it

Play the live version at **https://souto475.github.io/terrarium-chronicles/**, which updates
with every push to `main`. Or clone the repo and open `index.html`: no install, no build, no server.

- The number after `#` in the URL is the world seed: `index.html#42` always produces the same world.
- **Space** pause · **1–4** speed · **scroll** zoom · **drag** pan · **0** reset view ·
  **click** a creature to inspect it · **F** follow it · **Esc** deselect · **T** tree of life ·
  **P** performance monitor.
- Hover a species in the panel (or tap it on a phone) to read its story.

## What's in it so far

- A procedurally generated map with fertile and barren patches, and seasons. Each world gets its
  own climate, from mild to extreme; in harsh winters the vegetation stops growing.
- Creatures with seven genes, energy, age, a name and a family line.
- Competition for food, reproduction with mutation, starvation and old age.
- Predation that evolves on its own: a diet gene lets lineages drift from grazing toward meat.
  Hunters chase smaller creatures of other species, prey flee from anything that could eat them,
  and hunters wear a red ring on the map.
- Species detection: when a group drifts far enough from its species, it becomes a new one, with
  its own name and a record of its ancestor.
- The chronicle: population milestones, famines, generation records, evolutionary trends,
  new species, extinctions and obituaries.
- Species cards: hover a species to see its population curve, what makes it distinct, its
  ancestors and descendants and, for extinct ones, how it ended (hunger, old age, a rival
  that grew while it shrank, or a slow transformation into another species).
- A tree of life (**T**): every species as a stream along the timeline, as thick as its population,
  branching from its ancestor. Short-lived branches are hidden unless you ask for them.
- Panels: census, living species with their color spread (extinct ones folded away), a
  full-history chart, an evolution panel that plots how each average gene has moved since the
  founders, and an inspector for any creature.
- A performance monitor (**P**) that splits each slow frame into simulation, drawing, panels and
  time spent by the browser itself. It exists to track down the occasional stutter.

## Roadmap

1. ~~**Basic life**: genes, food, reproduction with mutation, death.~~ Done.
2. ~~**Species**: detect genetically distinct groups, name them, record splits and extinctions.~~ Done (first version).
3. ~~**Predation**: a diet gene, hunting, fleeing.~~ Done (first version). Moved ahead of social
   behavior: herding only makes evolutionary sense once there is something to herd against.
4. **Social behavior**: herding for safety, sharing food, defending kin. A first attempt (a
   sociability gene) was reverted: prey never evolved to herd and predators became rarer. See the
   devlog, session 4.
5. **Territory and conflict**: herds holding ground, fights between groups, migration.
6. **Culture**: traits passed on by imitation rather than genes (rituals, preferences, simple "technologies").
7. **World and history**: climate events, disasters, a map with place names, a timeline, one newspaper per era.

## Technical decisions

- **Vanilla JavaScript, no build step, no dependencies.** The project should open with a
  double-click forever, with nothing to install or update. Plain `<script>` tags instead of ES
  modules, because browsers block modules on `file://` pages.
- **Canvas 2D.** Up to a couple of thousand circles per frame is well within its reach. WebGL
  would add complexity without a visible gain at this scale.
- **The simulation doesn't touch the DOM.** `util`, `genes`, `creature`, `species`, `chronicle` and
  `world` run the same in the browser and in Node. That's how balance is tuned: run dozens of
  simulated decades headless in a few seconds and compare the numbers, rather than watching and guessing.
- **Seeded randomness.** Everything comes from one seeded generator (mulberry32), so a seed is a
  shareable, reproducible world. That's handy for bug reports: "seed 7, year 40, this happened".
- **Vegetation on a grid.** Food lives in 20 px cells instead of as individual plants. Regrowth is
  one pass over 4,000 numbers, drawing it is a single scaled-up image, and looking for food means
  scanning nearby cells.
- **A spatial grid for encounters.** Creatures are bucketed into 50 px cells every tick, so
  "who could I eat?" and "who could eat me?" only look at nearby cells.
- **A time budget per frame.** At high speeds the loop runs as many ticks as fit in ~8 ms and
  leaves the rest of the frame for drawing, so the animation stays smooth when the population
  explodes. The panel shows the actual speed reached.
- **Keeping the garbage collector quiet.** Dead creatures are compacted out of the list in place,
  color strings are cached, and names are generated only when someone looks at a creature.
- **Cheap drawing.** Creatures are grouped into 72 hue buckets and each bucket is one canvas path,
  so a frame makes a few dozen fill calls instead of thousands. The vegetation image is
  re-uploaded at most ten times a second, and the side panels use CSS containment so a text
  change in one doesn't relayout the page.

## Calibration decisions

The interesting part of a simulation like this is less the code than the numbers.

### Genes

| Gene | Range | What it does | What it costs |
|---|---|---|---|
| Size | 0.5–3 | Energy storage (50 × mass), bite size, lifespan (3 + 1.5 × size years), wins food disputes | Metabolism |
| Speed | 0.2–3 | Distance covered per tick | Movement cost grows with speed² × mass |
| Sight | 15–200 px | How far it can spot food | A small constant drain |
| Breeding threshold | 40–95% | How full it must be before having a child | Waiting longer means fewer, better-fed children |
| Mutation rate | 1–30% | How much children differ from parents | Evolves itself, so worlds can settle or turn chaotic |
| Meat in diet | 0–100% | Energy from kills, digested at diet^0.75 efficiency | Plants are digested at (1 − diet), so hunters starve on grass |
| Color | 0–360° | Nothing, it's neutral | Nothing. It drifts freely, so related creatures look alike |

Mass is size². A year is 400 ticks. A child gets 45% of the parent's energy; the parent keeps 50%,
and the 5% gap is the cost of birth.

### Metabolism

Cost per tick = `0.006` (fixed) + `0.01 × mass^0.75` + `0.00005 × sight`, plus `0.006 × mass × speed²` while moving.

- The **mass^0.75** exponent is Kleiber's law from real biology: bigger animals burn less energy
  per kilogram. Without it, being big was never worth it.
- The **fixed cost** of being alive keeps tiny creatures from being almost free to run.
- **Competition:** in each cell, a creature smaller than the biggest one present only gets
  (its mass / biggest mass)² of its bite, and creatures avoid patches held by much bigger ones.
- **Seasons** scale regrowth by `1 + climate × sin(year phase)`. Each world rolls a climate
  between 0.7 and 2.6; above 1, winter stops regrowth entirely for a while.

### A finding: small and fast always wins, until someone hunts

Before predation, every world headed to "small and fast" (size drifting to ~0.55). Four fixes
were tried: Kleiber scaling, a fixed living cost, food competition and harsh winters. None
reversed it. Food ends up spread thin, everyone grazes on the move, and whoever spends least
wins, which matches biology: without predators, small bodies and fast generations dominate.
Predation broke the pattern as predicted: prey can only be eaten by creatures ~20% larger, so
size became armor, and worlds now range from dwarf grazers to species of size 2.5.

### Predation

Nothing is scripted: founders are grazers (0–6% meat) and hunters have to evolve.

- A creature hunts if its diet is at least 20% meat and its energy is below 60%. Prey must be of
  another species and weigh at most 70% of the hunter (about 84% of its size).
- A strike succeeds with odds `0.2 + 0.5 × size edge + 0.4 × speed edge`, clamped to 5–85%, costs
  energy either way, and a miss sends the prey running. A kill yields (prey's energy + 30 × its
  mass) × diet^0.75.
- Creatures flee when anything of another species with 25%+ meat in its diet, big enough to eat
  them, comes within their sight (capped at 90 px).
- The first version digested meat at √diet, which made small steps toward meat pay off so well
  that omnivores with 10–20% meat were killing everything and one world fell to 103 creatures.
  With diet^0.75, a 20% hunting threshold and hunting only when hungry, predator species
  emerge in most worlds and can coexist with their prey for decades (world 7: about 1 hunter per
  8 grazers for 40+ years), while some worlds never evolve true hunters at all.
- Speed became the arms race: average speed often climbs from ~1 to ~2.6.

### What makes the news

A species split is recorded right away but only reported once the new species has lasted two
years with at least 15 members, or reached 40. Most branches die within a year or two; before
this rule, 18 of 24 extinctions in one world were of species nobody had heard of.

### Species

Genetic distance is measured over size, speed, sight, breeding threshold and diet, each normalized
to its range, plus hue with 60° weighing as much as a quarter of a trait's range. Twice a year,
creatures farther than **0.38** from their species' average are grouped; a group of at least
**15** becomes a new species. At 0.30, species multiplied into dozens of tiny groups. At 0.45,
new species almost never appeared. 0.38 gives around 5–7 living species over a 60-year run,
with regular splits and extinctions.

## Project structure

| File | Role |
|---|---|
| `js/util.js` | Config (`T.CFG`), seeded RNG, noise, name generator |
| `js/genes.js` | Gene definitions, genetic distance, mutation |
| `js/creature.js` | A creature: grazing, hunting, fleeing, metabolism, breeding, death |
| `js/species.js` | Species records and speciation |
| `js/world.js` | Vegetation grid, seasons, spatial grid, the `step()` loop, census |
| `js/chronicle.js` | Watches events and writes headlines |
| `js/render.js` | Canvas, camera, drawing |
| `js/ui.js` | Panels: chronicle, census, species and species cards, chart, evolution, inspector |
| `js/tree.js` | Tree of life (T) |
| `js/perf.js` | Performance monitor (P) |
| `tools/batch.js` | Headless multi-seed runner for balance experiments |
| `js/main.js` | Animation loop and input |

## License

[MIT](LICENSE). Use it, fork it, let your own AI take it somewhere else.
