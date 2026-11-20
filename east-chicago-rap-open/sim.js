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

  const DRIVE_X0 = 298;
  const X_FAR = DRIVE_X0 - 34 - 330;   // trucks appear / leave between White Oak Ave and the CSX West Wye crossing (soft fade)
  const LANE_Y = -30, LANE_IN = -50, DRIVE_X = 298, AISLE_Y = 128;
  const STALL_X = 373;            // orange drops its trailer here (SE row)
  const STALL_B = 349;            // blue truck's trailer waits here (same row, two stalls closer to the entrance)
  const BAY_X = 251, DOOR_Y = 82; // PEMB bay door nearest the entrance (yard side)
  const RIG = { len: 66, fw: 16 };   // tractor front -> fifth wheel 16', overall 66'
  const ARM_Y = 78;

  // ---- paths (feet) ----
  // Orange: in from the west on the eastbound lane, left into the drive, east along the aisle.
  const S = new Path()
    .line([X_FAR, LANE_IN], [DRIVE_X - 34, LANE_IN])
    .arc([DRIVE_X - 34, LANE_IN + 34], 34, -Math.PI / 2, 0)
    .line([DRIVE_X, LANE_IN + 34], [DRIVE_X, 100])
    .arc([DRIVE_X + 28, 100], 28, Math.PI, Math.PI / 2)
    .line([DRIVE_X + 28, AISLE_Y], [484, AISLE_Y]).done();
  // Orange: reverse into the stall (lead = trailer rear).
  const T = new Path()
    .line([484, AISLE_Y], [418, AISLE_Y])
    .arc([418, AISLE_Y - 45], 45, Math.PI / 2, Math.PI)
    .line([STALL_X, AISLE_Y - 45], [STALL_X, 20]).done();
  // Orange tractor (bobtail) after unhooking: north out of the stall, west along the aisle, nose-in to the bay.
  const OB = new Path()
    .line([STALL_X, 70], [STALL_X, 100])
    .arc([STALL_X - 20, 100], 20, 0, Math.PI / 2)
    .line([STALL_X - 20, 120], [BAY_X + 18, 120])
    .arc([BAY_X + 18, 102], 18, Math.PI / 2, Math.PI)
    .line([BAY_X, 102], [BAY_X, 56]).done();
  // Blue tractor (bobtail): out of the bay, east along the aisle, swing to face north above its trailer.
  // Blue tractor (bobtail): out of the bay, east along the aisle, pulls past its trailer and stops.
  const B_AY = 118, B_R = 30, B_ARC = STALL_B + B_R;   // reverse arc: radius 30', ends lined up over the stall
  const BB = new Path()
    .line([BAY_X, 62], [BAY_X, 100])
    .arc([BAY_X + 18, 100], 18, Math.PI, Math.PI / 2)
    .line([BAY_X + 18, B_AY], [B_ARC + 28, B_AY]).done();
  // Blue tractor backs under the trailer the way a driver would (lead = fifth wheel): a short straight,
  // one smooth reverse curve that swings it in line with the trailer, then a short straight push to couple.
  const BR = new Path()
    .line([B_ARC + 28, B_AY], [B_ARC, B_AY])
    .arc([B_ARC, B_AY - B_R], B_R, Math.PI / 2, Math.PI)
    .line([STALL_B, B_AY - B_R], [STALL_B, 70]).done();
  // Blue rig departs: north out of the stall, U-turn over the aisle, down the drive, right onto W 145th St.
  const BD = new Path()
    .line([STALL_B, 20], [STALL_B, 90])
    .arc([STALL_B - 25, 90], 25, 0, Math.PI / 2)
    .arc([STALL_B - 25, 89], 26, Math.PI / 2, Math.PI)
    .line([DRIVE_X, 89], [DRIVE_X, 0])
    .arc([DRIVE_X - 30, 0], 30, 0, -Math.PI / 2)
    .line([DRIVE_X - 30, LANE_Y], [X_FAR, LANE_Y]).done();

  // ---- per-truck timelines ----
  // Even pace: one steady cruise speed for both trucks everywhere (street, turns, yard, reverse),
  // with gentle constant-acceleration starts and stops.
  const V = 12, ACC = 3;                              // ft/s (~8 mph), ft/s^2
  function Track() { this.segs = []; this.t = 0; }
  Track.prototype.add = function (o) { o.t0 = this.t; o.t1 = this.t + o.dur; this.segs.push(o); this.t = o.t1; return o; };
  Track.prototype.move = function (path, mode, cfg, a, b, speed) { return this.add({ path, mode, cfg, a, b, dur: Math.abs(b - a) / speed }); };
  Track.prototype.ramp = function (path, mode, cfg, a, b, v0, v1, brake) {
    const L = Math.abs(b - a), dur = 2 * L / (v0 + v1);
    return this.add({ path, mode, cfg, a, b, dur, brake, ease: (k) => (v0 * k * dur + (v1 - v0) * k * k * dur / 2) / L });
  };
  Track.prototype.wait = function (path, mode, cfg, at, dur, tag) { return this.add({ path, mode, cfg, a: at, b: at, dur, tag }); };
  Track.prototype.cruise = function (path, mode, cfg, a, b, fromStop, toStop) {
    const dir = Math.sign(b - a) || 1, dA = V * V / (2 * ACC); let p = a;
    if (fromStop) { this.ramp(path, mode, cfg, p, p + dir * dA, 0.0001, V); p += dir * dA; }
    const pEnd = toStop ? b - dir * dA : b;
    if (Math.abs(pEnd - p) > 0.01) this.move(path, mode, cfg, p, pEnd, V);
    if (toStop) this.ramp(path, mode, cfg, pEnd, b, V, 0.0001, true);
  };

  // Blue: door opens (0-3 s), bobtail out, back under the trailer, hook up, pull out, exit west.
  const B = new Track();
  B.wait(BB, 'fwd', 'bob', 0, 3.0, 'shopOut');
  B.cruise(BB, 'fwd', 'bob', 0, BB.len, true, true);
  B.wait(BR, 'rev', 'bob', 16, 0.6);
  B.cruise(BR, 'rev', 'bob', 16, BR.len, true, true);
  const tHook = B.wait(BR, 'rev', 'bob', BR.len, 4.0, 'hooking').t1;
  B.cruise(BD, 'fwd', 'rig', RIG.len, BD.findY(4, 150), true, true);
  B.wait(BD, 'fwd', 'rig', BD.findY(4, 150), 1.5, 'curb');
  B.cruise(BD, 'fwd', 'rig', BD.findY(4, 150), BD.len, true, false);
  const tBlueGone = B.t;

  // Orange: timed so it turns into the drive only after the blue rig has cleared the drive mouth.
  function bluePose(tt) { return trackPose(B, tt); }
  let tClear = 0;
  for (let tt = tHook; tt < tBlueGone; tt += 0.05) { const p = bluePose(tt); if (p.rear[1] < -20 && p.rear[0] < 250) { tClear = tt; break; } }
  const sTurn = 264 - X_FAR;                          // inbound arc-length where the left turn begins
  const tA = Math.max(0, tClear + 1.0 - sTurn / V);
  const O = new Track(); O.t = tA;
  O.cruise(S, 'fwd', 'rig', 0, S.len, false, true);
  O.wait(S, 'fwd', 'rig', S.len, 1.5);
  O.cruise(T, 'rev', 'rig', RIG.len, T.len, true, true);
  const tDrop = O.wait(T, 'rev', 'rig', T.len, 4.0, 'unhooking').t1;
  O.cruise(OB, 'fwd', 'bob', 16, OB.len, true, true);
  const tOrangeIn = O.t;
  O.wait(OB, 'fwd', 'bob', OB.len, 3.5, 'inShop');    // door closes behind it
  const tSwap0 = O.t + 0.5;
  const TOTAL = tSwap0 + 2.0;                         // quiet 2 s reset: dropped trailer fades out, next trailer fades in
  O.wait(OB, 'fwd', 'bob', OB.len, TOTAL - O.t, 'inShop');
  B.wait(BD, 'fwd', 'rig', BD.len, TOTAL - B.t, 'gone');

  function ease(k, e) { return !e ? k : e(k); }
  function segAt(tr, tt) { const g = tr.segs; if (tt < g[0].t0) return null; for (const q of g) if (tt < q.t1) return q; return g[g.length - 1]; }
  function trackPose(tr, tt) {
    const sg = segAt(tr, tt); if (!sg) return null;
    const k = sg.t1 > sg.t0 ? Math.min(1, Math.max(0, (tt - sg.t0) / (sg.t1 - sg.t0))) : 1;
    const d = sg.a + (sg.b - sg.a) * ease(k, sg.ease), P = sg.path;
    let front, fw, rear = null;
    if (sg.cfg === 'rig') {
      if (sg.mode === 'fwd') { front = P.at(d); fw = P.at(d - RIG.fw); rear = P.at(d - RIG.len); }
      else { rear = P.at(d); fw = P.at(d - (RIG.len - RIG.fw)); front = P.at(d - RIG.len); }
    } else {
      if (sg.mode === 'fwd') { front = P.at(d); fw = P.at(d - RIG.fw); }
      else { fw = P.at(d); front = P.at(d - RIG.fw); }
    }
    const moving = sg.a !== sg.b;
    const k2 = Math.min(1, k + 0.02);
    const spd = moving ? Math.abs((ease(k2, sg.ease) - ease(k, sg.ease)) * (sg.b - sg.a) / ((sg.t1 - sg.t0) * 0.02)) : 0;
    return { front, fw, rear, cfg: sg.cfg, tag: sg.tag || null,
      tractorHeading: Math.atan2(front[0] - fw[0], front[1] - fw[1]),
      trailerHeading: rear ? Math.atan2(fw[0] - rear[0], fw[1] - rear[1]) : 0,
      reversing: sg.mode === 'rev' && moving, braking: !moving || !!sg.brake, moving, speed: spd };
  }

  // ---- bay door (0 closed .. 1 open), smooth 3 s roll ----
  function smooth(x) { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); }
  const tBlueOut = (function () { for (let tt = 3; tt < tHook; tt += 0.05) { const p = trackPose(B, tt); if (p.fw[1] - 7 > DOOR_Y + 2) return tt; } return 12; })();
  const tOrangeAtDoor = (function () { for (let tt = tDrop; tt < tOrangeIn; tt += 0.05) { const p = trackPose(O, tt); if (p.front[0] < BAY_X + 3 && p.front[1] < DOOR_Y + 6) return tt; } return tOrangeIn - 3; })();
  function door(tt) {
    const a = smooth(tt / 3.0) * (1 - smooth((tt - tBlueOut) / 3.0));
    const b = smooth((tt - (tOrangeAtDoor - 3.2)) / 3.0) * (1 - smooth((tt - (tOrangeIn + 0.3)) / 3.0));
    return Math.max(a, b);
  }

  // ---- all vehicles at time t (for the 3D model and the 2D plan) ----
  const TRL_B = { rear: [STALL_B, 20], heading: 0 }, TRL_O = { rear: [STALL_X, 20], heading: 0 };
  function vehicles(tt) {
    tt = ((tt % TOTAL) + TOTAL) % TOTAL;
    const out = [];
    const swap = smooth((tt - tSwap0) / 2.0);
    // blue truck
    const b = trackPose(B, tt), bOnStreetFade = tt > tBlueGone ? 0 : Math.max(0, Math.min(1, (tBlueGone - tt) / 4.0));
    const blueGone = tt >= tBlueGone;
    if (!blueGone) out.push({ id: 'blue', tractor: { fw: b.fw, heading: b.tractorHeading }, fade: bOnStreetFade,
      inShop: tt < 3.0 + 1.0 && door(tt) < 0.05, lights: b,
      trailer: b.cfg === 'rig' ? { kind: 'blueC', rear: b.rear, heading: b.trailerHeading } : null });
    // blue's trailer waiting in its stall (until hooked) and fading back in during the reset
    if (tt < tHook) out.push({ id: 'blueTrl', fade: 1, trailer: { kind: 'blueU', rear: TRL_B.rear, heading: 0 } });
    else if (swap > 0) out.push({ id: 'blueTrl', fade: swap, trailer: { kind: 'blueU', rear: TRL_B.rear, heading: 0 } });
    // orange truck
    const o = trackPose(O, tt);
    if (o) {
      const fIn = Math.max(0, Math.min(1, (tt - tA) / 4.0));
      out.push({ id: 'orange', tractor: { fw: o.fw, heading: o.tractorHeading }, fade: fIn, lights: o,
        inShop: o.tag === 'inShop' && door(tt) < 0.05,
        trailer: o.cfg === 'rig' ? { kind: 'orangeC', rear: o.rear, heading: o.trailerHeading } : null });
      if (o.cfg === 'bob' || tt >= tDrop) out.push({ id: 'orangeTrl', fade: 1 - swap, trailer: { kind: 'orangeU', rear: TRL_O.rear, heading: 0 } });
    }
    return out;
  }

  // primary truck (for headlights / status): whichever is moving and visible, orange first once it is in view
  function pose(tt) {
    tt = ((tt % TOTAL) + TOTAL) % TOTAL;
    const o = trackPose(O, tt), b = trackPose(B, tt);
    const useO = o && (tt >= tA + 1) && (o.moving || tt >= tBlueGone);
    const p = useO ? o : b;
    const rear = p.rear || p.fw;
    return { front: p.front, fw: p.fw, rear, tractorHeading: p.tractorHeading, trailerHeading: p.rear ? p.trailerHeading : p.tractorHeading,
      reversing: p.reversing, braking: p.braking, visible: true, fade: 1, phase: phaseAt(tt), speed: p.speed, who: useO ? 'orange' : 'blue' };
  }

  // ---- story beats (status text + timeline marks) ----
  const tBlueRev = B.segs.find(q => q.path === BR && q.a !== q.b).t0;
  const tBlueCurb = B.segs.find(q => q.tag === 'curb').t0;
  const tOrangeRev = O.segs.find(q => q.path === T && q.a !== q.b).t0;
  const tOrangeTurn = tA + sTurn / V;
  const tBobO = O.segs.find(q => q.path === OB && q.a !== q.b).t0;
  const BEATS = [
    [0, 'shopOut', 'Blue truck pulling out of the shop'],
    [tBlueRev, 'hookRev', 'Blue truck backing under its trailer'],
    [tHook - 4.0, 'hooking', 'Hooking up the trailer'],
    [tHook, 'pullOut', 'Pulling out with the trailer'],
    [tBlueCurb, 'curb', 'Checking traffic on W 145th St'],
    [tBlueCurb + 1.5, 'passing', 'Blue truck leaving · orange truck arriving'],
    [tOrangeTurn - 1, 'entering', 'Orange truck entering the yard'],
    [tOrangeRev, 'reversing', 'Backing into an open stall'],
    [tDrop - 4.0, 'unhooking', 'Unhooking the trailer'],
    [tBobO, 'toShop', 'Tractor heading into the shop'],
    [tOrangeIn, 'inShop', 'Tractor in for service'],
  ];
  function phaseAt(tt) { let ph = BEATS[0][1]; for (const b of BEATS) if (b[0] <= tt) ph = b[1]; return ph; }
  function status(tt) { tt = ((tt % TOTAL) + TOTAL) % TOTAL; let s = BEATS[0][2]; for (const b of BEATS) if (b[0] <= tt) s = b[2]; return s; }
  const MARKS = [['Shop exit', 0], ['Hook-up', tHook - 4.0], ['Exit', tBlueCurb], ['Entering', tOrangeTurn - 1], ['Backing in', tOrangeRev], ['Unhook', tDrop - 4.0], ['To shop', tBobO]];
  const BANDS = [
    { label: 'Blue truck out', color: '#2aa3ff', t0: 0, t1: tBlueGone, marks: [['Shop exit', 0], ['Backing under trailer', tBlueRev], ['Hook-up', tHook - 4.0], ['Pulling out', tHook], ['Exit onto W 145th St', tBlueCurb]] },
    { label: 'Orange truck in', color: '#ff5623', t0: tA, t1: tOrangeIn + 3.5, marks: [['Arriving', tA], ['Entering', tOrangeTurn - 1], ['Backing in', tOrangeRev], ['Unhook', tDrop - 4.0], ['To shop', tBobO], ['In for service', tOrangeIn]] },
  ];

  function arm() { return 0; }
  global.SiteSim = { pose, vehicles, door, status, MARKS, BANDS, arm, TOTAL, BAY_X, DOOR_Y,
    paths: { inbound: S, reverse: T, outbound: BD, orangeShop: OB, blueShop: BB, blueRev: BR }, RIG, ARM_Y, STALL_X,
    _t: { tA, tClear, tHook, tBlueGone, tDrop, tOrangeIn, tBlueOut, tOrangeAtDoor } };
})(typeof window !== 'undefined' ? window : globalThis);
