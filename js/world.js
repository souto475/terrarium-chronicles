'use strict';
// The world: vegetation grid, population, species, census and chronicle.

T.World = class {
  constructor(seed) {
    T.resetIds();
    const C = T.CFG;
    this.seed = seed >>> 0;
    this.rng = T.makeRng(this.seed);
    this.W = C.worldW;
    this.H = C.worldH;
    this.cs = C.cell;
    this.cols = Math.ceil(this.W / this.cs);
    this.rows = Math.ceil(this.H / this.cs);

    const n = this.cols * this.rows;
    this.fert = new Float32Array(n);
    this.food = new Float32Array(n);
    this.occ = new Float32Array(n);   // biggest mass present in each cell this tick
    const noise = T.makeNoise(this.rng);
    const ox = this.rng() * 100, oy = this.rng() * 100;
    for (let y = 0; y < this.rows; y++) {
      for (let x = 0; x < this.cols; x++) {
        const v = noise(ox + (x / this.cols) * 4, oy + (y / this.rows) * 2.5, 5);
        const f = T.clamp((v - 0.4) * 3, 0, 1);
        const i = y * this.cols + x;
        this.fert[i] = f;
        this.food[i] = f * C.foodMax * this.rng();
      }
    }

    // Climate: amplitude of the seasons. Above 1, winter stops regrowth for a while.
    this.climate = this.rng.range(0.7, 2.6);
    this.tick = 0;
    this.creatures = [];
    this.newborn = [];
    this.deadThisTick = false;
    this.totalBirths = 0;
    this.totalDeaths = 0;
    this.deathsByCause = { starvation: 0, 'old age': 0 };
    this.maxGen = 0;
    this.species = [];
    this.usedNames = new Set();
    this.speciesYearly = [];   // population of every species at the start of each year
    this.history = [];
    this.historyStride = 1;
    this.samples = 0;

    this.chronicle = new T.Chronicle(this);
    this.spawnFounders();
    T.updateCentroids(this);
    this.last = this.census();
    this.foundingAvg = Object.assign({}, this.last.avg);
    this.history.push(this.last);
    this.speciesYearly.push(this.species.map((s) => s.count));
    this.chronicle.onFounding();
  }

  uniqueSpeciesName() {
    for (let i = 0; i < 50; i++) {
      const name = T.makeName(this.rng, i < 25 ? 2 : 3);
      if (!this.usedNames.has(name)) {
        this.usedNames.add(name);
        return name;
      }
    }
    return 'Species ' + this.species.length;
  }

  spawnFounders() {
    const C = T.CFG, rng = this.rng;
    const baseHue = rng() * 360;
    const homes = [];
    for (let i = 0; i < C.founders; i++) {
      const hue = (baseHue + (i * 360) / C.founders + rng.range(-20, 20) + 360) % 360;
      const sp = new T.Species(this, null, hue, 0);

      // Each founding species starts on a fertile spot, away from the others.
      let cx = 0, cy = 0, bestScore = -Infinity;
      for (let t = 0; t < 300; t++) {
        const x = rng.range(60, this.W - 60), y = rng.range(60, this.H - 60);
        const near = homes.some((h) => Math.hypot(h.x - x, h.y - y) < 450);
        const score = this.fert[this.cellIndex(x, y)] - (near ? 10 : 0);
        if (score > bestScore) { bestScore = score; cx = x; cy = y; }
      }
      homes.push({ x: cx, y: cy });

      const base = T.founderGenome(rng, hue);
      for (let k = 0; k < C.foundersEach; k++) {
        const genes = T.mutateGenome(base, rng);
        const a = rng() * Math.PI * 2, d = rng() * 60;
        const x = T.clamp(cx + Math.cos(a) * d, 0, this.W - 0.01);
        const y = T.clamp(cy + Math.sin(a) * d, 0, this.H - 0.01);
        const c = new T.Creature(this, x, y, genes, Infinity, null, sp.id);
        c.energy = c.maxEnergy * 0.6;
        c.age = rng.int(0, C.year);
        this.creatures.push(c);
        sp.count++;
      }
      sp.peak = sp.count;
    }
  }

  // Phase of the year in [0,1): 0 = start of spring.
  season() {
    return (this.tick % T.CFG.year) / T.CFG.year;
  }

  // Regrowth multiplier: peaks in summer, bottoms out in winter.
  growth() {
    return Math.max(0, 1 + this.climate * Math.sin(this.season() * Math.PI * 2));
  }

  cellIndex(x, y) {
    return Math.floor(y / this.cs) * this.cols + Math.floor(x / this.cs);
  }

  step() {
    const C = T.CFG;
    this.tick++;

    const food = this.food, fert = this.fert, max = C.foodMax, rg = C.regrow * this.growth();
    for (let i = 0; i < food.length; i++) {
      const f = food[i] + rg * fert[i];
      food[i] = f > max ? max : f;
    }

    const list = this.creatures, occ = this.occ;
    occ.fill(0);
    for (let i = 0; i < list.length; i++) {
      const c = list[i], k = this.cellIndex(c.x, c.y);
      if (c.mass > occ[k]) occ[k] = c.mass;
    }
    for (let i = 0; i < list.length; i++) {
      if (list[i].alive) list[i].update(this);
    }
    // Compact the list in place instead of allocating a new array every tick.
    if (this.deadThisTick) {
      let j = 0;
      for (let i = 0; i < list.length; i++) if (list[i].alive) list[j++] = list[i];
      list.length = j;
      this.deadThisTick = false;
    }
    if (this.newborn.length) {
      for (let i = 0; i < this.newborn.length; i++) list.push(this.newborn[i]);
      this.newborn.length = 0;
    }

    if (this.tick % C.speciesEvery === 0 && list.length) T.speciate(this);
    if (this.tick % C.year === 0) this.speciesYearly.push(this.species.map((s) => s.count));

    if (this.tick % C.sampleEvery === 0) {
      this.last = this.census();
      this.samples++;
      if (this.samples % this.historyStride === 0) {
        this.history.push(this.last);
        // When the chart fills up, drop every other point: it always shows the whole history.
        if (this.history.length > C.historyMax) {
          this.history = this.history.filter((_, i) => i % 2 === 0);
          this.historyStride *= 2;
        }
      }
      for (const s of this.species) {
        if (s.count > s.peak) {
          s.peak = s.count;
          s.peakAt = this.tick;
          s.deathsAtPeak = Object.assign({}, s.deaths);
        }
      }
      this.chronicle.observe();
    }
  }

  census() {
    const list = this.creatures;
    const avg = {};
    for (const k of T.TRAIT_KEYS) avg[k] = 0;
    for (const c of list) for (const k of T.TRAIT_KEYS) avg[k] += c.genes[k];
    if (list.length) for (const k of T.TRAIT_KEYS) avg[k] /= list.length;
    let food = 0;
    for (let i = 0; i < this.food.length; i++) food += this.food[i];
    return { t: this.tick, pop: list.length, food, avg };
  }

  aliveSpecies() {
    return this.species.filter((s) => s.count > 0);
  }

  addBirth(c) {
    this.newborn.push(c);
    this.totalBirths++;
    this.species[c.species].count++;
    if (c.gen > this.maxGen) {
      this.maxGen = c.gen;
      this.chronicle.onGeneration(c);
    }
  }

  onDeath(c) {
    this.deadThisTick = true;
    this.totalDeaths++;
    this.deathsByCause[c.cause]++;
    this.chronicle.onDeath(c);
    const s = this.species[c.species];
    s.deaths[c.cause]++;
    s.count--;
    if (s.count === 0) this.speciesGone(s, null);
  }

  // `successor` is set when the species didn't die out but turned entirely into a new one.
  speciesGone(s, successor) {
    s.extinctAt = this.tick;
    s.avgAtEnd = Object.assign({}, this.last.avg);
    this.chronicle.onSpeciesGone(s, successor);
  }

  creatureAt(x, y, maxDist) {
    let best = null, bd = maxDist * maxDist;
    for (const c of this.creatures) {
      const dx = c.x - x, dy = c.y - y;
      const d = dx * dx + dy * dy - c.radius * c.radius;
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  }
};
