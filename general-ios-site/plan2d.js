// Site plan: satellite-style top-down render (from the 3D model) + annotation overlay + live truck.
(function (global) {
  'use strict';
  const D = global.SITE_DATA;
  const NS = 'http://www.w3.org/2000/svg';
  const VB = (() => { const h = D.DP + 210, w = h * 1080 / 905, cx = (D.X0 + D.X1) / 2; return [cx - w / 2, -(D.DP + 90), w, h]; })();            // svg units = feet; svg y = -plan y
  const WIN = { x0: VB[0], x1: VB[0] + VB[2], y0: -(VB[1] + VB[3]), y1: -VB[1] };
  const P = (p) => `${(+p[0]).toFixed(1)},${(-p[1]).toFixed(1)}`;
  const path = (a, close) => 'M' + a.map(P).join(' L') + (close ? ' Z' : '');
  function plineAt(pl, y) { for (let i = 1; i < pl.length; i++) { const a = pl[i - 1], b = pl[i]; if ((a[1] - y) * (b[1] - y) <= 0 && a[1] !== b[1]) return a[0] + (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]); } return null; }
  function text(x, y, s, cls, extra) { return `<text x="${x}" y="${-y}" class="${cls}" ${extra || ''}>${s}</text>`; }

  function build(el) {
    const o = [];
    o.push(`<svg xmlns="${NS}" viewBox="${VB.join(' ')}" class="plan" preserveAspectRatio="xMidYMid meet">`);
    o.push(`<defs>
      <clipPath id="cVB"><rect x="${VB[0]}" y="${VB[1]}" width="${VB[2]}" height="${VB[3]}"/></clipPath>
      <radialGradient id="gLed"><stop offset="0" stop-color="#ff3a2a" stop-opacity="1"/><stop offset="1" stop-color="#ff3a2a" stop-opacity="0"/></radialGradient>
      <linearGradient id="gCone" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#7fd8ff" stop-opacity=".30"/><stop offset="1" stop-color="#7fd8ff" stop-opacity="0"/></linearGradient>
      <linearGradient id="gRoof" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#d9dadb"/><stop offset=".5" stop-color="#f4f4f3"/><stop offset="1" stop-color="#cfd0d1"/></linearGradient>
      <marker id="mIn" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="3.6" markerHeight="3.6" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="#ff5623"/></marker>
      <marker id="mOut" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="3.6" markerHeight="3.6" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="#2aa3ff"/></marker>
      <filter id="fSh" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="2.2" dy="1.6" stdDeviation="1.2" flood-color="#000" flood-opacity=".38"/></filter>
    </defs><g clip-path="url(#cVB)">`);
    o.push(`<rect x="${VB[0]}" y="${VB[1]}" width="${VB[2]}" height="${VB[3]}" class="base-bg"/>`);
    o.push(`<image id="baseImg" x="${VB[0]}" y="${VB[1]}" width="${VB[2]}" height="${VB[3]}" preserveAspectRatio="none" href=""/>`);
    // annotations
    o.push(`<path d="${path(D.boundary, true)}" class="prop"/>`);
    const S = global.SiteSim.paths; const thinP = (pp, k) => pp.p.filter((_, i) => i % k === 0).concat([pp.p[pp.p.length - 1]]);
    o.push(`<g class="routes"><path d="${path(thinP(S.inbound, 6).filter(p => p[0] > -230))}" class="route route-in" marker-end="url(#mIn)"/>`);
    o.push(`<path d="${path(thinP(S.reverse, 6))}" class="route route-rev" marker-end="url(#mIn)"/>`);
    o.push(`<path d="${path(thinP(S.orangeShop, 4))}" class="route route-in" marker-end="url(#mIn)"/>`);
    o.push(`<path d="${path(thinP(S.blueShop, 4))}" class="route route-out" marker-end="url(#mOut)"/>`);
    o.push(`<path d="${path(thinP(S.blueRev, 4))}" class="route route-rev route-rev-b" marker-end="url(#mOut)"/>`);
    o.push(`<path d="${path(thinP(S.outbound, 6).filter(p => p[0] < 900))}" class="route route-out" marker-end="url(#mOut)"/></g>`);
    // cameras (coverage cones at night + blinking LEDs)
    const cams = [];
    D.cams.forEach(([x, y, z, yaw], i) => { cams.push(`<g transform="translate(${x} ${-y}) rotate(${yaw - 90})"><path d="M0,0 L70,-26 A75,75 0 0 1 70,26 Z" class="cam-cone"/><circle cx="2.4" cy="0" r="3.4" fill="url(#gLed)" class="led" style="animation-delay:${(-i * 0.37).toFixed(2)}s"/></g>`); });
    o.push(`<g class="cams">${cams.join('')}</g>`);
    // live trucks (top view): two trailers each for the orange and blue trucks, two tractors
    o.push(`<g id="fleet" filter="url(#fSh)"><g id="tr_orange" style="display:none"><rect x="-4.25" y="-53" width="8.5" height="53" rx=".6" fill="url(#gRoof)" stroke="#9a9b9c" stroke-width=".35"/>${Array.from({ length: 12 }, (_, i) => `<line x1="-4.1" x2="4.1" y1="${-3 - i * 4.2}" y2="${-3 - i * 4.2}" class="roofrib"/>`).join('')}</g><g id="tr_orangeTrl" style="display:none"><rect x="-4.25" y="-53" width="8.5" height="53" rx=".6" fill="url(#gRoof)" stroke="#9a9b9c" stroke-width=".35"/>${Array.from({ length: 12 }, (_, i) => `<line x1="-4.1" x2="4.1" y1="${-3 - i * 4.2}" y2="${-3 - i * 4.2}" class="roofrib"/>`).join('')}</g><g id="tr_blue" style="display:none"><rect x="-4.25" y="-53" width="8.5" height="53" rx=".6" fill="url(#gRoof)" stroke="#9a9b9c" stroke-width=".35"/>${Array.from({ length: 12 }, (_, i) => `<line x1="-4.1" x2="4.1" y1="${-3 - i * 4.2}" y2="${-3 - i * 4.2}" class="roofrib"/>`).join('')}</g><g id="tr_blueTrl" style="display:none"><rect x="-4.25" y="-53" width="8.5" height="53" rx=".6" fill="url(#gRoof)" stroke="#9a9b9c" stroke-width=".35"/>${Array.from({ length: 12 }, (_, i) => `<line x1="-4.1" x2="4.1" y1="${-3 - i * 4.2}" y2="${-3 - i * 4.2}" class="roofrib"/>`).join('')}</g><g id="cab_orange" style="display:none"><rect x="-4" y="-16.3" width="8" height="22.6" rx="1.4" fill="#d9481c" stroke="#7a2a10" stroke-width=".35"/><rect x="-3.6" y="-9.6" width="7.2" height="2.0" rx=".5" fill="#1d2630"/><rect x="-3.2" y="-16" width="6.4" height="5.6" rx="1" fill="#c43f17"/><rect x="-3.9" y="-2" width="7.8" height="8" rx="1" fill="#b83a14"/></g><g id="cab_blue" style="display:none"><rect x="-4" y="-16.3" width="8" height="22.6" rx="1.4" fill="#21477e" stroke="#10223e" stroke-width=".35"/><rect x="-3.6" y="-9.6" width="7.2" height="2.0" rx=".5" fill="#1d2630"/><rect x="-3.2" y="-16" width="6.4" height="5.6" rx="1" fill="#1c3d6c"/><rect x="-3.9" y="-2" width="7.8" height="8" rx="1" fill="#183660"/></g><g id="bm_orange" style="display:none"><path d="M -2.8,-16 L -10,-64 L 2,-64 Z" class="beam"/><path d="M 2.8,-16 L -2,-64 L 10,-64 Z" class="beam"/></g><g id="bm_blue" style="display:none"><path d="M -2.8,-16 L -10,-64 L 2,-64 Z" class="beam"/><path d="M 2.8,-16 L -2,-64 L 10,-64 Z" class="beam"/></g></g>`);
    // labels
    o.push(`<g class="row-labels">${D.rows.map(r => text((r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2 - 5, String(r.n), 'lbl-row')).join('')}</g>`);
    if (D.aisles) o.push(D.aisles.map(a => text(a[0], a[1], a[2], 'lbl-aisle')).join(''));
    else o.push(text(190, 116, "60' DRIVE AISLE", 'lbl-aisle') + text((D.X0 + D.X1) / 2, 326, "60' DRIVE AISLE", 'lbl-aisle') + (D.rows.length > 5 ? text((D.X0 + D.X1) / 2, 536, "60' DRIVE AISLE", 'lbl-aisle') : ''));
    if (D.existing) o.push(D.existing.map(b => text((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2 + 4, 'EXISTING', 'lbl-pemb') + text((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2 - 8, 'BUILDING', 'lbl-pemb')).join(''));
    else o.push(text((D.pemb.x0 + D.pemb.x1) / 2, (D.pemb.y0 + D.pemb.y1) / 2 - 4, 'PEMB', 'lbl-pemb'));
    o.push(text(323, 30, 'OPEN ENTRY', 'lbl-gate', 'text-anchor="start"'));
    if (D.detention.length) { const dc = D.detention.reduce((s, p) => [s[0] + p[0] / D.detention.length, s[1] + p[1] / D.detention.length], [0, 0]);
    o.push(text(dc[0], dc[1] + 2, 'DETENTION', 'lbl-det') + text(dc[0], dc[1] - 11, D.stats.detAc.toFixed(2) + ' AC', 'lbl-det-sub')); }
    o.push(text((D.X0 + D.X1) / 2 - 260, -44, 'PUBLIC STREET', 'road-label') + text((D.X0 + D.X1) / 2 + 260, -44, 'PUBLIC STREET', 'road-label'));
    // frontage dimension
    if (D.site !== 'photo') { const fx0 = D.front ? D.front[0] : D.X0, fx1 = D.front ? D.front[1] : D.X1;
      o.push(`<g class="dim"><line x1="${fx0}" y1="10" x2="${fx1}" y2="10"/><line x1="${fx0}" y1="4" x2="${fx0}" y2="16"/><line x1="${fx1}" y1="4" x2="${fx1}" y2="16"/></g>`);
      o.push(`<text x="${(fx0 + fx1) / 2}" y="23.5" class="dim-t">${Math.round(fx1 - fx0)}' FRONTAGE</text>`); }
    if (D.site !== 'photo') o.push(`<g class="dim"><line x1="${D.X1 + 14}" y1="0" x2="${D.X1 + 14}" y2="${-D.DP}"/><line x1="${D.X1 + 8}" y1="0" x2="${D.X1 + 20}" y2="0"/><line x1="${D.X1 + 8}" y1="${-D.DP}" x2="${D.X1 + 20}" y2="${-D.DP}"/></g>`);
    if (D.site !== 'photo') o.push(`<text class="dim-t" transform="translate(${D.X1 + 27} ${-D.DP / 2}) rotate(90)">${Math.round(D.DP)}' DEPTH</text>`);
    // north arrow + scale
    o.push(`<g transform="translate(${VB[0] + VB[2] - 45} ${VB[1] + 52})" class="north"><circle r="20"/><path d="M0,-14 L6.5,7 L0,2.5 L-6.5,7 Z"/><text y="-26">N</text></g>`);
    o.push(`<g transform="translate(${VB[0] + 30} ${VB[1] + 32})" class="scale"><rect x="-8" y="-10" width="226" height="34" rx="5" class="scale-bg"/><rect x="0" y="0" width="50" height="5" class="s1"/><rect x="50" y="0" width="50" height="5" class="s2"/><rect x="100" y="0" width="100" height="5" class="s1"/><text x="0" y="17">0</text><text x="50" y="17">50</text><text x="100" y="17">100</text><text x="200" y="17">200 FT</text></g>`);
    o.push('</g></svg>');
    el.innerHTML = `<div class="plan-loading" id="planLoading"><span></span>Rendering site plan…</div>` + o.join('');
    return {
      svg: el.querySelector('svg'), img: el.querySelector('#baseImg'), loading: el.querySelector('#planLoading'),
      q: (s) => el.querySelector(s),
      cache: {}
    };
  }

  function setBase(h, renderer, night) {
    const key = night ? 'n' : 'd';
    const apply = (url) => { h.img.setAttribute('href', url); h.loading.style.display = 'none'; };
    if (h.cache[key]) return apply(h.cache[key]);
    h.loading.style.display = 'flex';
    setTimeout(() => {
      try { const url = renderer.renderTop(WIN, 1728, 1448, night); h.cache[key] = url; apply(url); }
      catch (e) { console.error(e); h.loading.textContent = 'Plan render unavailable on this device'; }
    }, 30);
  }

  function update(h, pose, arm, night, veh) {
    if (!h) return;
    const deg = (r) => r * 180 / Math.PI;
    if (!h.els) { h.els = {}; for (const id of ['tr_orange', 'tr_orangeTrl', 'tr_blue', 'tr_blueTrl', 'cab_orange', 'cab_blue', 'bm_orange', 'bm_blue']) h.els[id] = h.q('#' + id); }
    const seen = {};
    const P = D.pemb, inside = (fw) => fw[0] > P.x0 && fw[0] < P.x1 && fw[1] > P.y0 + 4 && fw[1] < P.y1 - 4;   // under the PEMB roof
    for (const v of (veh || [])) {
      const op = String(Math.max(0, Math.min(1, v.fade == null ? 1 : v.fade)));
      if (v.trailer) { const e = h.els['tr_' + v.id]; seen['tr_' + v.id] = 1; e.style.display = ''; e.style.opacity = op;
        e.setAttribute('transform', `translate(${v.trailer.rear[0].toFixed(2)} ${(-v.trailer.rear[1]).toFixed(2)}) rotate(${deg(v.trailer.heading).toFixed(2)})`); }
      if (v.tractor && !inside(v.tractor.fw)) { const ct = `translate(${v.tractor.fw[0].toFixed(2)} ${(-v.tractor.fw[1]).toFixed(2)}) rotate(${deg(v.tractor.heading).toFixed(2)})`;
        const c = h.els['cab_' + v.id], b = h.els['bm_' + v.id]; seen['cab_' + v.id] = 1; c.style.display = ''; c.style.opacity = op; c.setAttribute('transform', ct);
        if (night && v.lights && v.lights.moving && !v.lights.reversing) { seen['bm_' + v.id] = 1; b.style.display = ''; b.style.opacity = op; b.setAttribute('transform', ct); } }
    }
    for (const id in h.els) if (!seen[id]) h.els[id].style.display = 'none';
  }
  global.Plan2D = { build, update, setBase, WIN };
})(window);
