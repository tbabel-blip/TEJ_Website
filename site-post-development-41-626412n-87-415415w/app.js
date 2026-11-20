(function () {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const D = window.SITE_DATA;
  const RATE = 1.0;
  const state = { view: 'v3d', night: false, playing: false, simT: 84 };

  // ---------- tabs & mode ----------
  function show(v) {
    state.view = v;
    document.querySelectorAll('section.view').forEach(s => s.classList.toggle('on', s.id === v));
    document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.v === v));
    if (v === 'v2d') { if (!plan) plan = Plan2D.build($('#planwrap')); if (R) Plan2D.setBase(plan, R, state.night); }
    try { history.replaceState(null, '', '#' + ({ vbefore: 'site-today', v2d: 'site-plan', v3d: 'model' })[v]); } catch (e) { }
  }
  document.querySelectorAll('#tabs button').forEach(b => b.onclick = () => show(b.dataset.v));
  document.querySelectorAll('[data-go]').forEach(b => b.onclick = () => show(b.dataset.go));
  function setMode(m) {
    state.night = m === 'night';
    document.body.classList.toggle('night', state.night);
    document.querySelectorAll('#mode button').forEach(b => b.classList.toggle('on', b.dataset.m === m));
    if (R) R.night = state.night;
    if (plan && R && state.view === 'v2d') Plan2D.setBase(plan, R, state.night);
  }
  document.querySelectorAll('#mode button').forEach(b => b.onclick = () => setMode(b.dataset.m));

  // ---------- 3D ----------
  let R = null, scene = null, plan = null;
  const canvas = $('#gl');
  try { scene = Scene3D.build(); R = new Renderer3D(canvas, scene); }
  catch (e) { console.error(e); $('#fallback').style.display = 'flex'; }

  const GCX = (D.X0 + D.X1) / 2, GS = Math.max(D.W, D.DP) / 600;
  const PRESETS = {
    hero: { target: [GCX - 15, 8, -D.DP * 0.42], yaw: -0.42, pitch: 0.55, dist: 900 * GS },
    gate: { target: [296, 6, -58], yaw: 0.58, pitch: 0.3, dist: 235 },
    yard: { target: [GCX, 6, -D.DP * 0.4], yaw: 2.62, pitch: 0.36, dist: 600 * GS },
    top: { target: [GCX, 0, -D.DP * 0.46], yaw: 0.0001, pitch: 1.45, dist: 1250 * GS },
  };
  let camAnim = null;
  function presetFor(name) {
    const p = JSON.parse(JSON.stringify(PRESETS[name]));
    const asp = canvas.clientWidth / Math.max(1, canvas.clientHeight);
    if (asp < 1.2) p.dist *= Math.min(2.1, 1.25 / Math.max(asp, 0.4));
    return p;
  }
  function goCam(name) {
    if (!R) return; zoomGoal = null; zoomAnchor = null; goalYaw = goalPitch = null; vel = { yaw: 0, pitch: 0, px: 0, py: 0 };
    const to = presetFor(name), from = { target: R.cam.target.slice(), yaw: R.cam.yaw, pitch: R.cam.pitch, dist: R.cam.dist };
    let dy = to.yaw - from.yaw; while (dy > Math.PI) dy -= 2 * Math.PI; while (dy < -Math.PI) dy += 2 * Math.PI;
    camAnim = { from, to: Object.assign({}, to, { yaw: from.yaw + dy }), t0: performance.now(), dur: 1400 };
    document.querySelectorAll('[data-cam]').forEach(b => b.classList.toggle('on', b.dataset.cam === name));
  }
  document.querySelectorAll('[data-cam]').forEach(b => b.onclick = () => goCam(b.dataset.cam));
  if (R) Object.assign(R.cam, presetFor('hero'));

  // dock toggles
  $('#bPlay').onclick = () => {
    state.playing = !state.playing; $('#bPlay').classList.toggle('on', state.playing);
    $('#playIco').setAttribute('d', state.playing ? 'M7 5h3.5v14H7zM13.5 5H17v14h-3.5z' : 'M7 4.5v15l12-7.5z');
    $('#playTxt').textContent = state.playing ? 'Pause truck movement' : 'Play truck movement';
    $('#status').style.display = state.playing ? '' : 'none'; document.body.classList.toggle('paused', !state.playing);
  };

  // orbit controls — free orbit, zoom toward the cursor, gentle inertia, wide pan bounds
  const LIM = { dMin: 16, dMax: 4200, pMin: 0.02, pMax: 1.55, x0: -1600, x1: 2200, z0: -2200, z1: 1300 };
  let vel = { yaw: 0, pitch: 0, px: 0, py: 0 };
  let pivot = null, qTimer = null;
  function lowQ() { }   // full quality at all times
  let goalYaw = null, goalPitch = null;
  // orbit about the ground point under the cursor (Google-Earth style)
  function yawAbout(dyaw, p) {
    if (p) { const ox = R.cam.target[0] - p[0], oz = R.cam.target[2] - p[2], c = Math.cos(dyaw), s = Math.sin(dyaw);
      R.cam.target[0] = p[0] + ox * c + oz * s; R.cam.target[2] = p[2] + oz * c - ox * s; }
    R.cam.yaw += dyaw;
  }
  function groundAt(cx, cy) {
    if (!R.VP) return null; const r = canvas.getBoundingClientRect();
    const nx = (cx - r.left) / r.width * 2 - 1, ny = 1 - (cy - r.top) / r.height * 2;
    const inv = M4.inv(R.VP); const a = M4.xf(inv, [nx, ny, -1]), b = M4.xf(inv, [nx, ny, 1]);
    const dy = b[1] - a[1]; if (Math.abs(dy) < 1e-6) return null; const t = -a[1] / dy; if (t < 0) return null;
    return [a[0] + (b[0] - a[0]) * t, 0, a[2] + (b[2] - a[2]) * t];
  }
  function clampCam() {
    R.cam.dist = Math.max(LIM.dMin, Math.min(LIM.dMax, R.cam.dist));
    R.cam.pitch = Math.max(LIM.pMin, Math.min(LIM.pMax, R.cam.pitch));
    R.cam.target[0] = Math.max(LIM.x0, Math.min(LIM.x1, R.cam.target[0])); R.cam.target[2] = Math.max(LIM.z0, Math.min(LIM.z1, R.cam.target[2]));
    R.cam.target[1] = Math.max(2, Math.min(40, R.cam.target[1]));
  }
  function pan(dx, dy) {
    const k = R.cam.dist * 0.0017 / Math.max(0.35, Math.sin(R.cam.pitch) + 0.25); const c = Math.cos(R.cam.yaw), s = Math.sin(R.cam.yaw);
    R.cam.target[0] += (-dx * c - dy * s) * k; R.cam.target[2] += (dx * s - dy * c) * k; clampCam();
  }
  // smooth zoom: inputs set a goal distance + ground anchor; the frame loop eases toward it
  let zoomGoal = null, zoomAnchor = null;
  function zoomAt(factor, cx, cy) {
    if (!R) return;
    camAnim = null;
    const base = zoomGoal !== null ? zoomGoal : R.cam.dist;
    zoomGoal = Math.max(LIM.dMin, Math.min(LIM.dMax, base * factor));
    if (cx !== undefined) { const g = groundAt(cx, cy); if (g) zoomAnchor = g; } else zoomAnchor = null;
  }
  function zoomStep(dt) {
    if (zoomGoal === null || !R) return;
    const old = R.cam.dist, k = 1 - Math.exp(-dt * 11);
    let nd = old + (zoomGoal - old) * k;
    const done = Math.abs(zoomGoal - nd) < Math.max(0.02, zoomGoal * 0.002);
    if (done) nd = zoomGoal;
    R.cam.dist = nd;
    if (zoomAnchor) { const f = 1 - nd / old; R.cam.target[0] += (zoomAnchor[0] - R.cam.target[0]) * f; R.cam.target[2] += (zoomAnchor[2] - R.cam.target[2]) * f; }
    clampCam();
    if (done) { zoomGoal = null; zoomAnchor = null; }
  }
  if (R) {
    let drag = null; const ptrs = new Map();
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    canvas.addEventListener('pointerdown', e => {
      canvas.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, [e.clientX, e.clientY]);
      drag = { pan: e.button === 2 || e.button === 1 || e.shiftKey || e.ctrlKey || e.metaKey };
      pivot = drag.pan ? null : (groundAt(e.clientX, e.clientY) || null); lowQ();
      camAnim = null; vel = { yaw: 0, pitch: 0, px: 0, py: 0 }; canvas.classList.add('drag');
      goalYaw = R.cam.yaw; goalPitch = R.cam.pitch;
    });
    canvas.addEventListener('pointermove', e => {
      if (!ptrs.has(e.pointerId)) return;
      const prev = ptrs.get(e.pointerId); ptrs.set(e.pointerId, [e.clientX, e.clientY]);
      if (ptrs.size === 2) {
        const [a, b] = [...ptrs.values()]; const other = [...ptrs.entries()].find(([k]) => k !== e.pointerId)[1];
        const d1 = Math.hypot(prev[0] - other[0], prev[1] - other[1]), d2 = Math.hypot(a[0] - b[0], a[1] - b[1]);
        if (d1 > 0 && d2 > 0) zoomAt(d1 / d2, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
        pan((e.clientX - prev[0]) / 2, (e.clientY - prev[1]) / 2);
        return;
      }
      const dx = e.clientX - prev[0], dy = e.clientY - prev[1];
      if (drag && drag.pan) { pan(dx, dy); vel.px = dx; vel.py = dy; }
      else { if (goalYaw === null) { goalYaw = R.cam.yaw; goalPitch = R.cam.pitch; } goalYaw += -dx * 0.0052; goalPitch = Math.max(LIM.pMin, Math.min(LIM.pMax, goalPitch + dy * 0.0042)); vel.yaw = -dx * 0.0052; vel.pitch = dy * 0.0042; }
      lowQ();
    });
    const up = e => { ptrs.delete(e.pointerId); if (!ptrs.size) { drag = null; canvas.classList.remove('drag'); } };
    canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('wheel', e => {
      e.preventDefault(); lowQ();
      let dy = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1);
      const k = e.ctrlKey ? 0.012 : 0.0016;                       // trackpad pinch arrives as ctrl+wheel
      zoomAt(Math.exp(Math.max(-0.6, Math.min(0.6, dy * k))), e.clientX, e.clientY);
    }, { passive: false });
    canvas.addEventListener('dblclick', e => { const g = groundAt(e.clientX, e.clientY); if (!g) return; camAnim = { from: { target: R.cam.target.slice(), yaw: R.cam.yaw, pitch: R.cam.pitch, dist: R.cam.dist }, to: { target: [g[0], 6, g[2]], yaw: R.cam.yaw, pitch: R.cam.pitch, dist: Math.max(LIM.dMin, R.cam.dist * 0.55) }, t0: performance.now(), dur: 900 }; });
  }
  function inertia(dt) {
    if (!R) return;
    if (drag_idle() && goalYaw !== null && Math.abs(vel.yaw) + Math.abs(vel.pitch) > 2e-5) {   // gentle ease-out after release
      goalYaw += vel.yaw; goalPitch = Math.max(LIM.pMin, Math.min(LIM.pMax, goalPitch + vel.pitch)); vel.yaw *= 0.88; vel.pitch *= 0.88;
    }
    if (goalYaw !== null) {                                       // camera glides toward the goal, pivoting on the point under the cursor
      const k = 1 - Math.exp(-(dt || 0.016) * 16);
      yawAbout((goalYaw - R.cam.yaw) * k, pivot); R.cam.pitch += (goalPitch - R.cam.pitch) * k; clampCam();
      if (drag_idle() && Math.abs(goalYaw - R.cam.yaw) < 1e-4 && Math.abs(goalPitch - R.cam.pitch) < 1e-4 && Math.abs(vel.yaw) + Math.abs(vel.pitch) <= 2e-5) goalYaw = goalPitch = null;
    }
    if (drag_idle() && Math.abs(vel.px) + Math.abs(vel.py) > 0.05) { pan(vel.px, vel.py); vel.px *= 0.88; vel.py *= 0.88; }
  }
  function drag_idle() { return !canvas.classList.contains('drag'); }

  // status text
  const stages = (function () {
    const out = []; let last = null;
    for (let t = 0; t < SiteSim.TOTAL; t += 0.1) { const p = SiteSim.pose(t).phase; if (p !== last) { out.push([t, p]); last = p; } }
    return out;
  })();
  function stageText(t) { return SiteSim.status(t); }

  // ---------- loop ----------
  const QS = new URLSearchParams(location.search); const MAXF = +(QS.get('frames') || 0); let nF = 0;
  if (QS.get('t')) state.simT = +QS.get('t'); if (QS.get('night')) setTimeout(() => setMode('night')); if (QS.get('cam')) setTimeout(() => { Object.assign(R.cam, JSON.parse(JSON.stringify(PRESETS[QS.get('cam')]))); });
  let lastT = performance.now();
  function loop(now) {
    if (MAXF && ++nF > MAXF) return;
    if (MAXF) now = lastT + 1;
    const real = Math.max(0, (now - lastT) / 1000); lastT = now;
    const dt = Math.min(0.1, real);                       // camera smoothing step
    // animation clock uses real elapsed time, so 1x / 2x / 4x hold their pace at any frame rate
    if (state.playing && !state.scrubbing) state.simT = (state.simT + Math.min(real, 0.5) * (state.rate || RATE)) % SiteSim.TOTAL;
    const pose = SiteSim.pose(state.simT), arm = SiteSim.arm(state.simT), veh = SiteSim.vehicles(state.simT), door = SiteSim.door(state.simT);
    if (state.view === 'v3d' && R && !document.hidden) {
      if (camAnim) {
        const k = Math.min(1, (now - camAnim.t0) / camAnim.dur), e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
        const f = camAnim.from, t = camAnim.to;
        R.cam.target = f.target.map((v, i) => v + (t.target[i] - v) * e);
        R.cam.yaw = f.yaw + (t.yaw - f.yaw) * e; R.cam.pitch = f.pitch + (t.pitch - f.pitch) * e; R.cam.dist = f.dist + (t.dist - f.dist) * e;
        if (k >= 1) camAnim = null;
      }
      if (!state.sv && !camAnim) { inertia(dt); zoomStep(dt); }
      if (window.__svTick) window.__svTick(dt);
      R.frame({ pose, arm, veh, door, doors: SiteSim.doors ? SiteSim.doors(state.simT) : null, bayX: SiteSim.BAY_X, doorY: SiteSim.DOOR_Y }, now / 1000);
      $('#statusTxt').textContent = stageText(state.simT);
    }
    if (state.view === 'v2d' && plan) Plan2D.update(plan, pose, arm, state.night, veh);
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  const h = (location.hash || '').slice(1);
  if (h === 'site-plan') show('v2d'); else if (h === 'site-today') show('vbefore');
  window.__app = { state, show, setMode, goCam, R: () => R };
})();
