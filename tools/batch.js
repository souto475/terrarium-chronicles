// Headless batch runner for balance experiments.
//
//   node tools/batch.js <label> <years> <seed> [seed...]
//
// Runs each world for <years> and prints, per seed, how many years had at least five hunters
// on the map, plus snapshots at year 50 and at the end. The last line is a summary.
//
// A/B tests: set OVERRIDES to replace `const NAME = value;` declarations in js/creature.js
// before loading, e.g.
//
//   OVERRIDES='HUNT_MIN_DIET=0.3,PREY_MAX_MASS=0.6' node tools/batch.js B 100 3 7 11
//
// Use at least a couple dozen seeds before trusting a difference: worlds vary a lot.

const fs = require('fs');
const vm = require('vm');
const path = require('path');

const [label, yearsArg, ...seeds] = process.argv.slice(2);
const years = +yearsArg;
if (!label || !years || !seeds.length) {
  console.error('usage: node tools/batch.js <label> <years> <seed> [seed...]');
  process.exit(1);
}
const root = path.join(__dirname, '..', 'js');
const overrides = (process.env.OVERRIDES || '').split(',').filter(Boolean).map((s) => s.split('='));
const SIM_FILES = ['util', 'genes', 'creature', 'species', 'chronicle', 'world'];

function loadWorld(seed) {
  const ctx = { console, Math, performance };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  for (const f of SIM_FILES) {
    let src = fs.readFileSync(path.join(root, f + '.js'), 'utf8');
    if (f === 'creature') {
      for (const [k, v] of overrides) {
        const re = new RegExp('const ' + k + ' = [^;]+;');
        if (!re.test(src)) throw new Error('no const ' + k + ' in creature.js');
        src = src.replace(re, 'const ' + k + ' = ' + v + ';');
      }
    }
    vm.runInContext(src, ctx, { filename: f + '.js' });
  }
  return { w: vm.runInContext(`new T.World(${seed})`, ctx), year: ctx.T.CFG.year };
}

const avg = (list, k) => (list.length ? list.reduce((s, c) => s + c.genes[k], 0) / list.length : NaN);
const fmt = (x) => (isNaN(x) ? '  -' : x.toFixed(2));

let sumHunterYears = 0, sumSize = 0;
for (const seed of seeds) {
  const { w, year } = loadWorld(seed);
  let hunterYears = 0;
  const snaps = {};
  for (let y = 1; y <= years; y++) {
    for (let i = 0; i < year; i++) w.step();
    const hunters = w.creatures.filter((c) => c.isHunter);
    if (hunters.length >= 5) hunterYears++;
    if (y === 50 || y === years) {
      snaps[y] = {
        pop: w.creatures.length,
        hunters: hunters.length,
        size: avg(w.creatures, 'size'),
        speed: avg(w.creatures, 'speed'),
        species: w.aliveSpecies().length,
      };
    }
  }
  const midYear = snaps[50] ? 50 : years;
  const a = snaps[midYear], b = snaps[years];
  sumHunterYears += hunterYears;
  sumSize += b.size;
  console.log(`${label} seed ${String(seed).padStart(7)} hunterYears ${String(hunterYears).padStart(3)}` +
    ` | y${midYear} pop ${a.pop} hunters ${a.hunters} species ${a.species}` +
    ` | y${years} pop ${b.pop} hunters ${b.hunters} species ${b.species} size ${fmt(b.size)} speed ${fmt(b.speed)}`);
}
console.log(`${label} SUMMARY ${seeds.length} worlds: hunter years ${(sumHunterYears / seeds.length).toFixed(1)} / ${years}, final size ${(sumSize / seeds.length).toFixed(2)}`);
