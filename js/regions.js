'use strict';
// Geography: the fertile and barren patches of the map become named regions, so the chronicle
// can say where things happen. Regions come from the terrain alone and use their own random
// generator, so naming them never changes how a world plays out.

const FERTILE_MIN = 0.35;     // cells at least this fertile belong to green regions
const BARREN_MAX = 0.05;      // cells at most this fertile belong to barren regions
const MIN_FERTILE_CELLS = 30;
const MIN_BARREN_CELLS = 60;
const SPLIT_CELLS = 170;      // target size when cutting up a big patch

const LUSH_NAMES = ['Wood', 'Marshes', 'Thicket', 'Fens'];
const GREEN_NAMES = ['Meadows', 'Vale', 'Groves', 'Fields', 'Hollow', 'Downs'];
const BARREN_NAMES = ['Barrens', 'Flats', 'Waste', 'Dunes', 'Scar'];

// Place names get their own style, so they never read like a species ("the Kato in the Kato Waste").
const PLACE_HEADS = ['Ash', 'Bram', 'Cold', 'Dun', 'Elder', 'Fal', 'Gray', 'Hollin', 'Iron', 'Kes', 'Lin', 'Mor',
  'Nor', 'Oak', 'Pen', 'Rook', 'Sel', 'Thorn', 'Wil', 'Yar', 'Brack', 'Cinder', 'Hart', 'Stil'];
const PLACE_TAILS = ['ford', 'wick', 'holm', 'ley', 'ton', 'stead', 'well', 'ridge', 'crest', 'hurst', 'den', 'worth', 'moor', 'gate'];

T.buildRegions = function (w) {
  const rng = T.makeRng((w.seed ^ 0x5bd1e995) >>> 0);
  const n = w.cols * w.rows;
  const cells = new Int16Array(n).fill(-1);
  const seen = new Uint8Array(n);
  const list = [];
  const used = new Set();

  const flood = (start, inside) => {
    const stack = [start], members = [];
    seen[start] = 1;
    while (stack.length) {
      const i = stack.pop();
      members.push(i);
      const x = i % w.cols, y = (i / w.cols) | 0;
      const next = [x > 0 ? i - 1 : -1, x < w.cols - 1 ? i + 1 : -1, y > 0 ? i - w.cols : -1, y < w.rows - 1 ? i + w.cols : -1];
      for (const j of next) {
        if (j >= 0 && !seen[j] && inside(w.fert[j])) {
          seen[j] = 1;
          stack.push(j);
        }
      }
    }
    return members;
  };

  const name = (pool) => {
    for (let t = 0; t < 30; t++) {
      const n2 = rng.pick(PLACE_HEADS) + rng.pick(PLACE_TAILS) + ' ' + rng.pick(pool);
      if (!used.has(n2)) { used.add(n2); return n2; }
    }
    return 'the unnamed lands';
  };

  const cx = (m) => (m % w.cols) + 0.5, cy = (m) => ((m / w.cols) | 0) + 0.5;

  // Big patches are cut into pieces of similar size: well-spread seed cells, each cell joining
  // the nearest seed. Otherwise one sprawling meadow would be the setting of every story.
  const split = (members) => {
    const k = Math.round(members.length / SPLIT_CELLS);
    if (k < 2) return [members];
    const seeds = [members[Math.floor(rng() * members.length)]];
    const dist = members.map((m) => (cx(m) - cx(seeds[0])) ** 2 + (cy(m) - cy(seeds[0])) ** 2);
    while (seeds.length < k) {
      let far = 0;
      for (let i = 1; i < members.length; i++) if (dist[i] > dist[far]) far = i;
      const s = members[far];
      seeds.push(s);
      members.forEach((m, i) => { dist[i] = Math.min(dist[i], (cx(m) - cx(s)) ** 2 + (cy(m) - cy(s)) ** 2); });
    }
    const parts = seeds.map(() => []);
    for (const m of members) {
      let best = 0, bd = Infinity;
      seeds.forEach((s, i) => {
        const d = (cx(m) - cx(s)) ** 2 + (cy(m) - cy(s)) ** 2;
        if (d < bd) { bd = d; best = i; }
      });
      parts[best].push(m);
    }
    return parts.filter((p) => p.length);
  };

  const addRegion = (members, kind) => {
    let sx = 0, sy = 0, sf = 0;
    for (const m of members) {
      sx += cx(m);
      sy += cy(m);
      sf += w.fert[m];
    }
    const lush = sf / members.length > 0.7;
    const region = {
      id: list.length,
      kind,
      name: name(kind === 'barren' ? BARREN_NAMES : lush ? LUSH_NAMES : GREEN_NAMES),
      size: members.length,
      x: (sx / members.length) * w.cs,
      y: (sy / members.length) * w.cs,
    };
    // Labels sit on a member cell near the middle, so odd-shaped regions keep their name inside.
    let best = members[0], bd = Infinity;
    for (const m of members) {
      const d = (cx(m) * w.cs - region.x) ** 2 + (cy(m) * w.cs - region.y) ** 2;
      if (d < bd) { bd = d; best = m; }
    }
    region.lx = cx(best) * w.cs;
    region.ly = cy(best) * w.cs;
    for (const m of members) cells[m] = region.id;
    list.push(region);
  };

  const fertile = (f) => f >= FERTILE_MIN, barren = (f) => f <= BARREN_MAX;
  for (let i = 0; i < n; i++) {
    if (seen[i]) continue;
    const f = w.fert[i];
    const kind = fertile(f) ? 'green' : barren(f) ? 'barren' : null;
    if (!kind) continue;
    const members = flood(i, kind === 'green' ? fertile : barren);
    if (members.length < (kind === 'green' ? MIN_FERTILE_CELLS : MIN_BARREN_CELLS)) continue;
    for (const part of split(members)) addRegion(part, kind);
  }
  return { cells, list };
};

// The region at a point, or the nearest one by label position.
T.regionNear = function (w, x, y) {
  const id = w.regions.cells[w.cellIndex(x, y)];
  if (id >= 0) return { region: w.regions.list[id], inside: true };
  let best = null, bd = Infinity;
  for (const r of w.regions.list) {
    const d = (r.lx - x) ** 2 + (r.ly - y) ** 2;
    if (d < bd) { bd = d; best = r; }
  }
  return best ? { region: best, inside: false } : null;
};

// "in the Kalu Meadows" / "near the Kalu Meadows" / "" (a map with no regions at all).
T.placeOf = function (w, x, y) {
  const r = T.regionNear(w, x, y);
  if (!r) return '';
  return `${r.inside ? 'in' : 'near'} the ${r.region.name}`;
};

// Where most members of a species are right now, as a place phrase.
T.rangeOf = function (w, speciesId) {
  const counts = new Map();
  for (const c of w.creatures) {
    if (c.species !== speciesId) continue;
    const r = T.regionNear(w, c.x, c.y);
    if (!r) continue;
    const key = r.region.id * 2 + (r.inside ? 1 : 0);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  let bestKey = -1, most = 0;
  for (const [k, v] of counts) if (v > most) { most = v; bestKey = k; }
  if (bestKey < 0) return '';
  const region = w.regions.list[bestKey >> 1];
  return `${bestKey & 1 ? 'in' : 'near'} the ${region.name}`;
};
