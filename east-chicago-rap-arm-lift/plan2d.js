// Site plan: satellite-style top-down render (from the 3D model) + annotation overlay + live truck.
(function (global) {
  'use strict';
  const D = global.SITE_DATA;
  const NS = 'http://www.w3.org/2000/svg';
  const VB = [-235, -780, 1080, 905];            // svg units = feet; svg y = -plan y
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
    o.push(`<path d="${path(thinP(S.outbound, 6).filter(p => p[0] > -200))}" class="route route-out" marker-end="url(#mOut)"/></g>`);
    // cameras (coverage cones at night + blinking LEDs)
    const cams = [];
    D.cams.forEach(([x, y, z, yaw], i) => { cams.push(`<g transform="translate(${x} ${-y}) rotate(${yaw - 90})"><path d="M0,0 L70,-26 A75,75 0 0 1 70,26 Z" class="cam-cone"/><circle cx="2.4" cy="0" r="3.4" fill="url(#gLed)" class="led" style="animation-delay:${(-i * 0.37).toFixed(2)}s"/></g>`); });
    o.push(`<g class="cams">${cams.join('')}</g>`);
    // gate arm + reader LED (animated)
    const e = D.entry;
    o.push(`<line id="gArm" x1="${e.armPivot[0]}" y1="${-e.armY}" x2="${e.x1 - 1.6}" y2="${-e.armY}" class="gate-arm"/>`);
    o.push(`<circle id="gReaderLed" cx="${e.reader[0] + 1}" cy="${-e.reader[1]}" r="2.6" class="reader-led"/>`);
    // live truck (top view)
    o.push(`<g id="rig" filter="url(#fSh)"><g id="rigTrl"><rect x="-4.25" y="-53" width="8.5" height="53" rx=".6" fill="url(#gRoof)" stroke="#9a9b9c" stroke-width=".35"/>${Array.from({ length: 12 }, (_, i) => `<line x1="-4.1" x2="4.1" y1="${-3 - i * 4.2}" y2="${-3 - i * 4.2}" class="roofrib"/>`).join('')}</g>
      <g id="rigCab"><rect x="-4" y="-16.3" width="8" height="22.6" rx="1.4" fill="#d9481c" stroke="#7a2a10" stroke-width=".35"/><rect x="-3.6" y="-9.6" width="7.2" height="2.0" rx=".5" fill="#1d2630"/><rect x="-3.2" y="-16" width="6.4" height="5.6" rx="1" fill="#c43f17"/><rect x="-3.9" y="-2" width="7.8" height="8" rx="1" fill="#b83a14"/></g>
      <g id="rigBeams"><path d="M -2.8,-16 L -10,-64 L 2,-64 Z" class="beam"/><path d="M 2.8,-16 L -2,-64 L 10,-64 Z" class="beam"/></g></g>`);
    // labels
    const rl = (name, txt) => { const r = D.rows.find(q => q.name === name); return text((r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2 - 5, txt, 'lbl-row'); };
    o.push(`<g class="row-labels">${rl('SW', '6')}${rl('SE', '17')}${rl('MID', '23')}${rl('UP', '17')}${rl('NORTH', '12')}</g>`);
    o.push(text(190, 112, "60' DRIVE AISLE", 'lbl-aisle') + text(275, 326, "60' DRIVE AISLE", 'lbl-aisle'));
    o.push(text((D.pemb.x0 + D.pemb.x1) / 2, 56, 'PEMB', 'lbl-pemb') + text((D.pemb.x0 + D.pemb.x1) / 2, 44, "6,000 SF · 100' × 60'", 'lbl-pemb-sub'));
    o.push(text(323, 66, 'LIFT-ARM GATE', 'lbl-gate', 'text-anchor="start"'));
    const dc = D.detention.reduce((s, p) => [s[0] + p[0] / D.detention.length, s[1] + p[1] / D.detention.length], [0, 0]);
    o.push(text(dc[0], dc[1] - 12, 'DETENTION', 'lbl-det') + text(dc[0], dc[1] - 25, '0.41 AC', 'lbl-det-sub'));
    o.push(text(80, -44, 'W 145TH STREET', 'road-label') + text(540, -44, 'W 145TH STREET', 'road-label'));
    o.push(`<text x="-113" y="-430" class="road-label" transform="rotate(-90 -113 -430)">WHITE OAK AVE</text>`);
    o.push(`<text class="rail-label" transform="translate(${plineAt(D.railW, 400) - 26} ${-400}) rotate(-64)">CSX WEST WYE</text>`);
    o.push(`<text class="rail-label" transform="translate(${plineAt(D.railE, 330) + 28} ${-330}) rotate(57)">CSX EAST WYE</text>`);
    o.push(text(780, 470, 'SHEFFIELD METALS', 'ctx-label') + text(780, 455, 'INTERNATIONAL', 'ctx-label'));
    // frontage dimension
    o.push(`<g class="dim"><line x1="0" y1="10" x2="594.4" y2="10"/><line x1="0" y1="4" x2="0" y2="16"/><line x1="594.4" y1="4" x2="594.4" y2="16"/></g>`);
    o.push(`<text x="297" y="23.5" class="dim-t">594.71' FRONTAGE</text>`);
    // north arrow + scale
    o.push(`<g transform="translate(790 -720)" class="north"><circle r="20"/><path d="M0,-14 L6.5,7 L0,2.5 L-6.5,7 Z"/><text y="-26">N</text></g>`);
    o.push(`<g transform="translate(-205 -748)" class="scale"><rect x="-8" y="-10" width="226" height="34" rx="5" class="scale-bg"/><rect x="0" y="0" width="50" height="5" class="s1"/><rect x="50" y="0" width="50" height="5" class="s2"/><rect x="100" y="0" width="100" height="5" class="s1"/><text x="0" y="17">0</text><text x="50" y="17">50</text><text x="100" y="17">100</text><text x="200" y="17">200 FT</text></g>`);
    o.push('</g></svg>');
    el.innerHTML = `<div class="plan-loading" id="planLoading"><span></span>Rendering site plan…</div>` + o.join('');
    return {
      svg: el.querySelector('svg'), img: el.querySelector('#baseImg'), loading: el.querySelector('#planLoading'),
      rig: el.querySelector('#rig'), trl: el.querySelector('#rigTrl'), cab: el.querySelector('#rigCab'), beams: el.querySelector('#rigBeams'),
      arm: el.querySelector('#gArm'), led: el.querySelector('#gReaderLed'), cache: {}
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

  function update(h, pose, arm, night) {
    if (!h) return;
    h.rig.style.display = pose.visible ? '' : 'none';
    const deg = (r) => r * 180 / Math.PI;
    h.trl.setAttribute('transform', `translate(${pose.rear[0].toFixed(2)} ${(-pose.rear[1]).toFixed(2)}) rotate(${deg(pose.trailerHeading).toFixed(2)})`);
    const ct = `translate(${pose.fw[0].toFixed(2)} ${(-pose.fw[1]).toFixed(2)}) rotate(${deg(pose.tractorHeading).toFixed(2)})`;
    h.cab.setAttribute('transform', ct); h.beams.setAttribute('transform', ct);
    h.beams.style.display = night && !pose.reversing ? '' : 'none';
    const e = D.entry; const L = (e.x1 - 1.6 - e.armPivot[0]) * Math.cos(arm * 1.47);
    h.arm.setAttribute('x2', (e.armPivot[0] + L).toFixed(2));
    h.led.setAttribute('class', 'reader-led ' + (arm > 0.05 ? 'go' : 'stop'));
  }
  global.Plan2D = { build, update, setBase, WIN };
})(window);
