'use strict';
// Species: creatures inherit their parent's species; every so often we check whether a group
// has drifted far enough from its species' average genome to be called a new one.
//
// The check (leader clustering):
//  1. Compute each living species' centroid genome.
//  2. Creatures farther than the threshold from their own centroid are "outliers".
//  3. Outliers close to each other are grouped. A group big enough becomes a new species,
//     descended from the species most of its members came from.

T.Species = class {
  constructor(world, parent, hue, tick) {
    this.id = world.species.length;
    this.name = world.uniqueSpeciesName();
    this.parentId = parent ? parent.id : -1;
    this.born = tick;
    this.extinctAt = -1;
    this.count = 0;
    this.peak = 0;
    this.centroid = null;
    this.firstCentroid = null;
    this.hue = hue;
    this.peakAt = tick;
    this.deaths = { starvation: 0, 'old age': 0, predation: 0 };
    this.deathsAtPeak = { starvation: 0, 'old age': 0, predation: 0 };
    this.kills = 0;
    this.killedBy = {};     // species id -> members of this species it has eaten
    this.hunterSince = -1;
    this.announced = !parent;   // new species only make the news once they establish themselves
    this.childIds = [];
    this.successorId = -1;
    this.avgAtEnd = null;   // world's average genes when the species ended, for comparison
    world.species.push(this);
  }
};

T.circularMeanHue = function (sumCos, sumSin) {
  return ((Math.atan2(sumSin, sumCos) * 180) / Math.PI + 360) % 360;
};

T.updateCentroids = function (w) {
  const keys = T.TRAIT_KEYS;
  const acc = w.species.map(() => {
    const a = { n: 0, cos: 0, sin: 0 };
    for (const k of keys) a[k] = 0;
    return a;
  });
  for (const c of w.creatures) {
    const a = acc[c.species], g = c.genes;
    a.n++;
    for (const k of keys) a[k] += g[k];
    const h = (g.hue * Math.PI) / 180;
    a.cos += Math.cos(h);
    a.sin += Math.sin(h);
  }
  for (const s of w.species) {
    const a = acc[s.id];
    if (!a.n) continue;
    s.hue = T.circularMeanHue(a.cos, a.sin);
    const cen = { hue: s.hue };
    for (const k of keys) cen[k] = a[k] / a.n;
    s.centroid = cen;
    if (!s.firstCentroid) s.firstCentroid = cen;
  }
};

T.speciate = function (w) {
  const C = T.CFG;
  T.updateCentroids(w);

  const clusters = [];
  for (const c of w.creatures) {
    const home = w.species[c.species].centroid;
    if (T.geneDistance(c.genes, home) <= C.speciesThreshold) continue;
    let joined = false;
    for (const cl of clusters) {
      if (T.geneDistance(c.genes, cl.seed) <= C.speciesThreshold * 0.8) {
        cl.members.push(c);
        joined = true;
        break;
      }
    }
    if (!joined) clusters.push({ seed: c.genes, members: [c] });
  }

  for (const cl of clusters) {
    if (cl.members.length < C.speciesMinSize) continue;
    const votes = new Map();
    for (const c of cl.members) votes.set(c.species, (votes.get(c.species) || 0) + 1);
    let parentId = -1, best = 0;
    for (const [id, n] of votes) if (n > best) { best = n; parentId = id; }
    const parent = w.species[parentId];

    const s = new T.Species(w, parent, cl.seed.hue, w.tick);
    parent.childIds.push(s.id);
    for (const c of cl.members) {
      w.species[c.species].count--;
      c.species = s.id;
      s.count++;
    }
    s.peak = s.count;
    w.chronicle.onSpeciation(s, parent);
    // A species whose every member moved into the new one has transformed rather than died out.
    for (const id of votes.keys()) {
      const old = w.species[id];
      if (old.count === 0) {
        old.successorId = s.id;
        w.speciesGone(old, s);
      }
    }
  }
  T.updateCentroids(w);
};
