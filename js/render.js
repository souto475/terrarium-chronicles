'use strict';
// Draws the world on the canvas, with a camera (zoom and pan).

const HUE_BUCKETS = 72; // 5° each: indistinguishable from exact colors at this size
const HUNTER_RING = 'rgba(228, 88, 72, 0.9)';
const BUCKET_COLORS = [];
for (let i = 0; i < HUE_BUCKETS; i++) BUCKET_COLORS.push(T.hueColor(i * (360 / HUE_BUCKETS)));

T.Renderer = class {
  constructor(canvas) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d');
    this.cam = { x: 0, y: 0, z: 1 };
    this.dpr = 1;
    this.selected = null;
    this.dragging = false;
    new ResizeObserver(() => {
      if (!this.w) return;
      const wasFit = this.cam.z <= this.fitZoom() * 1.001;
      this.resize();
      if (wasFit) this.fit();
    }).observe(canvas);
  }

  setWorld(w) {
    this.w = w;
    this.foodCv = document.createElement('canvas');
    this.foodCv.width = w.cols;
    this.foodCv.height = w.rows;
    this.foodCtx = this.foodCv.getContext('2d');
    this.img = this.foodCtx.createImageData(w.cols, w.rows);
    this.foodTick = -1;
    this.foodAt = 0;
    this.resize();
    this.fit();
  }

  resize() {
    const r = this.cv.getBoundingClientRect();
    this.dpr = window.devicePixelRatio || 1;
    this.cw = r.width;
    this.ch = r.height;
    this.cv.width = Math.round(r.width * this.dpr);
    this.cv.height = Math.round(r.height * this.dpr);
  }

  // Zoom level at which the whole map fits the screen. It is also the minimum zoom.
  fitZoom() {
    if (!this.w || !this.cw) return 1;
    return Math.min(this.cw / this.w.W, this.ch / this.w.H) * 0.94;
  }

  fit() {
    this.cam.z = this.fitZoom();
    this.cam.x = this.w.W / 2;
    this.cam.y = this.w.H / 2;
  }

  screenToWorld(sx, sy) {
    return {
      x: (sx - this.cw / 2) / this.cam.z + this.cam.x,
      y: (sy - this.ch / 2) / this.cam.z + this.cam.y,
    };
  }

  zoomAt(sx, sy, factor) {
    const before = this.screenToWorld(sx, sy);
    this.cam.z = T.clamp(this.cam.z * factor, this.fitZoom(), 12);
    const after = this.screenToWorld(sx, sy);
    this.cam.x += before.x - after.x;
    this.cam.y += before.y - after.y;
    this.constrain(true);
  }

  // Keeps the map on screen. On an axis where the whole map fits, it glides back to the
  // center; where it doesn't, the view can pan but never past the map's edge.
  constrain(hard) {
    const cam = this.cam, w = this.w;
    const pad = 24 / cam.z;
    const axis = (pos, viewSize, mapSize) => {
      const half = viewSize / cam.z / 2;
      const target = half * 2 >= mapSize ? mapSize / 2 : T.clamp(pos, half - pad, mapSize - half + pad);
      return hard ? target : pos + (target - pos) * 0.2;
    };
    cam.x = axis(cam.x, this.cw, w.W);
    cam.y = axis(cam.y, this.ch, w.H);
  }

  updateFood() {
    const w = this.w, d = this.img.data, max = T.CFG.foodMax;
    // Winter pulls the green toward cooler, drier tones.
    const g = w.growth() / (1 + w.climate);
    const vr = T.lerp(62, 86, g), vg = T.lerp(104, 150, g), vb = T.lerp(70, 62, g);
    for (let i = 0; i < w.food.length; i++) {
      const f = w.fert[i], a = w.food[i] / max;
      const sr = 30 + 12 * f, sg = 27 + 14 * f, sb = 24 + 6 * f;
      const k = Math.min(1, a * 1.15);
      const p = i * 4;
      d[p] = sr + (vr - sr) * k;
      d[p + 1] = sg + (vg - sg) * k;
      d[p + 2] = sb + (vb - sb) * k;
      d[p + 3] = 255;
    }
    this.foodCtx.putImageData(this.img, 0, 0);
  }

  // Creatures are grouped into hue buckets and each bucket is drawn as a single path:
  // a few dozen fill calls per frame instead of one (or three) per creature.
  drawCreatures() {
    const ctx = this.ctx, cam = this.cam, TAU = Math.PI * 2;
    if (!this.buckets) this.buckets = Array.from({ length: HUE_BUCKETS }, () => []);
    const buckets = this.buckets;
    for (const b of buckets) b.length = 0;

    // Only draw what's on screen.
    const tl = this.screenToWorld(0, 0), br = this.screenToWorld(this.cw, this.ch);
    for (const c of this.w.creatures) {
      if (c.x < tl.x - 10 || c.x > br.x + 10 || c.y < tl.y - 10 || c.y > br.y + 10) continue;
      buckets[Math.round(c.genes.hue / (360 / HUE_BUCKETS)) % HUE_BUCKETS].push(c);
    }

    const detail = cam.z > 0.9;
    ctx.lineWidth = Math.max(0.6, 1 / cam.z);
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.55)';
    for (let i = 0; i < HUE_BUCKETS; i++) {
      const b = buckets[i];
      if (!b.length) continue;
      ctx.fillStyle = BUCKET_COLORS[i];
      ctx.beginPath();
      for (const c of b) {
        ctx.moveTo(c.x + c.radius, c.y);
        ctx.arc(c.x, c.y, c.radius, 0, TAU);
      }
      ctx.fill();
      if (detail) ctx.stroke();
    }

    // Hunters wear a red ring, visible at any zoom.
    ctx.strokeStyle = HUNTER_RING;
    ctx.lineWidth = Math.max(1.2, 1.6 / cam.z);
    ctx.beginPath();
    for (const b of buckets) {
      for (const c of b) {
        if (!c.isHunter) continue;
        const rr = c.radius + Math.max(1.5, 2 / cam.z);
        ctx.moveTo(c.x + rr, c.y);
        ctx.arc(c.x, c.y, rr, 0, TAU);
      }
    }
    ctx.stroke();

    if (detail) {
      ctx.fillStyle = 'rgba(10, 12, 10, 0.85)';
      ctx.beginPath();
      for (const b of buckets) {
        for (const c of b) {
          const ex = c.x + Math.cos(c.heading) * c.radius * 0.55;
          const ey = c.y + Math.sin(c.heading) * c.radius * 0.55;
          const er = c.radius * 0.28;
          ctx.moveTo(ex + er, ey);
          ctx.arc(ex, ey, er, 0, TAU);
        }
      }
      ctx.fill();
    }
  }

  draw() {
    const ctx = this.ctx, w = this.w, cam = this.cam;
    if (!this.dragging) this.constrain(false);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = '#0b0d0c';
    ctx.fillRect(0, 0, this.cw, this.ch);

    ctx.translate(this.cw / 2, this.ch / 2);
    ctx.scale(cam.z, cam.z);
    ctx.translate(-cam.x, -cam.y);

    // Vegetation changes slowly: re-upload its image at most ~10 times a second.
    const now = performance.now();
    if (w.tick !== this.foodTick && now - this.foodAt > 100) {
      this.updateFood();
      this.foodTick = w.tick;
      this.foodAt = now;
    }
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.foodCv, 0, 0, w.W, w.H);
    ctx.strokeStyle = 'rgba(230, 226, 214, 0.12)';
    ctx.lineWidth = 1 / cam.z;
    ctx.strokeRect(0, 0, w.W, w.H);
    this.drawCreatures();

    const s = this.selected;
    if (s && s.alive) {
      ctx.setLineDash([4 / cam.z, 4 / cam.z]);
      ctx.strokeStyle = 'rgba(230, 226, 214, 0.35)';
      ctx.lineWidth = 1 / cam.z;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.genes.sense, 0, Math.PI * 2);
      ctx.stroke();
      if (s.hasTarget) {
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(s.tx, s.ty);
        ctx.stroke();
      }
      ctx.setLineDash([]);
      ctx.strokeStyle = '#e8b85a';
      ctx.lineWidth = 2 / cam.z;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.radius + 4 / cam.z, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
};
