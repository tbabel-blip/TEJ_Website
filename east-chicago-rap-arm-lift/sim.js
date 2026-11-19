// Truck movement timeline shared by the 2D plan and the 3D model.
// Units: feet. x = east, y = north. Origin = SW property corner on the north line of W 145th St.
(function (global) {
  'use strict';
  const STEP = 0.5;

  function Path() { this.p = []; }
  Path.prototype.line = function (a, b) {
    const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / STEP));
    for (let i = (this.p.length ? 1 : 0); i <= n; i++) this.p.push([a[0] + (b[0] - a[0]) * i / n, a[1] + (b[1] - a[1]) * i / n]);
    return this;
  };
  Path.prototype.arc = function (c, r, a0, a1) {
    const n = Math.max(2, Math.ceil(Math.abs(a1 - a0) * r / STEP));
    for (let i = 1; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; this.p.push([c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)]); }
    return this;
  };
  Path.prototype.done = function () {
    const s = [0];
    for (let i = 1; i < this.p.length; i++) s.push(s[i - 1] + Math.hypot(this.p[i][0] - this.p[i - 1][0], this.p[i][1] - this.p[i - 1][1]));
    this.s = s; this.len = s[s.length - 1]; return this;
  };
  Path.prototype.at = function (d) {
    const s = this.s, p = this.p;
    if (d <= 0) { const k = (d) / (s[1] || 1); return [p[0][0] + (p[1][0] - p[0][0]) * k, p[0][1] + (p[1][1] - p[0][1]) * k]; }
    if (d >= this.len) { const n = p.length - 1, k = (d - s[n]) / (s[n] - s[n - 1]); return [p[n][0] + (p[n][0] - p[n - 1][0]) * k, p[n][1] + (p[n][1] - p[n - 1][1]) * k]; }
    let lo = 0, hi = s.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (s[m] <= d) lo = m; else hi = m; }
    const k = (d - s[lo]) / (s[hi] - s[lo]);
    return [p[lo][0] + (p[hi][0] - p[lo][0]) * k, p[lo][1] + (p[hi][1] - p[lo][1]) * k];
  };
  Path.prototype.findY = function (y, from) {   // first arc-length (after `from`) where path crosses y
    for (let i = 1; i < this.p.length; i++) {
      if (this.s[i] < (from || 0)) continue;
      const a = this.p[i - 1][1], b = this.p[i][1];
      if ((a - y) * (b - y) <= 0 && a !== b) return this.s[i - 1] + (this.s[i] - this.s[i - 1]) * (y - a) / (b - a);
    }
    return null;
  };

  const LANE_Y = -30, LANE_IN = -50, DRIVE_X = 298, AISLE_Y = 128;
  const STALL_X = 373;            // SE row, stall #5 from the entry (empty at start)
  // Inbound: from the west on the eastbound lane, left turn into the drive, through the lift arm, east along the aisle.
  const S = new Path()
    .line([-1800, LANE_IN], [DRIVE_X - 34, LANE_IN])
    .arc([DRIVE_X - 34, LANE_IN + 34], 34, -Math.PI / 2, 0)
    .line([DRIVE_X, LANE_IN + 34], [DRIVE_X, 100])
    .arc([DRIVE_X + 28, 100], 28, Math.PI, Math.PI / 2)
    .line([DRIVE_X + 28, AISLE_Y], [484, AISLE_Y]).done();
  // Reverse into the stall (lead point = trailer rear).
  const T = new Path()
    .line([484, AISLE_Y], [418, AISLE_Y])
    .arc([418, AISLE_Y - 45], 45, Math.PI / 2, Math.PI)
    .line([STALL_X, AISLE_Y - 45], [STALL_X, 20]).done();
  // Departure: pull out, swing west along the aisle, out through the lift arm, right turn onto W 145th St.
  const D = new Path()
    .line([STALL_X, 20], [STALL_X, 95])
    .arc([STALL_X - 30, 95], 30, 0, Math.PI / 2)
    .line([STALL_X - 30, 125], [333, 125])
    .arc([333, 90], 35, Math.PI / 2, Math.PI)
    .line([DRIVE_X, 90], [DRIVE_X, 0])
    .arc([DRIVE_X - 30, 0], 30, 0, -Math.PI / 2)
    .line([DRIVE_X - 30, LANE_Y], [-1800, LANE_Y]).done();

  const RIG = { len: 66, fw: 16 };   // tractor front -> fifth wheel 16', overall 66'
  const ARM_Y = 78;

  // ---- timeline ----
  const segs = [];
  let t = 0;
  function move(path, mode, a, b, speed, ease) {
    const dur = Math.abs(b - a) / speed * (ease === 'both' ? 1.5 : ease ? 1.3 : 1);
    segs.push({ t0: t, t1: t + dur, path, mode, a, b, ease }); t += dur;
  }
  // constant-acceleration segment: speed changes smoothly from v0 to v1 (no jumps in pace)
  function ramp(path, mode, a, b, v0, v1) {
    const L = Math.abs(b - a), dur = 2 * L / (v0 + v1);
    const f = (k) => (v0 * k * dur + (v1 - v0) * k * k * dur / 2) / L;
    segs.push({ t0: t, t1: t + dur, path, mode, a, b, ease: f }); t += dur;
  }
  function wait(path, mode, at, dur, tag) { segs.push({ t0: t, t1: t + dur, path, mode, a: at, b: at, tag }); t += dur; }

  const sStopIn = S.findY(ARM_Y - 8, 200);          // front stops 8' short of the arm
  ramp(S, 'fwd', 0, 1560, 44, 30.77);                // arrives from far down W 145th St, slowing smoothly
  move(S, 'fwd', 1560, sStopIn, 20, 'out');
  wait(S, 'fwd', sStopIn, 5.0, 'gateIn');
  move(S, 'fwd', sStopIn, S.len, 8, 'both');
  wait(S, 'fwd', S.len, 1.5);
  move(T, 'rev', RIG.len, T.len, 3.2, 'both');
  wait(T, 'rev', T.len, 6, 'parked');
  const sStopOut = D.findY(ARM_Y + 12, 150);
  move(D, 'fwd', RIG.len, sStopOut, 7, 'both');
  wait(D, 'fwd', sStopOut, 4.0, 'gateOut');
  ramp(D, 'fwd', sStopOut, D.len, 0, 44);           // pulls away and accelerates smoothly out of view
  wait(D, 'fwd', D.len, 2.5, 'gone');
  const TOTAL = t;

  function ease(k, e) {
    if (!e) return k;
    if (typeof e === 'function') return e(k);
    if (e === 'out') return 1 - (1 - k) * (1 - k);
    if (e === 'in') return k * k;
    return k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
  }

  function seg(tt) { for (const sg of segs) if (tt < sg.t1) return sg; return segs[segs.length - 1]; }

  function pose(tt) {
    tt = ((tt % TOTAL) + TOTAL) % TOTAL;
    const sg = seg(tt);
    const k = sg.t1 > sg.t0 ? Math.min(1, Math.max(0, (tt - sg.t0) / (sg.t1 - sg.t0))) : 1;
    const d = sg.a + (sg.b - sg.a) * ease(k, sg.ease);
    let front, fw, rear;
    if (sg.mode === 'fwd') { front = sg.path.at(d); fw = sg.path.at(d - RIG.fw); rear = sg.path.at(d - RIG.len); }
    else { rear = sg.path.at(d); fw = sg.path.at(d - (RIG.len - RIG.fw)); front = sg.path.at(d - RIG.len); }
    // velocity sign for lights
    const moving = sg.a !== sg.b;
    const dk = 0.02;
    const k2 = Math.min(1, k + dk);
    const speedNow = moving ? (ease(k2, sg.ease) - ease(k, sg.ease)) * (sg.b - sg.a) / ((sg.t1 - sg.t0) * dk) : 0;
    return {
      front, fw, rear,
      tractorHeading: Math.atan2(front[0] - fw[0], front[1] - fw[1]),   // radians, 0 = north, cw
      trailerHeading: Math.atan2(fw[0] - rear[0], fw[1] - rear[1]),
      reversing: sg.mode === 'rev' && moving,
      braking: !moving || (sg.ease === 'out' && k > 0.4) || (sg.ease === 'both' && k > 0.6),
      visible: sg.tag !== 'gone',
      phase: sg.tag || (sg.mode === 'rev' ? 'reversing' : 'driving'),
      speed: Math.abs(speedNow)
    };
  }

  // Lift-arm opening (0 closed .. 1 open), pre-simulated so it is deterministic for any t.
  const DT = 0.05, armTab = [];
  (function () {
    let a = 0;
    const N = Math.ceil(TOTAL / DT) + 1;
    const need = [];
    for (let i = 0; i < N; i++) {
      const tt = i * DT, p = pose(tt), sg = seg(tt);
      const near = (pt) => pt[0] > 270 && pt[0] < 326 && pt[1] > ARM_Y - 14 && pt[1] < ARM_Y + 14;
      const waiting = (sg.tag === 'gateIn' && tt > sg.t0 + 1.2) || (sg.tag === 'gateOut' && tt > sg.t0 + 0.4);
      need.push(p.visible && (waiting || near(p.front) || near(p.fw) || near(p.rear) ||
        (Math.min(p.front[1], p.rear[1]) < ARM_Y && Math.max(p.front[1], p.rear[1]) > ARM_Y && Math.abs(p.fw[0] - 298) < 40)));
    }
    for (let pass = 0; pass < 2; pass++) for (let i = 0; i < N; i++) {
      a += need[i] ? DT / 3.2 : -DT / 3.8; a = Math.max(0, Math.min(1, a)); armTab[i] = a;
    }
  })();
  function arm(tt) {
    tt = ((tt % TOTAL) + TOTAL) % TOTAL;
    const x = tt / DT, i = Math.floor(x), f = x - i;
    const a0 = armTab[i] || 0, a1 = armTab[i + 1] === undefined ? a0 : armTab[i + 1];
    const v = a0 + (a1 - a0) * f;
    return v * v * (3 - 2 * v);
  }

  global.SiteSim = { pose, arm, TOTAL, paths: { inbound: S, reverse: T, outbound: D }, RIG, ARM_Y, STALL_X };
})(typeof window !== 'undefined' ? window : globalThis);
