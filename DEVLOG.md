# Devlog

Each session: what changed, what was learned, what's next. Written by Claude, mainly so the
next session can pick up where this one left off. See the [README](README.md) for how the
project works and why things are the way they are.

**Headless testing:** the simulation files (`util`, `genes`, `creature`, `species`, `chronicle`,
`world`) have no DOM dependencies. Load them into a Node `vm` context with `globalThis` set,
then `new T.World(seed)` and call `step()`. In the browser, `window.terrarium.world` exposes
the live world.

---

## Session 4 — 2026-09-28 (autonomous)

The tester stepped away and left the direction to me. Added `CLAUDE.md` so the core rule of
the project (Claude owns it; feedback is input, not orders) loads in every session.

**Decision: predation before social behavior.** The roadmap had herding (step 3) before
conflict (step 4). Swapped them: herding only pays off when there are predators to herd
against, and predation was the expected fix for the "small and fast" convergence.

What changed:
- New gene `diet` (0–1, founders 0–6%). Plants digest at `1 − diet`, meat at `diet^0.75`.
  Included in species distance. Changes are shown in points, not percent (`absolute: true`),
  because a percentage of a near-zero founder value is meaningless.
- Hunting: diet ≥ 20% and energy < 60% → look for the nearest creature of another species within
  sight weighing ≤ 70% of the hunter, chase it, strike on contact (cooldown 24 ticks). Odds
  `0.2 + 0.5·sizeEdge + 0.4·speedEdge`, clamped 5–85%. A miss scares the prey off. Pure carnivores
  (plant efficiency < 15%) roam instead of grazing.
- Fleeing: any creature of another species with diet ≥ 25% and big enough to eat you, within
  min(sight, 90 px), sends you running for 20 ticks.
- Spatial grid (50 px cells) rebuilt every tick, `world.near()`, `findPrey()`, `findThreat()`.
  Threat checks are skipped until some creature is dangerous (`world.hasHunters`).
- Calibration runs (seeds 1, 7, 42, 949118, 100 years each):
  - v1 (√diet, hunt at 12% meat, prey ≤ 80% mass, hunt below 80% energy): predators evolved
    everywhere by year 20–30, but omnivores with 10–20% meat killed constantly, predation was
    the top cause of death and one world fell to 103 creatures.
  - v2 (diet^0.75, hunt at 20%, prey ≤ 70%, hunt below 60%): predator species emerge in most
    worlds and can persist (world 7: Orho, 98% meat, ~43 hunters vs ~340 grazers from year 60 to
    100+). World 42 never evolved true hunters in 100 years, which I consider a feature.
  - Size is no longer pinned at 0.55: species range from ~0.6 to 2.5. Speed became the arms
    race (average ~2.4–2.8).
- Chronicle: first kill ("Blood in the terrarium"), species turning into hunters (centroid diet ≥
  40%), years where ≥ 45% of deaths were kills, and diet trends in points.
- **Editorial filter for species news.** Species churn went up with predation (world 949118: 30
  species in 100 years, 18 of the 24 extinctions were tiny or short-lived). New species are now
  announced only once established (2 years with ≥ 15 members, or ≥ 40 members), and
  extinctions of never-announced species are silent. They still show in the panel.
- Visuals: red ring on hunters (diet ≥ 40%) on the map and on hunter species in the panel. At 25%
  half the map was ringed, so the ring uses the "hunter" threshold, not the "dangerous" one.
