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

// Words for how a species differs from the average creature: [above, below].
const TRAIT_WORDS = {
  size: ['large', 'small'],
  speed: ['fast', 'slow'],
  sense: ['keen-sighted', 'short-sighted'],
  repro: ['patient breeders', 'early breeders'],
  mutation: ['genetically restless', 'genetically steady'],
};

// The two traits that stand out most (normalized to each gene's range), e.g. "Large and fast".
T.describeTraits = function (cen, ref) {
  const diffs = Object.keys(TRAIT_WORDS)
    .map((k) => ({ k, d: (cen[k] - ref[k]) / (T.GENES[k].max - T.GENES[k].min) }))
    .filter((x) => Math.abs(x.d) >= 0.04)
    .sort((a, b) => Math.abs(b.d) - Math.abs(a.d))
    .slice(0, 2)
    .map((x) => TRAIT_WORDS[x.k][x.d > 0 ? 0 : 1]);
  if (!diffs.length) return 'Close to the average creature';
  const text = diffs.join(' and ');
  return text[0].toUpperCase() + text.slice(1);
};

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
    this.hoverSpecies = -1;
    this.cardPinned = false;
    this.bindSpeciesCard();
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
    this.hoverSpecies = -1;
    this.renderSpeciesCard();
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
      return `<li data-id="${s.id}" class="${ext ? 'extinct' : ''}">
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
    this.renderSpeciesCard();
  }

  // ---------- Species card (hover a species, or tap it on touch screens) ----------

  bindSpeciesCard() {
    const list = $('species');
    list.addEventListener('mousemove', (e) => {
      const li = e.target.closest('li[data-id]');
      this.setHoverSpecies(li ? +li.dataset.id : -1);
    });
    list.addEventListener('mouseleave', () => this.setHoverSpecies(-1));
    list.addEventListener('click', (e) => {
      const li = e.target.closest('li[data-id]');
      if (!li) return;
      const id = +li.dataset.id;
      this.setHoverSpecies(this.hoverSpecies === id && this.cardPinned ? -1 : id);
      this.cardPinned = this.hoverSpecies >= 0;
    });
  }

  setHoverSpecies(id) {
    if (id === this.hoverSpecies) return;
    this.hoverSpecies = id;
    this.cardPinned = false;
    this.renderSpeciesCard();
  }

  renderSpeciesCard() {
    const card = $('speciesCard');
    const id = this.hoverSpecies;
    const li = id >= 0 ? $('species').querySelector(`li[data-id="${id}"]`) : null;
    if (!li) {
      card.hidden = true;
      return;
    }
    const html = this.speciesCardHtml(this.w.species[id]);
    if (card.innerHTML !== html) card.innerHTML = html;
    card.hidden = false;

    // Beside the panel on wide screens, below the row on narrow ones.
    const r = li.getBoundingClientRect();
    const h = card.offsetHeight;
    if (r.left > card.offsetWidth + 24) {
      card.style.left = '';
      card.style.right = `${window.innerWidth - r.left + 12}px`;
      card.style.top = `${T.clamp(r.top - 12, 8, window.innerHeight - h - 8)}px`;
    } else {
      card.style.right = '';
      card.style.left = `${T.clamp(r.left, 8, window.innerWidth - card.offsetWidth - 8)}px`;
      card.style.top = `${r.bottom + 6}px`;
    }
  }

  speciesCardHtml(s) {
    const w = this.w, Y = T.yearOf;
    const alive = s.count > 0;
    const name = (sp) => esc(sp.name);
    const parent = s.parentId >= 0 ? w.species[s.parentId] : null;
    const successor = s.successorId >= 0 ? w.species[s.successorId] : null;
    const children = s.childIds.map((id) => w.species[id]);
    const end = alive ? w.tick : s.extinctAt;
    const years = Math.floor((end - s.born) / T.CFG.year);
    const span = years < 1 ? 'less than a year' : years === 1 ? '1 year' : `${years} years`;
    const cen = s.centroid || s.firstCentroid;
    const ref = alive ? w.last.avg : (s.avgAtEnd || w.last.avg);

    let status;
    if (alive) status = `${s.count} alive · ${Math.round((s.count / Math.max(1, w.creatures.length)) * 100)}% of all creatures`;
    else if (successor) status = `Became the ${name(successor)} in year ${Y(s.extinctAt)}`;
    else status = `Extinct since year ${Y(s.extinctAt)}`;

    const story = [];
    const origin = parent
      ? `branched off from the ${name(parent)} in year ${Y(s.born)}`
      : `were one of the ${w.species.filter((x) => x.parentId < 0).length} founding species`;
    if (alive) {
      story.push(`The ${name(s)} ${origin}, ${span} ago.`);
      if (s.peak > s.count * 1.15) story.push(`They peaked at ${s.peak} in year ${Y(s.peakAt)}.`);
      else story.push('They are near the largest they have ever been.');
    } else {
      story.push(`The ${name(s)} ${origin} and lasted ${span}.`);
      story.push(`They peaked at ${s.peak} in year ${Y(s.peakAt)}.`);
      if (successor) {
        story.push(`By year ${Y(s.extinctAt)} every remaining member had drifted into the ${name(successor)}. They didn't die out: they changed.`);
      } else {
        story.push(this.declineStory(s));
      }
    }
    if (children.length) {
      const list = children.map((c) => 'the ' + name(c));
      const joined = list.length === 1 ? list[0] : list.slice(0, -1).join(', ') + ' and ' + list[list.length - 1];
      story.push(`Ancestors of ${joined}.`);
    }

    const traits = cen ? T.TRAIT_KEYS.map((k) => {
      const d = T.GENES[k];
      const pct = ref[k] ? Math.round(((cen[k] - ref[k]) / ref[k]) * 100) : 0;
      const cls = Math.abs(pct) < 5 ? 'same' : pct > 0 ? 'up' : 'down';
      const tag = cls === 'same' ? 'avg' : `${pct > 0 ? '+' : ''}${pct}%`;
      return `<dt>${d.label}</dt><dd>${d.fmt(cen[k])}</dd><dd class="${cls}">${tag}</dd>`;
    }).join('') : '';

    return `
      <div class="sc-head">
        <span class="dot" style="background:${T.hueColor(s.hue)}"></span>
        <div><h3>${name(s)}</h3><div class="sc-status">${status}</div></div>
      </div>
      <div class="sc-traitline">${cen ? esc(T.describeTraits(cen, ref)) : ''}</div>
      ${this.sparkline(s)}
      <p class="sc-story">${story.join(' ')}</p>
      <dl class="sc-traits">${traits}</dl>
      <div class="sc-foot">Compared with the ${alive ? 'current' : 'then'} average creature.</div>`;
  }

  // Why an extinct species disappeared: what killed it after its peak, and who grew meanwhile.
  declineStory(s) {
    const w = this.w, Y = T.yearOf;
    const starved = s.deaths.starvation - s.deathsAtPeak.starvation;
    const old = s.deaths['old age'] - s.deathsAtPeak['old age'];
    const total = starved + old;
    const parts = [];
    if (total > 0) {
      const p = Math.round((starved / total) * 100);
      if (p >= 60) parts.push(`Hunger did them in: ${p}% of deaths after their peak were from starvation.`);
      else if (p <= 30) parts.push(`Most died of old age (${100 - p}% of deaths after their peak): they stopped raising enough young to replace themselves.`);
      else parts.push(`After their peak, deaths were split between hunger (${p}%) and old age.`);
    }
    const rows = w.speciesYearly;
    const a = rows[Math.min(Y(s.peakAt), rows.length - 1)] || [];
    const b = rows[Math.min(Y(s.extinctAt), rows.length - 1)] || [];
    let rival = null, gain = 20;
    for (const other of w.species) {
      if (other.id === s.id) continue;
      const g = (b[other.id] || 0) - (a[other.id] || 0);
      if (g > gain) { gain = g; rival = other; }
    }
    if (rival) parts.push(`Meanwhile the ${esc(rival.name)} grew from ${a[rival.id] || 0} to ${b[rival.id]}.`);
    parts.push(`The last one died in year ${Y(s.extinctAt)}.`);
    return parts.join(' ');
  }

  // Population over the species' lifetime, one point per year.
  sparkline(s) {
    const w = this.w, Y = T.yearOf;
    const endYear = s.count > 0 ? Y(w.tick) : Y(s.extinctAt);
    const vals = [];
    for (let y = Y(s.born); y <= endYear && y < w.speciesYearly.length; y++) vals.push(w.speciesYearly[y][s.id] || 0);
    vals.push(s.count);
    if (vals.length < 3) return '';
    const W = 236, H = 34, max = Math.max(1, ...vals);
    const pts = vals.map((v, i) => `${((i / (vals.length - 1)) * W).toFixed(1)},${(H - 2 - (v / max) * (H - 4)).toFixed(1)}`);
    const color = T.hueColor(s.hue);
    return `<svg class="sc-spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
      <polygon points="0,${H} ${pts.join(' ')} ${W},${H}" fill="${color}" opacity="0.14"/>
      <polyline points="${pts.join(' ')}" fill="none" stroke="${color}" stroke-width="1.5" vector-effect="non-scaling-stroke"/>
    </svg>
    <div class="sc-axis"><span>year ${Y(s.born)}</span><span>peak ${s.peak}</span><span>year ${endYear}</span></div>`;
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
