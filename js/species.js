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
    this.hue = hue;
    world.species.push(this);
  }
};

T.circularMeanHue = function (sumCos, sumSin) {
  return ((Math.atan2(sumSin, sumCos) * 180) / Math.PI + 360) % 360;
};

T.updateCentroids = function (w) {
  const acc = w.species.map(() => ({ n: 0, size: 0, speed: 0, sense: 0, repro: 0, mutation: 0, cos: 0, sin: 0 }));
  for (const c of w.creatures) {
    const a = acc[c.species], g = c.genes;
    a.n++;
    a.size += g.size;
    a.speed += g.speed;
    a.sense += g.sense;
    a.repro += g.repro;
    a.mutation += g.mutation;
    const h = (g.hue * Math.PI) / 180;
    a.cos += Math.cos(h);
    a.sin += Math.sin(h);
  }
  for (const s of w.species) {
    const a = acc[s.id];
    if (!a.n) continue;
    s.hue = T.circularMeanHue(a.cos, a.sin);
    s.centroid = {
      size: a.size / a.n, speed: a.speed / a.n, sense: a.sense / a.n,
      repro: a.repro / a.n, mutation: a.mutation / a.n, hue: s.hue,
    };
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
      if (old.count === 0) w.speciesGone(old, s);
    }
  }
  T.updateCentroids(w);
};
