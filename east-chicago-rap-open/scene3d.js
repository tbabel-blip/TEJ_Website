// Scene for 1300 W 145th St — realistic version.
// Plan coords (x east, y north, ft) -> world (X = x, Y = up, Z = -y).
(function (global) {
  'use strict';
  const { hex, mix, shade, RNG, fbm, vnoise, MB, frame, ID, box, hexa, cyl, blob, ribbon, pip, distPoly, plineAt, resample } = G3;
  const D = global.SITE_DATA;
  const M = { NONE: 0, GRAVEL: 1, GRASS: 2, ASPHALT: 3, CONCRETE: 4, WALLRIB: 5, ROOFRIB: 6, TRAILER: 7, FOLIAGE: 8, WATER: 9, SLATS: 10, STONE: 11, FIELD: 12, GLASS: 13, PAINT: 14, METAL: 15, RUBBER: 16, DOOR: 17, PANEL: 18, WOOD: 19, LAWN: 20, BARK: 21 };

  const C = {
    gravel: hex('#38393b'), gravelDk: hex('#323335'), gravelLt: hex('#3e3f41'), track: hex('#2c2d2f'),
    lawn: hex('#56673a'), lawn2: hex('#5e6e3e'), field: hex('#7b8551'), field2: hex('#6a7444'), dry: hex('#8f8a63'), forest: hex('#3f4a2b'), forest2: hex('#4a5232'),
    asphalt: hex('#55575a'), asphalt2: hex('#5c5e61'), concrete: hex('#bdbab2'), conc2: hex('#b0ada5'), dirt: hex('#8d8270'),
    yellow: hex('#e8c14a'), white: hex('#ecebe7'),
    slat: hex('#2e4236'), galv: hex('#a3a8ad'),
    pembWall: hex('#3c6a9e'), pembRoof: hex('#5a5f66'), trim: hex('#2f3439'), door: hex('#e9e9e6'),
    glass: hex('#26313b'),
    ballast: hex('#8a847b'), tie: hex('#4f4033'), rail: hex('#6c6a67'),
    water: hex('#3d5f6b'),
    trunk: hex('#4e4033'),
    tree: [hex('#435429'), hex('#4c5c30'), hex('#3b4b24'), hex('#536238'), hex('#46552e'), hex('#364422'), hex('#58663a'), hex('#4f5a2c')],
    sheffWall: hex('#c9c3b6'), sheffRoof: hex('#cfd0cc'),
    pole: hex('#55595e'), lamp: hex('#f3f1ea'),
  };
  const TRAILER = { white: hex('#dddbd5'), silver: hex('#c3c6c9'), gray: hex('#a2a8ae'), navy: hex('#2b4065'), red: hex('#8e3129'), green: hex('#2f5a40') };
  const CAB = { red: hex('#8f1f1b'), white: hex('#e6e6e3'), blue: hex('#21477e'), black: hex('#1d1f22'), orange: hex('#d9481c') };

  const B = D.boundary, FENCE = D.fence, det = D.detention;
  const railW = D.railW, railE = D.railE;
  const railWX = (y) => plineAt(railW, y), railEX = (y) => plineAt(railE, y);

  // ---------------- occluders for ambient occlusion on the ground ----------------
  const OCC = []; const BK = 40; const OCCB = new Map();
  function addOcc(o) { OCC.push(o); const r = o.r + 12; for (let gx = Math.floor((o.x - r) / BK); gx <= Math.floor((o.x + r) / BK); gx++) for (let gy = Math.floor((o.y - r) / BK); gy <= Math.floor((o.y + r) / BK); gy++) { const k = gx + ',' + gy; if (!OCCB.has(k)) OCCB.set(k, []); OCCB.get(k).push(o); } }
  function occRect(cx, cy, hw, hl, yaw, k) { addOcc({ t: 'r', x: cx, y: cy, hw, hl, c: Math.cos(yaw), s: Math.sin(yaw), r: Math.hypot(hw, hl), k: k || 0.5 }); }
  function occCirc(cx, cy, r, k) { addOcc({ t: 'c', x: cx, y: cy, rr: r, r, k: k || 0.35 }); }
  function aoAt(x, y) {
    const l = OCCB.get(Math.floor(x / BK) + ',' + Math.floor(y / BK)); if (!l) return 1;
    let a = 1;
    for (const o of l) {
      let d;
      if (o.t === 'c') d = Math.hypot(x - o.x, y - o.y) - o.rr;
      else { const dx = x - o.x, dy = y - o.y; const lx = dx * o.c - dy * o.s, ly = dx * o.s + dy * o.c; const qx = Math.abs(lx) - o.hw, qy = Math.abs(ly) - o.hl; d = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0); }
      const occ = d < 0 ? 1 : Math.exp(-d / 3.2);
      a *= 1 - o.k * occ;
    }
    return a;
  }

  // ---------------- tree placement (also used for ground) ----------------
  const TREES = [];
  (function placeTrees() {
    const rnd = RNG(7);
    const tryAdd = (x, y, s, far) => { TREES.push({ x, y, s, far }); };
    // dense woods between White Oak Ave and the West Wye
    for (let y = -6; y < 1250; y += 19) for (let x = -88; x < 400; x += 19) {
      const jx = x + (rnd() - 0.5) * 12, jy = y + (rnd() - 0.5) * 12; const wx = railWX(Math.min(jy, 1150)); if (wx === null || jx > wx - 17) continue;
      if (rnd() < 0.18) continue; tryAdd(jx, jy, 0.85 + rnd() * 0.55);
    }
    // west of White Oak Ave
    for (let y = -6; y < 1300; y += 24) for (let x = -600; x < -138; x += 24) { if (rnd() < 0.3) continue; tryAdd(x + (rnd() - 0.5) * 16, y + (rnd() - 0.5) * 16, 0.9 + rnd() * 0.6, true); }
    // strip east of the East Wye
    for (let y = -6; y < 900; y += 15) { const ex = railEX(y); if (ex === null) continue; if (rnd() < 0.25) continue; tryAdd(ex + 17 + rnd() * 14, y + (rnd() - 0.5) * 8, 0.7 + rnd() * 0.35); }
    // between the wye legs north of the tip
    for (let y = 690; y < 1350; y += 18) { const a = railWX(Math.min(y, 1150)), b = railEX(Math.min(y, 1150)); if (a === null || b === null || b - a < 44) continue; for (let x = a + 18; x < b - 18; x += 18) { if (rnd() < 0.25) continue; tryAdd(x + (rnd() - 0.5) * 10, y + (rnd() - 0.5) * 10, 0.8 + rnd() * 0.45, y > 900); } }
    for (const t of TREES) occCirc(t.x, t.y, 6.5 * t.s, 0.42);
  })();
  function inForest(x, y) {
    const wx = railWX(Math.max(-5, Math.min(y, 1150)));
    if (y > -8 && x > -92 && wx !== null && x < wx - 14) return true;
    if (y > -8 && x < -136 && x > -620) return true;
    const ex = railEX(Math.max(-5, Math.min(y, 900)));
    if (y > -8 && y < 900 && ex !== null && x > ex + 13 && x < ex + 34) return true;
    if (y > 690) { const a = railWX(Math.min(y, 1150)), b = railEX(Math.min(y, 1150)); if (a !== null && b !== null && x > a + 14 && x < b - 14) return true; }
    return false;
  }

  // ---------------- occluders from objects ----------------
  (function () {
    for (const s of D.stalls) { if (s.kind === 'empty') continue; const north = s.face === 'N'; const rear = north ? s.y0 + 2.5 : s.y1 - 2.5; const len = s.kind === 'rig' ? 68 : 53; const cy = rear + (north ? 1 : -1) * len / 2; occRect(s.x + 6, cy, 4.3, len / 2, 0, 0.55); }
    const p = D.pemb; occRect((p.x0 + p.x1) / 2, (p.y0 + p.y1) / 2, (p.x1 - p.x0) / 2, (p.y1 - p.y0) / 2, 0, 0.55);
    occRect(795, 490, 155, 350, 0, 0.5);
    occRect(300, -150, 40, 30, 0, 0.5); occRect(520, -240, 55, 40, 0, 0.5);
  })();

  // ---------------- terrain ----------------
  const YARD = FENCE.concat([[270, 82], [280, 78]]);
  const inYard = (x, y) => y > 5 && pip([x, y], YARD);
  function terrainH(x, y) {
    if (y > D.detY - 6 && pip([x, y], det)) { const d = distPoly([x, y], det, true); return -Math.min(5.5, d * 0.3); }
    if (y < -20 && y > -60) return -0.35 + 0.0;
    return 0;
  }
  function classify(x, y) {
    if (y < -20 && y > -60 && x > -3000 && x < 3600) return 'road';
    if ((y <= -60 && y > -63) || (y >= -20 && y < -18)) return 'curb';
    if (x > -125 && x < -101 && y > -18) return 'whiteoak';
    if (x >= 278 && x <= 318 && y >= -18 && y <= 92) return 'conc';
    if (x >= D.pemb.x0 - 6 && x <= 278 && y >= 17 && y <= 90) return 'conc';
    if (y > D.detY - 6 && pip([x, y], det)) return terrainH(x, y) < -4.2 ? 'water' : 'detslope';
    if (inYard(x, y)) return 'yard';
    if (y >= 0 && pip([x, y], B)) return 'lawn';
    if (y >= -18 && y < 0 && x > -101 && x < 1400) return 'lawn';
    const ex = railEX(Math.max(-60, Math.min(y, 1150))), wx = railWX(Math.max(-60, Math.min(y, 1150)));
    if (wx !== null && Math.abs(x - wx) < 9) return 'ballastG';
    if (ex !== null && Math.abs(x - ex) < 9) return 'ballastG';
    if (ex !== null && x > ex + 34 && y > -18 && y < 860 && x < 980) return 'lotS';
    if (y < -63 && y > -460 && x > 120 && x < 760) return 'yardS';
    if (inForest(x, y)) return 'forest';
    return 'field';
  }
  const MAT = { road: M.ASPHALT, curb: M.CONCRETE, whiteoak: M.STONE, conc: M.CONCRETE, lotA: M.ASPHALT, water: M.WATER, detslope: M.GRASS, yard: 23, lawn: M.LAWN, ballastG: M.STONE, lotS: M.ASPHALT, yardS: M.GRAVEL, forest: M.FIELD, field: M.FIELD };
  function baseCol(k, x, y) {
    const n = fbm(x * 0.03, y * 0.03), n2 = vnoise(x * 0.11, y * 0.11);
    switch (k) {
      case 'road': return mix(C.asphalt, C.asphalt2, n * 0.7);
      case 'curb': return C.concrete;
      case 'whiteoak': return mix(hex('#8a8476'), hex('#9b9586'), n);
      case 'conc': return mix(C.concrete, C.conc2, n * 0.6);
      case 'lotA': case 'lotS': return mix(C.asphalt2, hex('#55575a'), n);
      case 'water': return C.water;
      case 'detslope': return mix(C.lawn2, hex('#7b8a48'), n);
      case 'yard': {
        let c = mix(C.gravelLt, C.gravel, n * 0.6 + 0.2); c = mix(c, C.gravelDk, n2 * 0.25);
        // wheel paths
        const band = (v, c0, w) => Math.max(0, 1 - Math.abs(v - c0) / w);
        let tk = 0;
        if (y > 92 && y < 148) tk = Math.max(tk, band(y, 121, 3.5) * 0.9, band(y, 129, 3.5) * 0.9, band(y, 112, 4) * 0.5);
        if (y > 302 && y < 358) tk = Math.max(tk, band(y, 326, 3.5) * 0.6, band(y, 334, 3.5) * 0.6);
        if (x > 268 && x < 330 && y < 150) tk = Math.max(tk, band(x, 294, 2.6), band(x, 302, 2.6));
        const sd = (D.rows || []);
        for (const r of sd) { if (x > r.x0 - 4 && x < r.x1 + 4) { const mouth = r.face === 'N' ? r.y1 : r.y0; tk = Math.max(tk, band(y, mouth + (r.face === 'N' ? 6 : -6), 8) * 0.35); } }
        // (wheel-path darkening removed — even, clean yard surface)
        return c;
      }
      case 'yardS': return mix(hex('#a29d91'), hex('#8f8a7e'), n);
      case 'lawn': return mix(C.lawn, C.lawn2, n);
      case 'ballastG': return mix(C.ballast, hex('#7a7268'), n);
      case 'forest': return mix(C.forest, C.forest2, n);
      default: { let c = mix(C.field, C.field2, n); return mix(c, C.dry, Math.max(0, vnoise(x * 0.012, y * 0.012) - 0.45)); }
    }
  }
  function terrainV(x, y) { const k = classify(x, y); let c = baseCol(k, x, y); const a = aoAt(x, y); c = [c[0] * a, c[1] * a, c[2] * a]; return { h: terrainH(x, y), c, m: MAT[k] }; }

  function addTerrain(m) {
    const fine = { x0: -40, x1: 640, y0: -72, y1: 680, s: 4 };
    const mid = { x0: -640, x1: 1040, y0: -520, y1: 1360, s: 8 };
    const coarse = { x0: -3200, x1: 3760, y0: -3200, y1: 3760, s: 40 };
    const prev = m.ref; m.ref = [0, -1e6, 0];
    function grid(g, hole) {
      const nx = Math.round((g.x1 - g.x0) / g.s), ny = Math.round((g.y1 - g.y0) / g.s);
      const V = new Array((nx + 1) * (ny + 1));
      const need = (i, j) => true;
      for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) {
        const x = g.x0 + i * g.s, y = g.y0 + j * g.s;
        if (hole && x > hole.x0 + g.s && x < hole.x1 - g.s && y > hole.y0 + g.s && y < hole.y1 - g.s) continue;
        V[j * (nx + 1) + i] = terrainV(x, y);
      }
      for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
        const x = g.x0 + i * g.s, y = g.y0 + j * g.s;
        if (hole && x >= hole.x0 && x + g.s <= hole.x1 && y >= hole.y0 && y + g.s <= hole.y1) continue;
        const a = V[j * (nx + 1) + i], b = V[j * (nx + 1) + i + 1], c = V[(j + 1) * (nx + 1) + i + 1], d = V[(j + 1) * (nx + 1) + i];
        if (!a || !b || !c || !d) continue;
        const sink = hole ? -0.08 : 0;
        const pa = [x, a.h + sink, -y], pb = [x + g.s, b.h + sink, -y], pc = [x + g.s, c.h + sink, -(y + g.s)], pd = [x, d.h + sink, -(y + g.s)];
        const cm = terrainMid(x + g.s / 2, y + g.s / 2, a, b, c, d);
        m.mat = cm;
        triV(m, pa, pb, pc, a.c, b.c, c.c); triV(m, pa, pc, pd, a.c, c.c, d.c);
        void need;
      }
    }
    function terrainMid(x, y, a, b, c, d) { if (a.m === b.m && b.m === c.m && c.m === d.m) return a.m; return MAT[classify(x, y)]; }
    grid(fine, null); grid(mid, fine); grid(coarse, mid);
    m.ref = prev; m.mat = 0;
  }
  function triV(m, a, b, c, ca, cb, cc) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let n = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx]; const l = Math.hypot(...n) || 1; n = n.map(v => v / l); if (n[1] < 0) n = n.map(v => -v);
    m.v(a, n, ca, 0); m.v(b, n, cb, 0); m.v(c, n, cc, 0);
  }
  function addWater(m) {
    const prev = m.ref; m.ref = [0, -1e6, 0]; m.mat = M.WATER;
    const cx = det.reduce((s, p) => s + p[0], 0) / det.length, cy = det.reduce((s, p) => s + p[1], 0) / det.length;
    const inner = det.map(p => { const dx = p[0] - cx, dy = p[1] - cy, L = Math.hypot(dx, dy); const k = Math.max(0, (L - 13) / L); return [cx + dx * k, cy + dy * k]; });
    for (let i = 0; i < inner.length; i++) { const a = inner[i], b = inner[(i + 1) % inner.length]; m.tri([cx, -4.0, -cy], [a[0], -4.0, -a[1]], [b[0], -4.0, -b[1]], C.water, 0); }
    m.ref = prev; m.mat = 0;
    // rip-rap at the inlet (south edge)
    const rnd = RNG(19); m.mat = M.STONE;
    for (let i = 0; i < 40; i++) { const x = 240 + rnd() * 40, y = D.detY + 4 + rnd() * 10; blob(m, x, y, -1.5 - rnd(), 1.3 + rnd(), 0.9, shade(hex('#8d877c'), 0.85 + rnd() * 0.3), rnd, 0, 0.5); }
    m.mat = 0;
  }

  // ---------------- roads & markings ----------------
  function addRoad(m) {
    m.mat = M.PAINT;
    for (const off of [-0.55, 0.55]) ribbon(m, [[-3000, -40 + off], [3600, -40 + off]], 0.4, -0.3, C.yellow);
    for (const yy of [-22.5, -57.5]) ribbon(m, [[-3000, yy], [3600, yy]], 0.45, -0.3, mix(C.white, C.asphalt, 0.15));
    ribbon(m, [[282, -12], [314, -12]], 1.1, 0.04, C.white);
    m.mat = 0;
    // utility poles + wires along the south side of W 145th St (wood), cobra-head street lights on some
    const poles = [];
    for (let x = -700; x < 1500; x += 150) poles.push(x);
    m.mat = M.WOOD;
    for (const x of poles) {
      cyl(m, ID, [x, 0, -70], [x, 36, -70], 0.55, 7, hex('#5d4b3a'));
      box(m, frame(x, -70, 32, Math.PI / 2), -4.5, 4.5, 0, 0.5, -0.25, 0.25, hex('#5d4b3a'));
    }
    m.mat = M.METAL;
    for (let i = 0; i < poles.length - 1; i++) for (const dx of [-4, 0, 4]) {
      const a = poles[i], b = poles[i + 1];
      const seg = 10; for (let k = 0; k < seg; k++) {
        const t0 = k / seg, t1 = (k + 1) / seg, sag = (t) => 32.6 - 3.0 * 4 * t * (1 - t);
        m.mat = 24; cyl(m, ID, [a + (b - a) * t0, sag(t0), -70 + dx], [a + (b - a) * t1, sag(t1), -70 + dx], 0.06, 3, hex('#2a2a2a'), 0, false); m.mat = M.METAL;
      }
    }
    for (const [k, x] of poles.entries()) { if (k % 2 !== 0) continue; box(m, frame(x, -70, 27, 0), -0.15, 0.15, 0, 0.3, 0, 8, C.pole); box(m, frame(x, -70, 26.6, 0), -0.8, 0.8, 0, 0.6, 7.2, 9.4, C.pole); STREETL.push([x, 26.3, 70 - 8.3]); }
    m.mat = 0;
  }
  const STREETL = [];

  // ---------------- rail ----------------
  function addRail(m, pl) {
    const pts = resample(pl, 6);
    m.mat = M.STONE; ribbon(m, pts, 12, 1.15, (i) => mix(C.ballast, hex('#7c756b'), (i * 37 % 10) / 20), 1.2);
    m.mat = M.WOOD;
    const ties = resample(pl, 1.75);
    for (let i = 1; i < ties.length - 1; i++) {
      const a = ties[i - 1], b = ties[i + 1]; const yaw = Math.atan2(b[0] - a[0], b[1] - a[1]);
      box(m, frame(ties[i][0], ties[i][1], 1.15, yaw), -4.25, 4.25, 0, 0.42, -0.38, 0.38, shade(C.tie, 0.85 + (i * 7 % 5) * 0.06), 0, { noBack: false });
    }
    m.mat = M.METAL;
    for (const g of [-2.35, 2.35]) {
      const rl = pts.map((p, i) => { const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)]; const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1; return [p[0] - dy / L * g, p[1] + dx / L * g]; });
      ribbon(m, rl, 0.3, 2.0, C.rail, 0.45);
    }
    m.mat = 0;
  }
  function addRailcars(m, pl, sFrom, n) {
    const pts = resample(pl, 1); let s = sFrom;
    for (let k = 0; k < n; k++) {
      const tank = k % 3 === 1, len = tank ? 58 : 60;
      const a = pts[Math.min(pts.length - 1, s)], b = pts[Math.min(pts.length - 1, s + len)];
      const yaw = Math.atan2(b[0] - a[0], b[1] - a[1]); const f = frame((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, 2.0, yaw);
      const body = tank ? hex('#1f2124') : [hex('#6b3426'), hex('#574638'), hex('#7a4630'), hex('#3a5466')][k % 4];
      m.mat = M.METAL; box(m, f, -4.6, 4.6, 2.0, 3.8, -len / 2 + 1, len / 2 - 1, hex('#262626'));
      m.mat = M.RUBBER; for (const z of [-len / 2 + 6, len / 2 - 6]) for (const dz of [-2.8, 2.8]) for (const x of [-2.3, 2.3]) cyl(m, f, [x - 0.3, 1.5, z + dz], [x + 0.3, 1.5, z + dz], 1.5, 8, hex('#262626'));
      if (tank) { m.mat = M.PAINT; cyl(m, f, [0, 9, -len / 2 + 3], [0, 9, len / 2 - 3], 5, 14, body); box(m, f, -1.5, 1.5, 13.6, 14.6, -2, 2, hex('#2d2f33')); }
      else { m.mat = M.WALLRIB; box(m, f, -5.1, 5.1, 3.8, 16.2, -len / 2 + 1.5, len / 2 - 1.5, { top: shade(body, 0.92), side: body, front: shade(body, 0.9), back: shade(body, 0.9) }, 0, { mat: { top: M.PAINT, side: M.WALLRIB } }); m.mat = M.METAL; box(m, f, -5.18, 5.18, 5.5, 14.5, -5, 5, shade(body, 0.7)); }
      s += len + 5;
    }
    m.mat = 0;
  }

  // ---------------- trees ----------------
  function addTrees(m) {
    const rnd = RNG(23);
    for (const t of TREES) {
      const s = t.s, col = C.tree[Math.floor(rnd() * C.tree.length)];
      const hTop = (t.street ? 22 : 34) * s, crownR = (t.street ? 9 : 11.5) * s;
      if (!t.far || rnd() < 0.3) { m.mat = M.BARK; cyl(m, ID, [t.x, 0, t.y], [t.x, hTop * 0.45, t.y], 0.55 * s + 0.25, 5, C.trunk, 0, false); }
      m.mat = M.FOLIAGE; m.smooth = true;
      const nb = t.far ? 2 : 3;
      for (let k = 0; k < nb; k++) {
        const ang = rnd() * Math.PI * 2, rr = k === 0 ? 0 : crownR * (0.35 + rnd() * 0.3);
        const bx = t.x + Math.cos(ang) * rr, by = t.y + Math.sin(ang) * rr;
        const bh = hTop * (k === 0 ? 0.68 : 0.55 + rnd() * 0.2), br = crownR * (k === 0 ? 0.85 : 0.55 + rnd() * 0.25);
        const c = mix(col, k === 0 ? shade(col, 0.95) : mix(col, hex('#7d8a4c'), 0.18), rnd() * 0.6);
        blob(m, bx, by, bh, br, br * (0.75 + rnd() * 0.2), c, rnd, 0, 0.42, t.far || (k > 0 && !t.street));
      }
      m.smooth = false;
    }
    m.mat = 0;
  }

  // ---------------- fence ----------------
  // 6' galvanized chain link + 3-strand barbed wire on 45° arms; privacy inserts only where the public looks in
  function addFence(m) {
    const pts = FENCE, H = 6.0, n = pts.length;
    const slatted = () => true;   // chain link with privacy inserts on every run
    for (let i = 0; i < n - 1; i++) {
      const a = pts[i], b = pts[i + 1]; const L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 0.3) continue;
      const yaw = Math.atan2(b[0] - a[0], b[1] - a[1]); const f = frame(a[0], a[1], 0, yaw);
      const sl = slatted(a, b);
      m.mat = sl ? M.SLATS : 25;
      box(m, f, -0.05, 0.05, 0.15, H, 0, L, sl ? C.slat : C.galv, 0, { noFront: true, noBack: true, noTop: true });
      m.mat = M.METAL; cyl(m, ID, [a[0], H, a[1]], [b[0], H, b[1]], 0.09, 6, hex('#b9bec3'), 0, false);   // top rail
    }
    // outward normal (yard is on the left of the polyline)
    const outN = (i) => { const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)]; const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1; return [dy / L, -dx / L]; };
    // terminal / corner posts at ends and sharp turns, line posts about every 10'
    const term = [0, n - 1];
    for (let i = 1; i < n - 1; i++) { const a = pts[i - 1], p = pts[i], b = pts[i + 1]; const h1 = Math.atan2(p[0] - a[0], p[1] - a[1]), h2 = Math.atan2(b[0] - p[0], b[1] - p[1]); let dh = Math.abs(h2 - h1); if (dh > Math.PI) dh = 2 * Math.PI - dh; if (dh > 0.35) term.push(i); }
    m.mat = M.METAL;
    for (const i of term) { const p = pts[i]; cyl(m, ID, [p[0], 0, p[1]], [p[0], H + 0.5, p[1]], 0.2, 8, C.galv); }
    let acc = 0; const linePosts = [];
    for (let i = 1; i < n; i++) { const a = pts[i - 1], b = pts[i]; const L = Math.hypot(b[0] - a[0], b[1] - a[1]); let s0 = 10 - acc; while (s0 < L) { const t = s0 / L; linePosts.push([[a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], i]); s0 += 10; } acc = (acc + L) % 10; if (term.includes(i)) acc = 0; }
    for (const [p] of linePosts) cyl(m, ID, [p[0], 0, p[1]], [p[0], H + 0.35, p[1]], 0.12, 6, C.galv);
    // barbed-wire arms (45° outward) and 3 strands
    const armAt = (p, o) => { cyl(m, ID, [p[0], H + 0.3, p[1]], [p[0] + o[0] * 0.95, H + 1.25, p[1] + o[1] * 0.95], 0.05, 4, C.galv, 0, false); };
    for (const i of term) armAt(pts[i], outN(i));
    for (const [p, i] of linePosts) armAt(p, outN(i));
    for (const k of [0.32, 0.63, 0.95]) {
      const st = pts.map((p, i) => { const o = outN(i); return [p[0] + o[0] * k, p[1] + o[1] * k]; });
      for (let i = 0; i < n - 1; i++) { m.mat = 24; cyl(m, ID, [st[i][0], H + 0.3 + k, st[i][1]], [st[i + 1][0], H + 0.3 + k, st[i + 1][1]], 0.035, 3, hex('#8b8f93'), 0, false); }
    }
    m.mat = 0;
  }

  // ---------------- PEMB ----------------
  const LABELS = [], WALLPACKS = [], DECALS = [];
  function addPEMB(m) {
    const P = D.pemb; const x0 = P.x0, x1 = P.x1, y0 = P.y0, y1 = P.y1, E = P.eave, R = P.ridge; const ym = (y0 + y1) / 2;
    const W = (x, h, y) => [x, h, -y];
    const prev = m.ref; m.ref = W((x0 + x1) / 2, 8, ym);
    m.mat = M.WALLRIB;
    m.quad(W(x0, 0, y0), W(x1, 0, y0), W(x1, E, y0), W(x0, E, y0), C.pembWall);
    m.quad(W(x0, 0, y1), W(x1, 0, y1), W(x1, E, y1), W(x0, E, y1), C.pembWall);
    for (const xx of [x0, x1]) { m.quad(W(xx, 0, y0), W(xx, 0, y1), W(xx, E, y1), W(xx, E, y0), C.pembWall); m.tri(W(xx, E, y0), W(xx, E, y1), W(xx, R, ym), C.pembWall); }
    // base trim (wainscot-like dark angle)
    m.mat = M.PAINT;
    m.ref = W((x0 + x1) / 2, -50, ym); m.mat = M.ROOFRIB;
    m.quad(W(x0 - 1, E - 0.1, y0 - 1.1), W(x1 + 1, E - 0.1, y0 - 1.1), W(x1 + 1, R + 0.15, ym), W(x0 - 1, R + 0.15, ym), C.pembRoof);
    m.quad(W(x0 - 1, R + 0.15, ym), W(x1 + 1, R + 0.15, ym), W(x1 + 1, E - 0.1, y1 + 1.1), W(x0 - 1, E - 0.1, y1 + 1.1), C.pembRoof);
    m.ref = prev;
    m.mat = M.PAINT;
    for (const [xx, yy] of [[x0, y0], [x1, y0], [x0, y1], [x1, y1]]) box(m, frame(xx, yy, 0, 0), -0.3, 0.3, 0, E, -0.3, 0.3, C.trim);
    // gutters + downspouts
    for (const yy of [y0 - 1.1, y1 + 1.1]) box(m, frame((x0 + x1) / 2, yy, E - 0.75, 0), -(x1 - x0) / 2 - 1, (x1 - x0) / 2 + 1, 0, 0.65, -0.3, 0.3, C.trim);
    for (const [xx, yy] of [[x0 + 1, y0 - 0.8], [x1 - 1, y0 - 0.8], [x0 + 1, y1 + 0.8], [x1 - 1, y1 + 0.8]]) box(m, frame(xx, yy, 0.4, 0), -0.25, 0.25, 0, E - 0.8, -0.2, 0.2, C.trim);
    // rake trim + ridge cap + ridge vents
    box(m, frame((x0 + x1) / 2, ym, R + 0.1, 0), -(x1 - x0) / 2 - 1, (x1 - x0) / 2 + 1, 0, 0.3, -0.7, 0.7, shade(C.pembRoof, 0.85));
    m.mat = M.METAL; for (const xv of [x0 + 20, x0 + 40, x0 + 60]) box(m, frame(xv, ym, R + 0.35, 0), -1.4, 1.4, 0, 1.1, -1.4, 1.4, hex('#9aa0a6'));
    m.ref = W((x0 + x1) / 2, 8, ym);
    const wallQ = (axis, c, w, h0, h1, face, d, col, mat, em) => {
      const pm = m.mat; m.mat = mat;
      if (axis === 'x') m.quad(W(c - w / 2, h0, face.v + face.s * d), W(c + w / 2, h0, face.v + face.s * d), W(c + w / 2, h1, face.v + face.s * d), W(c - w / 2, h1, face.v + face.s * d), col, em);
      else m.quad(W(face.v + face.s * d, h0, c - w / 2), W(face.v + face.s * d, h0, c + w / 2), W(face.v + face.s * d, h1, c + w / 2), W(face.v + face.s * d, h1, c - w / 2), col, em);
      m.mat = pm;
    };
    const N = { v: y1, s: 1 }, S = { v: y0, s: -1 }, Eg = { v: x1, s: 1 }, Wg = { v: x0, s: -1 };
    const door = (axis, face, c, w, h) => { wallQ(axis, c, w + 1, 0, h + 0.8, face, 0.08, C.trim, M.PAINT); wallQ(axis, c, w, 0, h, face, 0.15, C.door, M.DOOR); };
    const walk = (axis, face, c) => { wallQ(axis, c, 3.6, 0, 7.4, face, 0.08, C.trim, M.PAINT); wallQ(axis, c, 3.0, 0, 7.0, face, 0.14, C.door, M.PAINT); };
    const win = (axis, face, c) => { wallQ(axis, c, 4.0, 4.0, 8.0, face, 0.08, hex('#ededea'), M.PAINT); wallQ(axis, c, 3.3, 4.35, 7.65, face, 0.14, C.glass, M.GLASS, 0.75); };
    [x0 + 30, x0 + 47, x0 + 64, x0 + 81].forEach(cx => door('x', N, cx, 12, 14));
    walk('x', N, x0 + 13); win('x', N, x0 + 6); win('x', N, x0 + 20); win('x', N, x0 + 94);
    door('y', Eg, ym, 14, 14); walk('y', Eg, y0 + 5); win('y', Eg, y1 - 6);
    for (const wx of [x0 + 10, x0 + 22, x0 + 34, x0 + 66, x0 + 78, x0 + 90]) win('x', S, wx);
    walk('y', Wg, ym - 8); win('y', Wg, ym + 6); win('y', Wg, ym - 16);
    m.ref = prev;
    // bollards at the doors
    m.mat = M.PAINT; for (const cx of [x0 + 30, x0 + 47, x0 + 64, x0 + 81]) for (const dx of [-6.9, 6.9]) for (const yb of [y1 + 1.6]) cyl(m, ID, [cx + dx, 0, yb], [cx + dx, 4, yb], 0.35, 8, hex('#e2b512'));
    // building-mounted LED floodlights (aimed into the yard)
    m.mat = M.METAL;
    for (const [fx, fy, fh, aim] of D.floods) {
      const a = aim * Math.PI / 180, f = frame(fx, fy, fh, a);
      box(m, f, -0.12, 0.12, -0.2, 0.2, -0.2, 0.9, C.trim);
      hexa(m, f, [[-1.1, -0.9, 0.7], [1.1, -0.9, 0.7], [1.1, -0.3, 2.3], [-1.1, -0.3, 2.3], [-1.1, 0.3, 0.7], [1.1, 0.3, 0.7], [1.1, 0.5, 2.3], [-1.1, 0.5, 2.3]], { top: C.trim, side: C.trim, front: C.lamp }, 0, M.METAL);
      const dir = [Math.sin(a) * 0.954, -0.3, -Math.cos(a) * 0.954];
      const lp = f(0, -0.4, 2.5);
      LIGHTS.push([lp[0], lp[1], lp[2], 11.0, dir[0], dir[1], dir[2], 0.05]);
      GLOWS.push({ p: [lp[0] + dir[0] * 0.3, lp[1] - 0.2, lp[2] + dir[2] * 0.3], kind: 'pack' });
    }
    m.mat = 0;
    LABELS.push({ id: 'pemb', text: '4,000 SF PEMB', sub: 'Maintenance building', at: [(x0 + x1) / 2, 19, ym] });
  }

  // ---------------- vehicles ----------------
  const RIM = hex('#b9bdc1'), TIRE = hex('#1c1d1f'), ALU = hex('#c3c7cb'), DARK = hex('#26282b'), CHROME = hex('#d9dcdf');
  function wheel(m, f, x, y, z, r, w, outerSign) {
    m.mat = M.RUBBER; cyl(m, f, [x - w / 2, y, z], [x + w / 2, y, z], r, 12, TIRE);
    m.mat = M.METAL; cyl(m, f, [x + outerSign * (w / 2 - 0.02), y, z], [x + outerSign * (w / 2 + 0.04), y, z], r * 0.62, 10, RIM);
  }
  function trailerMesh(m, f, color, opts) {
    const o = opts || {}; const top = mix(color, hex('#aeb3b8'), 0.65);   // aluminium roof sheet
    // body (rear at z=0.3, nose at z=53)
    box(m, f, -4.25, 4.25, 4.1, 13.5, 0.3, 53, { top, side: color, front: shade(color, 0.95), back: shade(color, 0.93) }, 0, { mat: { top: M.PAINT, side: M.TRAILER, front: M.TRAILER, back: M.DOOR } });
    m.mat = M.METAL;
    for (const yy of [[4.0, 4.55], [13.2, 13.55]]) for (const sx of [-1, 1]) box(m, f, sx > 0 ? 4.22 : -4.32, sx > 0 ? 4.32 : -4.22, yy[0], yy[1], 0.2, 53, ALU);
    for (const sx of [-1, 1]) box(m, f, sx * 4.25 - 0.18, sx * 4.25 + 0.18, 4.0, 13.55, 0.0, 0.6, ALU);       // rear corner posts
    box(m, f, -4.2, 4.2, 13.2, 13.55, 0.0, 0.6, ALU);
    box(m, f, -4.2, 4.2, 3.6, 4.1, 0.0, 0.6, DARK);                                                           // rear sill
    box(m, f, -0.05, 0.05, 4.2, 13.2, 0.18, 0.3, shade(color, 0.55));                                       // door seam
    for (const x of [-3.2, -1.2, 1.2, 3.2]) box(m, f, x - 0.07, x + 0.07, 4.4, 13.0, 0.12, 0.26, hex('#8d9196')); // lock rods
    // DOT conspicuity tape along the bottom rail
    m.mat = M.PAINT;
    for (let z = 2; z < 51; z += 4) for (const sx of [-1, 1]) box(m, f, sx > 0 ? 4.32 : -4.36, sx > 0 ? 4.36 : -4.32, 4.6, 4.95, z, z + 2, (z / 4) % 2 < 1 ? hex('#b52a22') : hex('#e8e8e4'));
    if (o.stripe) for (const sx of [-1, 1]) box(m, f, sx > 0 ? 4.32 : -4.36, sx > 0 ? 4.36 : -4.32, 6.2, 6.8, 2, 51, o.stripe);
    // ICC underride bumper + tail lights
    m.mat = M.METAL; box(m, f, -3.9, 3.9, 1.6, 2.15, -0.35, 0.15, DARK); for (const x of [-3.2, 3.2]) box(m, f, x - 0.15, x + 0.15, 2.0, 3.7, 0.0, 0.3, DARK);
    m.mat = M.PAINT; for (const x of [-3.4, 3.4]) box(m, f, x - 0.35, x + 0.35, 3.0, 3.5, -0.02, 0.1, hex('#9b1d17'), 0.6);
    // slider subframe, tandem axles with dual wheels, mud flaps
    m.mat = M.METAL; box(m, f, -3.0, 3.0, 2.6, 4.1, 2.0, 13.5, DARK);
    for (const z of [5.0, 9.2]) { for (const sx of [-1, 1]) { wheel(m, f, sx * 3.45, 1.7, z, 1.7, 0.9, sx); wheel(m, f, sx * 2.35, 1.7, z, 1.7, 0.9, -sx); } }
    m.mat = M.RUBBER; for (const sx of [-1, 1]) box(m, f, sx * 3.0 - 1.1, sx * 3.0 + 1.1, 0.5, 3.4, 2.6, 2.75, DARK);
    // side skirts (some trailers)
    if (o.skirt) { m.mat = M.PAINT; for (const sx of [-1, 1]) box(m, f, sx > 0 ? 4.0 : -4.1, sx > 0 ? 4.1 : -4.0, 1.3, 4.0, 14, 40, shade(color, 0.88)); }
    // landing gear
    if (!o.coupled) { m.mat = M.METAL; for (const x of [-3.0, 3.0]) { box(m, f, x - 0.28, x + 0.28, 0.3, 4.1, 39.6, 40.2, DARK); box(m, f, x - 0.6, x + 0.6, 0.0, 0.3, 39.3, 40.5, DARK); } box(m, f, -3.0, 3.0, 2.6, 2.8, 39.8, 40.0, DARK); }
    m.mat = 0;
  }
  function tractorMesh(m, f, color, night) {
    // origin at the fifth wheel; +z forward. Front bumper at z ~16.4
    m.mat = M.METAL;
    box(m, f, -1.9, 1.9, 2.2, 3.2, -6.5, 15.4, DARK);                                       // frame rails
    box(m, f, -1.6, 1.6, 3.2, 3.6, -3.4, 1.2, hex('#3a3c3f'));                              // fifth wheel plate
    m.mat = M.PAINT;
    // sleeper + cab
    hexa(m, f, [[-4.0, 4.2, 2.6], [4.0, 4.2, 2.6], [4.0, 4.2, 9.2], [-4.0, 4.2, 9.2], [-4.0, 12.6, 2.6], [4.0, 12.6, 2.6], [4.0, 12.6, 8.7], [-4.0, 12.6, 8.7]], { top: shade(color, 1.04), side: color }, 0, M.PAINT);
    hexa(m, f, [[-4.0, 4.2, 9.2], [4.0, 4.2, 9.2], [4.0, 4.2, 11.0], [-4.0, 4.2, 11.0], [-3.9, 11.6, 8.7], [3.9, 11.6, 8.7], [3.9, 11.6, 9.8], [-3.9, 11.6, 9.8]], { top: shade(color, 1.04), side: color, front: C.glass }, 0, M.PAINT);
    // windshield (glass on the sloped face)
    { const g = [[-3.6, 8.3, 10.65], [3.6, 8.3, 10.65], [3.5, 11.3, 9.9], [-3.5, 11.3, 9.9]].map(p => f(...p)); const pm = m.mat; m.mat = M.GLASS; m.ref = f(0, 8, 6); m.quad(g[0], g[1], g[2], g[3], C.glass, 0); m.ref = null; m.mat = pm; }
    // roof fairing
    hexa(m, f, [[-3.9, 12.6, 3.0], [3.9, 12.6, 3.0], [3.9, 11.6, 9.4], [-3.9, 11.6, 9.4], [-3.9, 13.7, 3.0], [3.9, 13.7, 3.0], [3.7, 12.0, 8.8], [-3.7, 12.0, 8.8]], { top: shade(color, 1.06), side: color }, 0, M.PAINT);
    // side windows
    m.mat = M.GLASS; for (const sx of [-1, 1]) box(m, f, sx > 0 ? 3.98 : -4.04, sx > 0 ? 4.04 : -3.98, 8.6, 11.0, 8.4, 10.2, C.glass, 0);
    // hood (tapered, sloping)
    hexa(m, f, [[-3.5, 3.6, 10.8], [3.5, 3.6, 10.8], [3.1, 3.6, 16.0], [-3.1, 3.6, 16.0], [-3.5, 8.6, 10.8], [3.5, 8.6, 10.8], [3.0, 7.3, 15.9], [-3.0, 7.3, 15.9]], { top: shade(color, 1.05), side: color, front: CHROME }, 0, M.PAINT);
    // fenders over steer axle
    for (const sx of [-1, 1]) hexa(m, f, [[sx * 3.1, 2.4, 11.0], [sx * 4.1, 2.4, 11.0], [sx * 4.1, 2.4, 15.2], [sx * 3.1, 2.4, 15.2], [sx * 3.1, 4.2, 11.0], [sx * 4.1, 4.2, 11.0], [sx * 4.0, 3.9, 15.0], [sx * 3.1, 3.9, 15.0]], color, 0, M.PAINT);
    // grille + bumper + headlights
    m.mat = M.METAL; box(m, f, -2.4, 2.4, 4.0, 7.0, 15.9, 16.08, CHROME); box(m, f, -4.0, 4.0, 2.5, 3.7, 15.9, 16.6, CHROME);
    m.mat = M.PAINT; for (const sx of [-1, 1]) box(m, f, sx * 3.0 - 0.6, sx * 3.0 + 0.6, 4.4, 5.2, 15.6, 16.05, hex('#e9edf0'), 0.8);
    // mirrors
    m.mat = M.METAL; for (const sx of [-1, 1]) { box(m, f, sx * 4.0, sx * 4.7, 9.6, 9.75, 10.3, 10.45, DARK); box(m, f, sx * 4.55 - 0.2, sx * 4.55 + 0.2, 8.6, 10.9, 10.25, 10.6, DARK); }
    // fuel tanks, steps, stacks
    for (const sx of [-1, 1]) { cyl(m, f, [sx * 3.95, 3.0, 4.4], [sx * 3.95, 3.0, 8.6], 1.05, 12, CHROME); cyl(m, f, [sx * 4.15, 4.6, 2.9], [sx * 4.15, 14.6, 2.9], 0.27, 8, CHROME); }
    m.mat = M.PAINT; for (const sx of [-1, 1]) box(m, f, sx > 0 ? 3.6 : -4.4, sx > 0 ? 4.4 : -3.6, 1.6, 2.0, 9.0, 10.8, DARK);
    // wheels: steer + tandem drives (duals)
    for (const sx of [-1, 1]) wheel(m, f, sx * 3.35, 1.75, 13.1, 1.75, 1.0, sx);
    for (const z of [-1.0, -5.0]) for (const sx of [-1, 1]) { wheel(m, f, sx * 3.45, 1.75, z, 1.75, 0.9, sx); wheel(m, f, sx * 2.35, 1.75, z, 1.75, 0.9, -sx); }
    m.mat = M.RUBBER; for (const sx of [-1, 1]) box(m, f, sx * 3.0 - 1.1, sx * 3.0 + 1.1, 0.5, 3.6, -7.2, -7.05, DARK);
    m.mat = 0;
  }
  function carMesh(m, f, color) {
    hexa(m, f, [[-3.0, 0.8, -7.6], [3.0, 0.8, -7.6], [3.0, 0.8, 7.6], [-3.0, 0.8, 7.6], [-3.0, 3.2, -7.4], [3.0, 3.2, -7.4], [2.9, 2.9, 7.5], [-2.9, 2.9, 7.5]], { top: shade(color, 1.04), side: color }, 0, M.PAINT);
    hexa(m, f, [[-2.8, 3.2, -4.6], [2.8, 3.2, -4.6], [2.8, 3.2, 3.2], [-2.8, 3.2, 3.2], [-2.5, 4.7, -3.6], [2.5, 4.7, -3.6], [2.5, 4.7, 1.4], [-2.5, 4.7, 1.4]], { top: shade(color, 1.04), side: C.glass, front: C.glass, back: C.glass }, 0, M.GLASS);
    for (const [x, z] of [[-2.8, 4.9], [2.8, 4.9], [-2.8, -4.9], [2.8, -4.9]]) wheel(m, f, x, 1.1, z, 1.1, 0.7, Math.sign(x));
    m.mat = 0;
  }
  function addParked(m) {
    const rnd = RNG(41);
    for (const s of D.stalls) {
      if (s.kind === 'empty') continue;
      const cx = s.x + 6, north = s.face === 'N';
      const rearY = north ? s.y0 + 2.5 : s.y1 - 2.5, yaw = north ? 0 : Math.PI;
      const j = ((s.i * 7919) % 11 - 5) * 0.07;
      const col = TRAILER[s.color] || TRAILER.white;
      const age = 0.92 + rnd() * 0.08;
      trailerMesh(m, frame(cx + j, rearY + j * 2, 0, yaw + j * 0.004), shade(col, age), { coupled: s.kind === 'rig', skirt: rnd() < 0.45 });
      if (s.kind === 'rig') tractorMesh(m, frame(cx + j, rearY + j * 2 + (north ? 1 : -1) * 50, 0, yaw), CAB[s.cab] || CAB.white);
    }
    const cars = D.cars, cols = [hex('#dcdcd9'), hex('#26282b'), hex('#6e1c1c'), hex('#8e959c'), hex('#2a3f5f')];
    for (let i = 0; i < cars.n; i++) { if (i === 3) continue; carMesh(m, frame(cars.x0 + cars.w * i + cars.w / 2, cars.y0 + 9.5, 0, i % 2 ? 0 : Math.PI), cols[i]); }
  }
  function addStallPaint(m) {
    m.mat = M.PAINT;
    // gravel yards: low concrete wheel stops at the back of each stall + faint stall lines
    for (const r of D.rows) {
      const back = r.face === 'N' ? r.y0 + 1.2 : r.y1 - 1.2;
      for (let i = 0; i < r.n; i++) { const x = r.x0 + i * 12 + 6; box(m, frame(x, back, 0, 0), -3, 3, 0, 0.5, -0.4, 0.4, C.concrete); }
      for (let i = 0; i <= r.n; i++) { const x = r.x0 + i * 12; ribbon(m, [[x, r.y0 + 1], [x, r.y1 - 1]], 0.35, 0.05, mix(C.white, C.gravel, 0.3)); }
    }
    m.mat = 0;
  }

  // ---------------- gate ----------------
  const GATE = {};
  function addGate(m) {
    // monument sign
    m.mat = M.STONE; box(m, frame(232, 2.4, 0, 0), -10.5, 10.5, 0, 1.4, -1.9, 1.9, hex('#8f8a80'));
    m.mat = M.PAINT; box(m, frame(232, 2.4, 1.4, 0), -9, 9, 0, 6.3, -0.9, 0.9, hex('#2a2d31'));
    DECALS.push([[224.3, 1.65, -1.44], [239.7, 1.65, -1.44], [239.7, 7.5, -1.44], [224.3, 7.5, -1.44]]);
    m.mat = 0;
  }
  function armMesh() {
    const m = new MB(); const L = D.entry.x1 - D.entry.armPivot[0] - 1.6;
    m.mat = M.PAINT;
    for (let x = 0; x < L; x += 2.5) box(m, ID, x, Math.min(L, x + 2.5), -0.2, 0.2, -0.14, 0.14, Math.floor(x / 2.5) % 2 ? hex('#c42d25') : hex('#f2f2ef'));
    return m;
  }

  // ---------------- poles / cameras ----------------
  const LIGHTS = [], CAMS = [], GLOWS = [];
  function addPoles(m) {
    for (const [x, y] of D.lights) {
      m.mat = M.CONCRETE; cyl(m, ID, [x, 0, y], [x, 3.0, y], 1.05, 12, C.concrete);                    // pier between trailer rears
      m.mat = M.PAINT; cyl(m, ID, [x, 1.0, y], [x, 1.6, y], 1.07, 12, hex('#e0b512'), 0, false);        // safety band
      m.mat = M.METAL; cyl(m, ID, [x, 3.0, y], [x, 40, y], 0.42, 12, C.pole); cyl(m, ID, [x, 3.0, y], [x, 4.0, y], 0.6, 12, C.pole);
      for (let k = 0; k < 4; k++) {
        const g = frame(x, y, 0, Math.PI / 4 + k * Math.PI / 2);
        box(m, g, -0.13, 0.13, 39.3, 39.6, 0, 3.2, C.pole);
        box(m, g, -1.25, 1.25, 38.8, 39.55, 2.6, 5.4, C.pole);
        box(m, g, -1.1, 1.1, 38.72, 38.8, 2.75, 5.25, C.lamp, 1.0);
        const lp = g(0, 38.5, 4.0); LIGHTS.push([lp[0], lp[1], lp[2], 6.5, 0, -1, 0, -0.25]); GLOWS.push({ p: [lp[0], lp[1] - 0.3, lp[2]], kind: 'lamp' });
      }
    }
    for (const [x, h, yy] of STREETL) { LIGHTS.push([x, h, yy, 0.75, 0, -1, 0, 0.2]); GLOWS.push({ p: [x, h - 0.2, yy], kind: 'street' }); }
    for (const [x, y, z, yaw, label] of D.cams) {
      const a = yaw * Math.PI / 180;
      m.mat = M.METAL;
      const f = frame(x, y, z, a);
      box(m, f, -0.1, 0.1, -0.1, 0.1, 0, 1.3, C.pole);
      m.mat = M.PAINT; box(m, f, -0.42, 0.42, -0.7, 0.12, 1.0, 2.9, hex('#ecebe7'));
      box(m, f, -0.5, 0.5, 0.12, 0.2, 1.0, 3.2, hex('#ecebe7'));
      m.mat = M.GLASS; box(m, f, -0.32, 0.32, -0.6, 0.02, 2.9, 3.1, hex('#0f1114'));
      CAMS.push({ p: f(0, 0.24, 2.4), label, yaw: a, ph: (CAMS.length * 0.37) % 1 });
    }
    m.mat = 0;
  }

  // ---------------- utilities (below grade) ----------------
  function utilityMesh(pl, depth, r, col) {
    const m = new MB(); m.mat = M.NONE; const pts = resample(pl, 6);
    for (let i = 0; i < pts.length - 1; i++) { const a = pts[i], b = pts[i + 1]; cyl(m, ID, [a[0], -depth, a[1]], [b[0], -depth, b[1]], r, 10, col, 0, false); }
    return m;
  }
  function addMarkers(m) {
    const mk = (pl, col, step) => {
      for (const p of resample(pl, step)) {
        if (p[1] < -2 || p[1] > D.tipY) continue;
        if (D.stalls.some(s => p[0] > s.x - 1 && p[0] < s.x + 13 && p[1] > s.y0 - 1 && p[1] < s.y1 + 1)) continue;
        m.mat = M.PAINT; box(m, frame(p[0], p[1], 0, 0), -0.2, 0.2, 0, 4.0, -0.2, 0.2, hex('#ebeae5')); box(m, frame(p[0], p[1], 3.3, 0), -0.22, 0.22, 0, 0.9, -0.22, 0.22, col);
      }
    };
    mk(D.gas, hex('#e9b81f'), 90); mk(D.pet, hex('#c92e26'), 90); m.mat = 0;
  }

  // ---------------- context ----------------
  function addContext(m) {
    m.mat = M.PANEL;
    box(m, frame(795, 140, 0, 0), -155, 155, 0, 34, 0, 700, { top: C.sheffRoof, side: C.sheffWall, front: shade(C.sheffWall, 0.96), back: shade(C.sheffWall, 0.94) }, 0, { mat: { top: 22, side: M.PANEL } });
    m.mat = M.DOOR; for (let y = 170; y < 820; y += 22) { const f = frame(640 - 0.15, y, 0, 0); box(m, f, -0.15, 0, 0, 10, -4.5, 4.5, hex('#9ba1a8')); }
    const rnd = RNG(3); m.mat = M.METAL;
    for (let i = 0; i < 22; i++) box(m, frame(670 + rnd() * 250, 180 + rnd() * 620, 34, 0), -4, 4, 0, 3.6, -5.5, 5.5, hex('#b9bcbf'));
    const cc = [hex('#dcdcd9'), hex('#dcdcd9'), hex('#26282b'), hex('#8e959c'), hex('#8e959c'), hex('#b8b2a5'), hex('#4b1d1d'), hex('#2a3f5f')];
    for (let y = 30; y < 128; y += 20) for (let x = 615; x < 920; x += 9.5) if (rnd() > 0.38) carMesh(m, frame(x, y, 0, rnd() < 0.5 ? 0 : Math.PI), cc[Math.floor(rnd() * cc.length)]);
    m.mat = M.PAINT; for (let y = 30; y < 128; y += 20) for (let x = 610; x < 925; x += 9.5) ribbon(m, [[x, y - 9], [x, y + 9]], 0.3, 0.05, hex('#d8d8d4'));
    m.mat = M.WALLRIB;
    box(m, frame(300, -150, 0, 0), -40, 40, 0, 18, -30, 30, { top: hex('#9ea2a6'), side: hex('#c9c4b9') }, 0, { mat: { top: M.ROOFRIB, side: M.WALLRIB } });
    box(m, frame(520, -240, 0, 0), -55, 55, 0, 24, -40, 40, { top: hex('#a6aaae'), side: hex('#b9b4a9') }, 0, { mat: { top: M.ROOFRIB, side: M.WALLRIB } });
    for (let i = 0; i < 9; i++) trailerMesh(m, frame(380 + i * 12, -330, 0, 0), [hex('#d6d9dc'), hex('#e6e6e4'), hex('#9fa6ad')][i % 3]);
    m.mat = 0;
  }

  // ---------------- build ----------------
  function build() {
    const S = new MB();
    addTerrain(S); addWater(S); addRoad(S);
    addRail(S, railW); addRail(S, railE); addRailcars(S, railE, 380, 7);
    addTrees(S); addFence(S); addPEMB(S); addParked(S); addStallPaint(S); addGate(S); addPoles(S); addContext(S);
    const truck = { tractor: new MB(), trailer: new MB() };
    tractorMesh(truck.tractor, ID, CAB.orange); trailerMesh(truck.trailer, ID, TRAILER.white, { coupled: true, stripe: hex('#e2521f'), skirt: true });
    LABELS.push({ id: 'det', text: 'Stormwater detention', sub: '0.41 AC', at: [262, 4, 505] });
    LABELS.push({ id: 'west', text: 'CSX West Wye', sub: '', at: [railWX(250) || 0, 4, 250], muted: true });
    LABELS.push({ id: 'east', text: 'CSX East Wye', sub: '', at: [railEX(230) || 0, 4, 230], muted: true });
    LABELS.push({ id: 'st', text: 'W 145th Street', sub: '', at: [470, 1, -40], muted: true });
    LABELS.push({ id: 'yard', text: '75 trailer stalls', sub: "12' × 75'", at: [290, 18, 260] });
    return {
      statics: S, truck, arm: armMesh(),
      lights: LIGHTS, cams: CAMS, glows: GLOWS, labels: LABELS, gate: GATE, decals: DECALS, M,
    };
  }
  global.Scene3D = { build, C, M };
})(window);
