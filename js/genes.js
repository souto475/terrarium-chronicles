'use strict';
// Gene definitions, genetic distance and mutation.

T.GENES = {
  size:     { min: 0.5,  max: 3,    label: 'Size',          fmt: (v) => v.toFixed(2) },
  speed:    { min: 0.2,  max: 3,    label: 'Speed',         fmt: (v) => v.toFixed(2) },
  sense:    { min: 15,   max: 200,  label: 'Sight',         fmt: (v) => v.toFixed(0) },
  repro:    { min: 0.4,  max: 0.95, label: 'Breeding at',   fmt: (v) => Math.round(v * 100) + '%' },
  mutation: { min: 0.01, max: 0.3,  label: 'Mutation rate', fmt: (v) => (v * 100).toFixed(1) + '%' },
  // Share of energy that can come from meat. Changes are shown in points, not percent, since
  // it starts near zero.
  diet:     { min: 0,    max: 1,    label: 'Meat in diet',  fmt: (v) => Math.round(v * 100) + '%', absolute: true },
  hue:      { min: 0,    max: 360,  label: 'Color',         fmt: (v) => v.toFixed(0) + '°', wrap: true },
};

T.GENE_KEYS = Object.keys(T.GENES);
T.TRAIT_KEYS = T.GENE_KEYS.filter((k) => !T.GENES[k].wrap);

// Traits that define a species. Mutation rate is left out: it is a meta-gene, not a body plan.
const SPECIES_KEYS = ['size', 'speed', 'sense', 'repro', 'diet'];

// Distance between two genomes in normalized gene space. Hue is a neutral trait that drifts
// freely, so it works like a visible "accent": 60° of hue weighs as much as 25% of a trait's range.
T.geneDistance = function (a, b) {
  let d = 0;
  for (const k of SPECIES_KEYS) {
    const g = T.GENES[k];
    const x = (a[k] - b[k]) / (g.max - g.min);
    d += x * x;
  }
  let dh = Math.abs(a.hue - b.hue);
  if (dh > 180) dh = 360 - dh;
  dh /= 240;
  return Math.sqrt(d + dh * dh);
};

T.founderGenome = function (rng, hue) {
  return {
    size: rng.range(0.85, 1.25),
    speed: rng.range(0.8, 1.2),
    sense: rng.range(40, 70),
    repro: rng.range(0.6, 0.8),
    mutation: rng.range(0.04, 0.07),
    diet: rng.range(0, 0.06),
    hue: hue,
  };
};

// Mutation rate is itself a gene: lineages can evolve to mutate more or less.
T.mutateGenome = function (g, rng) {
  const m = g.mutation;
  const out = {};
  for (const k of T.GENE_KEYS) {
    const d = T.GENES[k];
    let v = g[k];
    if (d.wrap) {
      v = (((v + rng.gauss() * m * 120) % 360) + 360) % 360;
    } else {
      v = T.clamp(v + rng.gauss() * m * (d.max - d.min) * 0.5, d.min, d.max);
    }
    out[k] = v;
  }
  return out;
};
