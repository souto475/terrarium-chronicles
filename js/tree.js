'use strict';
// Tree of life: every species as a stream along a timeline, its thickness following its
// population, joined to the species it branched from.

const TREE_PAD_LEFT = 12;
const TREE_PAD_RIGHT = 130;   // room for the names at the end of each stream
const TREE_AXIS = 26;

T.TreeView = class {
  constructor(ui) {
    this.ui = ui;
    this.el = document.getElementById('tree');
    this.body = document.getElementById('treeBody');
    this.minorBox = document.getElementById('treeMinor');
    this.open = false;
    this.lastKey = '';

    document.getElementById('treeClose').addEventListener('click', () => this.toggle(false));
    this.minorBox.addEventListener('change', () => { this.lastKey = ''; this.render(); });
    this.body.addEventListener('mousemove', (e) => {
      const g = e.target.closest('[data-id]');
      if (g) ui.showCardAt(+g.dataset.id, e.clientX, e.clientY);
      else ui.showCardAt(-1);
    });
    this.body.addEventListener('mouseleave', () => ui.showCardAt(-1));
  }

  toggle(force) {
    this.open = force === undefined ? !this.open : force;
    this.el.hidden = !this.open;
    this.lastKey = '';
    if (this.open) this.render();
    else this.ui.showCardAt(-1);
  }

  // Which species to draw: living ones, announced ones, and every ancestor of those.
  visibleSpecies(w) {
    const showMinor = this.minorBox.checked;
    const keep = new Set();
    for (const s of w.species) {
      if (!(showMinor || s.announced || s.count > 0)) continue;
      for (let x = s; x && !keep.has(x.id); x = x.parentId >= 0 ? w.species[x.parentId] : null) keep.add(x.id);
    }
    return keep;
  }

  // Depth-first order, children right below their parent, oldest branch first.
  order(w, keep) {
    const kids = new Map();
    for (const s of w.species) {
      if (!keep.has(s.id)) continue;
      const p = s.parentId >= 0 ? s.parentId : -1;
      if (!kids.has(p)) kids.set(p, []);
      kids.get(p).push(s);
    }
    const out = [];
    const visit = (s) => {
      out.push(s);
      for (const c of (kids.get(s.id) || []).sort((a, b) => a.born - b.born)) visit(c);
    };
    for (const root of kids.get(-1) || []) visit(root);
    return out;
  }

  render() {
    if (!this.open) return;
    const w = this.ui.w, Y = T.yearOf;
    const now = Math.max(1, Y(w.tick));
    // Rebuilding the SVG is cheap, but not free: redo it only when something visible changed.
    const key = `${w.seed}|${now}|${w.species.length}|${this.minorBox.checked}|${w.species.map((s) => s.count > 0 ? 1 : 0).join('')}`;
    if (key === this.lastKey) return;
    this.lastKey = key;

    const keep = this.visibleSpecies(w);
    const rows = this.order(w, keep);
    const width = Math.max(320, this.body.clientWidth - 12);
    const plotW = width - TREE_PAD_LEFT - TREE_PAD_RIGHT;
    const rowH = T.clamp(Math.floor((this.body.clientHeight - TREE_AXIS - 16) / Math.max(1, rows.length)), 12, 32);
    const height = TREE_AXIS + rows.length * rowH + 8;
    const x = (year) => TREE_PAD_LEFT + (year / now) * plotW;
    const rowY = new Map(rows.map((s, i) => [s.id, TREE_AXIS + i * rowH + rowH / 2]));

    let maxPop = 1;
    for (const row of w.speciesYearly) for (const id of keep) if ((row[id] || 0) > maxPop) maxPop = row[id];
    for (const s of rows) if (s.count > maxPop) maxPop = s.count;
    const half = (n) => (n > 0 ? 0.6 + (Math.sqrt(n) / Math.sqrt(maxPop)) * (rowH * 0.42) : 0);

    const parts = [];
    // Time axis.
    const step = niceStep(now);
    for (let yr = 0; yr <= now; yr += step) {
      parts.push(`<line x1="${x(yr)}" x2="${x(yr)}" y1="${TREE_AXIS - 6}" y2="${height}" class="tree-grid"/>`);
      parts.push(`<text x="${x(yr)}" y="${TREE_AXIS - 10}" class="tree-year">${yr}</text>`);
    }

    for (const s of rows) {
      const cy = rowY.get(s.id);
      const color = T.hueColor(s.hue);
      const start = Y(s.born), end = s.count > 0 ? now : Math.max(start, Y(s.extinctAt));
      const alive = s.count > 0;

      // Branch from the parent's stream at the moment of the split.
      if (s.parentId >= 0 && rowY.has(s.parentId)) {
        const py = rowY.get(s.parentId);
        parts.push(`<path d="M${x(start)},${py} C${x(start) + 6},${py} ${x(start) - 2},${cy} ${x(start) + 4},${cy}" class="tree-branch" stroke="${color}"/>`);
      }

      // Population stream: one point per year, mirrored around the row's center line.
      const top = [], bottom = [];
      for (let yr = start; yr <= end; yr++) {
        const n = yr === now && alive ? s.count : (w.speciesYearly[yr] && w.speciesYearly[yr][s.id]) || 0;
        const h = Math.max(0.8, half(n));
        top.push(`${x(yr).toFixed(1)},${(cy - h).toFixed(1)}`);
        bottom.push(`${x(yr).toFixed(1)},${(cy + h).toFixed(1)}`);
      }
      if (top.length === 1) {
        top.push(top[0].replace(/^[\d.]+/, (v) => (+v + 2).toFixed(1)));
        bottom.push(bottom[0].replace(/^[\d.]+/, (v) => (+v + 2).toFixed(1)));
      }
      const hunter = s.centroid && s.centroid.diet >= T.PRED.HUNTER_DIET;
      const label = alive ? `${esc(s.name)} <tspan class="tree-count">${s.count}</tspan>` : esc(s.name);
      parts.push(`<g data-id="${s.id}" class="tree-sp${alive ? '' : ' gone'}${hunter ? ' hunter' : ''}">
        <rect x="${x(start) - 2}" y="${cy - rowH / 2}" width="${Math.max(6, x(end) - x(start) + 4)}" height="${rowH}" class="tree-hit"/>
        <polygon points="${top.join(' ')} ${bottom.reverse().join(' ')}" fill="${color}"/>
        <text x="${x(end) + 6}" y="${cy + 4}" class="tree-name">${label}</text>
      </g>`);
    }

    const hidden = w.species.length - rows.length;
    document.getElementById('treeNote').textContent = hidden > 0
      ? `${hidden} short-lived branch${hidden === 1 ? '' : 'es'} hidden`
      : '';
    this.body.innerHTML = `<svg width="${width}" height="${height}" class="tree-svg" role="img" aria-label="Tree of life">${parts.join('')}</svg>`;
  }
};

function niceStep(span) {
  for (const s of [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000]) if (span / s <= 10) return s;
  return 2000;
}
