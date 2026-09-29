'use strict';
// Shared utilities: config, seeded RNG, noise and name generation.
var T = (typeof window !== 'undefined' ? window : globalThis).T = {};

T.CFG = {
  worldW: 1600,
  worldH: 1000,
  cell: 20,              // size of each vegetation cell (world px)
  foodMax: 5,            // max food per cell
  regrow: 0.01,          // regrowth per tick on a fertility-1 cell
  year: 400,             // ticks per year
  sampleEvery: 40,       // census interval
  historyMax: 800,       // max points kept for the chart
  founders: 3,           // founding species
  foundersEach: 25,      // creatures per founding species
  decideEvery: 8,        // ticks between each creature's decisions
  speciesEvery: 200,     // ticks between speciation checks
  speciesThreshold: 0.38,// genetic distance that separates species
  speciesMinSize: 15,    // members needed for a split to count as a new species
};

T.makeRng = function (seed) {
  let a = seed >>> 0;
  const r = function () {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  r.range = (lo, hi) => lo + (hi - lo) * r();
  r.int = (lo, hi) => Math.floor(lo + (hi - lo + 1) * r());
  r.pick = (arr) => arr[Math.floor(r() * arr.length)];
  r.gauss = () => {
    let u = 0;
    while (u === 0) u = r();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r());
  };
  return r;
};

// 2D value noise with octaves (fBm), returns roughly [0,1].
T.makeNoise = function (rng) {
  const p = [];
  for (let i = 0; i < 256; i++) p.push(i);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = p[i]; p[i] = p[j]; p[j] = t;
  }
  const perm = new Uint8Array(512);
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const vals = new Float32Array(256);
  for (let i = 0; i < 256; i++) vals[i] = rng();
  const fade = (t) => t * t * (3 - 2 * t);
  const h = (x, y) => vals[perm[(perm[x & 255] + y) & 255]];

  function value(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const u = fade(x - xi), v = fade(y - yi);
    const a = h(xi, yi), b = h(xi + 1, yi), c = h(xi, yi + 1), d = h(xi + 1, yi + 1);
    return (a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v;
  }

  return function (x, y, octaves) {
    let sum = 0, amp = 1, freq = 1, norm = 0;
    for (let o = 0; o < (octaves || 4); o++) {
      sum += value(x * freq, y * freq) * amp;
      norm += amp;
      amp *= 0.5;
      freq *= 2;
    }
    return sum / norm;
  };
};

const SYLLABLES = [
  'ka', 'lu', 'mi', 'to', 'ra', 'ze', 'no', 'bi', 'sa', 'vo', 'el', 'an', 'or', 'ti', 'qua',
  'mur', 'dro', 'fe', 'gi', 'ho', 'ja', 'ki', 'pe', 'su', 'ya', 'xo', 'ul', 'ir', 'en', 'tha',
];

T.makeName = function (rng, syllables) {
  const n = syllables || rng.int(2, 3);
  let s = '';
  for (let i = 0; i < n; i++) s += rng.pick(SYLLABLES);
  return s[0].toUpperCase() + s.slice(1);
};

// Color strings are cached per whole degree of hue, so creatures don't allocate one each.
const HUE_COLORS = [];
for (let h = 0; h < 360; h++) HUE_COLORS.push(`hsl(${h}, 70%, 62%)`);
T.hueColor = (hue) => HUE_COLORS[Math.round(hue) % 360];

T.clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
T.lerp = (a, b, t) => a + (b - a) * t;
T.yearOf = (tick) => Math.floor(tick / T.CFG.year);
