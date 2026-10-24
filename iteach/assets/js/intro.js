/*
 * iTeach intro
 * A real dove (green-screen video, keyed live in WebGL) flies out of the sunrise
 * toward the viewer, freezes mid-air, breaks into light particles and those
 * particles assemble into the iTeach logo. The logo then docks into the header.
 *
 * URL flags: ?intro (play again), ?nointro (skip), ?speed=0.25 (slow motion for review)
 */
(() => {
  'use strict';

  const intro = document.getElementById('intro');
  const root = document.documentElement;   // intro state classes live on <html>
  const qs = new URLSearchParams(location.search);

  if (!intro) return;

  // ---------- settings ----------
  const SPEED = Math.min(2, Math.max(0.05, parseFloat(qs.get('speed')) || 1));
  // CSS/WAAPI animations follow SPEED too, except in capture mode (?cap), where DevTools slows them instead
  const ANIM = qs.has('cap') ? 1 : SPEED;
  const FRAME = { w: 1192, h: 960, ax: 0.6, ay: 0.47 };   // dove video frame; anchor = bird body centre
  const FREEZE_AT = 4.2;          // seconds into the clip: wings fully up (looks like the logo)
  const RATE = 1.6;               // the source is slow motion; play it a bit faster
  const FLY = FREEZE_AT / RATE;   // flight time in seconds
  const HOLD = 0.5;               // frozen pause before the transformation
  const DIS_DUR = 1.1;            // flight time of each particle
  const Z0 = 9;                   // start depth: the dove starts 9x smaller, at the sun
  const LOGO_VB = [170, 100, 340, 420];
  const LOGO_D = [
    'M179 113L321 236L208 333Q184 330 180 318Z',
    'M502 108L502 306L382 425L382 513L262 413C240 405 214 410 200 432L194 446C184 430 178 414 181 400C184 388 190 380 200 372Z'
  ];
  const STOPS = [[0, [75, 230, 90]], [0.45, [37, 192, 128]], [0.72, [31, 159, 176]], [1, [31, 127, 214]]];
  const HAZE = [246 / 255, 204 / 255, 166 / 255];  // warm sunset colour of the photo, for the far-away dove

  // ---------- state ----------
  let finished = false, raf = 0, gl = null, video = null, still = null;
  let started = false, held = false, t0 = 0, useStill = false;
  const AT = qs.has('at') ? Math.max(0, parseFloat(qs.get('at')) || 0) : null;  // review mode: show one moment
  let doveTex = null, stillTex = null, quad = null, parts = null;
  let holdBox = null, logoBox = null, logoShown = false, wordShown = false, docking = false;

  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let seen = false;
  try { seen = sessionStorage.getItem('itIntro') === '1'; } catch (e) { /* private mode */ }
  if (!qs.has('intro') && (reduce || seen || qs.has('nointro'))) { done(true); return; }

  const canvas = intro.querySelector('.intro-gl');
  const flash = intro.querySelector('.intro-flash');
  const mark = intro.querySelector('.ib-mark');
  const word = intro.querySelector('.ib-word');
  intro.querySelector('.intro-skip').addEventListener('click', () => done(false));

  // ---------- helpers ----------
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeOutCubic = t => 1 - Math.pow(1 - t, 3);
  const easeInOut = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const now = () => performance.now();
  const secs = t => (now() - t) / 1000 * SPEED;
  function grad(t) {
    t = clamp(t);
    for (let i = 1; i < STOPS.length; i++) {
      if (t <= STOPS[i][0]) {
        const [t0, c0] = STOPS[i - 1], [t1, c1] = STOPS[i], k = (t - t0) / (t1 - t0);
        return c0.map((c, j) => lerp(c, c1[j], k) / 255);
      }
    }
    return STOPS[STOPS.length - 1][1].map(c => c / 255);
  }

  function layout() {
    const W = innerWidth, H = innerHeight, m = W < 760;
    // the sunset glow sits at (1700, 1010) of the 2560x1707 Thames photo (object-fit: cover)
    const P = { w: 2560, h: 1707, gx: 1700, gy: 1010, px: m ? 0.56 : 0.5, py: 0.66 };
    const sc = Math.max(W / P.w, H / P.h);
    const sun = { x: (W - P.w * sc) * P.px + P.gx * sc, y: (H - P.h * sc) * P.py + P.gy * sc };
    const endH = m ? Math.min(H * 0.5, W * 1.15 * FRAME.h / FRAME.w) : Math.min(H * 0.84, W * 0.6 * FRAME.h / FRAME.w);
    const end = { x: W * 0.5, y: H * (m ? 0.42 : 0.5) };
    const logoH = m ? Math.min(H * 0.26, W * 0.5 * 420 / 340) : Math.min(H * 0.36, 380);
    return { W, H, m, sun, endH, end, logoH };
  }

  // ---------- WebGL ----------
  const DELAY = 'float delayAt(vec2 uv){return 0.09+uv.y*0.5+0.05*sin(uv.x*23.0)+0.03*sin(uv.x*61.0+uv.y*17.0);}';
  const QUAD_VS = `attribute vec2 aPos;uniform vec4 uBox;uniform vec2 uRes;varying vec2 vUv;
void main(){vUv=aPos;vec2 p=uBox.xy+aPos*uBox.zw;vec2 c=p/uRes*2.0-1.0;gl_Position=vec4(c.x,-c.y,0.0,1.0);}`;
  const QUAD_FS = `precision mediump float;uniform sampler2D uTex;uniform float uKeyed,uHaze,uDis,uAlpha;uniform vec3 uHazeCol;varying vec2 vUv;${DELAY}
void main(){vec4 c=texture2D(uTex,vUv);float a=c.a;
if(uKeyed<0.5){float m=max(c.r,c.b);float k=c.g-m;a=1.0-smoothstep(0.07,0.235,k);if(c.g>m)c.g=m+(c.g-m)*0.15;}
if(uDis>-0.5){float e=uDis-delayAt(vUv);if(e>0.0)discard;c.rgb=mix(c.rgb,vec3(1.0,0.97,0.86)*1.1,smoothstep(-0.045,0.0,e)*0.75);}
c.rgb=mix(c.rgb,uHazeCol,uHaze);a*=uAlpha;gl_FragColor=vec4(c.rgb*a,a);}`;
  const PART_VS = `attribute vec2 aStart,aEnd,aRnd;attribute vec3 aCol,aCol2;
uniform vec4 uDove,uLogo;uniform vec2 uRes;uniform float uT,uDur,uS0,uS1,uFade,uDpr;varying vec3 vCol;varying float vA;${DELAY}
void main(){vec2 p0=uDove.xy+aStart*uDove.zw;vec2 p1=uLogo.xy+aEnd*uLogo.zw;
float lt=uT-delayAt(aStart)-aRnd.x*0.05;float t=clamp(lt/uDur,0.0,1.0);
float e=t<0.5?4.0*t*t*t:1.0-pow(-2.0*t+2.0,3.0)*0.5;
vec2 d=p1-p0;vec2 n=vec2(-d.y,d.x);vec2 ctrl=(p0+p1)*0.5+n*(aRnd.y-0.5)*0.8-vec2(0.0,90.0*aRnd.x);
vec2 p=mix(mix(p0,ctrl,e),mix(ctrl,p1,e),e);float mid=sin(3.14159*t);
p+=vec2(sin(uT*7.0+aRnd.y*40.0),cos(uT*6.0+aRnd.x*40.0))*7.0*mid;
vec2 c=p/uRes*2.0-1.0;gl_Position=vec4(c.x,-c.y,0.0,1.0);
gl_PointSize=max(1.0,mix(uS0,uS1,e)*(1.0-0.45*mid)*uDpr);
vCol=mix(aCol,aCol2,smoothstep(0.2,0.9,t))+vec3(0.45,0.5,0.35)*mid*0.6;vA=step(0.0,lt)*uFade;}`;
  const PART_FS = `precision mediump float;varying vec3 vCol;varying float vA;
void main(){vec2 q=gl_PointCoord-0.5;float r=length(q);if(r>0.5)discard;float a=vA*smoothstep(0.5,0.3,r);gl_FragColor=vec4(vCol*a,a);}`;

  function shader(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }
  function program(vs, fs, names) {
    const p = gl.createProgram();
    gl.attachShader(p, shader(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, shader(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const u = {};
    names.forEach(n => { u[n] = gl.getUniformLocation(p, n); });
    return { p, u };
  }
  function texture() {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    return t;
  }
  function upload(tex, src) {
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
    if (gl.generateMipmap && typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext) {
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    }
  }

  let dpr = 1;
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(innerWidth * dpr), h = Math.round(innerHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    gl.viewport(0, 0, w, h);
  }

  function drawQuad(tex, keyed, box, haze, dis, alpha) {
    gl.useProgram(quad.p);
    gl.bindBuffer(gl.ARRAY_BUFFER, quad.buf);
    gl.enableVertexAttribArray(quad.aPos);
    gl.vertexAttribPointer(quad.aPos, 2, gl.FLOAT, false, 0, 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    const u = quad.u;
    gl.uniform1i(u.uTex, 0);
    gl.uniform4f(u.uBox, box[0], box[1], box[2], box[3]);
    gl.uniform2f(u.uRes, innerWidth, innerHeight);
    gl.uniform1f(u.uKeyed, keyed);
    gl.uniform1f(u.uHaze, haze);
    gl.uniform3f(u.uHazeCol, HAZE[0], HAZE[1], HAZE[2]);
    gl.uniform1f(u.uDis, dis);
    gl.uniform1f(u.uAlpha, alpha);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.disableVertexAttribArray(quad.aPos);
  }

  // ---------- particles ----------
  function sampleDove(img, N) {
    const c = document.createElement('canvas');
    c.width = FRAME.w; c.height = FRAME.h;
    const x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(img, 0, 0, FRAME.w, FRAME.h);
    const d = x.getImageData(0, 0, FRAME.w, FRAME.h).data;
    let opaque = 0;
    for (let i = 3; i < d.length; i += 16) if (d[i] > 150) opaque += 4;
    const step = Math.max(1.5, Math.sqrt(opaque / N));
    const pts = [];
    for (let y = step / 2; y < FRAME.h; y += step) {
      for (let xx = step / 2; xx < FRAME.w; xx += step) {
        const px = Math.min(FRAME.w - 1, Math.round(xx + (Math.random() - 0.5) * step * 0.7));
        const py = Math.min(FRAME.h - 1, Math.round(y + (Math.random() - 0.5) * step * 0.7));
        const i = (py * FRAME.w + px) * 4;
        if (d[i + 3] > 150) pts.push({ u: px / FRAME.w, v: py / FRAME.h, c: [d[i] / 255, d[i + 1] / 255, d[i + 2] / 255] });
      }
    }
    return { pts, step };
  }
  function sampleLogo(M) {
    const lw = LOGO_VB[2], lh = LOGO_VB[3];
    const c = document.createElement('canvas');
    c.width = lw; c.height = lh;
    const x = c.getContext('2d', { willReadFrequently: true });
    x.translate(-LOGO_VB[0], -LOGO_VB[1]);
    LOGO_D.forEach(p => x.fill(new Path2D(p)));
    const d = x.getImageData(0, 0, lw, lh).data;
    let area = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i] > 160) area++;
    const step = Math.sqrt(area / M);
    let pts = [];
    for (let y = step / 2; y < lh; y += step) {
      for (let xx = step / 2; xx < lw; xx += step) {
        const px = xx + (Math.random() - 0.5) * step * 0.6, py = y + (Math.random() - 0.5) * step * 0.6;
        const i = ((py | 0) * lw + (px | 0)) * 4;
        if (d[i + 3] > 160) pts.push({ u: px / lw, v: py / lh, c: grad((py + LOGO_VB[1] - 108) / 405) });
      }
    }
    // make the count match the dove samples exactly
    while (pts.length < M) { const p = pts[(Math.random() * pts.length) | 0]; pts.push({ u: p.u + (Math.random() - 0.5) * 0.004, v: p.v + (Math.random() - 0.5) * 0.004, c: p.c }); }
    if (pts.length > M) { pts.sort(() => Math.random() - 0.5); pts = pts.slice(0, M); }
    return { pts, area };
  }
  function buildParticles() {
    const N = innerWidth < 760 ? 7000 : 14000;
    const dove = sampleDove(still, N);
    const M = dove.pts.length;
    const logo = sampleLogo(M);
    const a = dove.pts, b = logo.pts;
    // top of the dove goes to the top of the logo, left to left: wings become wings
    a.sort((p, q) => p.v - q.v); b.sort((p, q) => p.v - q.v);
    const size = Math.ceil(M / 40);
    for (let i = 0; i < M; i += size) {
      const A = a.slice(i, i + size).sort((p, q) => p.u - q.u);
      const B = b.slice(i, i + size).sort((p, q) => p.u - q.u);
      for (let j = 0; j < A.length; j++) { a[i + j] = A[j]; b[i + j] = B[j]; }
    }
    const data = new Float32Array(M * 12);
    for (let i = 0; i < M; i++) {
      const o = i * 12, p = a[i], q = b[i];
      data[o] = p.u; data[o + 1] = p.v; data[o + 2] = q.u; data[o + 3] = q.v;
      data[o + 4] = p.c[0]; data[o + 5] = p.c[1]; data[o + 6] = p.c[2];
      data[o + 7] = q.c[0]; data[o + 8] = q.c[1]; data[o + 9] = q.c[2];
      data[o + 10] = Math.random(); data[o + 11] = Math.random();
    }
    const prog = program(PART_VS, PART_FS, ['uDove', 'uLogo', 'uRes', 'uT', 'uDur', 'uS0', 'uS1', 'uFade', 'uDpr']);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    const loc = n => gl.getAttribLocation(prog.p, n);
    return {
      ...prog, buf, M, doveStep: dove.step, logoArea: logo.area,
      attrs: [[loc('aStart'), 2, 0], [loc('aEnd'), 2, 2], [loc('aCol'), 3, 4], [loc('aCol2'), 3, 7], [loc('aRnd'), 2, 10]]
    };
  }
  function drawParticles(T, fade) {
    const P = parts, u = P.u;
    gl.useProgram(P.p);
    gl.bindBuffer(gl.ARRAY_BUFFER, P.buf);
    P.attrs.forEach(([l, n, off]) => { if (l < 0) return; gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, n, gl.FLOAT, false, 48, off * 4); });
    const s0 = P.doveStep * (holdBox[3] / FRAME.h) * 1.7;
    const s1 = Math.sqrt(P.logoArea * Math.pow(logoBox[3] / LOGO_VB[3], 2) / P.M) * 1.5;
    gl.uniform4f(u.uDove, holdBox[0], holdBox[1], holdBox[2], holdBox[3]);
    gl.uniform4f(u.uLogo, logoBox[0], logoBox[1], logoBox[2], logoBox[3]);
    gl.uniform2f(u.uRes, innerWidth, innerHeight);
    gl.uniform1f(u.uT, T);
    gl.uniform1f(u.uDur, DIS_DUR);
    gl.uniform1f(u.uS0, s0);
    gl.uniform1f(u.uS1, s1);
    gl.uniform1f(u.uFade, fade);
    gl.uniform1f(u.uDpr, dpr);
    gl.drawArrays(gl.POINTS, 0, P.M);
    P.attrs.forEach(([l]) => { if (l >= 0) gl.disableVertexAttribArray(l); });
  }

  // ---------- timeline ----------
  function flyBox(p, L) {
    const z = lerp(Z0, 1, Math.sin(p * Math.PI / 2));
    const s = 1 / z, k = (s - 1 / Z0) / (1 - 1 / Z0);
    const h = L.endH * s, w = h * FRAME.w / FRAME.h;
    const start = { x: L.sun.x, y: L.sun.y - L.endH * 0.04 };
    const cx = lerp(start.x, L.end.x, k);
    const cy = lerp(start.y, L.end.y, k) + Math.sin(p * Math.PI * 2.2) * L.endH * 0.012 * k;
    return { box: [cx - w * FRAME.ax, cy - h * FRAME.ay, w, h], k };
  }
  function computeLogoBox(L) {
    const ax = holdBox[0] + holdBox[2] * FRAME.ax, ay = holdBox[1] + holdBox[3] * FRAME.ay;
    const lh = L.logoH, lw = lh * LOGO_VB[2] / LOGO_VB[3];
    const cy = ay - lh * (L.m ? 0.22 : 0.3);  // lift it: the wordmark goes below, over the darker sky
    return [ax - lw / 2, cy - lh / 2, lw, lh];
  }

  function frame() {
    if (finished) return;
    raf = requestAnimationFrame(frame);
    resize();
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    const L = layout();

    // one master clock: fly -> hold (frozen) -> dissolve into the logo
    const t = AT !== null ? AT : secs(t0);
    if (t < FLY) {
      const p = clamp(t / FLY);
      const { box, k } = flyBox(p, L);
      let tex = stillTex, keyed = 1;
      if (!useStill && video.readyState >= 2) { upload(doveTex, video); tex = doveTex; keyed = 0; }
      drawQuad(tex, keyed, box, 0.8 * Math.pow(1 - k, 1.4), -1, clamp(p * 8));
      return;
    }
    if (!held) startHold(flyBox(1, L).box);
    if (t < FLY + HOLD) {
      const q = clamp((t - FLY) / HOLD);
      holdBox = scaleBox(flyBox(1, L).box, 1 + 0.035 * easeOutCubic(q));
      drawQuad(stillTex, 1, holdBox, 0, -1, 1);
      return;
    }
    const T = t - FLY - HOLD;
    holdBox = scaleBox(flyBox(1, L).box, 1.035);
    logoBox = computeLogoBox(L);
    drawQuad(stillTex, 1, holdBox, 0, T, 1);
    drawParticles(T, 1 - clamp((T - 1.8) / 0.4));
    placeBrand(L);
    if (AT !== null) {   // review mode: draw this moment only
      mark.style.opacity = clamp((T - 1.55) / 0.65);
      word.style.opacity = clamp((T - 1.95) / 0.8);
      return;
    }
    if (T > 1.55 && !logoShown) showLogo();
    if (T > 1.95 && !wordShown) showWord();
    if (T > 3.0 && !docking) dock();
  }
  function scaleBox(b, s) {
    const ax = b[0] + b[2] * FRAME.ax, ay = b[1] + b[3] * FRAME.ay;
    return [ax - b[2] * s * FRAME.ax, ay - b[3] * s * FRAME.ay, b[2] * s, b[3] * s];
  }

  function startFly() {
    if (started) return;
    started = true;
    t0 = now();
    raf = requestAnimationFrame(frame);
  }
  function startHold(box) {
    held = true;
    if (video) video.pause();
    root.classList.add('frozen');
    if (AT !== null) return;
    // a soft burst of light where the dove stopped
    const ax = box[0] + box[2] * FRAME.ax, ay = box[1] + box[3] * FRAME.ay, size = box[3] * 1.5;
    Object.assign(flash.style, { left: ax + 'px', top: ay + 'px', width: size + 'px', height: size + 'px' });
    flash.animate([
      { opacity: 0, transform: 'translate(-50%,-50%) scale(.5)' },
      { opacity: 0.55, transform: 'translate(-50%,-50%) scale(1)', offset: 0.3 },
      { opacity: 0, transform: 'translate(-50%,-50%) scale(1.25)' }
    ], { duration: 900 / ANIM, easing: 'ease-out' });
  }
  function placeBrand() {
    if (docking) return;
    Object.assign(mark.style, { left: logoBox[0] + 'px', top: logoBox[1] + 'px', width: logoBox[2] + 'px', height: logoBox[3] + 'px' });
    const fs = clamp(logoBox[3] * 0.15, 26, 58);
    word.style.fontSize = fs + 'px';
    word.style.top = (logoBox[1] + logoBox[3] + fs * 0.55) + 'px';
    word.style.left = (logoBox[0] + logoBox[2] / 2 - word.offsetWidth / 2) + 'px';
  }
  function showLogo() {
    logoShown = true;
    mark.animate([{ opacity: 0, filter: 'drop-shadow(0 0 0 rgba(120,255,190,0)) brightness(1.6)' },
      { opacity: 1, filter: 'drop-shadow(0 0 40px rgba(120,255,190,.55)) brightness(1)' }],
      { duration: 650 / ANIM, easing: 'ease-out', fill: 'forwards' });
  }
  function showWord() {
    wordShown = true;
    word.animate([{ opacity: 0, transform: 'translateY(14px)', letterSpacing: '.12em' },
      { opacity: 1, transform: 'none', letterSpacing: '-.01em' }],
      { duration: 800 / ANIM, easing: 'cubic-bezier(.2,.7,.2,1)', fill: 'forwards' });
  }
  function dock() {
    docking = true;
    root.classList.remove('frozen');
    root.classList.add('intro-dock');
    const tMark = document.querySelector('.site-header .brand-mark').getBoundingClientRect();
    const tWord = document.querySelector('.site-header .brand-word').getBoundingClientRect();
    const m = mark.getBoundingClientRect(), w = word.getBoundingClientRect();
    const dur = 950 / ANIM, easing = 'cubic-bezier(.7,0,.2,1)';
    mark.getAnimations().forEach(a => a.cancel());
    word.getAnimations().forEach(a => a.cancel());
    mark.style.opacity = 1; word.style.opacity = 1;
    mark.animate([{ transform: 'none', filter: 'drop-shadow(0 0 40px rgba(120,255,190,.55))' },
      { transform: `translate(${tMark.left - m.left}px,${tMark.top - m.top}px) scale(${tMark.height / m.height})`, filter: 'drop-shadow(0 0 0 rgba(120,255,190,0))' }],
      { duration: dur, easing, fill: 'forwards' });
    const a = word.animate([{ transform: 'none' },
      { transform: `translate(${tWord.left - w.left}px,${tWord.top - w.top}px) scale(${tWord.height / w.height})` }],
      { duration: dur, easing, fill: 'forwards' });
    a.onfinish = () => done(true);
  }

  function done(instant) {
    if (finished) return;
    finished = true;
    cancelAnimationFrame(raf);
    try { sessionStorage.setItem('itIntro', '1'); } catch (e) { /* ignore */ }
    if (video) { video.pause(); video.removeAttribute('src'); video.load(); }
    if (instant) {
      root.classList.remove('intro-on', 'intro-dock', 'frozen');
      intro.remove();
      return;
    }
    root.classList.add('intro-dock');
    root.classList.remove('intro-on', 'frozen');
    intro.classList.add('fade-out');
    setTimeout(() => { intro.remove(); root.classList.remove('intro-dock'); }, 450);
  }

  // ---------- boot ----------
  function load() {
    try {
      gl = canvas.getContext('webgl2', { premultipliedAlpha: true, alpha: true, antialias: false })
        || canvas.getContext('webgl', { premultipliedAlpha: true, alpha: true, antialias: false });
      if (!gl) throw new Error('no webgl');
      resize();
      const qp = program(QUAD_VS, QUAD_FS, ['uTex', 'uBox', 'uRes', 'uKeyed', 'uHaze', 'uHazeCol', 'uDis', 'uAlpha']);
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
      quad = { ...qp, buf, aPos: gl.getAttribLocation(qp.p, 'aPos') };
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      doveTex = texture();
      stillTex = texture();
    } catch (e) {
      done(true);
      return;
    }

    still = new Image();
    still.decoding = 'async';
    still.src = 'assets/img/dove-freeze.webp';

    video = document.createElement('video');
    video.muted = true; video.defaultMuted = true;
    video.playsInline = true; video.setAttribute('playsinline', '');
    video.preload = 'auto';
    video.src = innerWidth < 760 || innerHeight < 560 ? 'assets/video/dove-600.mp4' : 'assets/video/dove-960.mp4';
    Object.assign(video.style, { position: 'absolute', width: '1px', height: '1px', opacity: '0', pointerEvents: 'none' });
    intro.appendChild(video);

    const stillReady = still.decode().then(() => true, () => false);
    const videoReady = new Promise(res => {
      if (video.readyState >= 3) return res(true);
      video.addEventListener('canplaythrough', () => res(true), { once: true });
      video.addEventListener('error', () => res(false), { once: true });
      setTimeout(() => res(video.readyState >= 2), 3500);
    });
    const fonts = Promise.race([document.fonts ? document.fonts.ready : Promise.resolve(), new Promise(r => setTimeout(r, 1500))]);
    const minWait = new Promise(r => setTimeout(r, 450));

    Promise.all([stillReady, videoReady, fonts, minWait]).then(([okStill, okVideo]) => {
      if (finished) return;
      if (!okStill) { done(true); return; }
      upload(stillTex, still);
      try { parts = buildParticles(); } catch (e) { done(true); return; }
      if (!okVideo) useStill = true;
      if (AT !== null) {   // review mode: seek the clip to this moment and draw one frame
        if (AT < FLY && !useStill) {
          video.addEventListener('seeked', () => frame(), { once: true });
          video.currentTime = AT / FLY * FREEZE_AT;
        } else frame();
        return;
      }
      if (useStill) { startFly(); return; }
      video.playbackRate = RATE * SPEED;
      video.currentTime = 0;
      const p = video.play();
      const go = () => startFly();
      if (p && p.then) p.then(() => { video.addEventListener('playing', go, { once: true }); if (!video.paused && video.currentTime > 0) go(); setTimeout(go, 300); }, () => { useStill = true; go(); });
      else go();
    });
  }
  load();
})();
