'use strict';
// A creature: grazes, hunts or flees, spends energy, breeds and dies.

let NEXT_ID = 1;
T.resetIds = () => { NEXT_ID = 1; };

// Predation rules.
const HUNT_MIN_DIET = 0.2;     // below this, a creature never bothers hunting
const PREY_MAX_MASS = 0.7;     // prey must weigh at most this fraction of the hunter
const THREAT_MIN_DIET = 0.25;  // creatures this carnivorous are recognized as dangerous
const HUNTER_DIET = 0.4;       // shown and reported as a hunter (red ring) from here on
const ATTACK_COOLDOWN = 24;    // ticks between attack attempts
const FLEE_TICKS = 20;         // how long a scare lasts
const MEAT_PER_MASS = 30;      // energy in a body, per unit of mass, before digestion losses

T.Creature = class {
  constructor(world, x, y, genes, energy, parent, species) {
    const rng = world.rng;
    this.id = NEXT_ID++;
    this.x = x;
    this.y = y;
    this.genes = genes;
    this.species = species;
    this.gen = parent ? parent.gen + 1 : 0;
    this.parentId = parent ? parent.id : 0;
    this.nameSeed = (rng() * 4294967296) >>> 0;
    this._name = null;
    this.born = world.tick;
    this.died = -1;
    this.age = 0;
    this.children = 0;
    this.eaten = 0;
    this.kills = 0;
    this.heading = rng() * Math.PI * 2;
    this.tx = 0;
    this.ty = 0;
    this.hasTarget = false;
    this.moving = false;
    this.prey = null;
    this.attackIn = 0;
    this.fleeFor = 0;
    this.decideIn = rng.int(0, T.CFG.decideEvery);
    this.alive = true;
    this.cause = '';
    this.killer = null;

    // Traits derived from genes: being big is expensive, but stores more energy,
    // eats faster, lives longer and makes you harder to eat. Speed costs quadratically.
    const s = genes.size;
    this.mass = s * s;
    this.radius = 2 + 2.4 * s;
    this.maxEnergy = 50 * this.mass;
    this.energy = Math.min(energy, this.maxEnergy);
    this.maxAge = T.CFG.year * (3 + 1.5 * s) * rng.range(0.85, 1.15);
    this.maturity = T.CFG.year * 0.35;
    this.stepLen = genes.speed * 0.9;
    this.bite = 0.25 * this.mass;
    this.baseCost = 0.006 + 0.01 * Math.pow(this.mass, 0.75) + 0.00005 * genes.sense;
    this.moveCost = 0.006 * this.mass * genes.speed * genes.speed;
    // Digestion: a gut tuned for meat is worse at plants, and vice versa. The square root makes
    // the first steps toward meat pay off quickly, so hunting can evolve out of grazing.
    this.plantEff = 1 - genes.diet;
    this.meatEff = Math.pow(genes.diet, 0.75);
    this.hunter = genes.diet >= HUNT_MIN_DIET;
    this.dangerous = genes.diet >= THREAT_MIN_DIET;
    this.isHunter = genes.diet >= HUNTER_DIET;
    this.color = T.hueColor(genes.hue);
  }

  // Names are only generated when someone looks: most creatures never need one.
  get name() {
    if (this._name === null) this._name = T.makeName(T.makeRng(this.nameSeed));
    return this._name;
  }

  decide(w) {
    // Danger first: a creature that could eat me, close by, sends me running.
    if (w.hasHunters) {
      const threat = w.findThreat(this);
      if (threat) {
        this.flee(threat);
        return;
      }
    }
    if (this.fleeFor > 0) return;

    // Hungry hunters look for prey.
    if (this.hunter && this.energy < this.maxEnergy * 0.6) {
      const prey = w.findPrey(this);
      if (prey) {
        this.prey = prey;
        this.hasTarget = false;
        this.moving = true;
        return;
      }
    }
    this.prey = null;
    if (this.plantEff < 0.15) {
      // Pure carnivores don't graze: they roam until they find something.
      this.hasTarget = false;
      this.heading += w.rng.gauss() * 0.7;
      this.moving = true;
      return;
    }
    this.graze(w);
  }

  graze(w) {
    const cs = w.cs;
    const here = w.cellIndex(this.x, this.y);
    if (w.food[here] >= 1.2 && w.occ[here] <= this.mass * 1.3) {
      this.hasTarget = false;
      this.moving = false;
      return;
    }
    const r = this.genes.sense, r2 = r * r;
    const rc = Math.ceil(r / cs);
    const cx = Math.floor(this.x / cs), cy = Math.floor(this.y / cs);
    let best = 0, bx = 0, by = 0;
    for (let j = -rc; j <= rc; j++) {
      const yy = cy + j;
      if (yy < 0 || yy >= w.rows) continue;
      for (let i = -rc; i <= rc; i++) {
        const xx = cx + i;
        if (xx < 0 || xx >= w.cols) continue;
        const d2 = (i * i + j * j) * cs * cs;
        if (d2 > r2) continue;
        const k = yy * w.cols + xx;
        const f = w.food[k];
        if (f < 1) continue;
        let score = f / (1 + Math.sqrt(d2) / 40);
        // Avoid patches already held by someone much bigger.
        if (w.occ[k] > this.mass * 1.3) score *= 0.25;
        if (score > best) { best = score; bx = xx; by = yy; }
      }
    }
    if (best > 0) {
      this.tx = (bx + w.rng()) * cs;
      this.ty = (by + w.rng()) * cs;
      this.hasTarget = true;
    } else {
      this.hasTarget = false;
      this.heading += w.rng.gauss() * 0.9;
    }
    this.moving = true;
  }

  flee(from) {
    this.prey = null;
    this.hasTarget = false;
    this.moving = true;
    this.heading = Math.atan2(this.y - from.y, this.x - from.x);
    this.fleeFor = FLEE_TICKS;
  }

  update(w) {
    this.age++;
    if (this.attackIn > 0) this.attackIn--;
    if (this.fleeFor > 0) this.fleeFor--;
    if (--this.decideIn <= 0) {
      this.decide(w);
      this.decideIn = T.CFG.decideEvery;
    }

    const prey = this.prey;
    if (prey) {
      if (!prey.alive) {
        this.prey = null;
      } else {
        // Chase: steer straight at the prey every tick, strike on contact.
        const dx = prey.x - this.x, dy = prey.y - this.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d <= this.radius + prey.radius + 1) {
          if (this.attackIn === 0) this.attack(w, prey);
        } else {
          this.heading = Math.atan2(dy, dx);
          const step = Math.min(this.stepLen, d);
          this.x += (dx / d) * step;
          this.y += (dy / d) * step;
          this.energy -= this.moveCost;
        }
      }
    } else if (this.moving) {
      if (this.hasTarget) {
        const dx = this.tx - this.x, dy = this.ty - this.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d <= this.stepLen) {
          this.x = this.tx;
          this.y = this.ty;
          this.hasTarget = false;
          this.moving = false;
        } else {
          this.heading = Math.atan2(dy, dx);
          this.x += (dx / d) * this.stepLen;
          this.y += (dy / d) * this.stepLen;
        }
      } else {
        this.x += Math.cos(this.heading) * this.stepLen;
        this.y += Math.sin(this.heading) * this.stepLen;
      }
      this.energy -= this.moveCost;
    }
    if (this.x < 0) { this.x = 0; this.heading = Math.PI - this.heading; }
    else if (this.x >= w.W) { this.x = w.W - 0.01; this.heading = Math.PI - this.heading; }
    if (this.y < 0) { this.y = 0; this.heading = -this.heading; }
    else if (this.y >= w.H) { this.y = w.H - 0.01; this.heading = -this.heading; }
    this.energy -= this.baseCost;

    if (this.plantEff > 0) {
      const idx = w.cellIndex(this.x, this.y);
      const f = w.food[idx];
      if (f > 0 && this.energy < this.maxEnergy) {
        // Competition: anyone smaller than the biggest creature in the cell only gets scraps.
        const occ = w.occ[idx];
        const share = occ > this.mass ? (this.mass / occ) * (this.mass / occ) : 1;
        const b = Math.min(f, this.bite * share, (this.maxEnergy - this.energy) / this.plantEff);
        w.food[idx] = f - b;
        this.energy += b * this.plantEff;
        this.eaten += b * this.plantEff;
      }
    }

    if (this.energy <= 0) return this.die(w, 'starvation');
    if (this.age >= this.maxAge) return this.die(w, 'old age');
    if (this.age >= this.maturity && this.energy >= this.genes.repro * this.maxEnergy) {
      this.reproduce(w);
    }
  }

  // Odds improve with a bigger size advantage and a speed edge. A failed strike scares the prey off.
  attack(w, prey) {
    this.attackIn = ATTACK_COOLDOWN;
    this.energy -= 0.3 * this.mass;
    const sizeEdge = this.genes.size / prey.genes.size - 1;
    const speedEdge = this.genes.speed / prey.genes.speed - 1;
    const odds = T.clamp(0.2 + 0.5 * sizeEdge + 0.4 * speedEdge, 0.05, 0.85);
    if (w.rng() < odds) {
      const meat = (Math.max(0, prey.energy) + prey.mass * MEAT_PER_MASS) * this.meatEff;
      this.energy = Math.min(this.maxEnergy, this.energy + meat);
      this.eaten += meat;
      this.kills++;
      prey.killer = this;
      prey.die(w, 'predation');
      this.prey = null;
    } else {
      prey.flee(this);
    }
  }

  reproduce(w) {
    const genes = T.mutateGenome(this.genes, w.rng);
    const childEnergy = this.energy * 0.45;
    this.energy *= 0.5;
    const a = w.rng() * Math.PI * 2;
    const x = T.clamp(this.x + Math.cos(a) * this.radius * 2, 0, w.W - 0.01);
    const y = T.clamp(this.y + Math.sin(a) * this.radius * 2, 0, w.H - 0.01);
    const child = new T.Creature(w, x, y, genes, childEnergy, this, this.species);
    this.children++;
    w.addBirth(child);
  }

  die(w, cause) {
    this.alive = false;
    this.cause = cause;
    this.died = w.tick;
    this.prey = null;
    w.onDeath(this);
  }
};

T.PRED = { HUNT_MIN_DIET, PREY_MAX_MASS, THREAT_MIN_DIET, HUNTER_DIET };
