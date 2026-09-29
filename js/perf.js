'use strict';
// Performance monitor (toggle with P). Records how long each frame spends simulating,
// drawing and updating panels, and catches "long frames": gaps between frames well past
// the ~16.7 ms of a 60 Hz display. Whatever part of a gap our own work doesn't explain
// was spent by the browser itself (garbage collection, compositing, other tabs).

const LONG_FRAME_MS = 50;
const WINDOW = 120;

T.PerfMonitor = class {
  constructor(el) {
    this.el = el;
    this.visible = false;
    this.lastNow = 0;
    this.prev = null;
    this.frames = [];
    this.long = [];
  }

  record(now, sim, draw, ui) {
    if (this.lastNow && this.prev) {
      const gap = now - this.lastNow;
      if (gap > LONG_FRAME_MS && !document.hidden) {
        const ours = this.prev.sim + this.prev.draw + this.prev.ui;
        this.long.push({
          at: now, gap,
          sim: this.prev.sim, draw: this.prev.draw, ui: this.prev.ui,
          browser: Math.max(0, gap - ours - 16.7),
        });
        if (this.long.length > 50) this.long.shift();
      }
    }
    this.lastNow = now;
    this.prev = { sim, draw, ui };
    this.frames.push({ now, sim, draw, ui });
    if (this.frames.length > WINDOW) this.frames.shift();
  }

  toggle(world) {
    this.visible = !this.visible;
    this.el.hidden = !this.visible;
    if (this.visible) this.render(world);
  }

  render(world) {
    const f = this.frames;
    if (f.length < 2) return;
    const span = (f[f.length - 1].now - f[0].now) / 1000;
    const avg = (k) => (f.reduce((s, x) => s + x[k], 0) / f.length).toFixed(1);
    const max = (k) => Math.max(...f.map((x) => x[k])).toFixed(1);
    const recent = this.long.filter((l) => performance.now() - l.at < 60000);
    const rows = recent.slice(-4).reverse().map((l) =>
      `<div>${Math.round(l.gap)} ms · sim ${l.sim.toFixed(0)} · draw ${l.draw.toFixed(0)} · ui ${l.ui.toFixed(0)} · <b>browser ${Math.round(l.browser)}</b></div>`
    ).join('');
    this.el.innerHTML = `
      <div class="perf-title">Performance <span>P to hide</span></div>
      <div>${((f.length - 1) / span).toFixed(0)} fps · ${world.creatures.length} creatures · year ${T.yearOf(world.tick)}</div>
      <div>sim ${avg('sim')} ms (max ${max('sim')}) · draw ${avg('draw')} (max ${max('draw')}) · ui ${avg('ui')} (max ${max('ui')})</div>
      <div class="perf-long">Long frames in the last minute: ${recent.length}</div>
      ${rows}`;
  }
};
