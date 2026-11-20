// WebGL renderer — realistic materials, soft shadows, sky, night lighting, top-down plan render.
(function (global) {
  'use strict';
  const MAXL = 24;
  const M4 = {
    persp(fov, asp, n, f) { const t = 1 / Math.tan(fov / 2), nf = 1 / (n - f); return [t / asp, 0, 0, 0, 0, t, 0, 0, 0, 0, (f + n) * nf, -1, 0, 0, 2 * f * n * nf, 0]; },
    ortho(l, r, b, t, n, f) { return [2 / (r - l), 0, 0, 0, 0, 2 / (t - b), 0, 0, 0, 0, -2 / (f - n), 0, -(r + l) / (r - l), -(t + b) / (t - b), -(f + n) / (f - n), 1]; },
    look(e, c, u) {
      let z = [e[0] - c[0], e[1] - c[1], e[2] - c[2]]; let l = Math.hypot(...z); z = z.map(v => v / l);
      let x = [u[1] * z[2] - u[2] * z[1], u[2] * z[0] - u[0] * z[2], u[0] * z[1] - u[1] * z[0]]; l = Math.hypot(...x); x = x.map(v => v / l);
      const y = [z[1] * x[2] - z[2] * x[1], z[2] * x[0] - z[0] * x[2], z[0] * x[1] - z[1] * x[0]];
      return [x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -(x[0] * e[0] + x[1] * e[1] + x[2] * e[2]), -(y[0] * e[0] + y[1] * e[1] + y[2] * e[2]), -(z[0] * e[0] + z[1] * e[1] + z[2] * e[2]), 1];
    },
    mul(a, b) { const o = new Array(16); for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + j] * b[i * 4 + k]; o[i * 4 + j] = s; } return o; },
    inv(a) {
      const o = new Array(16);
      const b00 = a[0] * a[5] - a[1] * a[4], b01 = a[0] * a[6] - a[2] * a[4], b02 = a[0] * a[7] - a[3] * a[4], b03 = a[1] * a[6] - a[2] * a[5], b04 = a[1] * a[7] - a[3] * a[5], b05 = a[2] * a[7] - a[3] * a[6];
      const b06 = a[8] * a[13] - a[9] * a[12], b07 = a[8] * a[14] - a[10] * a[12], b08 = a[8] * a[15] - a[11] * a[12], b09 = a[9] * a[14] - a[10] * a[13], b10 = a[9] * a[15] - a[11] * a[13], b11 = a[10] * a[15] - a[11] * a[14];
      let d = 1 / (b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06);
      o[0] = (a[5] * b11 - a[6] * b10 + a[7] * b09) * d; o[1] = (a[2] * b10 - a[1] * b11 - a[3] * b09) * d; o[2] = (a[13] * b05 - a[14] * b04 + a[15] * b03) * d; o[3] = (a[10] * b04 - a[9] * b05 - a[11] * b03) * d;
      o[4] = (a[6] * b08 - a[4] * b11 - a[7] * b07) * d; o[5] = (a[0] * b11 - a[2] * b08 + a[3] * b07) * d; o[6] = (a[14] * b02 - a[12] * b05 - a[15] * b01) * d; o[7] = (a[8] * b05 - a[10] * b02 + a[11] * b01) * d;
      o[8] = (a[4] * b10 - a[5] * b08 + a[7] * b06) * d; o[9] = (a[1] * b08 - a[0] * b10 - a[3] * b06) * d; o[10] = (a[12] * b04 - a[13] * b02 + a[15] * b00) * d; o[11] = (a[9] * b02 - a[8] * b04 - a[11] * b00) * d;
      o[12] = (a[5] * b07 - a[4] * b09 - a[6] * b06) * d; o[13] = (a[0] * b09 - a[1] * b07 + a[2] * b06) * d; o[14] = (a[13] * b01 - a[12] * b03 - a[14] * b00) * d; o[15] = (a[8] * b03 - a[9] * b01 + a[10] * b00) * d;
      return o;
    },
    model(px, h, py, yaw, roll) {
      const c = Math.cos(yaw), s = Math.sin(yaw);
      let m = [c, 0, s, 0, 0, 1, 0, 0, s, 0, -c, 0, px, h, -py, 1];
      if (roll) { const cr = Math.cos(roll), sr = Math.sin(roll); m = M4.mul(m, [cr, sr, 0, 0, -sr, cr, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]); }
      return m;
    },
    xf(m, p) { const x = p[0], y = p[1], z = p[2]; const w = m[3] * x + m[7] * y + m[11] * z + m[15]; return [(m[0] * x + m[4] * y + m[8] * z + m[12]) / w, (m[1] * x + m[5] * y + m[9] * z + m[13]) / w, (m[2] * x + m[6] * y + m[10] * z + m[14]) / w, w]; }
  };
  function modelFromID(px, h, py, yaw, roll) { return M4.mul(M4.model(px, h, py, yaw, roll), [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, -1, 0, 0, 0, 0, 1]); }
  const I4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  function norm(v) { const l = Math.hypot(...v); return v.map(x => x / l); }

  const SKYFN = `
vec3 skyCol(vec3 d, float night){
  float y = max(d.y, 0.0);
  if(night < 0.5){ vec3 zen = vec3(0.24,0.43,0.72), hor = vec3(0.80,0.85,0.89); return mix(hor, zen, pow(y, 0.6)); }
  vec3 zen = vec3(0.008,0.016,0.04), hor = vec3(0.05,0.075,0.13); return mix(hor, zen, pow(y, 0.5));
}`;
  const NOISE = `
float h21(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(h21(i), h21(i+vec2(1.0,0.0)), f.x), mix(h21(i+vec2(0.0,1.0)), h21(i+vec2(1.0,1.0)), f.x), f.y); }
float fb(vec2 p){ return 0.5*n2(p) + 0.25*n2(p*2.03+1.7) + 0.125*n2(p*4.01+3.1) + 0.125*n2(p*8.05+5.3); }`;

  const VS = `
attribute vec3 aP; attribute vec3 aN; attribute float aMat; attribute vec4 aCE;
uniform mat4 uVP; uniform mat4 uM; uniform mat4 uLVP;
varying vec3 vW; varying vec3 vN; varying vec3 vC; varying float vE; varying float vMat; varying vec4 vL;
void main(){ vec4 w = uM*vec4(aP,1.0); vW = w.xyz; vN = (uM*vec4(aN,0.0)).xyz; vC = aCE.rgb; vE = aCE.a; vMat = aMat; vL = uLVP*w; gl_Position = uVP*w; }`;
  const FS = `
precision highp float;
uniform sampler2D uSh; uniform sampler2D uShD; uniform float uShOn; uniform float uShRes; uniform float uShResD; uniform float uPix;
uniform vec3 uSun; uniform vec3 uSunC; uniform vec3 uSky; uniform vec3 uGnd; uniform vec3 uFog; uniform vec3 uCam; uniform vec3 uViewDir;
uniform float uFogN; uniform float uFogF; uniform float uNight; uniform float uExp; uniform float uXray; uniform float uAlpha; uniform float uOrtho;
uniform vec4 uPL[${MAXL}]; uniform vec4 uPD[${MAXL}]; uniform vec3 uLC;
uniform vec3 uHL0; uniform vec3 uHL1; uniform vec3 uHD; uniform float uHLon;
varying vec3 vW; varying vec3 vN; varying vec3 vC; varying float vE; varying float vMat; varying vec4 vL;
${NOISE}
${SKYFN}
float unpack(vec4 c){ return dot(c, vec4(1.0, 1.0/255.0, 1.0/65025.0, 1.0/16581375.0)); }
float shadow(vec3 N){
  vec3 p = vL.xyz/vL.w*0.5+0.5;
  if(p.x<0.0||p.x>1.0||p.y<0.0||p.y>1.0||p.z>1.0) return 1.0;
  float b = 0.0005 + 0.0015*(1.0-max(dot(N,uSun),0.0));
  float s = 0.0; float t = 1.25/uShRes;
  float td = 1.25/uShResD;
  for(int i=0;i<4;i++) for(int j=0;j<4;j++){ vec2 o = vec2(float(i)-1.5, float(j)-1.5); float z = min(unpack(texture2D(uSh, p.xy+o*t)), unpack(texture2D(uShD, p.xy+o*td))); s += (p.z - b > z) ? 0.0 : 1.0; }
  return s/16.0;
}
vec3 aces(vec3 x){ return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14), 0.0, 1.0); }
float bay4(vec2 p){ vec2 q = mod(floor(p), 4.0); float a = mod(q.x,2.0), b = mod(q.y,2.0), c = mod(floor(q.x/2.0),2.0), d = mod(floor(q.y/2.0),2.0); return (8.0*mod(a+b,2.0) + 4.0*b + 2.0*mod(c+d,2.0) + d + 0.5)/16.0; }
uniform float uFadeA;
void main(){
  if(uFadeA < 0.999 && bay4(gl_FragCoord.xy) > uFadeA) discard;
  vec3 alb = pow(vC, vec3(2.2));
  if(uXray > 0.5){ gl_FragColor = vec4(pow(alb*1.3, vec3(1.0/2.2)), uAlpha); return; }
  int mat = int(vMat + 0.5);
  float camD = length(uCam - vW); float dfade = uOrtho > 0.5 ? 0.0 : smoothstep(260.0, 900.0, camD);
  vec3 N = normalize(vN);
  vec3 V = uOrtho > 0.5 ? -uViewDir : normalize(uCam - vW);
  vec2 gp = vec2(vW.x, -vW.z);
  vec3 T = cross(vec3(0.0,1.0,0.0), N); float tl = length(T); T = tl > 0.01 ? T/tl : vec3(1.0,0.0,0.0);
  float s = dot(vW, T);
  float spec = 0.0, rough = 0.9, refl = 0.0;
  if(mat == 1){
    float gf = uOrtho > 0.5 ? 1.0 : dfade;
    float g = fb(gp*0.22), mt = fb(gp*1.1 + 7.1), gr = n2(gp*6.0), gr2 = n2(gp*15.0 + 3.7);
    float gn = n2(gp*3.1 + 1.3);
    alb *= 0.9 + 0.16*(g-0.5) + 0.1*(mt-0.5) + (1.0-gf)*((gn-0.5)*0.12 + (gr-0.5)*0.16 + (gr2-0.5)*0.14);
    alb *= mix(vec3(1.0), vec3(1.03, 1.0, 0.95), 1.0-gf);
    alb = mix(alb, alb*vec3(1.05, 1.01, 0.93), smoothstep(0.5, 0.78, g)*0.45);
  } else if(mat == 2 || mat == 20){
    float g = fb(gp*0.8), b = n2(gp*5.0), bl = n2(gp*19.0);
    alb *= 0.78 + 0.36*g + 0.12*(b-0.5) + 0.1*(bl-0.5)*(1.0-dfade);
    alb = mix(alb, alb*vec3(1.15,1.06,0.78), smoothstep(0.45,0.8,n2(gp*0.05))*0.6);
    if(mat == 20) alb *= 1.0 + 0.06*sign(sin(gp.x*0.31));
  } else if(mat == 23){
    // compacted asphalt millings (RAP): crushed stone coated in aged binder. Lighter warm charcoal than
    // blacktop, coarse salt-and-pepper grain, load-to-load mottling, faint roller bands, fully matte.
    // Every band of detail is filtered by the pixel footprint, so it reads at every distance without shimmer.
    float fp = uOrtho > 0.5 ? uPix : camD * uPix;
    float calm = uNight > 0.5 ? 0.6 : 1.0;
    #define KEEP(l) (1.0 - smoothstep(0.35*(l), 1.1*(l), fp))
    // load-to-load mottling (each truckload a slightly different tone / warmth)
    float lm = fb(gp*0.021 + 3.3), lm2 = n2(gp*0.055 + 8.1);
    float load = smoothstep(0.3, 0.75, lm);
    alb *= 0.9 + 0.2*load + 0.08*(lm2-0.5);
    alb = mix(alb, alb*vec3(1.06, 1.0, 0.92), smoothstep(0.45, 0.8, n2(gp*0.03 + 17.0))*0.45);
    // roller-compaction passes: ~6.5' bands along the long (east-west) direction, slightly wavy
    float rb = sin((gp.y + 2.0*n2(gp*vec2(0.02, 0.05)))*0.9666);
    alb *= 1.0 + 0.035*rb*KEEP(6.5)*(0.6 + 0.4*n2(gp*0.04 + 2.0));
    // clusters of exposed stone vs binder-rich fines (reads as 'grainy' from the air)
    float cl1 = n2(gp*0.26 + 1.7), cl2 = n2(gp*0.75 + 4.2), cl3 = n2(gp*2.1 + 9.6);
    alb *= 1.0 + calm*(0.14*(cl1-0.5)*KEEP(4.0) + 0.22*(cl2-0.5)*KEEP(1.4) + 0.24*(cl3-0.5)*KEEP(0.5));
    // salt-and-pepper speckle: lighter stone-rich spots and dark binder-rich spots (~0.5-2 ft), visible at yard distances
    float sA = n2(gp*1.15 + 31.0), sB = n2(gp*3.3 + 57.0);
    float spL = smoothstep(0.66, 0.8, sA) * KEEP(0.9) + smoothstep(0.7, 0.82, sB) * KEEP(0.3) * 0.8;
    float spD = smoothstep(0.7, 0.84, 1.0 - sA*0.6 - sB*0.4) * KEEP(0.6);
    alb *= 1.0 + calm*(0.15*spL - 0.18*spD);
    // individual chips: light stone faces and dark binder lumps, up close
    float c4 = n2(gp*6.2 + 2.1), c5 = n2(gp*13.0 + 5.3);
    float near = KEEP(0.16);
    float lite = smoothstep(0.64, 0.78, c4) * smoothstep(0.35, 0.6, c5);
    float dark = smoothstep(0.68, 0.84, c5) * (1.0 - lite);
    alb = mix(alb, vec3(0.19, 0.18, 0.165), lite*0.45*near*calm);
    alb = mix(alb, alb*0.5, dark*0.6*near);
    alb *= 1.0 + 0.14*(n2(gp*24.0) - 0.5)*KEEP(0.08);
    #undef KEEP
    spec = 0.0; rough = 1.0;
  } else if(mat == 3){
    // paved road asphalt: dense, smooth, closed texture; slightly polished wheel paths; tire-wear crosshatch
    float gf = uOrtho > 0.5 ? 1.0 : dfade;
    float p = fb(gp*0.035), fine = n2(gp*14.0);
    alb *= 0.96 + 0.08*(p-0.5) + (1.0-gf)*(fine-0.5)*0.035;
    float wp = 0.0;
    for(int k=0;k<4;k++){ float yc = k==0 ? -27.0 : (k==1 ? -33.0 : (k==2 ? -47.0 : -53.0)); wp = max(wp, 1.0 - smoothstep(1.2, 2.6, abs(gp.y - yc))); }
    wp *= step(-60.0, gp.y) * step(gp.y, -20.0);
    alb *= 1.0 + 0.07*wp;
    // tire-wear crosshatch: fine diamond tread marks along the wheel paths of both lanes
    float wb = 0.0;
    for(int k=0;k<4;k++){ float yc = k==0 ? -27.0 : (k==1 ? -33.0 : (k==2 ? -47.0 : -53.0)); wb = max(wb, 1.0 - smoothstep(1.0, 3.6, abs(gp.y - yc))); }
    wb *= step(-60.0, gp.y) * step(gp.y, -20.0);
    float hs = 0.42;
    float d1 = abs(fract((gp.x + gp.y*1.7)/hs) - 0.5), d2 = abs(fract((gp.x - gp.y*1.7)/hs) - 0.5);
    float hatch = (1.0 - smoothstep(0.06, 0.16, d1)) + (1.0 - smoothstep(0.06, 0.16, d2));
    float hv = 0.75 + 0.5*n2(gp*0.35 + 4.0);
    alb *= 1.0 - 0.07*clamp(hatch, 0.0, 1.0)*wb*hv*(1.0-gf);
    // worn patches: clustered darker diamond blocks across both lanes
    vec2 rq = vec2(gp.x + gp.y, gp.x - gp.y) * 0.7071 / 0.62;
    vec2 cf = fract(rq), ci = floor(rq);
    float edge = min(min(cf.x, 1.0 - cf.x), min(cf.y, 1.0 - cf.y));
    float blk = smoothstep(0.06, 0.14, edge);
    float cl = smoothstep(0.5, 0.72, fb(gp*vec2(0.11, 0.16) + 2.0)) * (0.55 + 0.45*h21(ci));
    float lanes = smoothstep(-59.0, -57.0, gp.y) * (1.0 - smoothstep(-23.0, -21.0, gp.y)) * smoothstep(1.2, 2.4, abs(gp.y + 40.0));
    alb *= 1.0 - 0.17*blk*cl*lanes*(1.0-gf);
    spec = 0.08 + 0.1*wp; rough = 0.55;
  } else if(mat == 4){
    vec2 j = abs(fract(gp/12.0)-0.5); float joint = smoothstep(0.484, 0.497, max(j.x, j.y));
    alb *= (0.93 + 0.1*n2(gp*3.0)) * (1.0 - 0.3*joint);
  } else if(mat == 5 || mat == 6){
    float per = mat == 5 ? 1.0 : 2.0; float u = fract(s/per);
    float d = (smoothstep(0.0,0.06,u) - smoothstep(0.24,0.3,u)) * (1.0 - dfade);
    N = normalize(N + T*d*0.55);
    alb *= 0.97 + 0.06*n2(vec2(s*0.2, vW.y*0.3));
    if(mat == 5) alb *= mix(0.8, 1.0, smoothstep(0.0, 2.5, vW.y));
    spec = 0.28; rough = 0.45;
  } else if(mat == 18){
    float u = fract(s/30.0); float jt = smoothstep(0.988,1.0,u) + 1.0 - smoothstep(0.0,0.012,u);
    alb *= (0.95 + 0.08*n2(vec2(s, vW.y)*0.3)) * (1.0 - 0.3*jt);
  } else if(mat == 7){
    float u = fract(s/2.0); float post = (smoothstep(0.0,0.03,u) - smoothstep(0.07,0.1,u)) * (1.0 - dfade);
    alb *= 1.0 - 0.13*post; alb *= 0.95 + 0.06*n2(vec2(s*0.25, vW.y*0.6));
    alb *= 1.0 - 0.06*smoothstep(12.6, 13.4, vW.y);
    alb *= mix(0.9, 1.0, smoothstep(4.0, 6.0, vW.y));
    spec = 0.18; rough = 0.5;
  } else if(mat == 8){
    vec3 q = vW*1.3;
    float f1 = n2(q.xz + q.y*0.7), f2 = n2(q.zx*2.6 - q.y*1.3 + 7.0), f3 = n2(q.xz*5.1 + q.y*2.0);
    alb *= 0.48 + 0.38*f1 + 0.3*f1*f2 + 0.18*f3;
    alb *= mix(0.7, 1.05, clamp(N.y*0.6+0.5, 0.0, 1.0));
  } else if(mat == 10 || mat == 25){
    // chain link (2" diamonds) + privacy inserts; box-filtered by the pixel footprint so it never shimmers
    bool slats = mat == 10;
    float fp = uOrtho > 0.5 ? uPix : camD * uPix;            // world size of one pixel here
    vec3 galv = vec3(0.42, 0.44, 0.46);
    // wires
    vec2 q = vec2(s + vW.y, s - vW.y) / 0.236;
    vec2 gq = abs(fract(q) - 0.5);
    float ww = max(0.07, fp / 0.236 * 0.9);
    float wire = smoothstep(0.5 - ww, 0.5 - ww * 0.35, max(gq.x, gq.y));
    float wireAvg = 0.16;
    float wireD = mix(wire, wireAvg, smoothstep(0.08, 0.35, fp / 0.236));
    if (slats) {
      // slats: 75% of each 2" column; F = integral of the square wave, filtered over the pixel footprint
      float P = 0.167, duty = 0.75, x = s / P - 0.06, w = max(fp / P, 0.001);
      float a0 = x - w * 0.5, a1 = x + w * 0.5;
      float F0 = floor(a0) * duty + min(fract(a0), duty), F1 = floor(a1) * duty + min(fract(a1), duty);
      float cov = clamp((F1 - F0) / w, 0.0, 1.0);
      float sharp = 1.0 - smoothstep(0.018, 0.035, fp);             // gaps resolvable on screen
      if (sharp > 0.5) { if (cov < 0.5 && wireD < 0.5) discard; }
      else {
        // beyond that: a stable ordered see-through so the yard shows faintly between the inserts (never a solid wall)
        vec2 bp = floor(gl_FragCoord.xy);
        vec2 b1 = mod(bp, 2.0), b2 = mod(floor(bp * 0.5), 2.0);
        float by = (dot(b1, vec2(2.0, 3.0)) - 4.0 * b1.x * b1.y) * 4.0 + (dot(b2, vec2(2.0, 3.0)) - 4.0 * b2.x * b2.y);
        float th = (mod(by, 16.0) + 0.5) / 16.0;
        if (th > 0.8) discard;
      }
      vec3 slatC = alb * (0.92 + 0.12 * h21(vec2(floor(s / P), 3.0)) * (1.0 - smoothstep(0.03, 0.08, fp)));
      vec3 gapC = mix(alb * 0.25, galv, wireD * 0.7);       // what shows between slats: mesh + shadowed yard behind
      float stripe = sharp > 0.5 ? cov : mix(cov, 0.55 + 0.45 * cov, smoothstep(0.035, 0.2, fp));
      alb = mix(gapC, slatC, stripe);
      alb = mix(alb, galv, wireD * 0.15 * cov);                     // mesh passing in front of the slats
      alb *= 0.97 + 0.06 * sin(s * 6.2832 / 1.0);                   // faint vertical banding keeps the insert texture readable from afar
    } else {
      float far = smoothstep(0.08, 0.3, fp / 0.236);
      if (far < 0.5) { if (wire < 0.5) discard; }
      else { vec2 fc = mod(floor(gl_FragCoord.xy), 3.0); if (!(fc.x < 0.5 && fc.y < 0.5) && !(fc.x > 1.5 && fc.y > 1.5)) discard; }
      alb = galv;
    }
    spec = slats ? 0.1 : 0.4; rough = slats ? 0.6 : 0.35;
  } else if(mat == 11){
    float st = h21(floor(gp*3.2 + vW.y*1.7)); alb *= 0.72 + 0.5*st*(0.6+0.4*n2(gp*9.0));
  } else if(mat == 12){
    float g = fb(gp*0.1), d = n2(gp*1.2); alb *= 0.76 + 0.38*g; alb *= 0.9 + 0.2*d;
  } else if(mat == 13){ spec = 1.0; rough = 0.08; refl = 1.0; }
  else if(mat == 14){ spec = 0.35; rough = 0.32; }
  else if(mat == 15){ spec = 0.55; rough = 0.28; }
  else if(mat == 22){ alb *= 0.93 + 0.1*fb(gp*0.06) + 0.04*n2(gp*0.8); }
  else if(mat == 17){ float u = fract(vW.y/0.7); alb *= 0.9 + 0.12*(1.0-dfade)*(smoothstep(0.1,0.2,u) - smoothstep(0.8,0.9,u)); spec = 0.2; rough = 0.5; }
  else if(mat == 19 || mat == 21){ alb *= 0.78 + 0.32*n2(vec2(s*2.5, vW.y*0.35)); }
  else if(mat == 9){
    float r1 = n2(gp*0.9 + vec2(0.0, 0.0)), r2 = n2(gp*1.7 - 3.1);
    N = normalize(vec3((r1-0.5)*0.08, 1.0, (r2-0.5)*0.08));
    spec = 1.0; rough = 0.06; refl = 1.0;
  }

  float ndl = max(dot(N, uSun), 0.0);
  float sh = uShOn > 0.5 ? shadow(normalize(vN)) : 1.0;
  vec3 amb = mix(uGnd, uSky, N.y*0.5+0.5);
  vec3 col = alb*(amb + uSunC*ndl*sh);
  vec3 H = normalize(uSun + V);
  float shin = mix(6.0, 160.0, 1.0 - rough);
  col += uSunC * spec * pow(max(dot(N, H), 0.0), shin) * sh * (shin + 8.0)/80.0 * (uNight > 0.5 ? 0.0 : 1.0);
  if(refl > 0.0){
    vec3 R = reflect(-V, N); float F = 0.04 + 0.96*pow(1.0 - max(dot(N, V), 0.0), 5.0);
    vec3 sk = skyCol(R, uNight);
    if(mat == 9) col = mix(col*0.55, sk*0.62, clamp(F*1.1 + 0.06, 0.0, 0.6));
    else col = mix(col, sk, clamp(F + 0.18, 0.0, 0.85));
  }
  if(uNight > 0.5){
    vec3 acc = vec3(0.0);
    for(int i=0;i<${MAXL};i++){
      vec4 L = uPL[i]; if(L.w <= 0.0) continue;
      vec4 Dd = uPD[i];
      vec3 d = L.xyz - vW; float dist = length(d); vec3 l = d/dist;
      float spot = smoothstep(Dd.w, min(Dd.w + 0.6, 0.98), dot(-l, Dd.xyz));
      float att = L.w * 1050.0/(dist*dist + 450.0);
      float nl = max(dot(N, l), 0.0);
      acc += uLC * att * spot * (0.2 + 0.8*nl);
      vec3 h2 = normalize(l + V); acc += uLC * att * spot * spec * pow(max(dot(N, h2), 0.0), shin) * 0.5;
    }
    if(uHLon > 0.5){
      for(int k=0;k<2;k++){
        vec3 p = k == 0 ? uHL0 : uHL1; vec3 d = p - vW; float dist = length(d); vec3 l = d/dist;
        float spot = smoothstep(0.86, 0.97, dot(-l, uHD));
        acc += vec3(1.0,0.95,0.86) * spot * 2400.0/(dist*dist+60.0) * (0.3 + 0.7*max(dot(N, l), 0.0));
      }
    }
    // night: compress the light reaching each surface (soft shoulder) so dark RAP keeps its charcoal and whites keep their shading
    vec3 accC = acc / (1.0 + acc / 2.2);
    col += alb*accC;
    col += mix(alb, vec3(1.0,0.8,0.52), 0.7) * vE * 3.0;
  }
  float f = uOrtho > 0.5 ? 0.0 : smoothstep(uFogN, uFogF, length(vW - uCam));
  col = mix(col, uFog, f);
  col = aces(col*uExp);
  float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(vec3(lum), col, 0.9) * vec3(1.015, 1.0, 0.975);
  gl_FragColor = vec4(pow(col, vec3(1.0/2.2)), 1.0);
}`;
  const DVS = `attribute vec3 aP; attribute float aMat; uniform mat4 uLVP; uniform mat4 uM; void main(){ gl_Position = aMat > 23.5 ? vec4(2.0, 2.0, 2.0, 1.0) : uLVP*uM*vec4(aP,1.0); }`;
  const DFS = `precision highp float;
vec4 pack(float d){ vec4 e = vec4(1.0,255.0,65025.0,16581375.0)*d; e = fract(e); e -= e.yzww*vec4(1.0/255.0,1.0/255.0,1.0/255.0,0.0); return e; }
float bay4(vec2 p){ vec2 q = mod(floor(p), 4.0); float a = mod(q.x,2.0), b = mod(q.y,2.0), c = mod(floor(q.x/2.0),2.0), d = mod(floor(q.y/2.0),2.0); return (8.0*mod(a+b,2.0) + 4.0*b + 2.0*mod(c+d,2.0) + d + 0.5)/16.0; }
uniform float uFadeA;
void main(){ if(uFadeA < 0.999 && bay4(gl_FragCoord.xy) > uFadeA) discard; gl_FragColor = pack(gl_FragCoord.z); }`;
  const SVS = `attribute vec2 aQ; varying vec2 vQ; void main(){ vQ = aQ; gl_Position = vec4(aQ, 0.9999, 1.0); }`;
  const SFS = `precision highp float; varying vec2 vQ; uniform mat4 uIVP; uniform vec3 uCam; uniform float uNight; uniform vec3 uSun;
${NOISE}
${SKYFN}
void main(){
  vec4 a = uIVP*vec4(vQ, 1.0, 1.0); vec3 d = normalize(a.xyz/a.w - uCam);
  vec3 col = skyCol(d, uNight);
  if(uNight < 0.5){
    float s = max(dot(d, uSun), 0.0); col += vec3(1.0,0.92,0.75)*pow(s, 300.0)*1.5 + vec3(1.0,0.88,0.65)*pow(s, 10.0)*0.12;
    if(d.y > 0.0){
      vec2 uv = d.xz/(d.y + 0.08)*1.6;
      float c = fb(uv*1.1 + vec2(3.0, 1.0)); c = smoothstep(0.52, 0.8, c) * smoothstep(0.0, 0.18, d.y);
      col = mix(col, vec3(0.97,0.97,0.96) - vec3(0.12)*smoothstep(0.7,0.95,c), c*0.85);
    }
    col = mix(col, vec3(0.83,0.86,0.89), smoothstep(0.12, 0.0, d.y)*0.7);
  } else {
    vec2 g = floor(vec2(atan(d.z, d.x)*260.0, d.y*280.0));
    col += vec3(step(0.997, h21(g)) * smoothstep(0.08, 0.4, d.y)) * 0.55;
    col += vec3(0.16,0.11,0.07)*pow(1.0 - max(d.y, 0.0), 14.0);
  }
  gl_FragColor = vec4(col, 1.0);
}`;
  const GVS = `attribute vec3 aP; attribute vec4 aC; attribute float aS; uniform mat4 uVP; uniform float uScale; uniform float uOrtho; varying vec4 vC;
void main(){ vec4 p = uVP*vec4(aP,1.0); gl_Position = p; gl_PointSize = clamp(aS*uScale/(uOrtho > 0.5 ? 1.0 : p.w), 2.0, 140.0); vC = aC; }`;
  const GFS = `precision mediump float; varying vec4 vC; void main(){ vec2 q = gl_PointCoord*2.0-1.0; float r = dot(q,q); float a = exp(-r*5.0)*0.75 + 0.7*exp(-r*40.0); gl_FragColor = vec4(vC.rgb*a*vC.a, 1.0); }`;
  const TVS = `attribute vec3 aP; attribute vec2 aT; uniform mat4 uVP; varying vec2 vT; void main(){ vT = aT; gl_Position = uVP*vec4(aP,1.0); }`;
  const TFS = `precision mediump float; varying vec2 vT; uniform sampler2D uTex; uniform float uK; void main(){ gl_FragColor = vec4(texture2D(uTex, vT).rgb*uK, 1.0); }`;

  function Renderer(canvas, scene) {
    const gl = canvas.getContext('webgl', { antialias: true, alpha: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
    if (!gl) throw new Error('WebGL unavailable');
    this.gl = gl; this.canvas = canvas; this.scene = scene;
    const prog = (vs, fs) => {
      const p = gl.createProgram();
      for (const [t, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
        const s = gl.createShader(t); gl.shaderSource(s, src); gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
        gl.attachShader(p, s);
      }
      gl.linkProgram(p); if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
      const u = {}; for (let i = 0; i < gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS); i++) { const info = gl.getActiveUniform(p, i); u[info.name.replace('[0]', '')] = gl.getUniformLocation(p, info.name); }
      const a = {}; for (let i = 0; i < gl.getProgramParameter(p, gl.ACTIVE_ATTRIBUTES); i++) { const info = gl.getActiveAttrib(p, i); a[info.name] = gl.getAttribLocation(p, info.name); }
      return { p, u, a };
    };
    this.P = prog(VS, FS); this.PD = prog(DVS, DFS); this.PS = prog(SVS, SFS); this.PG = prog(GVS, GFS); this.PT = prog(TVS, TFS);
    const up = (mb) => { const pk = mb.pack(); const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, pk.buf, gl.STATIC_DRAW); return { b, n: pk.n }; };
    this.M = { statics: up(scene.statics), tractor: up(scene.truck.tractor), trailer: up(scene.truck.trailer), arm: up(scene.arm) };
    this.F = {}; for (const k in scene.fleet) this.F[k] = (k === 'tractorOrange') ? this.M.tractor : (k === 'orangeC' ? this.M.trailer : up(scene.fleet[k]));
    scene.statics.d = null;
    this.quad = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, this.quad); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    this.glowBuf = gl.createBuffer();
    { const d = []; for (const q of (scene.decals || [])) { const uv = [[0, 1], [1, 1], [1, 0], [0, 0]]; for (const k of [0, 1, 2, 0, 2, 3]) d.push(...q[k], ...uv[k]); }
      this.decalBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, this.decalBuf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(d), gl.STATIC_DRAW); this.decalN = d.length / 5; }
    this.logoTex = null;
    if (global.LOGO_SRC) { const img = new Image(); img.onload = () => { const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      this.logoTex = t; if (this.onReady) this.onReady(); }; img.src = global.LOGO_SRC; }
    // shadow map
    this.shRes = Math.min(4096, gl.getParameter(gl.MAX_TEXTURE_SIZE));
    const fbo = this.makeFBO(this.shRes, this.shRes); this.shFB = fbo.fb; this.shTex = fbo.tex; this.shOK = fbo.ok;
    this.shResD = this.shRes; const fd = this.makeFBO(this.shResD, this.shResD); this.shFBD = fd.fb; this.shTexD = fd.tex; this.shOK = this.shOK && fd.ok;
    this.staticShadow = false; this.quality = 1;
    this.sunDir = norm([-0.5, 0.66, 0.56]);
    const tgt = [260, 0, -300], e = [tgt[0] + this.sunDir[0] * 2000, this.sunDir[1] * 2000, tgt[2] + this.sunDir[2] * 2000];
    this.LVP = M4.mul(M4.ortho(-950, 950, -950, 950, 300, 4200), M4.look(e, tgt, [0, 1, 0]));
    this.cam = { target: [300, 10, -300], yaw: 0.6, pitch: 0.5, dist: 1000, fov: 0.6 };
    this.night = false; this.xray = false;
  }
  Renderer.prototype.makeFBO = function (w, h) {
    const gl = this.gl, tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fb); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    const rb = gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER, rb); gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, w, h); gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, rb);
    const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE; gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { fb, tex, rb, ok };
  };
  Renderer.prototype.bind = function (P, mesh) {
    const gl = this.gl; gl.bindBuffer(gl.ARRAY_BUFFER, mesh.b);
    gl.enableVertexAttribArray(P.a.aP); gl.vertexAttribPointer(P.a.aP, 3, gl.FLOAT, false, 20, 0);
    if (P.a.aN !== undefined) { gl.enableVertexAttribArray(P.a.aN); gl.vertexAttribPointer(P.a.aN, 3, gl.BYTE, true, 20, 12); }
    if (P.a.aMat !== undefined) { gl.enableVertexAttribArray(P.a.aMat); gl.vertexAttribPointer(P.a.aMat, 1, gl.UNSIGNED_BYTE, false, 20, 15); }
    if (P.a.aCE !== undefined) { gl.enableVertexAttribArray(P.a.aCE); gl.vertexAttribPointer(P.a.aCE, 4, gl.UNSIGNED_BYTE, true, 20, 16); }
  };
  Renderer.prototype.unbind = function (P) { for (const k of ['aP', 'aN', 'aMat', 'aCE']) if (P.a[k] !== undefined) this.gl.disableVertexAttribArray(P.a[k]); };
  Renderer.prototype.camPos = function () { const c = this.cam, cp = Math.cos(c.pitch); return [c.target[0] + c.dist * cp * Math.sin(c.yaw), c.target[1] + c.dist * Math.sin(c.pitch), c.target[2] + c.dist * cp * Math.cos(c.yaw)]; };
  Renderer.prototype.resize = function () {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(this.canvas.clientWidth * dpr), h = Math.round(this.canvas.clientHeight * dpr);
    if (w && h && (this.canvas.width !== w || this.canvas.height !== h)) { this.canvas.width = w; this.canvas.height = h; }
  };

  Renderer.prototype.dynamics = function (sim) {
    const dyn = [];
    if (sim && sim.veh) {
      for (const v of sim.veh) {
        const fa = v.fade == null ? 1 : v.fade; if (fa <= 0.001) continue;
        if (v.trailer) dyn.push({ mesh: this.F[v.trailer.kind], m: modelFromID(v.trailer.rear[0], 0, v.trailer.rear[1], v.trailer.heading), fade: fa });
        if (v.tractor) dyn.push({ mesh: v.id === 'blue' ? this.F.tractorBlue : this.F.tractorOrange, m: modelFromID(v.tractor.fw[0], 0, v.tractor.fw[1], v.tractor.heading), fade: fa });
      }
      const doors = sim.doors || [{ open: sim.door || 0, x: sim.bayX, y: sim.doorY, face: 1 }];
      for (const d of doors) { if (d.open >= 0.985) continue; const sy = 1 - d.open, f = d.face;
        dyn.push({ mesh: this.F.bayDoor, m: [f, 0, 0, 0, 0, sy, 0, 0, 0, 0, f, 0, d.x, 14, -(d.y + f * 0.12), 1], fade: 1 }); }
    } else if (sim && sim.pose && sim.pose.visible) {
      const p = sim.pose;
      const fa = p.fade == null ? 1 : p.fade;
      dyn.push({ mesh: this.M.trailer, m: modelFromID(p.rear[0], 0, p.rear[1], p.trailerHeading), fade: fa });
      dyn.push({ mesh: this.M.tractor, m: modelFromID(p.fw[0], 0, p.fw[1], p.tractorHeading), fade: fa });
    }
    return dyn;
  };
  Renderer.prototype.shadowPass = function (dyn) {
    const gl = this.gl, P = this.PD;
    gl.enable(gl.DEPTH_TEST); gl.disable(gl.BLEND); gl.disable(gl.CULL_FACE);
    gl.useProgram(P.p); gl.uniformMatrix4fv(P.u.uLVP, false, this.LVP);
    if (!this.staticShadow) {   // static scene: rendered once, the sun never moves
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.shFB); gl.viewport(0, 0, this.shRes, this.shRes);
      gl.clearColor(1, 1, 1, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.uniform1f(P.u.uFadeA, 1); gl.uniformMatrix4fv(P.u.uM, false, I4); this.bind(P, this.M.statics); gl.drawArrays(gl.TRIANGLES, 0, this.M.statics.n);
      this.staticShadow = true;
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.shFBD); gl.viewport(0, 0, this.shResD, this.shResD);
    gl.clearColor(1, 1, 1, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    for (const d of dyn) { gl.uniform1f(P.u.uFadeA, d.fade == null ? 1 : d.fade); gl.uniformMatrix4fv(P.u.uM, false, d.m); this.bind(P, d.mesh); gl.drawArrays(gl.TRIANGLES, 0, d.mesh.n); }
    gl.uniform1f(P.u.uFadeA, 1);
    this.unbind(P);
  };

  // draw scene into the currently bound framebuffer
  Renderer.prototype.draw = function (o) {
    const gl = this.gl, night = o.night, VP = o.VP, eye = o.eye;
    gl.viewport(0, 0, o.W, o.H);
    gl.clearColor(o.clear[0], o.clear[1], o.clear[2], 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    if (o.sky) {
      gl.disable(gl.DEPTH_TEST);
      const P = this.PS; gl.useProgram(P.p); gl.bindBuffer(gl.ARRAY_BUFFER, this.quad); gl.enableVertexAttribArray(P.a.aQ); gl.vertexAttribPointer(P.a.aQ, 2, gl.FLOAT, false, 0, 0);
      gl.uniformMatrix4fv(P.u.uIVP, false, M4.inv(VP)); gl.uniform3fv(P.u.uCam, eye); gl.uniform1f(P.u.uNight, night ? 1 : 0); gl.uniform3fv(P.u.uSun, this.sunDir);
      gl.drawArrays(gl.TRIANGLES, 0, 3); gl.disableVertexAttribArray(P.a.aQ);
    }
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL);
    const P = this.P; gl.useProgram(P.p);
    gl.uniformMatrix4fv(P.u.uVP, false, VP); gl.uniformMatrix4fv(P.u.uLVP, false, this.LVP);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, this.shTexD); gl.uniform1i(P.u.uShD, 2);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.shTex); gl.uniform1i(P.u.uSh, 0);
    gl.uniform1f(P.u.uShOn, o.shOn ? 1 : 0); gl.uniform1f(P.u.uShRes, this.shRes); gl.uniform1f(P.u.uShResD, this.shResD); gl.uniform1f(P.u.uPix, o.pix || 0.001);
    gl.uniform3fv(P.u.uCam, eye); gl.uniform3fv(P.u.uViewDir, o.viewDir || [0, -1, 0]); gl.uniform1f(P.u.uOrtho, o.ortho ? 1 : 0);
    gl.uniform1f(P.u.uXray, 0); gl.uniform1f(P.u.uAlpha, 1);
    if (!night) {
      gl.uniform3fv(P.u.uSun, this.sunDir); gl.uniform3fv(P.u.uSunC, [1.72, 1.58, 1.36]);
      gl.uniform3fv(P.u.uSky, [0.3, 0.36, 0.47]); gl.uniform3fv(P.u.uGnd, [0.17, 0.155, 0.13]);
      gl.uniform3fv(P.u.uFog, [0.72, 0.77, 0.82]); gl.uniform1f(P.u.uFogN, 900); gl.uniform1f(P.u.uFogF, 5200);
      gl.uniform1f(P.u.uNight, 0); gl.uniform1f(P.u.uExp, 1.0);
    } else {
      gl.uniform3fv(P.u.uSun, norm([0.3, 0.8, -0.3])); gl.uniform3fv(P.u.uSunC, [0.022, 0.03, 0.055]);
      gl.uniform3fv(P.u.uSky, [0.014, 0.02, 0.04]); gl.uniform3fv(P.u.uGnd, [0.004, 0.004, 0.006]);
      gl.uniform3fv(P.u.uFog, [0.03, 0.045, 0.08]); gl.uniform1f(P.u.uFogN, 1100); gl.uniform1f(P.u.uFogF, 4600);
      gl.uniform1f(P.u.uNight, 1); gl.uniform1f(P.u.uExp, 1.0);
      const L = new Float32Array(MAXL * 4), Dd = new Float32Array(MAXL * 4), src = this.scene.lights;
      for (let i = 0; i < Math.min(MAXL, src.length); i++) { const q = src[i]; L.set([q[0], q[1], q[2], q[3]], i * 4); Dd.set([q[4], q[5], q[6], q[7]], i * 4); }
      gl.uniform4fv(P.u.uPL, L); gl.uniform4fv(P.u.uPD, Dd); gl.uniform3fv(P.u.uLC, [1.0, 0.9, 0.76]);
    }
    const sim = o.sim, pose = sim && sim.pose;
    const hl = pose && pose.visible && night && !pose.reversing && o.dyn.length > 1;
    gl.uniform1f(P.u.uHLon, hl ? 1 : 0);
    if (hl) {
      const h = pose.tractorHeading, fx = Math.sin(h), fy = Math.cos(h); const fr = [pose.fw[0] + fx * 16.3, pose.fw[1] + fy * 16.3];
      gl.uniform3fv(P.u.uHL0, [fr[0] - fy * 2.8, 4.8, -(fr[1] + fx * 2.8)]); gl.uniform3fv(P.u.uHL1, [fr[0] + fy * 2.8, 4.8, -(fr[1] - fx * 2.8)]); gl.uniform3fv(P.u.uHD, norm([fx, -0.12, -fy]));
    }
    gl.uniform1f(P.u.uFadeA, 1); gl.uniformMatrix4fv(P.u.uM, false, I4); this.bind(P, this.M.statics); gl.drawArrays(gl.TRIANGLES, 0, this.M.statics.n);
    for (const d of o.dyn) { gl.uniform1f(P.u.uFadeA, d.fade == null ? 1 : d.fade); gl.uniformMatrix4fv(P.u.uM, false, d.m); this.bind(P, d.mesh); gl.drawArrays(gl.TRIANGLES, 0, d.mesh.n); }
    gl.uniform1f(P.u.uFadeA, 1);
    this.unbind(P);
    // logo decals
    if (this.logoTex && this.decalN) {
      const PT = this.PT; gl.useProgram(PT.p); gl.bindBuffer(gl.ARRAY_BUFFER, this.decalBuf);
      gl.enableVertexAttribArray(PT.a.aP); gl.vertexAttribPointer(PT.a.aP, 3, gl.FLOAT, false, 20, 0);
      gl.enableVertexAttribArray(PT.a.aT); gl.vertexAttribPointer(PT.a.aT, 2, gl.FLOAT, false, 20, 12);
      gl.uniformMatrix4fv(PT.u.uVP, false, VP); gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.logoTex); gl.uniform1i(PT.u.uTex, 1);
      gl.uniform1f(PT.u.uK, night ? 0.72 : 0.86);
      gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(-2, -4); gl.drawArrays(gl.TRIANGLES, 0, this.decalN); gl.disable(gl.POLYGON_OFFSET_FILL);
      gl.disableVertexAttribArray(PT.a.aP); gl.disableVertexAttribArray(PT.a.aT); gl.activeTexture(gl.TEXTURE0);
    }
    // glows
    const G = []; const push = (p, c, a, s) => G.push(p[0], p[1], p[2], c[0], c[1], c[2], a, s);
    if (night) for (const g of this.scene.glows) push(g.p, g.kind === 'street' ? [1.0, 0.78, 0.5] : [1.0, 0.92, 0.8], g.kind === 'pack' ? 0.6 : 0.85, g.kind === 'pack' ? 6 : 11);
    if (o.blink !== false) for (const cm of this.scene.cams) { const ph = (o.time * 0.85 + cm.ph) % 1; const on = ph < 0.1 ? 1 : (ph < 0.16 ? 0.25 : 0); if (on > 0) push(cm.p, [1.0, 0.1, 0.06], on * (night ? 1.0 : 0.7), night ? 4.5 : 2.4); }
    const VEH = (o.sim && o.sim.veh) || [];
    for (const v of VEH) {
      if (!v.tractor || !v.lights) continue;
      const fA = v.fade == null ? 1 : v.fade; if (fA <= 0.01) continue;
      const L = v.lights, pushF = (p, c, a, s) => push(p, c, a * fA, s);
      const h = v.tractor.heading, fx = Math.sin(h), fy = Math.cos(h), fw = v.tractor.fw; const fr = [fw[0] + fx * 16.3, fw[1] + fy * 16.3];
      if (night && !L.reversing && L.moving) for (const sd of [-1, 1]) pushF([fr[0] - fy * 3.0 * sd, 4.8, -(fr[1] + fx * 3.0 * sd)], [1.0, 0.97, 0.9], 1.0, 6);
      let rp0, th;
      if (v.trailer) { th = v.trailer.heading; rp0 = v.trailer.rear; } else { th = h; rp0 = [fw[0] - fx * 6.6, fw[1] - fy * 6.6]; }
      const tx = Math.sin(th), ty = Math.cos(th), hh = v.trailer ? 3.25 : 3.0, wd = v.trailer ? 3.4 : 2.6;
      for (const sd of [-1, 1]) { const rp = [rp0[0] - ty * wd * sd, hh, -(rp0[1] + tx * wd * sd)];
        if (L.reversing) pushF(rp, [1, 1, 1], night ? 0.9 : 0.5, night ? 3.5 : 2);
        else if ((L.braking && L.moving) || night) pushF(rp, [1.0, 0.08, 0.05], L.braking && L.moving ? 0.9 : 0.45, L.braking && L.moving ? 3.5 : 2.5); }
    }
    if (G.length) {
      const PG = this.PG; gl.useProgram(PG.p);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.glowBuf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(G), gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(PG.a.aP); gl.vertexAttribPointer(PG.a.aP, 3, gl.FLOAT, false, 32, 0);
      gl.enableVertexAttribArray(PG.a.aC); gl.vertexAttribPointer(PG.a.aC, 4, gl.FLOAT, false, 32, 12);
      gl.enableVertexAttribArray(PG.a.aS); gl.vertexAttribPointer(PG.a.aS, 1, gl.FLOAT, false, 32, 28);
      gl.uniformMatrix4fv(PG.u.uVP, false, VP); gl.uniform1f(PG.u.uScale, o.glowScale); gl.uniform1f(PG.u.uOrtho, o.ortho ? 1 : 0);
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE); gl.depthMask(false);
      gl.drawArrays(gl.POINTS, 0, G.length / 8);
      gl.depthMask(true); gl.disable(gl.BLEND);
      for (const k of ['aP', 'aC', 'aS']) gl.disableVertexAttribArray(PG.a[k]);
    }
  };

  Renderer.prototype.frame = function (sim, time) {
    const gl = this.gl; this.resize();
    const W = this.canvas.width, H = this.canvas.height; if (!W || !H) return;
    const eye = this.camPos(), c = this.cam;
    const VP = M4.mul(M4.persp(c.fov, W / H, Math.max(0.6, c.dist * 0.01), 12000), M4.look(eye, c.target, [0, 1, 0]));
    this.VP = VP;
    const dyn = this.dynamics(sim);
    const shOn = !this.night && this.shOK;
    if (shOn) this.shadowPass(dyn);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.draw({ VP, eye, W, H, night: this.night, sky: true, shOn, dyn, sim, time, xray: this.xray, clear: [0, 0, 0], glowScale: H / (2 * Math.tan(c.fov / 2)), pix: 2 * Math.tan(c.fov / 2) / H });
  };

  // Top-down orthographic render of a plan window -> data URL (no moving truck / arm)
  Renderer.prototype.renderTop = function (win, pxW, pxH, night) {
    const gl = this.gl;
    const maxRB = Math.min(gl.getParameter(gl.MAX_RENDERBUFFER_SIZE), gl.getParameter(gl.MAX_TEXTURE_SIZE));
    const ss = Math.max(1, Math.min(2, Math.floor(maxRB / Math.max(pxW, pxH))));
    const W = pxW * ss, H = pxH * ss;
    const cx = (win.x0 + win.x1) / 2, cy = (win.y0 + win.y1) / 2, hw = (win.x1 - win.x0) / 2, hh = (win.y1 - win.y0) / 2;
    const eye = [cx, 2500, -cy];
    const VP = M4.mul(M4.ortho(-hw, hw, -hh, hh, 100, 5000), M4.look(eye, [cx, 0, -cy], [0, 0, -1]));
    if (!night && this.shOK) this.shadowPass([]);
    const f = this.makeFBO(W, H);
    gl.bindFramebuffer(gl.FRAMEBUFFER, f.fb);
    this.draw({ VP, eye, W, H, night, sky: false, shOn: !night && this.shOK, dyn: [], sim: null, time: 0, xray: false, blink: false, ortho: true, viewDir: [0, -1, 0], clear: night ? [0.02, 0.03, 0.05] : [0.6, 0.65, 0.55], glowScale: W / (win.x1 - win.x0), pix: (win.x1 - win.x0) / W });
    const px = new Uint8Array(W * H * 4); gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.deleteFramebuffer(f.fb); gl.deleteTexture(f.tex); gl.deleteRenderbuffer(f.rb);
    const c1 = document.createElement('canvas'); c1.width = W; c1.height = H; const x1 = c1.getContext('2d');
    const id = x1.createImageData(W, H);
    for (let y = 0; y < H; y++) id.data.set(px.subarray((H - 1 - y) * W * 4, (H - y) * W * 4), y * W * 4);
    x1.putImageData(id, 0, 0);
    const c2 = document.createElement('canvas'); c2.width = pxW; c2.height = pxH; const x2 = c2.getContext('2d');
    x2.imageSmoothingEnabled = true; x2.imageSmoothingQuality = 'high'; x2.drawImage(c1, 0, 0, pxW, pxH);
    return c2.toDataURL('image/jpeg', 0.9);
  };

  Renderer.prototype.project = function (p) { const v = M4.xf(this.VP, p); if (v[3] <= 0) return null; const r = this.canvas.getBoundingClientRect(); return [(v[0] * 0.5 + 0.5) * r.width, (1 - (v[1] * 0.5 + 0.5)) * r.height, v[2]]; };

  global.Renderer3D = Renderer; global.M4 = M4;
})(window);
