// Street View (curbside, eye-level) + truck timeline (play / scrub / ±10 s / 1× 2× 4×)
(function () {
  'use strict';
  const app = window.__app; if (!app) return;
  const state = app.state, R = app.R();
  const $ = (s) => document.querySelector(s);
  const canvas = $('#gl');
  const SIM = window.SiteSim, TOTAL = SIM.TOTAL;
  const ARM_SITE = (function () { for (let t = 0; t < TOTAL; t += 0.5) if (SIM.pose(t).phase === 'gateIn') return true; return false; })();

  // ================= TIMELINE =================
  state.rate = 1;
  const marks = (function () {
    const out = [['Arriving', 0]]; let entered = false, rev = false, park = false, leave = false, prevPh = null;
    for (let t = 0; t < TOTAL; t += 0.1) {
      const p = SIM.pose(t);
      if (!entered && (p.phase === 'gateIn' || p.front[1] > -10)) { out.push(['Entering', Math.max(0, t - 1)]); entered = true; }
      if (!rev && p.phase === 'reversing') { out.push(['Backing in', t]); rev = true; }
      if (!park && p.phase === 'parked') { out.push(['Parked', t]); park = true; }
      if (park && !leave && prevPh === 'parked' && p.phase !== 'parked') { out.push(['Leaving', t]); leave = true; }
      prevPh = p.phase;
    }
    return out;
  })();
  const tl = document.createElement('div');
  tl.className = 'card timeline'; tl.id = 'timeline';
  tl.innerHTML = `
    <button class="tl-btn" id="tlBack" title="Back 10 s"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 17l-5-5 5-5"/><path d="M18 17l-5-5 5-5"/></svg><span>10s</span></button>
    <button class="tl-play" id="tlPlay" title="Play / pause"><svg viewBox="0 0 24 24" fill="currentColor"><path id="tlIco" d="M7 4.5v15l12-7.5z"/></svg></button>
    <button class="tl-btn" id="tlFwd" title="Forward 10 s"><span>10s</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 17l5-5-5-5"/><path d="M6 17l5-5-5-5"/></svg></button>
    <div class="tl-track">
      <input type="range" id="tlRange" min="0" max="${TOTAL.toFixed(2)}" step="0.05" value="0">
      <div class="tl-marks">${(function () { let last = -1e9, row = 0; return marks.map(([n, t]) => { const pct = t / TOTAL * 100; row = (pct - last < 17) ? 1 - row : 0; last = pct; return `<button class="tl-mark${row ? ' r2' : ''}" data-t="${t.toFixed(2)}" style="left:${pct.toFixed(2)}%"><i></i><span>${n}</span></button>`; }).join(''); })()}</div>
    </div>
    <span class="tl-time" id="tlTime">0:00</span>
    <div class="tl-speed">${[1, 2, 4].map(s => `<button data-rate="${s}" class="${s === 1 ? 'on' : ''}">${s}×</button>`).join('')}</div>`;
  $('main').appendChild(tl);
  const css = document.createElement('style');
  css.textContent = `
  .timeline{position:fixed;left:50%;transform:translateX(-50%);bottom:84px;display:flex;align-items:center;gap:8px;padding:8px 12px 8px 8px;width:min(860px,calc(100vw - 40px));z-index:6}
  body.v-today .timeline{display:none}
  .plan .route-in,.plan .route-out{animation-duration:calc(1.2s / var(--rate, 1))!important}
  body.v-plan .timeline{left:calc((100vw - 360px)/2);width:min(760px,calc(100vw - 400px));bottom:22px}
  .tl-play{all:unset;cursor:pointer;width:38px;height:38px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:var(--brand);color:#fff;flex:none;box-shadow:0 4px 14px rgba(255,86,35,.35)}
  .tl-play svg{width:18px;height:18px}
  .tl-btn{all:unset;cursor:pointer;display:flex;align-items:center;gap:2px;padding:7px 8px;border-radius:10px;font-size:11.5px;font-weight:800;color:var(--ink-2);flex:none}
  .tl-btn:hover{background:rgba(127,127,127,.14)} .tl-btn svg{width:15px;height:15px}
  .tl-track{position:relative;flex:1;min-width:120px;padding:0 6px 30px}
  .tl-track input{width:100%;margin:6px 0 0;accent-color:var(--brand);cursor:pointer}
  .tl-marks{position:absolute;left:6px;right:6px;top:22px;height:18px}
  .tl-mark{all:unset;cursor:pointer;position:absolute;transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;font-size:10px;font-weight:700;color:var(--mute);white-space:nowrap}
  .tl-mark i{width:2px;height:5px;background:var(--mute);border-radius:1px;margin-bottom:1px}
  .tl-mark.r2 i{height:17px}
  .tl-mark:hover{color:var(--brand)}
  .tl-mark:first-child{transform:none;align-items:flex-start}
  .tl-time{font-size:12px;font-weight:800;color:var(--ink-2);min-width:76px;text-align:right;font-variant-numeric:tabular-nums;flex:none}
  .tl-speed{display:flex;gap:2px;padding:3px;border-radius:999px;border:1px solid var(--line);flex:none}
  .tl-speed button{all:unset;cursor:pointer;padding:5px 9px;border-radius:999px;font-size:12px;font-weight:800;color:var(--mute)}
  .tl-speed button.on{background:var(--ink);color:var(--paper)}
  body.night .tl-speed button.on{background:#fff;color:#0b1220}

  /* street view */
  body.sv .stats, body.sv .hint, body.sv #dock [data-cam], body.sv #dock .sep, body.sv .vignette{display:none!important}
  .svpanel{position:absolute;left:22px;top:20px;padding:14px 14px 12px;width:250px;display:none;z-index:5}
  body.sv .svpanel{display:block}
  .svpanel .eyebrow{font-size:11px;font-weight:800;letter-spacing:.16em;color:var(--brand);text-transform:uppercase}
  .svpanel h3{margin:4px 0 10px;font-size:16px;font-weight:800}
  .svpanel .spots{display:flex;flex-direction:column;gap:4px}
  .svpanel .spots button{all:unset;cursor:pointer;padding:8px 10px;border-radius:10px;font-size:13px;font-weight:700;color:var(--ink-2);background:rgba(127,127,127,.08)}
  .svpanel .spots button:hover{background:rgba(127,127,127,.18)}
  .svpanel .svhelp{margin-top:10px;font-size:11.5px;color:var(--mute);font-weight:600;line-height:1.45}
  .svexit{all:unset;cursor:pointer;margin-top:10px;display:block;text-align:center;padding:9px;border-radius:10px;background:var(--ink);color:var(--paper);font-weight:800;font-size:13px}
  body.night .svexit{background:#fff;color:#0b1220}
  .svlayer{position:absolute;inset:0;pointer-events:none;overflow:hidden;display:none}
  body.sv .svlayer{display:block}
  .svarrow{position:absolute;width:76px;height:76px;margin:-38px 0 0 -38px;pointer-events:auto;cursor:pointer;opacity:.92;transition:opacity .15s}
  .svarrow:hover{opacity:1}
  .svarrow svg{width:100%;height:100%;filter:drop-shadow(0 2px 4px rgba(0,0,0,.55))}
  .svcursor{position:absolute;width:46px;height:20px;margin:-10px 0 0 -23px;border-radius:50%;border:2.5px solid #fff;box-shadow:0 0 0 1px rgba(0,0,0,.35),inset 0 0 0 1px rgba(0,0,0,.25);display:none;pointer-events:none}
  #dock button#bSV.on{background:var(--brand);color:#fff}
  @media (max-width:980px){ .timeline{bottom:auto;top:76px;gap:4px;padding:6px;width:calc(100vw - 20px)} .tl-time{display:none} .tl-mark span{display:none} .tl-track{padding-bottom:8px} .tl-btn span{display:none} .tl-btn{padding:6px 4px} .tl-play{width:32px;height:32px} .tl-speed button{padding:4px 7px}
    body.v-plan .timeline{left:50%;width:calc(100vw - 20px)}
    .svpanel{top:136px;left:10px;right:10px;width:auto;padding:10px} .svpanel h3,.svpanel .svhelp{display:none} .svpanel .spots{flex-direction:row;overflow-x:auto} .svpanel .spots button{white-space:nowrap;flex:none} .svexit{margin-top:8px} }
  `;
  document.head.appendChild(css);
  // replace the old dock play button (timeline owns playback)
  const oldPlay = $('#bPlay'); if (oldPlay) { const sep = oldPlay.nextElementSibling; oldPlay.remove(); if (sep && sep.classList.contains('sep')) sep.remove(); }
  const range = $('#tlRange');
  function setPlaying(p) {
    state.playing = p;
    $('#tlIco').setAttribute('d', p ? 'M7 5h3.5v14H7zM13.5 5H17v14h-3.5z' : 'M7 4.5v15l12-7.5z');
    const st = $('#status'); if (st) st.style.display = p ? '' : 'none';
    document.body.classList.toggle('paused', !p);
  }
  setPlaying(!!state.playing);
  const wrapT = (t) => ((t % TOTAL) + TOTAL) % TOTAL;
  $('#tlPlay').onclick = () => setPlaying(!state.playing);
  $('#tlBack').onclick = () => { state.simT = wrapT(state.simT - 10); };
  $('#tlFwd').onclick = () => { state.simT = wrapT(state.simT + 10); };
  // scrubbing: the clock is held while dragging (play state is untouched), released cleanly on any kind of release
  let scrubbing = false;
  const startScrub = () => { scrubbing = true; state.scrubbing = true; };
  const endScrub = () => { if (!scrubbing) return; scrubbing = false; state.scrubbing = false; };
  range.addEventListener('pointerdown', startScrub);
  range.addEventListener('input', () => { state.simT = Math.min(TOTAL - 0.01, Math.max(0, +range.value)); });
  window.addEventListener('pointerup', endScrub); window.addEventListener('pointercancel', endScrub);
  range.addEventListener('change', endScrub); range.addEventListener('blur', endScrub);
  tl.querySelectorAll('.tl-mark').forEach(b => b.onclick = () => { state.simT = +b.dataset.t; });
  tl.querySelectorAll('[data-rate]').forEach(b => b.onclick = () => { state.rate = +b.dataset.rate; document.body.style.setProperty('--rate', state.rate); tl.querySelectorAll('[data-rate]').forEach(x => x.classList.toggle('on', x === b)); });
  const fmt = (t) => { const m = Math.floor(t / 60), s = Math.floor(t % 60); return m + ':' + String(s).padStart(2, '0'); };
  function viewClass() { document.body.classList.toggle('v-today', state.view === 'vbefore'); document.body.classList.toggle('v-plan', state.view === 'v2d'); }

  // ================= STREET VIEW =================
  const EYE = 5.4, STEP = 14;
  const MAXY = ARM_SITE ? 70 : 8;           // lift-arm sites: up to the arm; open sites: up to the fence line
  function allowed(x, y) {
    if (x >= -160 && x <= 760 && y >= -74 && y <= -4) return true;     // W 145th St, both sidewalks / parkways
    if (x >= 282 && x <= 314 && y > -4 && y <= MAXY) return true;      // entrance drive, up to the entrance point
    return false;
  }
  function clampAllowed(x, y) {
    if (allowed(x, y)) return [x, y];
    if (x >= 270 && x <= 326 && y > -4) return [Math.max(282, Math.min(314, x)), Math.min(MAXY, y)];
    return [Math.max(-160, Math.min(760, x)), Math.max(-74, Math.min(-4, y))];
  }
  const SPOTS = [
    ['West approach', -110, -30, -1.25, 0.04],
    ['Entrance', 298, -12, 0.0, 0.06],
    ['In front of the PEMB', 220, -14, 0.25, 0.02],
    ['East corner', 640, -28, 0.95, 0.03],
    ['Across the street', 300, -68, 0.05, 0.02],
  ];
  const sv = { on: false, x: 298, y: -12, yaw: 0, pitch: 0.05, fov: 1.15, mv: null, saved: null };
  const panel = document.createElement('div'); panel.className = 'card svpanel';
  panel.innerHTML = `<div class="eyebrow">Street View</div><h3>W 145th Street · curbside</h3><div class="spots">${SPOTS.map((s, i) => `<button data-spot="${i}">${s[0]}</button>`).join('')}</div>
    <div class="svhelp">Click the arrows on the ground to move · drag to look around · click the street to jump there · keyboard ↑ ↓ to move, ← → to turn</div><button class="svexit" id="svExit">Exit Street View</button>`;
  $('#v3d').appendChild(panel);
  const layer = document.createElement('div'); layer.className = 'svlayer'; $('#v3d').appendChild(layer);
  const cursor = document.createElement('div'); cursor.className = 'svcursor'; layer.appendChild(cursor);
  const ARW = '<svg viewBox="0 0 64 64"><path d="M32 8 L56 46 L32 36 L8 46 Z" fill="rgba(255,255,255,.95)" stroke="rgba(0,0,0,.35)" stroke-width="1.5" stroke-linejoin="round"/></svg>';
  const arrows = ['f', 'b', 'l', 'r'].map(k => { const a = document.createElement('div'); a.className = 'svarrow'; a.dataset.dir = k; a.innerHTML = ARW; layer.appendChild(a); return a; });
  // dock button
  const dock = $('#dock');
  const bSV = document.createElement('button'); bSV.id = 'bSV';
  bSV.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="3"/><path d="M8.5 9.5h7l-1 6h-1.5L12.5 22h-1L11 15.5H9.5z"/></svg>Street View';
  dock.insertBefore(bSV, dock.firstChild);
  const sp = document.createElement('span'); sp.className = 'sep'; sp.style.display = 'inline-block'; dock.insertBefore(sp, bSV.nextSibling);
  bSV.onclick = () => (sv.on ? exitSV() : enterSV(1));
  $('#svExit').onclick = () => exitSV();
  panel.querySelectorAll('[data-spot]').forEach(b => b.onclick = () => { const s = SPOTS[+b.dataset.spot]; moveTo(s[1], s[2], s[3], s[4]); });

  function enterSV(i) {
    if (state.view !== 'v3d') app.show('v3d');
    sv.saved = { target: R.cam.target.slice(), yaw: R.cam.yaw, pitch: R.cam.pitch, dist: R.cam.dist, fov: R.cam.fov };
    const s = SPOTS[i]; sv.x = s[1]; sv.y = s[2]; sv.yaw = s[3]; sv.pitch = s[4]; sv.mv = null;
    sv.on = true; state.sv = true; document.body.classList.add('sv'); bSV.classList.add('on');
  }
  function exitSV() {
    sv.on = false; state.sv = false; document.body.classList.remove('sv'); bSV.classList.remove('on'); cursor.style.display = 'none';
    if (sv.saved) Object.assign(R.cam, sv.saved, { target: sv.saved.target.slice() });
  }
  function moveTo(x, y, yaw, pitch) {
    [x, y] = clampAllowed(x, y);
    let ty = yaw === undefined ? sv.yaw : yaw;
    while (ty - sv.yaw > Math.PI) ty -= 2 * Math.PI; while (ty - sv.yaw < -Math.PI) ty += 2 * Math.PI;
    sv.mv = { fx: sv.x, fy: sv.y, tx: x, ty: y, fyaw: sv.yaw, tyaw: ty, fp: sv.pitch, tp: pitch === undefined ? sv.pitch : pitch, t0: performance.now(), dur: Math.min(1100, 350 + Math.hypot(x - sv.x, y - sv.y) * 6) };
  }
  const fwd = () => [-Math.sin(sv.yaw), Math.cos(sv.yaw)];
  function stepDir(k) { const [fx, fy] = fwd(); return k === 'f' ? [fx, fy] : k === 'b' ? [-fx, -fy] : k === 'l' ? [-fy, fx] : [fy, -fx]; }
  function step(k) { const [dx, dy] = stepDir(k); const nx = sv.x + dx * STEP, ny = sv.y + dy * STEP; if (allowed(nx, ny)) moveTo(nx, ny); }
  arrows.forEach(a => a.addEventListener('click', (e) => { e.stopPropagation(); step(a.dataset.dir); }));
  window.addEventListener('keydown', (e) => {
    if (!sv.on || e.target.tagName === 'INPUT') return;
    if (e.key === 'ArrowUp') { step('f'); e.preventDefault(); } else if (e.key === 'ArrowDown') { step('b'); e.preventDefault(); }
    else if (e.key === 'ArrowLeft') { sv.yaw += 0.26; e.preventDefault(); } else if (e.key === 'ArrowRight') { sv.yaw -= 0.26; e.preventDefault(); }
    else if (e.key === 'Escape') exitSV();
  });
  function ground(cx, cy) {
    if (!R.VP) return null; const r = canvas.getBoundingClientRect();
    const nx = (cx - r.left) / r.width * 2 - 1, ny = 1 - (cy - r.top) / r.height * 2;
    const inv = M4.inv(R.VP); const a = M4.xf(inv, [nx, ny, -1]), b = M4.xf(inv, [nx, ny, 1]);
    const dy = b[1] - a[1]; if (dy > -1e-6) return null; const t = (-0.3 - a[1]) / dy; if (t < 0) return null;
    return [a[0] + (b[0] - a[0]) * t, -(a[2] + (b[2] - a[2]) * t)];
  }
  // pointer handling in street view (captures before the orbit controls)
  let pd = null;
  const cap = { capture: true };
  canvas.addEventListener('pointerdown', (e) => { if (!sv.on) return; e.stopImmediatePropagation(); canvas.setPointerCapture(e.pointerId); pd = { x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY, moved: false }; canvas.classList.add('drag'); }, cap);
  canvas.addEventListener('pointermove', (e) => {
    if (!sv.on) return; e.stopImmediatePropagation();
    if (pd) {
      const dx = e.clientX - pd.lx, dy = e.clientY - pd.ly; pd.lx = e.clientX; pd.ly = e.clientY;
      if (Math.hypot(e.clientX - pd.x, e.clientY - pd.y) > 4) pd.moved = true;
      const k = sv.fov / Math.max(300, canvas.clientHeight);
      sv.yaw += dx * k; sv.pitch = Math.max(-0.75, Math.min(1.1, sv.pitch - dy * k)); sv.mv = null; cursor.style.display = 'none';
    } else {
      const g = ground(e.clientX, e.clientY); const r = canvas.getBoundingClientRect();
      if (g && allowed(g[0], g[1]) && Math.hypot(g[0] - sv.x, g[1] - sv.y) > 3) { cursor.style.display = 'block'; cursor.style.left = (e.clientX - r.left) + 'px'; cursor.style.top = (e.clientY - r.top) + 'px'; }
      else cursor.style.display = 'none';
    }
  }, cap);
  canvas.addEventListener('pointerup', (e) => {
    if (!sv.on) return; e.stopImmediatePropagation(); canvas.classList.remove('drag');
    if (pd && !pd.moved) { const g = ground(e.clientX, e.clientY); if (g && allowed(g[0], g[1])) moveTo(g[0], g[1]); }
    pd = null;
  }, cap);
  canvas.addEventListener('pointercancel', (e) => { if (!sv.on) return; e.stopImmediatePropagation(); pd = null; canvas.classList.remove('drag'); }, cap);
  canvas.addEventListener('wheel', (e) => { if (!sv.on) return; e.stopImmediatePropagation(); e.preventDefault(); sv.fov = Math.max(0.45, Math.min(1.35, sv.fov * Math.exp(e.deltaY * 0.0012))); }, { capture: true, passive: false });
  canvas.addEventListener('dblclick', (e) => { if (sv.on) e.stopImmediatePropagation(); }, cap);
  canvas.addEventListener('pointerleave', () => { cursor.style.display = 'none'; });

  function applyCam() {
    if (sv.mv) {
      const m = sv.mv, k = Math.min(1, (performance.now() - m.t0) / m.dur), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      sv.x = m.fx + (m.tx - m.fx) * e; sv.y = m.fy + (m.ty - m.fy) * e; sv.yaw = m.fyaw + (m.tyaw - m.fyaw) * e; sv.pitch = m.fp + (m.tp - m.fp) * e;
      if (k >= 1) sv.mv = null;
    }
    const D = 10, cp = Math.cos(sv.pitch);
    const u = [cp * Math.sin(sv.yaw), Math.sin(sv.pitch), cp * Math.cos(sv.yaw)];
    const E = [sv.x, EYE, -sv.y];
    R.cam.target = [E[0] - D * u[0], E[1] - D * u[1], E[2] - D * u[2]];
    R.cam.yaw = sv.yaw; R.cam.pitch = sv.pitch; R.cam.dist = D; R.cam.fov = sv.fov;
  }
  function placeArrows() {
    if (!R.VP) return;
    const r = canvas.getBoundingClientRect();
    for (const a of arrows) {
      const [dx, dy] = stepDir(a.dataset.dir);
      const ok = allowed(sv.x + dx * STEP, sv.y + dy * STEP) && !sv.mv;
      // arrows sit on the ground a few feet ahead of the viewer, arranged around a point in front of the camera
      const [fx, fy] = fwd(); const cx = sv.x + fx * 26, cy = sv.y + fy * 26;
      const off = a.dataset.dir === 'f' || a.dataset.dir === 'b' ? 7 : 6.5;
      const px = cx + dx * off, py = cy + dy * off;
      const p = R.project([px, -0.25, -py]), q = R.project([px + dx * 1.5, -0.25, -(py + dy * 1.5)]);
      if (!ok || !p || !q || p[2] > 1 || q[2] > 1) { a.style.display = 'none'; continue; }
      a.style.display = 'block'; a.style.left = p[0] + 'px'; a.style.top = p[1] + 'px';
      const ang = Math.atan2(q[0] - p[0], -(q[1] - p[1])) * 180 / Math.PI;
      const squash = Math.max(0.35, Math.min(1, Math.abs(Math.sin(Math.max(0.05, sv.pitch + 0.55)))));
      a.style.transform = `rotate(${ang.toFixed(1)}deg) scaleY(${squash.toFixed(2)})`;
    }
    void r;
  }

  { const q = new URLSearchParams(location.search); if (q.get('sv')) enterSV(+q.get('sv')); if (q.get('rate')) tl.querySelector(`[data-rate="${q.get('rate')}"]`).click(); }
  // ================= per-frame hooks =================
  window.__svTick = function () { if (sv.on) applyCam(); };
  (function ui() {
    viewClass();
    if (!scrubbing) range.value = state.simT.toFixed(2);
    $('#tlTime').textContent = fmt(state.simT) + ' / ' + fmt(TOTAL);
    if (sv.on && state.view === 'v3d') placeArrows();
    if (sv.on && state.view !== 'v3d') exitSV();
    requestAnimationFrame(ui);
  })();
})();
