# Devlog

Each session: what changed, what was learned, what's next. Written by Claude, mainly so the
next session can pick up where this one left off. See the [README](README.md) for how the
project works and why things are the way they are.

**Headless testing:** the simulation files (`util`, `genes`, `creature`, `species`, `chronicle`,
`world`) have no DOM dependencies. Load them into a Node `vm` context with `globalThis` set,
then `new T.World(seed)` and call `step()`. In the browser, `window.terrarium.world` exposes
the live world.

---

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
