'use strict';
// Main loop and user input.

(function () {
  const canvas = document.getElementById('world');
  const renderer = new T.Renderer(canvas);
  let world = null;
  let speed = 1;
  let paused = false;
  let follow = false;
  let lastUI = 0;
  // Ticks actually simulated per frame, smoothed: at high speed with a big population
  // the time budget caps the real speed, and the panel shows it.
  let actualTicks = 1;

  const SIM_BUDGET_MS = 9;

  const ui = new T.UI({
    toggleFollow: () => { follow = !follow; },
    isFollowing: () => follow,
    deselect: () => select(null),
  });

  function select(c) {
    renderer.selected = c;
    if (!c) follow = false;
    ui.updateInspector(c);
  }

  function newWorld(seed) {
    world = new T.World(seed);
    renderer.setWorld(world);
    select(null);
    ui.bindWorld(world);
    ui.update(null, paused, speed);
    history.replaceState(null, '', '#' + world.seed);
  }

  function setSpeed(s) {
    speed = s;
    document.querySelectorAll('#speedSeg button').forEach((b) => {
      b.classList.toggle('on', +b.dataset.speed === s);
    });
  }

  function randomSeed() {
    return Math.floor(Math.random() * 999999) + 1;
  }

  function frame(now) {
    if (!paused) {
      // Time budget: at high speeds, simulate as many ticks as fit in the frame,
      // leaving room for drawing so the animation stays smooth.
      const t0 = performance.now();
      let n = 0;
      while (n < speed) {
        world.step();
        n++;
        if (performance.now() - t0 > SIM_BUDGET_MS) break;
      }
      actualTicks += (n - actualTicks) * 0.1;
    }
    const s = renderer.selected;
    if (follow && s && s.alive) {
      renderer.cam.x += (s.x - renderer.cam.x) * 0.15;
      renderer.cam.y += (s.y - renderer.cam.y) * 0.15;
    } else if (follow && s && !s.alive) {
      follow = false;
    }
    renderer.draw();
    if (now - lastUI > 250) {
      ui.update(renderer.selected, paused, Math.max(1, Math.round(actualTicks)));
      lastUI = now;
    }
    requestAnimationFrame(frame);
  }

  // ---------- Controls ----------

  document.getElementById('playBtn').onclick = () => {
    paused = !paused;
    ui.update(renderer.selected, paused, Math.round(actualTicks));
  };
  document.querySelectorAll('#speedSeg button').forEach((b) => {
    b.onclick = () => setSpeed(+b.dataset.speed);
  });
  document.getElementById('newBtn').onclick = () => {
    const v = parseInt(document.getElementById('seedInput').value, 10);
    newWorld(Number.isFinite(v) && v > 0 ? v : randomSeed());
  };
  document.getElementById('diceBtn').onclick = () => newWorld(randomSeed());
  document.getElementById('seedInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('newBtn').click();
  });

  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return;
    if (e.code === 'Space') { e.preventDefault(); document.getElementById('playBtn').click(); }
    else if (e.key >= '1' && e.key <= '4') setSpeed([1, 4, 16, 64][+e.key - 1]);
    else if (e.key === '0') renderer.fit();
    else if (e.key === 'f' || e.key === 'F') { if (renderer.selected) follow = !follow; }
    else if (e.key === 'Escape') select(null);
  });

  // ---------- Camera and selection ----------

  let drag = null;
  canvas.addEventListener('pointerdown', (e) => {
    drag = { x: e.clientX, y: e.clientY, cx: renderer.cam.x, cy: renderer.cam.y, moved: false };
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) > 4) {
      drag.moved = true;
      follow = false;
      renderer.dragging = true;
      canvas.classList.add('dragging');
    }
    if (drag.moved) {
      renderer.cam.x = drag.cx - dx / renderer.cam.z;
      renderer.cam.y = drag.cy - dy / renderer.cam.z;
    }
  });
  const endDrag = (e) => {
    if (drag && !drag.moved && e.type === 'pointerup') {
      const r = canvas.getBoundingClientRect();
      const p = renderer.screenToWorld(e.clientX - r.left, e.clientY - r.top);
      select(world.creatureAt(p.x, p.y, 14 / renderer.cam.z));
    }
    drag = null;
    renderer.dragging = false;
    canvas.classList.remove('dragging');
  };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const r = canvas.getBoundingClientRect();
    renderer.zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.0015));
  }, { passive: false });

  // Handle for poking at the simulation from the browser console.
  window.terrarium = { get world() { return world; }, renderer };

  const fromHash = parseInt(location.hash.slice(1), 10);
  setSpeed(1);
  newWorld(Number.isFinite(fromHash) && fromHash > 0 ? fromHash : randomSeed());
  requestAnimationFrame(frame);
})();
