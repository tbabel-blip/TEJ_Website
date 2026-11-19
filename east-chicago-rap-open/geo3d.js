// Mesh construction helpers + scene geometry for the 1300 W 145th St model.
// Plan coords (x east, y north, feet) -> world (X = x, Y = up, Z = -y).
(function (global) {
  'use strict';

  function hex(h) {
    const n = parseInt(h.slice(1), 16);
    return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255];
  }
  function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
  function shade(c, k) { return [c[0] * k, c[1] * k, c[2] * k]; }

  // seeded random
  function RNG(seed) { let s = seed >>> 0 || 1; return function () { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
  // value noise
  function hash2(x, y) { let h = (x * 374761393 + y * 668265263) | 0; h = (h ^ (h >> 13)) * 1274126177 | 0; return ((h ^ (h >> 16)) >>> 0) / 4294967296; }
  function vnoise(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  function fbm(x, y) { return 0.55 * vnoise(x, y) + 0.3 * vnoise(x * 2.1, y * 2.1) + 0.15 * vnoise(x * 4.3, y * 4.3); }

  // ---------- mesh builder ----------
  // vertex: pos3 nrm3 col3 emissive1 material1  (11 floats; packed to 20 bytes on upload)
  function MB() { this.d = []; this.mat = 0; }
  MB.prototype.v = function (p, n, c, e) { this.d.push(p[0], p[1], p[2], n[0], n[1], n[2], c[0], c[1], c[2], e || 0, this.mat || 0); };
  MB.prototype.pack = function () {
    const n = this.d.length / 11, buf = new ArrayBuffer(n * 20), f = new Float32Array(buf), b = new Int8Array(buf), u = new Uint8Array(buf);
    const cl = (v) => Math.max(0, Math.min(255, Math.round(v * 255)));
    for (let i = 0; i < n; i++) {
      const s = i * 11, o = i * 20;
      f[o / 4] = this.d[s]; f[o / 4 + 1] = this.d[s + 1]; f[o / 4 + 2] = this.d[s + 2];
      b[o + 12] = Math.round(this.d[s + 3] * 127); b[o + 13] = Math.round(this.d[s + 4] * 127); b[o + 14] = Math.round(this.d[s + 5] * 127);
      u[o + 15] = this.d[s + 10];
      u[o + 16] = cl(this.d[s + 6]); u[o + 17] = cl(this.d[s + 7]); u[o + 18] = cl(this.d[s + 8]); u[o + 19] = cl(this.d[s + 9]);
    }
    return { buf, n };
  };
  MB.prototype.tri = function (a, b, c, col, em, nrm) {
    let n = nrm;
    if (!n) {
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      n = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
      const l = Math.hypot(n[0], n[1], n[2]) || 1; n = [n[0] / l, n[1] / l, n[2] / l];
      const r = this.ref;
      if (r && (n[0] * (a[0] - r[0]) + n[1] * (a[1] - r[1]) + n[2] * (a[2] - r[2])) < 0) n = [-n[0], -n[1], -n[2]];
    }
    this.v(a, n, col, em); this.v(b, n, col, em); this.v(c, n, col, em);
  };
  MB.prototype.quad = function (a, b, c, d, col, em) { this.tri(a, b, c, col, em); this.tri(a, c, d, col, em); };
  MB.prototype.count = function () { return this.d.length / 11; };

  // local frame: origin (plan x,y), base height h, heading yaw (rad, 0 = north, cw). local: X right, Y up, Z forward
  function frame(px, py, h, yaw) {
    const c = Math.cos(yaw), s = Math.sin(yaw);
    return function (lx, ly, lz) {
      const x = px + lx * c + lz * s, y = py - lx * s + lz * c;
      return [x, h + ly, -y];
    };
  }
  const ID = frame(0, 0, 0, 0);

  // box in local frame (x0..x1 right, y0..y1 up, z0..z1 forward). col can be color or {top, side, front, back, bottom}
  function box(m, f, x0, x1, y0, y1, z0, z1, col, em, opts) {
    const C = (k) => (col && col.length === 3) ? col : (col[k] || col.side);
    const P = (x, y, z) => f(x, y, z);
    const o = opts || {};
    const prev = m.ref, pm = m.mat; m.ref = f((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    const MT = (k) => { const q = o.mat; m.mat = q === undefined ? pm : (typeof q === 'number' ? q : (q[k] !== undefined ? q[k] : (q.side !== undefined ? q.side : pm))); };
    const EM = (k) => (em && typeof em === 'object') ? (em[k] || 0) : em;
    MT('top'); if (!o.noTop) m.quad(P(x0, y1, z0), P(x1, y1, z0), P(x1, y1, z1), P(x0, y1, z1), C('top'), EM('top'));
    MT('front'); if (!o.noFront) m.quad(P(x0, y0, z1), P(x0, y1, z1), P(x1, y1, z1), P(x1, y0, z1), C('front'), EM('front'));
    MT('back'); if (!o.noBack) m.quad(P(x1, y0, z0), P(x1, y1, z0), P(x0, y1, z0), P(x0, y0, z0), C('back'), EM('back'));
    MT('right'); m.quad(P(x1, y0, z1), P(x1, y1, z1), P(x1, y1, z0), P(x1, y0, z0), C('right'), EM('right'));
    MT('left'); m.quad(P(x0, y0, z0), P(x0, y1, z0), P(x0, y1, z1), P(x0, y0, z1), C('left'), EM('left'));
    MT('bottom'); if (o.bottom) m.quad(P(x0, y0, z1), P(x1, y0, z1), P(x1, y0, z0), P(x0, y0, z0), C('bottom'), EM('bottom'));
    m.ref = prev; m.mat = pm;
  }
  function hexa(m, f, c, col, em, mat) {
    const P = c.map(p => f(p[0], p[1], p[2]));
    const prev = m.ref, pm = m.mat; if (mat !== undefined) m.mat = mat;
    const cx = c.reduce((s, p) => [s[0] + p[0] / 8, s[1] + p[1] / 8, s[2] + p[2] / 8], [0, 0, 0]); m.ref = f(cx[0], cx[1], cx[2]);
    const C = (k) => (col && col.length === 3) ? col : (col[k] || col.side);
    const [b0, b1, b2, b3, t0, t1, t2, t3] = P;
    m.quad(t0, t1, t2, t3, C('top'), em);
    m.quad(b3, b2, t2, t3, C('front'), em);
    m.quad(b1, b0, t0, t1, C('back'), em);
    m.quad(b2, b1, t1, t2, C('right'), em);
    m.quad(b0, b3, t3, t0, C('left'), em);
    m.ref = prev; m.mat = pm;
  }
  // cylinder between local points a,b
  function cyl(m, f, a, b, r, seg, col, em, caps) {
    const ax = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const L = Math.hypot(ax[0], ax[1], ax[2]); const u = [ax[0] / L, ax[1] / L, ax[2] / L];
    let t = Math.abs(u[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    let p = [u[1] * t[2] - u[2] * t[1], u[2] * t[0] - u[0] * t[2], u[0] * t[1] - u[1] * t[0]];
    let l = Math.hypot(p[0], p[1], p[2]); p = [p[0] / l, p[1] / l, p[2] / l];
    const q = [u[1] * p[2] - u[2] * p[1], u[2] * p[0] - u[0] * p[2], u[0] * p[1] - u[1] * p[0]];
    const ring = (c, ang) => [c[0] + r * (Math.cos(ang) * p[0] + Math.sin(ang) * q[0]), c[1] + r * (Math.cos(ang) * p[1] + Math.sin(ang) * q[1]), c[2] + r * (Math.cos(ang) * p[2] + Math.sin(ang) * q[2])];
    const prev = m.ref; m.ref = f((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
    for (let i = 0; i < seg; i++) {
      const a0 = i / seg * Math.PI * 2, a1 = (i + 1) / seg * Math.PI * 2;
      const p0 = f(...ring(a, a0)), p1 = f(...ring(a, a1)), p2 = f(...ring(b, a1)), p3 = f(...ring(b, a0));
      m.quad(p0, p1, p2, p3, col, em);
      if (caps !== false) { m.tri(f(...b), p3, p2, col, em); m.tri(f(...a), p1, p0, col, em); }
    }
    m.ref = prev;
  }
  // low-poly blob (icosahedron, 1 subdivision)
  const ICO = (function () {
    const t = (1 + Math.sqrt(5)) / 2;
    let v = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]];
    let f = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
    v = v.map(p => { const l = Math.hypot(...p); return p.map(c => c / l); });
    const cache = {}; const mid = (a, b) => {
      const k = a < b ? a + '_' + b : b + '_' + a; if (cache[k] !== undefined) return cache[k];
      const p = [(v[a][0] + v[b][0]) / 2, (v[a][1] + v[b][1]) / 2, (v[a][2] + v[b][2]) / 2]; const l = Math.hypot(...p);
      v.push(p.map(c => c / l)); return cache[k] = v.length - 1;
    };
    const f0 = f.map(x => x.slice());
    const f2 = []; f.forEach(([a, b, c]) => { const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a); f2.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]); });
    return { v, f: f2, f0 };
  })();
  function blob(m, cx, cy, h, rx, ry, col, rnd, em, jit, lod0) {
    const prev = m.ref; m.ref = [cx, h, -cy];
    const J = jit || 0.3;
    const vs = ICO.v.map(p => { const k = 1 - J * 0.6 + rnd() * J; return [cx + p[0] * rx * k, h + p[1] * ry * k, -(cy + p[2] * rx * k)]; });
    if (m.smooth) {
      const ns = ICO.v.map((p, i) => { const n = [p[0] / rx, p[1] / ry, p[2] / rx]; const l = Math.hypot(...n); return [n[0] / l, n[1] / l, -n[2] / l]; });
      const cs = ICO.v.map((p) => shade(col, 0.8 + 0.28 * (p[1] * 0.5 + 0.5) + (rnd() - 0.5) * 0.16));
      (lod0 ? ICO.f0 : ICO.f).forEach(([a, b, c]) => { m.v(vs[a], ns[a], cs[a], em); m.v(vs[c], ns[c], cs[c], em); m.v(vs[b], ns[b], cs[b], em); });
    } else ICO.f.forEach(([a, b, c]) => {
      const pa = vs[a], pb = vs[b], pc = vs[c];
      const yy = (pa[1] + pb[1] + pc[1]) / 3 - h;
      const k = 0.78 + 0.32 * (yy / ry * 0.5 + 0.5);
      m.tri(pa, pc, pb, shade(col, k), em);
    });
    m.ref = prev;
  }

  // ribbon along a plan polyline; w = width; h(x,y) height; col; optional sides (raised strip)
  function ribbon(m, pts, w, h, col, sideH, em) {
    const prev = m.ref; m.ref = sideH ? null : [0, -1e6, 0];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1;
      const nx = -dy / L * w / 2, ny = dx / L * w / 2;
      // mitre with neighbours for smoothness
      const pa = i > 0 ? pts[i - 1] : a, pb = i < pts.length - 2 ? pts[i + 2] : b;
      const n0 = nrm(pa, b, w), n1 = nrm(a, pb, w);
      const A0 = [a[0] + n0[0], a[1] + n0[1]], A1 = [a[0] - n0[0], a[1] - n0[1]];
      const B0 = [b[0] + n1[0], b[1] + n1[1]], B1 = [b[0] - n1[0], b[1] - n1[1]];
      const ha = typeof h === 'function' ? h : () => h;
      const W = (p) => [p[0], ha(p[0], p[1]), -p[1]];
      m.quad(W(A1), W(B1), W(B0), W(A0), typeof col === 'function' ? col(i) : col, em);
      if (sideH) {
        const D = (p) => [p[0], ha(p[0], p[1]) - sideH, -p[1]];
        m.quad(D(A0), W(A0), W(B0), D(B0), shade(typeof col === 'function' ? col(i) : col, 0.8), em);
        m.quad(D(B1), W(B1), W(A1), D(A1), shade(typeof col === 'function' ? col(i) : col, 0.8), em);
      }
    }
    m.ref = prev;
    function nrm(p, q, w) { const dx = q[0] - p[0], dy = q[1] - p[1], L = Math.hypot(dx, dy) || 1; return [-dy / L * w / 2, dx / L * w / 2]; }
  }

  function pip(pt, poly) {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i], b = poly[j];
      if (((a[1] > pt[1]) !== (b[1] > pt[1])) && (pt[0] < (b[0] - a[0]) * (pt[1] - a[1]) / (b[1] - a[1]) + a[0])) c = !c;
    }
    return c;
  }
  function distSeg(p, a, b) {
    const dx = b[0] - a[0], dy = b[1] - a[1]; const L2 = dx * dx + dy * dy || 1;
    let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2; t = Math.max(0, Math.min(1, t));
    return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
  }
  function distPoly(p, poly, closed) {
    let d = 1e9; const n = poly.length;
    for (let i = 0; i < n - (closed ? 0 : 1); i++) d = Math.min(d, distSeg(p, poly[i], poly[(i + 1) % n]));
    return d;
  }
  function plineAt(pl, y) { // x of polyline at plan y (first crossing)
    for (let i = 1; i < pl.length; i++) {
      const a = pl[i - 1], b = pl[i];
      if ((a[1] - y) * (b[1] - y) <= 0 && a[1] !== b[1]) return a[0] + (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]);
    }
    return null;
  }
  function resample(pl, step) {
    const out = [pl[0]]; let acc = 0;
    for (let i = 1; i < pl.length; i++) {
      const a = pl[i - 1], b = pl[i]; const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      let s = step - acc;
      while (s <= L) { out.push([a[0] + (b[0] - a[0]) * s / L, a[1] + (b[1] - a[1]) * s / L]); s += step; }
      acc = (acc + L) % step;
    }
    return out;
  }

  global.G3 = { hex, mix, shade, RNG, fbm, vnoise, MB, frame, ID, box, hexa, cyl, blob, ribbon, pip, distPoly, distSeg, plineAt, resample };
})(window);
