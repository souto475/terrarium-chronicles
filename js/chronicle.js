'use strict';
// The chronicle watches the world and turns events into headlines.
// It doesn't "understand" anything: it notices numeric milestones and tells the story.

const POP_MILESTONES = [100, 250, 500, 750, 1000, 1500, 2000, 3000, 5000];
const GEN_MILESTONES = [5, 10, 25, 50, 100, 150, 200, 300, 500, 750, 1000, 1500, 2000];

const ordinal = (n) => {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

const TRENDS = {
  size: {
    up: (p) => `Creatures are growing larger: average size is up ${p}%.`,
    down: (p) => `An age of shrinking: average size has dropped ${p}%.`,
  },
  speed: {
    up: (p) => `Haste wins out. Creatures are now ${p}% faster.`,
    down: (p) => `Slowness pays off: average speed has fallen ${p}%.`,
  },
  sense: {
    up: (p) => `Sharper eyes: average sight range is up ${p}%.`,
    down: (p) => `Sight loses its value, and average range falls ${p}%.`,
  },
  repro: {
    up: (p) => `Creatures wait longer before breeding (threshold up ${p}%).`,
    down: (p) => `Early breeding: creatures now have offspring with ${p}% less in reserve.`,
  },
  mutation: {
    up: (p) => `Life grows unstable: the mutation rate is up ${p}%.`,
    down: (p) => `Heredity settles down, and the mutation rate falls ${p}%.`,
  },
};

T.Chronicle = class {
  constructor(world) {
    this.w = world;
    this.entries = [];
    this.onEntry = null;
    this.cool = {};
    this.nextPop = 0;
    this.nextGen = 0;
    this.recentPops = [];
    this.baseline = null;
    this.elderRecord = 0;
    this.ended = false;
    this.soleSpecies = -1;
  }

  add(text, kind) {
    const e = { tick: this.w.tick, year: T.yearOf(this.w.tick), text, kind };
    this.entries.push(e);
    if (this.onEntry) this.onEntry(e);
  }

  // Keeps the same kind of headline from repeating too often.
  ready(key, years) {
    const last = this.cool[key];
    if (last !== undefined && this.w.tick - last < years * T.CFG.year) return false;
    this.cool[key] = this.w.tick;
    return true;
  }

  speciesName(id) {
    return this.w.species[id].name;
  }

  onFounding() {
    const w = this.w;
    const names = w.species.map((s) => 'the ' + s.name);
    const list = names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1];
    this.add(`The first ${w.creatures.length} creatures awaken in the terrarium, split into ${w.species.length} species: ${list}.`, 'founding');
    this.baseline = Object.assign({}, w.last.avg);
    while (this.nextPop < POP_MILESTONES.length && POP_MILESTONES[this.nextPop] <= w.creatures.length) this.nextPop++;
  }

  observe() {
    const w = this.w;
    const pop = w.creatures.length;

    if (pop === 0) {
      if (!this.ended) {
        this.ended = true;
        this.add('The last creature in the terrarium dies. No life remains, only vegetation growing in silence.', 'end');
      }
      return;
    }

    let crossed = null;
    while (this.nextPop < POP_MILESTONES.length && pop >= POP_MILESTONES[this.nextPop]) {
      crossed = POP_MILESTONES[this.nextPop++];
    }
    if (crossed) this.add(`The population passes ${crossed} creatures for the first time.`, 'milestone');

    // Famine: a sharp drop from the peak of the last three years.
    const windowLen = Math.round((3 * T.CFG.year) / T.CFG.sampleEvery);
    this.recentPops.push(pop);
    if (this.recentPops.length > windowLen) this.recentPops.shift();
    const peak = Math.max.apply(null, this.recentPops);
    if (peak >= 40 && pop < peak * 0.5 && this.ready('famine', 4)) {
      this.add(`Great famine: the population collapses from ${peak} to ${pop} creatures.`, 'famine');
    }

    // Evolutionary trends, checked once a year.
    if (w.tick % T.CFG.year === 0 && this.baseline) {
      for (const k of Object.keys(TRENDS)) {
        const base = this.baseline[k];
        const rel = (w.last.avg[k] - base) / base;
        if (Math.abs(rel) >= 0.3 && this.ready('trend_' + k, 6)) {
          const p = Math.round(Math.abs(rel) * 100);
          this.add(rel > 0 ? TRENDS[k].up(p) : TRENDS[k].down(p), 'evolution');
          this.baseline[k] = w.last.avg[k];
        }
      }
    }
  }

  onGeneration(c) {
    let hit = null;
    while (this.nextGen < GEN_MILESTONES.length && c.gen >= GEN_MILESTONES[this.nextGen]) {
      hit = GEN_MILESTONES[this.nextGen++];
    }
    if (hit) {
      this.add(`${c.name} of the ${this.speciesName(c.species)} is born: the first creature of the ${ordinal(hit)} generation.`, 'generation');
    }
  }

  onDeath(c) {
    if (c.cause !== 'old age' || c.age <= this.elderRecord) return;
    this.elderRecord = c.age;
    if (this.w.tick > 5 * T.CFG.year && this.ready('elder', 8)) {
      const years = (c.age / T.CFG.year).toFixed(1);
      const kids = c.children === 0 ? 'They left no offspring'
        : c.children === 1 ? 'They left 1 child' : `They left ${c.children} children`;
      this.add(`${c.name} of the ${this.speciesName(c.species)} dies at ${years} years old, the longest life ever seen. ${kids}.`, 'obituary');
    }
  }

  onSpeciation(s, parent) {
    this.add(`A new species emerges: the ${s.name}, descended from the ${parent.name}.`, 'species');
    this.soleSpecies = -1;
  }

  onSpeciesGone(s, successor) {
    const years = T.yearOf(this.w.tick - s.born);
    const span = years < 1 ? 'less than a year' : plural(years, 'year');
    if (successor) {
      this.add(`The ${s.name} are no more: after ${span}, every one of them has become ${successor.name}.`, 'extinction');
    } else {
      this.add(`The ${s.name} go extinct after ${span}. At their peak there were ${s.peak} of them.`, 'extinction');
    }
    const alive = this.w.aliveSpecies();
    if (alive.length === 1 && this.soleSpecies !== alive[0].id) {
      this.soleSpecies = alive[0].id;
      this.add(`The ${alive[0].name} are now the only species in the terrarium.`, 'extinction');
    }
  }
};
