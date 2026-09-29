'use strict';
// Saving and resuming worlds in the browser's localStorage, one save per seed.
//
// A resumed world must continue exactly as if it had never stopped, so everything that
// feeds the simulation is stored: every creature field, species, vegetation, counters, the
// chronicle's memory and the random generator's position. Derived per-tick structures (the
// occupancy and spatial grids) are rebuilt on the next step anyway.

const SAVE_VERSION = 1;          // bump whenever the simulation changes what it stores
const SAVE_PREFIX = 'terrarium-save-';
const SAVE_INDEX = 'terrarium-saves';
const MAX_SAVES = 3;

// Creature fields that hold references, or that derive() rebuilds from the genes.
const CREATURE_SKIP = new Set(['prey', 'killer', ...T.Creature.DERIVED]);
const CHRONICLE_FIELDS = ['entries', 'cool', 'nextPop', 'nextGen', 'recentPops', 'baseline', 'elderRecord', 'ended', 'soleSpecies'];
const WORLD_FIELDS = [
  'tick', 'climate', 'totalBirths', 'totalDeaths', 'deathsByCause', 'yearDeaths', 'lastYearDeaths',
  'firstKill', 'maxGen', 'history', 'historyStride', 'samples', 'last', 'foundingAvg',
  'speciesYearly', 'hasHunters',
];

const store = {
  get(key) { try { return localStorage.getItem(key); } catch (e) { return null; } },
  set(key, value) { localStorage.setItem(key, value); },
  remove(key) { try { localStorage.removeItem(key); } catch (e) { /* storage unavailable */ } },
};

function readIndex() {
  try { return JSON.parse(store.get(SAVE_INDEX)) || []; } catch (e) { return []; }
}

T.Save = {
  serialize(w) {
    // Columnar: field names once, then one array of values per creature (and per genome).
    const sample = w.creatures[0];
    const fields = sample ? Object.keys(sample).filter((k) => !CREATURE_SKIP.has(k) && k !== 'genes') : [];
    const creatures = {
      fields,
      genes: T.GENE_KEYS,
      rows: w.creatures.map((c) => [
        fields.map((k) => c[k]),
        T.GENE_KEYS.map((k) => c.genes[k]),
        c.prey && c.prey.alive ? c.prey.id : 0,
      ]),
    };
    const chronicle = {};
    for (const k of CHRONICLE_FIELDS) chronicle[k] = w.chronicle[k];
    const world = {};
    for (const k of WORLD_FIELDS) world[k] = w[k];
    return {
      v: SAVE_VERSION,
      seed: w.seed,
      savedAt: Date.now(),
      rng: w.rng.getState(),
      nextId: T.getNextId(),
      world,
      food: Array.from(w.food),
      usedNames: [...w.usedNames],
      species: w.species.map((s) => Object.assign({}, s)),
      creatures,
      chronicle,
    };
  },

  // Rebuilds a world from saved data. Returns null if the data doesn't fit this version.
  restore(data) {
    if (!data || data.v !== SAVE_VERSION) return null;
    const w = new T.World(data.seed);   // regenerates the terrain; everything else is overwritten
    Object.assign(w, data.world);
    w.food.set(data.food);
    w.usedNames = new Set(data.usedNames);
    w.species = data.species.map((s) => Object.assign(Object.create(T.Species.prototype), s));
    const { fields, genes, rows } = data.creatures;
    const byId = new Map();
    w.creatures = rows.map(([values, geneValues]) => {
      const c = Object.create(T.Creature.prototype);
      fields.forEach((k, i) => { c[k] = values[i]; });
      c.genes = {};
      genes.forEach((k, i) => { c.genes[k] = geneValues[i]; });
      c.prey = null;
      c.killer = null;
      c.derive();
      byId.set(c.id, c);
      return c;
    });
    rows.forEach((row, i) => { if (row[2]) w.creatures[i].prey = byId.get(row[2]) || null; });
    w.newborn = [];
    w.deadThisTick = false;
    Object.assign(w.chronicle, data.chronicle);
    w.rng.setState(data.rng);
    T.setNextId(data.nextId);
    return w;
  },

  // Returns false if the browser refused (storage full or disabled).
  save(w) {
    const key = SAVE_PREFIX + w.seed;
    try {
      store.set(key, JSON.stringify(this.serialize(w)));
    } catch (e) {
      return false;
    }
    const index = readIndex().filter((s) => s !== w.seed);
    index.unshift(w.seed);
    for (const old of index.splice(MAX_SAVES)) store.remove(SAVE_PREFIX + old);
    try { store.set(SAVE_INDEX, JSON.stringify(index)); } catch (e) { /* the save itself landed */ }
    return true;
  },

  load(seed) {
    try {
      return this.restore(JSON.parse(store.get(SAVE_PREFIX + seed)));
    } catch (e) {
      return null;
    }
  },

  // Seed of the most recently saved world, or 0.
  latestSeed() {
    return readIndex()[0] || 0;
  },
};