- Species cards: kills, "turned to hunting in year N", and a third cause of decline ("hunted
  down, most of them by the X") using per-species `killedBy` tallies. Inspector shows kills and
  "Eaten by X of the Y". Census shows eaten count.
- **Performance:** a CPU profile showed 25% of sim time in `cellIndex` (two `Math.floor` divisions,
  called several times per creature per tick). Multiplying by a precomputed inverse and truncating
  with `|0` took a tick from 1.13 to 0.63 ms at ~540 creatures, with bit-identical results.

**Social behavior: tried and reverted.** A `social` gene (0–1, founders 5–25%) with:
kin within 40 px cutting strike odds (scaled by the prey's own sociability, so plain crowding
doesn't count), fellow hunters nearby raising them (packs), social creatures spotting threats
from farther away, a pull toward the herd while moving, and following kin that are standing
still and eating. Results over 36 seeds × 100 years (`tools/batch.js`, same seeds with the
effects switched off via overrides):
- Prey never evolved sociability (it stayed at 5–17%). Grazers crowding the same cells split the
  food, and predation comes in bursts too short to select for herds over many generations.
- Hunters in worlds with lasting predators did drift up to 26–33% sociability: pack hunting is
  mildly selected.
- Worlds with social effects had hunters on the map 16.6 years in 100, against 25.1 without.
  A first version, where any crowding protected prey, stopped predators from establishing at all.

Net effect: less predation, no herds. Reverted rather than kept as a gene that does nothing
visible. A future attempt needs a real reason for prey to clump, e.g. hunters that can only
pick off stragglers at the edge of a group, or grazing that works better in company.

- New `tools/batch.js`: runs many seeds headless and prints hunter-years, population, species,
  size and speed; `OVERRIDES='NAME=value'` swaps constants in `creature.js` for A/B tests.

Next:
- A tree-of-life view of species; saving worlds across reloads.
- Watch whether speed pinned near its max (3) needs a rethink.
- Still waiting on monitor readings for the stutters.

## Session 3 — 2026-09-28

Feedback: stutters still happen now and then (world #949118, around year 73, ~1,200 creatures).
The species panel works well; request: a hover card with each species' story and traits, and for
extinct species how they lived and why they died. Camera: fine as is.

Investigation (reproduced #949118 at year 72, 1,266 creatures; worlds are deterministic):
- Simulation: 0.4 ms median per tick, occasional 4–9 ms ticks on ordinary ticks. Speciation costs
  0.4–2 ms. Not the problem.
- Drawing: median 2.6 ms, spikes to 35 ms. Components measured alone were all under 1 ms, but
  measuring canvas work from a hidden browser pane is unreliable: with nothing presented, queued
  GPU work piles up and flushes in bursts (one test showed a fake 1.8 s "frame"). The only
  trustworthy numbers come from a visible page, hence the new monitor.

Changes:
- **Rendering:** creatures drawn in 72 hue buckets, one path per bucket (plus one path for all
  eyes). Measured median draw went from 2.6 to 1.3 ms at ~1,450 creatures, spikes from 35 to 11 ms.
  Vegetation image re-uploaded at most every 100 ms instead of every frame.
- **CSS containment** on side panels, toast, cards and the stage.
- Sim budget per frame 9 → 8 ms.
- **Performance monitor (P):** fps, average/max sim, draw and UI time, and a list of long frames
  (> 50 ms) with the unexplained remainder labelled "browser". In the (throttled) preview pane,
  long frames were ~1–2 ms of our work plus 40–47 ms of browser time.
- **Species card** on hover (tap on touch): status, a one-line trait summary ("Large and fast",
  the two traits furthest from the average), a yearly population sparkline, the story (origin,
  peak, descendants; for extinct species the dominant cause of death after the peak and the
  rival that grew most in that window, or the species it transformed into), and traits compared
  with the average creature at the time.
  - New tracking: per-species deaths by cause (and a snapshot at peak), peak year, child species,
    successor, world averages at extinction, and a yearly census of every species
    (`world.speciesYearly`).
- `window.terrarium` now also exposes `ui` and `perf`.

Later in the session, more feedback: the extinct list will keep growing and push everything
down; and the "Average genes" panel goes unnoticed. The tester asked that suggestions be judged,
not just implemented.
- Extinct species now sit in their own list, collapsed by default behind an "Extinct (N)"
  toggle, scrollable when open. Their stories already live in the chronicle and species cards.
- The average-genes bars were dropped rather than highlighted: a bar showing today's average
  says nothing about evolution. The new **Evolution** panel plots each average gene over the
  whole history against a dashed founders' line, with the change since founding ("▲ 46%").
  Sparklines scale to their own data but never tighter than 6% of the gene's range, so noise
  doesn't look like a trend. Genes that moved 5% or more are highlighted.
- Panel order is now census, species, history, evolution. The color strip moved under the
  species list, where it reads as "each species has its own hue".

Next:
- Get monitor readings from a real stutter. If long frames are mostly "browser", look at paint
  and compositing (DevTools Performance tab); if "sim", profile the tick.
- Phylogenetic tree view; predation (step 4); save/load.

## Session 2 — 2026-09-28

Feedback from the first test:
1. New lineages never showed up in the panel, only the three founders.
2. Panning could drag the map off screen, even when not zoomed in.
3. The app froze for a moment every so often, and that got tiresome.

Also: publish on GitHub and move the whole project to English.

What changed:
- **Species (roadmap step 2, first version).** Lineages were replaced by species. Children inherit
  their parent's species. Every 200 ticks, creatures more than 0.38 away (normalized gene
  distance) from their species' centroid are grouped by leader clustering. Groups of 15+ become
  a new species that records its parent. When all of a species' members move into a new one,
  the chronicle reports it as a transformation rather than an extinction. The panel lists living
  species by population with a share bar, plus the five most recent extinctions.
  - Calibration: at 0.30 threshold and 12 minimum size, 18 species were alive by year 40, most of
    them tiny. At 0.45, almost nothing split. 0.38 with 15 minimum gives 5–7 alive over 60 years.
- **Camera.** You can't zoom out past "whole map fits". When the map fits on an axis, it glides
  back to center after a drag. When zoomed in, panning stops at the map's edge (with a small margin).
- **Stutters.** Headless timing showed occasional 15–40 ms ticks, but at different ticks on every
  run, so they come from the environment (GC, OS scheduling) rather than one expensive step.
  To reduce pressure:
  - dead creatures are compacted out in place instead of `filter()` allocating a new array each tick;
  - color strings are cached per hue degree; names are generated lazily from a stored seed;
  - `died` and target fields are initialized in the constructor so objects keep one shape;
  - the per-frame simulation budget dropped from 14 ms to 9 ms, leaving room to draw;
  - off-screen creatures aren't drawn; the chronicle list is capped at 300 entries.
  - The panel now shows the actual speed ("Running at 23×"), since at high speed the budget caps it.
  - Measured in the browser: ~0.2–0.4 ms per tick with ~600 creatures, ~1 ms per draw.
- **English everywhere:** UI, chronicle, comments, docs. The Portuguese diary became this devlog.
- Published to GitHub with a README covering the collaboration model and key decisions.

Next:
- Hear whether the stutters are gone. If not, profile in the browser (the Performance tab) at 64×.
- A small phylogenetic tree view of species would make the history much more legible.
- Consider early predation to break the "small and fast" convergence (see README).
- Save/load a world in `localStorage`.
- A spatial hash will be needed once creatures interact with each other (steps 3–4).

## Session 1 — 2026-09-28

- Picked the project (terrarium + world newspaper) and set up the structure.
- Roadmap step 1 complete: simulation, rendering with zoom and pan, creature inspector,
  population/vegetation chart, color histogram, lineage list, and a chronicle with headlines
  (population milestones, famine, generations, evolutionary trends, lineage extinction,
  obituary of the longest-lived).
- **Balance finding:** in every world tested, evolution converges on "small and fast" (size → 0.55,
  speed → 1.6+). Tried Kleiber scaling, a fixed living cost, per-cell competition and harsh
  seasons, and none reversed it. Food ends up as scattered scraps, everyone grazes on the move,
  and whoever spends least wins. Biologically sound: size pays off with predation or direct
  conflict. Step 4 (predation) should fix it, so it isn't worth forcing now.
- Performance: ~1 ms per tick with ~1,000 creatures in Node.
