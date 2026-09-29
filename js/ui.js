'use strict';
// Side panels: chronicle, census, chart, species, genes and inspector.

const KIND_TAG = {
  founding: 'Founding',
  milestone: 'Milestone',
  famine: 'Famine',
  extinction: 'Extinction',
  evolution: 'Evolution',
  generation: 'Generation',
  obituary: 'Obituary',
  species: 'New species',
  end: 'The end',
};

const SEASONS = ['Spring', 'Summer', 'Autumn', 'Winter'];
const MAX_ENTRIES = 300;
const EXTINCT_SHOWN = 5;

T.seasonName = (w) => SEASONS[Math.floor(((w.season() + 0.125) % 1) * 4)];

T.climateName = (c) => (c < 1 ? 'Mild' : c < 1.6 ? 'Temperate' : c < 2.2 ? 'Harsh' : 'Extreme');

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
const fmtYears = (ticks) => (ticks / T.CFG.year).toFixed(1);

T.UI = class {
  constructor(handlers) {
    this.h = handlers;
    this.graph = $('graph');
    this.hues = $('hues');
    this.inspectorFor = null;
    this.toastTimer = 0;
  }

  bindWorld(w) {
    this.w = w;
    $('entries').innerHTML = '';
    for (const e of w.chronicle.entries) this.addEntry(e);
    w.chronicle.onEntry = (e) => { this.addEntry(e); this.toast(e.text); };
    $('seedLabel').textContent = 'World #' + w.seed;
    $('seedInput').value = w.seed;
    $('sClimate').textContent = T.climateName(w.climate);

    const genes = $('genes');
    genes.innerHTML = '';
    this.geneEls = {};
    for (const k of T.TRAIT_KEYS) {
      const d = T.GENES[k];
      const el = document.createElement('div');
      el.className = 'gene';
      el.innerHTML = `<div class="top"><span>${d.label}</span><span></span></div><div class="bar"><i></i><b></b></div>`;
      genes.appendChild(el);
      const pct = ((w.foundingAvg[k] - d.min) / (d.max - d.min)) * 100;
      el.querySelector('b').style.left = `calc(${pct}% - 1px)`;
      this.geneEls[k] = { val: el.querySelector('.top span:last-child'), bar: el.querySelector('i') };
    }
    this.hideInspector();
  }

  addEntry(e) {
    const list = $('entries');
    const li = document.createElement('li');
    li.dataset.kind = e.kind;
    li.innerHTML = `<div class="year"><span>Year ${e.year}</span><span class="tag">${KIND_TAG[e.kind] || ''}</span></div><p>${esc(e.text)}</p>`;
    list.prepend(li);
    while (list.children.length > MAX_ENTRIES) list.lastChild.remove();
  }

  toast(text) {
    const t = $('toast');
    t.textContent = text;
    t.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => t.classList.remove('show'), 4200);
  }

  update(selected, paused, actualSpeed) {
    const w = this.w, last = w.last;
    const season = T.seasonName(w);
    $('clock').textContent = `Year ${T.yearOf(w.tick)} · ${season}`;
    $('sPop').textContent = w.creatures.length;
    $('sGen').textContent = w.maxGen;
    $('sBirths').textContent = w.totalBirths;
    $('sDeaths').innerHTML = `${w.totalDeaths} <small>${w.deathsByCause.starvation} starved</small>`;
    $('sSeason').textContent = season;
    $('playBtn').textContent = paused ? 'Resume' : 'Pause';
    $('actualSpeed').textContent = paused ? 'Paused' : `Running at ${actualSpeed}×`;

    this.updateSpecies();

    for (const k of T.TRAIT_KEYS) {
      const d = T.GENES[k], v = last.avg[k];
      this.geneEls[k].val.textContent = w.creatures.length ? d.fmt(v) : '—';
      this.geneEls[k].bar.style.width = (w.creatures.length ? ((v - d.min) / (d.max - d.min)) * 100 : 0) + '%';
    }

    this.drawGraph();
    this.drawHues();
    this.updateInspector(selected);
  }

  updateSpecies() {
    const w = this.w, pop = Math.max(1, w.creatures.length);
    const alive = w.aliveSpecies().sort((a, b) => b.count - a.count);
    const extinct = w.species.filter((s) => s.count === 0).sort((a, b) => b.extinctAt - a.extinctAt);
    const row = (s) => {
      const ext = s.count === 0;
      const parent = s.parentId >= 0 ? `from ${esc(w.species[s.parentId].name)}` : 'founder';
      const info = ext ? `gone · yr ${T.yearOf(s.extinctAt)}` : s.count;
      const share = ext ? 0 : (s.count / pop) * 100;
      return `<li class="${ext ? 'extinct' : ''}">
        <span class="dot" style="background:${T.hueColor(s.hue)}"></span>
        <span class="name">${esc(s.name)}<small>${parent}</small></span>
        <span class="count">${info}</span>
        <i class="share" style="width:${share.toFixed(1)}%"></i></li>`;
    };
    let html = alive.map(row).join('');
    if (extinct.length) {
      html += `<li class="divider">Extinct (${extinct.length})</li>` + extinct.slice(0, EXTINCT_SHOWN).map(row).join('');
    }
    const list = $('species');
    if (list.innerHTML !== html) list.innerHTML = html;
    $('spCount').textContent = `${alive.length} alive`;
  }

  canvasCtx(cv) {
    const dpr = window.devicePixelRatio || 1;
    const r = cv.getBoundingClientRect();
    if (cv.width !== Math.round(r.width * dpr)) {
      cv.width = Math.round(r.width * dpr);
      cv.height = Math.round(r.height * dpr);
    }
    const ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, r.width, r.height);
    return { ctx, W: r.width, H: r.height };
  }

  drawGraph() {
    const { ctx, W, H } = this.canvasCtx(this.graph);
    const h = this.w.history;
    if (h.length < 2) return;
    let maxPop = 1, maxFood = 1;
    for (const p of h) {
      if (p.pop > maxPop) maxPop = p.pop;
      if (p.food > maxFood) maxFood = p.food;
    }
    const line = (key, max, color, width) => {
      ctx.beginPath();
      for (let i = 0; i < h.length; i++) {
        const x = (i / (h.length - 1)) * W;
        const y = H - 2 - (h[i][key] / max) * (H - 8);
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.stroke();
    };
    ctx.strokeStyle = '#242a25';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, H - 0.5);
    ctx.lineTo(W, H - 0.5);
    ctx.stroke();
    line('food', maxFood, 'rgba(111,174,106,0.7)', 1);
    line('pop', maxPop, '#e8b85a', 1.5);
    ctx.fillStyle = '#8b9388';
    ctx.font = '10px "IBM Plex Mono", monospace';
    ctx.fillText('peak ' + maxPop, 4, 11);
    ctx.textAlign = 'right';
    ctx.fillText('year ' + T.yearOf(this.w.tick), W - 4, 11);
    ctx.textAlign = 'left';
  }

  drawHues() {
    const { ctx, W, H } = this.canvasCtx(this.hues);
    const bins = new Array(48).fill(0);
    for (const c of this.w.creatures) bins[Math.floor(c.genes.hue / 7.5) % 48]++;
    const max = Math.max(1, ...bins);
    const bw = W / bins.length;
    bins.forEach((n, i) => {
      ctx.fillStyle = `hsl(${i * 7.5}, 70%, ${n ? 62 : 20}%)`;
      const bh = n ? 3 + (n / max) * (H - 3) : 2;
      ctx.fillRect(i * bw, H - bh, bw - 0.5, bh);
    });
  }

  showInspector(c) {
    this.inspectorFor = c;
    const el = $('inspector');
    el.hidden = false;
    el.innerHTML = `<div class="body"></div>
      <div class="actions">
        <button class="btn small" data-act="follow">Follow</button>
        <button class="btn small" data-act="close">Close</button>
      </div>`;
    el.querySelector('[data-act=follow]').onclick = () => this.h.toggleFollow();
    el.querySelector('[data-act=close]').onclick = () => this.h.deselect();
  }

  hideInspector() {
    this.inspectorFor = null;
    $('inspector').hidden = true;
  }

  updateInspector(c) {
    if (!c) { if (this.inspectorFor) this.hideInspector(); return; }
    if (c !== this.inspectorFor) this.showInspector(c);
    const w = this.w, sp = w.species[c.species];
    const age = c.alive ? c.age : c.died - c.born;
    const rows = T.TRAIT_KEYS.map((k) => `<dt>${T.GENES[k].label}</dt><dd>${T.GENES[k].fmt(c.genes[k])}</dd>`).join('');
    const status = c.alive
      ? `<div class="energy" title="Energy"><i style="width:${((c.energy / c.maxEnergy) * 100).toFixed(0)}%"></i></div>`
      : `<div class="dead">Died of ${c.cause} in year ${T.yearOf(c.died)}.</div>`;
    const html = `<div class="who"><span class="dot" style="background:${c.color}"></span><div><h3>${esc(c.name)}</h3>
      <div class="sub">of the ${esc(sp.name)} · ${c.gen ? 'generation ' + c.gen : 'founder'}</div></div></div>
      ${status}
      <dl class="kv"><dt>Age</dt><dd>${fmtYears(age)} yrs</dd><dt>Children</dt><dd>${c.children}</dd>${rows}</dl>`;
    const body = $('inspector').querySelector('.body');
    if (body.innerHTML !== html) body.innerHTML = html;
    const fb = $('inspector').querySelector('[data-act=follow]');
    fb.textContent = this.h.isFollowing() ? 'Unfollow' : 'Follow';
    fb.disabled = !c.alive;
  }
};
