// ── Cosmic Comet — Cinematic Real-Time Audio/Effects Visualization ────
import { bus, $ } from './utils.js';
import { getPitchHistory, getRmsHistory, getTransients, getFreqData, getSmoothedHz } from './audio-analysis.js';

/* ── Constants ────────────────────────────────────────────────────── */
const TAU = Math.PI * 2;
const PITCH_HISTORY_LEN = 300;

// CC slot indices
const SLOT_DRIVE = 0;
const SLOT_DRIVE_LEVEL = 1;
const SLOT_CHORUS_MIX = 2;
const SLOT_CHORUS_RATE = 3;
const SLOT_DELAY_MIX = 4;
const SLOT_DELAY_TIME = 5;
const SLOT_DELAY_FB = 6;
const SLOT_REVERB_MIX = 7;
const SLOT_REVERB_DECAY = 8;
const SLOT_RING_MIX = 9;
const SLOT_RING_FREQ = 10;
const SLOT_EQ_LOW = 11;
const SLOT_EQ_MID = 12;
const SLOT_EQ_HIGH = 13;
const SLOT_COUNT = 14;

const CC_TO_SLOT = {
  11: SLOT_DRIVE, 10: SLOT_DRIVE_LEVEL, 9: SLOT_DRIVE,
  12: SLOT_CHORUS_MIX, 13: SLOT_CHORUS_RATE,
  17: SLOT_DELAY_MIX, 18: SLOT_DELAY_TIME, 19: SLOT_DELAY_FB, 20: SLOT_DELAY_TIME,
  4: SLOT_REVERB_MIX, 5: SLOT_REVERB_DECAY,
  25: SLOT_RING_MIX, 26: SLOT_RING_FREQ, 27: SLOT_RING_MIX,
  22: SLOT_EQ_LOW, 23: SLOT_EQ_MID, 24: SLOT_EQ_HIGH, 21: SLOT_EQ_MID,
};

// Particle system
const MAX_PARTICLES = 400;
const MAX_EMBERS = 150;
const MAX_RINGS = 24;
const STAR_COUNT = 200;
const NEBULA_COUNT = 5;
const SMOOTH_ALPHA = 0.10;

// Explosion system for non-Take-5 MIDI notes
const MAX_EXPLOSIONS = 8;
const explosions = []; // { x, y, age, maxAge, hue, particles[] }

/* ── State ────────────────────────────────────────────────────────── */
let canvas = null, ctx = null;
let collapsed = true;
let panelBuilt = false;
let rafId = null;
let audioActive = false;
let time = 0;
let lastTime = 0;

// Comet position (smoothed center)
let cometX = 0, cometY = 0;
let targetX = 0, targetY = 0;
let cometAngle = 0; // direction of travel

// CC state (normalized 0-1)
const ccRaw = new Float64Array(SLOT_COUNT);
const ccSmoothed = new Float64Array(SLOT_COUNT);

// Particle system — main particles (parallel typed arrays)
const pX = new Float32Array(MAX_PARTICLES);
const pY = new Float32Array(MAX_PARTICLES);
const pVX = new Float32Array(MAX_PARTICLES);
const pVY = new Float32Array(MAX_PARTICLES);
const pLife = new Float32Array(MAX_PARTICLES);
const pSize = new Float32Array(MAX_PARTICLES);
const pHue = new Float32Array(MAX_PARTICLES);
const pSat = new Float32Array(MAX_PARTICLES);
const pBright = new Float32Array(MAX_PARTICLES);
let pHead = 0;

// Ember system — tiny hot trailing sparks
const eX = new Float32Array(MAX_EMBERS);
const eY = new Float32Array(MAX_EMBERS);
const eVX = new Float32Array(MAX_EMBERS);
const eVY = new Float32Array(MAX_EMBERS);
const eLife = new Float32Array(MAX_EMBERS);
let eHead = 0;

// Ring mod ripple pool
const ringPool = [];

// Background stars
const stars = [];

// Background nebula clouds
const nebulae = [];

// Trail history (smoothed comet positions for the tail)
const trail = []; // { x, y, rms, drive }
const TRAIL_LEN = 180;

// Reverb haze trailing position
let hazeX = 0, hazeY = 0;

// Pre-rendered textures
let glowTexture128 = null;
let glowTexture64 = null;
let glowTexture32 = null;
let cometCoreTexture = null;

// Cached color
let blendedColor = { h: 30, s: 20, l: 80 };

/* ── Pre-render textures ─────────────────────────────────────────── */

function makeGlow(size, stops) {
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(size/2, size/2, 0, size/2, size/2, size/2);
  for (const [pos, color] of stops) g.addColorStop(pos, color);
  x.fillStyle = g;
  x.fillRect(0, 0, size, size);
  return c;
}

function initTextures() {
  glowTexture128 = makeGlow(128, [
    [0, 'rgba(255, 255, 255, 0.7)'],
    [0.1, 'rgba(255, 240, 220, 0.5)'],
    [0.3, 'rgba(255, 200, 150, 0.15)'],
    [0.6, 'rgba(255, 140, 80, 0.04)'],
    [1, 'rgba(255, 100, 50, 0)'],
  ]);
  glowTexture64 = makeGlow(64, [
    [0, 'rgba(255, 255, 255, 0.6)'],
    [0.2, 'rgba(255, 230, 200, 0.3)'],
    [0.5, 'rgba(255, 180, 120, 0.08)'],
    [1, 'rgba(255, 120, 60, 0)'],
  ]);
  glowTexture32 = makeGlow(32, [
    [0, 'rgba(255, 255, 255, 0.5)'],
    [0.4, 'rgba(255, 200, 150, 0.15)'],
    [1, 'rgba(255, 150, 80, 0)'],
  ]);
  // Large pre-rendered comet core (drawn once, tinted per frame)
  cometCoreTexture = makeGlow(256, [
    [0, 'rgba(255, 255, 255, 1.0)'],
    [0.02, 'rgba(255, 255, 250, 0.95)'],
    [0.06, 'rgba(255, 245, 230, 0.7)'],
    [0.12, 'rgba(255, 220, 180, 0.4)'],
    [0.25, 'rgba(255, 180, 120, 0.15)'],
    [0.45, 'rgba(255, 130, 70, 0.05)'],
    [0.7, 'rgba(200, 80, 40, 0.015)'],
    [1, 'rgba(150, 50, 20, 0)'],
  ]);
}

function initStars() {
  stars.length = 0;
  for (let i = 0; i < STAR_COUNT; i++) {
    stars.push({
      x: Math.random(),
      y: Math.random(),
      size: 0.3 + Math.random() * 1.8,
      phase: Math.random() * TAU,
      speed: 0.2 + Math.random() * 0.8,
      hue: 200 + Math.random() * 60, // blue-white range
    });
  }
  // A few warm stars
  for (let i = 0; i < 15; i++) {
    stars.push({
      x: Math.random(),
      y: Math.random(),
      size: 0.5 + Math.random() * 2,
      phase: Math.random() * TAU,
      speed: 0.1 + Math.random() * 0.3,
      hue: 20 + Math.random() * 30, // warm
    });
  }
}

function initNebulae() {
  nebulae.length = 0;
  for (let i = 0; i < NEBULA_COUNT; i++) {
    nebulae.push({
      x: 0.1 + Math.random() * 0.8,
      y: 0.1 + Math.random() * 0.8,
      rx: 80 + Math.random() * 200,
      ry: 60 + Math.random() * 150,
      hue: [220, 280, 340, 200, 260][i % 5],
      alpha: 0.01 + Math.random() * 0.015,
      rotation: Math.random() * TAU,
    });
  }
}

/* ── DOM construction ─────────────────────────────────────────────── */

function buildPanel() {
  const panel = $('#ccmonitor-panel');
  if (!panel || panel.querySelector('.ccm-comet')) return;

  const section = document.createElement('div');
  section.className = 'ccm-comet';
  section.innerHTML =
    '<div class="ccm-comet-header">' +
      '<button class="ccm-comet-toggle" id="ccm-comet-toggle">&#9654;</button>' +
      '<span class="ccm-comet-title">Cosmic Comet</span>' +
    '</div>' +
    '<div class="ccm-comet-body" id="ccm-comet-body" hidden>' +
      '<div class="ccm-comet-canvas-wrap">' +
        '<canvas id="ccm-comet-canvas"></canvas>' +
      '</div>' +
    '</div>';

  const analysisEl = panel.querySelector('.ccm-analysis');
  if (analysisEl) panel.insertBefore(section, analysisEl);
  else {
    const groupsEl = panel.querySelector('.ccm-groups');
    if (groupsEl) panel.insertBefore(section, groupsEl);
    else panel.appendChild(section);
  }

  canvas = section.querySelector('#ccm-comet-canvas');
  ctx = canvas.getContext('2d');

  section.querySelector('#ccm-comet-toggle').addEventListener('click', toggleCollapse);
  window.addEventListener('resize', resizeCanvas);

  initTextures();
  initStars();
  initNebulae();
  panelBuilt = true;
}

function toggleCollapse() {
  collapsed = !collapsed;
  const body = document.getElementById('ccm-comet-body');
  const btn = document.getElementById('ccm-comet-toggle');
  if (body) body.hidden = collapsed;
  if (btn) btn.textContent = collapsed ? '\u25B6' : '\u25BC';

  if (!collapsed) {
    resizeCanvas();
    startLoop();
  } else {
    stopLoop();
  }
}

function resizeCanvas() {
  if (!canvas) return;
  const parent = canvas.parentElement;
  if (!parent) return;
  const rect = parent.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

/* ── CC handling ──────────────────────────────────────────────────── */

function onMidiMessage({ data, msgType, channel }) {
  if (msgType === 'cc') {
    const cc = data[1];
    const val = data[2];
    const slot = CC_TO_SLOT[cc];
    if (slot !== undefined) ccRaw[slot] = val / 127;
    return;
  }

  // Explosion on note-on from non-Take-5 instruments
  // Take 5 typically on channel 1 (0-indexed); other instruments trigger explosions
  if (msgType === 'noteon' && data[2] > 0 && channel !== 0) {
    spawnExplosion();
  }
}

function smoothCC() {
  for (let i = 0; i < SLOT_COUNT; i++) {
    ccSmoothed[i] += (ccRaw[i] - ccSmoothed[i]) * SMOOTH_ALPHA;
  }
}

/* ── Color blending ──────────────────────────────────────────────── */

function blendEffectColors() {
  const entries = [
    { h: 28,  s: 95, l: 55, w: ccSmoothed[SLOT_DRIVE] },
    { h: 235, s: 65, l: 58, w: ccSmoothed[SLOT_CHORUS_MIX] },
    { h: 275, s: 70, l: 50, w: ccSmoothed[SLOT_REVERB_MIX] },
    { h: 185, s: 90, l: 55, w: ccSmoothed[SLOT_RING_MIX] },
  ];

  let totalW = 0, hX = 0, hY = 0, sSum = 0, lSum = 0;
  for (const e of entries) {
    if (e.w < 0.01) continue;
    totalW += e.w;
    hX += Math.cos(e.h * Math.PI / 180) * e.w;
    hY += Math.sin(e.h * Math.PI / 180) * e.w;
    sSum += e.s * e.w;
    lSum += e.l * e.w;
  }

  if (totalW < 0.01) {
    blendedColor = { h: 30, s: 60, l: 70 };
    return;
  }

  let h = ((Math.atan2(hY, hX) * 180 / Math.PI) + 360) % 360;
  const s = sSum / totalW;
  const l = lSum / totalW;
  const tempShift = (ccSmoothed[SLOT_EQ_HIGH] - ccSmoothed[SLOT_EQ_LOW]) * 30;
  h = (h + tempShift + 360) % 360;
  blendedColor = { h, s, l };
}

/* ── Comet position logic ────────────────────────────────────────── */

function updateCometPosition(W, H) {
  const pitchHistory = getPitchHistory();
  const rmsHistory = getRmsHistory();

  // Find current pitch
  let headNote = null;
  if (pitchHistory) {
    for (let i = pitchHistory.length - 1; i >= 0; i--) {
      if (pitchHistory[i]) { headNote = pitchHistory[i].midiNote; break; }
    }
  }

  // Comet lives center-right, appearing to travel rightward through space
  const anchorX = W * 0.55;
  const anchorY = H * 0.5;

  if (headNote !== null) {
    // Gentle pitch response: ±10% of height, heavily smoothed
    const normalizedPitch = ((headNote - 60) / 30); // wider range = less sensitive
    targetY = anchorY - normalizedPitch * H * 0.10;
    // Subtle horizontal breathing
    const rms = rmsHistory && rmsHistory.length > 0 ? rmsHistory[rmsHistory.length - 1] : 0;
    targetX = anchorX + Math.sin(time * 0.25) * W * 0.02 + rms * W * 0.01;
  } else {
    // Idle: very gentle float
    targetX = anchorX + Math.sin(time * 0.18) * W * 0.015;
    targetY = anchorY + Math.cos(time * 0.12) * H * 0.015;
  }

  // Very smooth follow — less jittery
  const prevX = cometX, prevY = cometY;
  cometX += (targetX - cometX) * 0.03;
  cometY += (targetY - cometY) * 0.03;

  // Travel angle: strongly biased toward rightward (0 radians) to feel like
  // the comet is flying through space horizontally
  const dx = cometX - prevX;
  const dy = cometY - prevY;
  const rawAngle = (Math.abs(dx) > 0.001 || Math.abs(dy) > 0.001)
    ? Math.atan2(dy, dx) : cometAngle;
  // Blend toward 0 (rightward) — 70% horizontal bias
  const biasedAngle = rawAngle * 0.3; // pull toward 0
  let diff = biasedAngle - cometAngle;
  while (diff > Math.PI) diff -= TAU;
  while (diff < -Math.PI) diff += TAU;
  cometAngle += diff * 0.05;

  // Record trail
  const rms = rmsHistory && rmsHistory.length > 0 ? rmsHistory[rmsHistory.length - 1] : 0;
  trail.push({ x: cometX, y: cometY, rms, drive: ccSmoothed[SLOT_DRIVE] });
  if (trail.length > TRAIL_LEN) trail.shift();
}

/* ── Particle system ─────────────────────────────────────────────── */

function emitParticle(x, y, vx, vy, size, hue, sat, bright) {
  const i = pHead;
  pX[i] = x; pY[i] = y;
  pVX[i] = vx + (Math.random() - 0.5) * 0.8;
  pVY[i] = vy + (Math.random() - 0.5) * 0.8;
  pLife[i] = 1.0;
  pSize[i] = size;
  pHue[i] = hue;
  pSat[i] = sat;
  pBright[i] = bright || 70;
  pHead = (pHead + 1) % MAX_PARTICLES;
}

function emitEmber(x, y, vx, vy) {
  const i = eHead;
  eX[i] = x; eY[i] = y;
  eVX[i] = vx; eVY[i] = vy;
  eLife[i] = 1.0;
  eHead = (eHead + 1) % MAX_EMBERS;
}

function updateParticles() {
  for (let i = 0; i < MAX_PARTICLES; i++) {
    if (pLife[i] <= 0) continue;
    pX[i] += pVX[i]; pY[i] += pVY[i];
    pVX[i] *= 0.975; pVY[i] *= 0.975;
    pLife[i] -= 0.012;
    if (pLife[i] < 0) pLife[i] = 0;
  }
  for (let i = 0; i < MAX_EMBERS; i++) {
    if (eLife[i] <= 0) continue;
    eX[i] += eVX[i]; eY[i] += eVY[i];
    eVX[i] *= 0.96; eVY[i] *= 0.96;
    eLife[i] -= 0.025;
    if (eLife[i] < 0) eLife[i] = 0;
  }
}

function updateRings() {
  for (let i = ringPool.length - 1; i >= 0; i--) {
    const r = ringPool[i];
    r.radius += 2;
    r.alpha -= 0.008;
    if (r.alpha <= 0) ringPool.splice(i, 1);
  }
}

/* ── Animation loop ──────────────────────────────────────────────── */

function startLoop() {
  if (rafId) return;
  lastTime = performance.now();
  rafId = requestAnimationFrame(tick);
}

function stopLoop() {
  if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
}

function tick(now) {
  rafId = requestAnimationFrame(tick);
  const dt = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;
  time += dt;

  const dpr = window.devicePixelRatio || 1;
  const W = canvas.width / dpr;
  const H = canvas.height / dpr;
  if (W === 0 || H === 0) { resizeCanvas(); return; }

  smoothCC();
  blendEffectColors();
  updateCometPosition(W, H);
  updateParticles();
  updateRings();
  updateExplosions();

  draw(W, H, dt);
}

/* ── Main draw ───────────────────────────────────────────────────── */

function draw(W, H, dt) {
  const rmsHistory = getRmsHistory();
  const rms = rmsHistory && rmsHistory.length > 0 ? rmsHistory[rmsHistory.length - 1] : 0;
  const { h, s, l } = blendedColor;
  const drive = ccSmoothed[SLOT_DRIVE];

  // 1. Deep space background
  ctx.fillStyle = '#020208';
  ctx.fillRect(0, 0, W, H);

  // 2. Nebula clouds (very subtle colored fog)
  drawNebulae(W, H);

  // 3. Background stars
  drawStars(W, H);

  // 4. Reverb haze (deep space glow)
  if (ccSmoothed[SLOT_REVERB_MIX] > 0.01) drawReverbHaze(W, H);

  // 5. Delay ghosts
  if (ccSmoothed[SLOT_DELAY_MIX] > 0.01 && trail.length > 5) drawDelayGhosts(W, H, rms);

  // 6. Comet tail
  if (trail.length > 2) drawCometTail(W, H, rms);

  // 7. Embers (tiny hot sparks)
  drawEmbers(W, H);

  // 8. Main particles
  drawParticles(W, H);

  // 8.5 Explosions (non-Take-5 note triggers)
  drawExplosions(W, H);

  // 9. Ring mod ripples
  if (ringPool.length > 0) drawRingRipples();

  // 10. Comet head (the star)
  drawCometHead(W, H, rms);

  // 11. Emit
  emitCometParticles(rms);
  spawnRingRipple();
  emitTrailEmbers(rms);
}

/* ── Nebulae ─────────────────────────────────────────────────────── */

function drawNebulae(W, H) {
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  for (const n of nebulae) {
    const nx = n.x * W;
    const ny = n.y * H;
    // Breathing animation
    const breathe = 1 + Math.sin(time * 0.15 + n.rotation) * 0.1;
    const rx = n.rx * breathe;
    const ry = n.ry * breathe;

    ctx.save();
    ctx.translate(nx, ny);
    ctx.rotate(n.rotation + time * 0.005);
    ctx.scale(1, ry / rx);

    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
    g.addColorStop(0, `hsla(${n.hue}, 50%, 40%, ${n.alpha * 1.5})`);
    g.addColorStop(0.4, `hsla(${n.hue}, 40%, 30%, ${n.alpha})`);
    g.addColorStop(1, `hsla(${n.hue}, 30%, 20%, 0)`);
    ctx.fillStyle = g;
    ctx.fillRect(-rx, -rx, rx * 2, rx * 2);

    ctx.restore();
  }
  ctx.restore();
}

/* ── Stars ────────────────────────────────────────────────────────── */

function drawStars(W, H) {
  // Stars drift slowly leftward to create the feeling of traveling through space
  const drift = time * 0.015; // fast horizontal travel
  for (const s of stars) {
    const twinkle = 0.2 + 0.8 * (0.5 + 0.5 * Math.sin(time * s.speed + s.phase));
    const alpha = twinkle * 0.5;
    const sz = s.size * (0.7 + twinkle * 0.3);

    // Parallax: bigger stars drift faster (closer to camera)
    const parallax = drift * (0.5 + s.size * 0.4);
    const sx = ((s.x - parallax) % 1 + 1) % 1; // wrap around

    // Star glow for bigger stars
    if (sz > 1.2) {
      ctx.fillStyle = `hsla(${s.hue}, 30%, 80%, ${alpha * 0.15})`;
      ctx.beginPath();
      ctx.arc(sx * W, s.y * H, sz * 3, 0, TAU);
      ctx.fill();
    }

    ctx.fillStyle = `hsla(${s.hue}, 20%, 90%, ${alpha})`;
    ctx.beginPath();
    ctx.arc(sx * W, s.y * H, sz, 0, TAU);
    ctx.fill();
  }
}

/* ── Reverb haze ─────────────────────────────────────────────────── */

function drawReverbHaze(W, H) {
  const mix = ccSmoothed[SLOT_REVERB_MIX];
  const decay = ccSmoothed[SLOT_REVERB_DECAY];

  hazeX += (cometX - hazeX) * 0.015;
  hazeY += (cometY - hazeY) * 0.015;

  const radius = 80 + decay * 180;
  const alpha = mix * 0.12;

  ctx.save();
  ctx.globalCompositeOperation = 'screen';

  // Primary haze
  const g1 = ctx.createRadialGradient(hazeX, hazeY, 0, hazeX, hazeY, radius);
  g1.addColorStop(0, `hsla(275, 70%, 45%, ${alpha})`);
  g1.addColorStop(0.3, `hsla(280, 55%, 35%, ${alpha * 0.6})`);
  g1.addColorStop(0.7, `hsla(285, 40%, 25%, ${alpha * 0.15})`);
  g1.addColorStop(1, 'hsla(290, 30%, 15%, 0)');
  ctx.fillStyle = g1;
  ctx.fillRect(hazeX - radius, hazeY - radius, radius * 2, radius * 2);

  // Wide ambient
  const r2 = radius * 2.2;
  const g2 = ctx.createRadialGradient(hazeX, hazeY, 0, hazeX, hazeY, r2);
  g2.addColorStop(0, `hsla(265, 40%, 35%, ${alpha * 0.25})`);
  g2.addColorStop(1, 'hsla(270, 30%, 20%, 0)');
  ctx.fillStyle = g2;
  ctx.fillRect(hazeX - r2, hazeY - r2, r2 * 2, r2 * 2);

  ctx.restore();
}

/* ── Delay ghosts ────────────────────────────────────────────────── */

function drawDelayGhosts(W, H, rms) {
  const mix = ccSmoothed[SLOT_DELAY_MIX];
  const delayTime = ccSmoothed[SLOT_DELAY_TIME];
  const feedback = ccSmoothed[SLOT_DELAY_FB];

  const ghostCount = Math.floor(feedback * 7) + 1;
  // Larger spacing range for more visible separation
  const spacing = Math.max(8, Math.floor(delayTime * 80));
  const len = trail.length;

  // Distinct green color for delay ghosts (Simple Delay = green #30d158)
  const ghostHue = 140;
  const ghostSat = 70;

  for (let g = ghostCount; g >= 1; g--) {
    const idx = len - 1 - (g * spacing);
    if (idx < 0) continue;
    const t = trail[idx];
    if (!t) continue;

    // Much stronger alpha — delay should be unmistakable
    const falloff = 1 - (g - 1) / ghostCount;
    const alpha = mix * falloff * 0.85;
    if (alpha <= 0.01) continue;

    // Ghost size scales down with each repeat
    const ghostScale = 0.7 + falloff * 0.3;
    const ghostCoreR = (16 + rms * 20) * ghostScale;

    // === Wide green glow ===
    ctx.save();
    ctx.globalCompositeOperation = 'screen';

    const outerR = ghostCoreR * 6;
    const g1 = ctx.createRadialGradient(t.x, t.y, 0, t.x, t.y, outerR);
    g1.addColorStop(0, `hsla(${ghostHue}, ${ghostSat}%, 60%, ${alpha * 0.25})`);
    g1.addColorStop(0.3, `hsla(${ghostHue}, ${ghostSat - 10}%, 45%, ${alpha * 0.1})`);
    g1.addColorStop(1, `hsla(${ghostHue}, ${ghostSat - 20}%, 30%, 0)`);
    ctx.fillStyle = g1;
    ctx.fillRect(t.x - outerR, t.y - outerR, outerR * 2, outerR * 2);

    // === Bright ghost core ===
    const gc = ctx.createRadialGradient(t.x, t.y, 0, t.x, t.y, ghostCoreR);
    gc.addColorStop(0, `hsla(${ghostHue - 10}, ${ghostSat + 10}%, 85%, ${alpha * 0.9})`);
    gc.addColorStop(0.3, `hsla(${ghostHue}, ${ghostSat}%, 65%, ${alpha * 0.5})`);
    gc.addColorStop(0.7, `hsla(${ghostHue + 10}, ${ghostSat - 10}%, 50%, ${alpha * 0.15})`);
    gc.addColorStop(1, `hsla(${ghostHue}, ${ghostSat}%, 40%, 0)`);
    ctx.fillStyle = gc;
    ctx.beginPath();
    ctx.arc(t.x, t.y, ghostCoreR, 0, TAU);
    ctx.fill();

    // === White-hot center dot ===
    const dotR = ghostCoreR * 0.25;
    const dot = ctx.createRadialGradient(t.x, t.y, 0, t.x, t.y, dotR);
    dot.addColorStop(0, `rgba(255, 255, 255, ${alpha * 0.8})`);
    dot.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = dot;
    ctx.beginPath();
    ctx.arc(t.x, t.y, dotR, 0, TAU);
    ctx.fill();

    ctx.restore();

    // === Ghost trail (green stroke) ===
    ctx.beginPath();
    const tailSamples = Math.min(25, idx);
    let started = false;
    for (let ti = idx - tailSamples; ti <= idx; ti++) {
      if (ti < 0) continue;
      const tp = trail[ti];
      if (!started) { ctx.moveTo(tp.x, tp.y); started = true; }
      else ctx.lineTo(tp.x, tp.y);
    }
    ctx.strokeStyle = `hsla(${ghostHue}, ${ghostSat}%, 60%, ${alpha * 0.35})`;
    ctx.lineWidth = 2 * ghostScale;
    ctx.shadowColor = `hsla(${ghostHue}, ${ghostSat}%, 50%, ${alpha * 0.2})`;
    ctx.shadowBlur = 6;
    ctx.stroke();
    ctx.shadowBlur = 0;
  }
}

/* ── Comet tail ──────────────────────────────────────────────────── */

function drawCometTail(W, H, rms) {
  const { h, s, l } = blendedColor;
  const len = trail.length;

  // === Broad glow pass ===
  ctx.save();
  ctx.globalCompositeOperation = 'screen';

  // Wide luminous trail (soft glow)
  for (let i = 1; i < len; i++) {
    const t = trail[i];
    const progress = i / len; // 0=old, 1=new
    const alpha = progress * progress * 0.08 * (1 + rms * 2);
    const glowR = 25 + progress * 50 + rms * 35;

    if (alpha < 0.003) continue;

    const g = ctx.createRadialGradient(t.x, t.y, 0, t.x, t.y, glowR);
    g.addColorStop(0, `hsla(${h}, ${s}%, ${l + 10}%, ${alpha})`);
    g.addColorStop(1, `hsla(${h}, ${s}%, ${l}%, 0)`);
    ctx.fillStyle = g;
    ctx.fillRect(t.x - glowR, t.y - glowR, glowR * 2, glowR * 2);
  }

  ctx.restore();

  // === Core line pass ===
  // Smooth curve through trail points using quadratic bezier
  const segSize = 6;
  for (let seg = 0; seg < Math.ceil(len / segSize); seg++) {
    const start = seg * segSize;
    const end = Math.min(start + segSize + 1, len);
    const midIdx = (start + end) / 2;
    const progress = midIdx / len;
    const drive = trail[Math.min(end - 1, len - 1)]?.drive || 0;

    const alpha = progress * progress * 0.7 * (0.4 + rms * 0.6);
    const width = 1 + progress * progress * 7;

    if (alpha < 0.01) continue;

    ctx.beginPath();
    let started = false;

    for (let i = start; i < end; i++) {
      const t = trail[i];
      let x = t.x, y = t.y;

      // Drive roughness
      if (drive > 0.05) {
        const noise = Math.sin(i * 17.3 + time * 4.1) * Math.cos(i * 11.7 + time * 3.3);
        const perpX = -Math.sin(cometAngle);
        const perpY = Math.cos(cometAngle);
        x += perpX * noise * drive * 8;
        y += perpY * noise * drive * 8;
      }

      if (!started) { ctx.moveTo(x, y); started = true; }
      else ctx.lineTo(x, y);
    }

    ctx.strokeStyle = `hsla(${h}, ${Math.min(s + 15, 100)}%, ${Math.min(l + 20, 95)}%, ${alpha})`;
    ctx.lineWidth = width;
    ctx.shadowColor = `hsla(${h}, ${s}%, ${l + 10}%, ${alpha * 0.4})`;
    ctx.shadowBlur = 4 + rms * 8;
    ctx.stroke();
    ctx.shadowBlur = 0;
  }
}

/* ── Embers ──────────────────────────────────────────────────────── */

function drawEmbers(W, H) {
  for (let i = 0; i < MAX_EMBERS; i++) {
    if (eLife[i] <= 0) continue;
    const x = eX[i], y = eY[i];
    if (x < -10 || x > W + 10 || y < -10 || y > H + 10) continue;

    const life = eLife[i];
    const alpha = life * life * 0.8;
    const sz = 0.5 + life * 1.5;

    ctx.fillStyle = `hsla(35, 95%, ${65 + life * 30}%, ${alpha})`;
    ctx.beginPath();
    ctx.arc(x, y, sz, 0, TAU);
    ctx.fill();
  }
}

/* ── Particles ───────────────────────────────────────────────────── */

function drawParticles(W, H) {
  for (let i = 0; i < MAX_PARTICLES; i++) {
    if (pLife[i] <= 0) continue;

    const x = pX[i], y = pY[i];
    if (x < -30 || x > W + 30 || y < -30 || y > H + 30) continue;

    const life = pLife[i];
    const size = pSize[i] * life;
    const alpha = life * 0.7;

    // Glow for bright particles
    if (life > 0.4 && size > 1.5 && glowTexture32) {
      ctx.save();
      ctx.globalAlpha = alpha * 0.3;
      ctx.globalCompositeOperation = 'screen';
      const gs = size * 8;
      ctx.drawImage(glowTexture32, x - gs/2, y - gs/2, gs, gs);
      ctx.restore();
    }

    ctx.fillStyle = `hsla(${pHue[i]}, ${pSat[i]}%, ${pBright[i]}%, ${alpha})`;
    ctx.beginPath();
    ctx.arc(x, y, Math.max(0.3, size), 0, TAU);
    ctx.fill();
  }
}

/* ── Ring mod ripples ────────────────────────────────────────────── */

function drawRingRipples() {
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  for (const r of ringPool) {
    ctx.strokeStyle = `rgba(0, 240, 255, ${r.alpha})`;
    ctx.lineWidth = 1.5 * r.alpha + 0.5;
    ctx.beginPath();
    ctx.arc(r.x, r.y, r.radius, 0, TAU);
    ctx.stroke();
  }
  ctx.restore();
}

function spawnRingRipple() {
  const ringMix = ccSmoothed[SLOT_RING_MIX];
  if (ringMix < 0.02) return;
  const ringFreq = ccSmoothed[SLOT_RING_FREQ];
  const interval = Math.max(3, Math.floor(30 - ringFreq * 25));
  if (Math.floor(time * 60) % interval === 0 && ringPool.length < MAX_RINGS) {
    ringPool.push({ x: cometX, y: cometY, radius: 8, alpha: ringMix * 0.4 });
  }
}

/* ── Comet head ──────────────────────────────────────────────────── */

function drawCometHead(W, H, rms) {
  const drive = ccSmoothed[SLOT_DRIVE];
  const driveLevel = ccSmoothed[SLOT_DRIVE_LEVEL];
  const chorusMix = ccSmoothed[SLOT_CHORUS_MIX];
  const chorusRate = ccSmoothed[SLOT_CHORUS_RATE];
  const { h, s, l } = blendedColor;
  const hx = cometX, hy = cometY;

  const brightness = 0.7 + driveLevel * 0.25 + rms * 0.35;
  const coreRadius = 20 + rms * 32;

  // === Outermost ambient glow (BIG, in-your-face) ===
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  if (cometCoreTexture) {
    const ambientSize = coreRadius * 22;
    ctx.globalAlpha = brightness * 0.5;
    ctx.drawImage(cometCoreTexture, hx - ambientSize/2, hy - ambientSize/2, ambientSize, ambientSize);
  }
  ctx.restore();

  // === Warm atmospheric haze (fireball heat distortion) ===
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  const hazeR = coreRadius * 4;
  const hazeGrad = ctx.createRadialGradient(hx, hy, coreRadius * 0.5, hx, hy, hazeR);
  hazeGrad.addColorStop(0, `hsla(35, 80%, 60%, ${brightness * 0.12})`);
  hazeGrad.addColorStop(0.3, `hsla(25, 70%, 50%, ${brightness * 0.06})`);
  hazeGrad.addColorStop(0.7, `hsla(15, 60%, 40%, ${brightness * 0.02})`);
  hazeGrad.addColorStop(1, 'hsla(10, 50%, 30%, 0)');
  ctx.fillStyle = hazeGrad;
  ctx.fillRect(hx - hazeR, hy - hazeR, hazeR * 2, hazeR * 2);
  ctx.restore();

  // === Secondary colored glow (larger) ===
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  const colorGlowR = coreRadius * 8;
  const cg = ctx.createRadialGradient(hx, hy, 0, hx, hy, colorGlowR);
  cg.addColorStop(0, `hsla(${h}, ${s}%, ${l + 15}%, ${brightness * 0.3})`);
  cg.addColorStop(0.3, `hsla(${h}, ${s}%, ${l + 5}%, ${brightness * 0.12})`);
  cg.addColorStop(0.6, `hsla(${h}, ${s}%, ${l}%, ${brightness * 0.03})`);
  cg.addColorStop(1, `hsla(${h}, ${s}%, ${l - 10}%, 0)`);
  ctx.fillStyle = cg;
  ctx.beginPath();
  ctx.arc(hx, hy, colorGlowR, 0, TAU);
  ctx.fill();
  ctx.restore();

  // === Drive turbulence corona ===
  if (drive > 0.03) {
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const coronaR = coreRadius * 2 + drive * 30;
    const arcCount = 12 + Math.floor(drive * 12);

    for (let i = 0; i < arcCount; i++) {
      const angle = (i / arcCount) * TAU + Math.sin(time * 8 + i * 0.7) * drive * 0.5;
      const r = coronaR + Math.sin(time * 6 + i * 1.7) * drive * 8;
      const arcLen = 0.15 + Math.random() * 0.4;
      const flicker = 0.6 + Math.random() * 0.4;

      ctx.beginPath();
      ctx.arc(hx, hy, r, angle, angle + arcLen);
      ctx.strokeStyle = `hsla(30, 95%, ${55 + drive * 25}%, ${drive * 0.4 * flicker})`;
      ctx.lineWidth = 1.5 + drive * 3;
      ctx.stroke();
    }

    // Fiery wisps extending outward
    for (let i = 0; i < 4 + Math.floor(drive * 6); i++) {
      const angle = (i / 10) * TAU + time * 1.5 + Math.sin(time * 3 + i) * 0.5;
      const len = coreRadius + drive * 50 + Math.sin(time * 7 + i * 2.3) * 10;
      const x2 = hx + Math.cos(angle) * len;
      const y2 = hy + Math.sin(angle) * len;
      const g = ctx.createLinearGradient(hx, hy, x2, y2);
      g.addColorStop(0, `hsla(35, 100%, 70%, ${drive * 0.3})`);
      g.addColorStop(0.5, `hsla(25, 100%, 55%, ${drive * 0.15})`);
      g.addColorStop(1, 'hsla(15, 100%, 40%, 0)');
      ctx.strokeStyle = g;
      ctx.lineWidth = 1 + drive * 1.5;
      ctx.beginPath();
      ctx.moveTo(hx, hy);
      // Curvy wisp
      const cx = hx + Math.cos(angle + 0.3) * len * 0.6;
      const cy = hy + Math.sin(angle + 0.3) * len * 0.6;
      ctx.quadraticCurveTo(cx, cy, x2, y2);
      ctx.stroke();
    }
    ctx.restore();
  }

  // === Chorus shimmer rings ===
  if (chorusMix > 0.02) {
    const baseR = coreRadius * 2.5;
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (let ring = 0; ring < 3; ring++) {
      const phase = ring * TAU / 3;
      const r = baseR + Math.sin(time * (5 + chorusRate * 10) + phase) * chorusMix * 12;
      const alpha = chorusMix * 0.3 * (1 - ring * 0.15);

      ctx.beginPath();
      if (drive > 0.1) {
        const steps = 48;
        for (let step = 0; step <= steps; step++) {
          const a = (step / steps) * TAU;
          const wobble = Math.sin(a * 4 + time * 6 + ring * 1.3) * drive * 4;
          const px = hx + Math.cos(a) * (r + wobble);
          const py = hy + Math.sin(a) * (r + wobble);
          if (step === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
      } else {
        ctx.arc(hx, hy, Math.max(1, r), 0, TAU);
      }

      ctx.strokeStyle = `hsla(235, 65%, 70%, ${alpha})`;
      ctx.lineWidth = 0.8 + chorusMix * 2;
      ctx.stroke();
    }
    ctx.restore();
  }

  // === Plasma mantle (realistic fireball layer) ===
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  // Multiple overlapping elliptical plasma blobs for organic look
  for (let p = 0; p < 6; p++) {
    const pAngle = (p / 6) * TAU + time * 1.8 + Math.sin(time * 2.3 + p * 1.1) * 0.5;
    const pDist = coreRadius * 0.3 + Math.sin(time * 4.5 + p * 2.7) * coreRadius * 0.2;
    const px = hx + Math.cos(pAngle) * pDist;
    const py = hy + Math.sin(pAngle) * pDist;
    const pR = coreRadius * (0.6 + Math.sin(time * 3.2 + p * 1.9) * 0.2);
    const plasmaAlpha = brightness * 0.18;

    const pg = ctx.createRadialGradient(px, py, 0, px, py, pR);
    pg.addColorStop(0, `hsla(${h + 10}, ${s + 10}%, 80%, ${plasmaAlpha})`);
    pg.addColorStop(0.4, `hsla(${h}, ${s}%, 60%, ${plasmaAlpha * 0.5})`);
    pg.addColorStop(1, `hsla(${h - 10}, ${s}%, 40%, 0)`);
    ctx.fillStyle = pg;
    ctx.beginPath();
    ctx.arc(px, py, pR, 0, TAU);
    ctx.fill();
  }

  // Heat shimmer (turbulent outer envelope)
  const shimmerCount = 8 + Math.floor(drive * 8);
  for (let i = 0; i < shimmerCount; i++) {
    const sAngle = (i / shimmerCount) * TAU + time * 2.5;
    const sR = coreRadius * 1.4 + Math.sin(time * 5.1 + i * 3.3) * coreRadius * 0.4;
    const sx = hx + Math.cos(sAngle) * sR * 0.15;
    const sy = hy + Math.sin(sAngle) * sR * 0.15;
    const shimAlpha = brightness * 0.06 * (0.5 + Math.sin(time * 7 + i * 2.1) * 0.5);
    const sg = ctx.createRadialGradient(sx, sy, sR * 0.5, sx, sy, sR);
    sg.addColorStop(0, `hsla(${h + 15}, ${s}%, 70%, ${shimAlpha})`);
    sg.addColorStop(1, `hsla(${h}, ${s}%, 50%, 0)`);
    ctx.fillStyle = sg;
    ctx.fillRect(sx - sR, sy - sR, sR * 2, sR * 2);
  }
  ctx.restore();

  // === Inner core (white-hot) ===
  const eqHigh = ccSmoothed[SLOT_EQ_HIGH];
  const eqLow = ccSmoothed[SLOT_EQ_LOW];
  const warmth = eqLow - eqHigh;
  let coreHue = 40, coreSat = 15;
  if (warmth > 0.1) { coreHue = 30 + warmth * 20; coreSat = 30 + warmth * 40; }
  else if (warmth < -0.1) { coreHue = 210 + warmth * 30; coreSat = 20 - warmth * 30; }

  const coreGrad = ctx.createRadialGradient(hx, hy, 0, hx, hy, coreRadius);
  coreGrad.addColorStop(0, `hsla(${coreHue}, ${coreSat}%, 98%, ${brightness})`);
  coreGrad.addColorStop(0.15, `hsla(${coreHue}, ${coreSat + 10}%, 92%, ${brightness * 0.9})`);
  coreGrad.addColorStop(0.35, `hsla(${h}, ${s}%, ${l + 25}%, ${brightness * 0.5})`);
  coreGrad.addColorStop(0.7, `hsla(${h}, ${s}%, ${l}%, ${brightness * 0.15})`);
  coreGrad.addColorStop(1, `hsla(${h}, ${s}%, ${l - 15}%, 0)`);

  ctx.fillStyle = coreGrad;
  ctx.beginPath();
  ctx.arc(hx, hy, coreRadius, 0, TAU);
  ctx.fill();

  // === Brilliant white center bloom ===
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  const bloomR = coreRadius * 0.5;
  const bloom = ctx.createRadialGradient(hx, hy, 0, hx, hy, bloomR);
  bloom.addColorStop(0, `rgba(255, 255, 255, ${brightness * 0.95})`);
  bloom.addColorStop(0.5, `rgba(255, 255, 250, ${brightness * 0.4})`);
  bloom.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = bloom;
  ctx.beginPath();
  ctx.arc(hx, hy, bloomR, 0, TAU);
  ctx.fill();

  // Cross-shaped lens flare (cinematic) — wider and softer
  const flareLen = coreRadius * 4 + rms * 60;
  const flareAlpha = brightness * 0.18;

  // Horizontal flare (strongest — elongated fireball feel)
  const hFlareGrad = ctx.createLinearGradient(hx - flareLen, hy, hx + flareLen, hy);
  hFlareGrad.addColorStop(0, 'rgba(255, 240, 220, 0)');
  hFlareGrad.addColorStop(0.3, `rgba(255, 240, 220, ${flareAlpha * 0.3})`);
  hFlareGrad.addColorStop(0.5, `rgba(255, 255, 255, ${flareAlpha})`);
  hFlareGrad.addColorStop(0.7, `rgba(255, 240, 220, ${flareAlpha * 0.3})`);
  hFlareGrad.addColorStop(1, 'rgba(255, 240, 220, 0)');
  ctx.strokeStyle = hFlareGrad;
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(hx - flareLen, hy); ctx.lineTo(hx + flareLen, hy); ctx.stroke();

  // Vertical flare (softer)
  ctx.strokeStyle = `rgba(255, 255, 255, ${flareAlpha * 0.6})`;
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(hx, hy - flareLen * 0.7); ctx.lineTo(hx, hy + flareLen * 0.7); ctx.stroke();

  // Diagonal flares (fainter)
  const dfl = flareLen * 0.45;
  ctx.strokeStyle = `rgba(255, 250, 240, ${flareAlpha * 0.3})`;
  ctx.lineWidth = 0.7;
  ctx.beginPath(); ctx.moveTo(hx - dfl, hy - dfl); ctx.lineTo(hx + dfl, hy + dfl); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(hx + dfl, hy - dfl); ctx.lineTo(hx - dfl, hy + dfl); ctx.stroke();

  ctx.restore();
}

/* ── Particle emission ───────────────────────────────────────────── */

function emitCometParticles(rms) {
  const { h, s } = blendedColor;
  const drive = ccSmoothed[SLOT_DRIVE];

  // Tail direction (opposite of travel)
  const tailDX = -Math.cos(cometAngle);
  const tailDY = -Math.sin(cometAngle);

  // Base emission: 5-8 per frame streaming backward (dense fireball)
  const baseCount = 5 + Math.floor(rms * 4);
  for (let i = 0; i < baseCount; i++) {
    const speed = 1.5 + Math.random() * 3;
    const spread = (Math.random() - 0.5) * 2.5;
    emitParticle(
      cometX + (Math.random() - 0.5) * 10,
      cometY + (Math.random() - 0.5) * 10,
      tailDX * speed + spread * (-tailDY),
      tailDY * speed + spread * tailDX,
      2 + Math.random() * 4,
      h + (Math.random() - 0.5) * 25, s, 60 + Math.random() * 30
    );
  }

  // Drive sparks
  if (drive > 0.2) {
    const extra = 1 + Math.floor(drive * 4);
    for (let i = 0; i < extra; i++) {
      const angle = Math.random() * TAU;
      const speed = 1.5 + Math.random() * 3;
      emitParticle(
        cometX + (Math.random() - 0.5) * 8,
        cometY + (Math.random() - 0.5) * 8,
        Math.cos(angle) * speed * 0.7 + tailDX * 1.5,
        Math.sin(angle) * speed * 0.7 + tailDY * 1.5,
        1 + Math.random() * 3,
        25 + Math.random() * 15, 90 + Math.random() * 10, 70 + Math.random() * 25
      );
    }
  }

  // Transient bursts
  const transients = getTransients();
  if (transients && transients.length > 0) {
    const latest = transients[transients.length - 1];
    if (latest && latest.opacity > 0.8) {
      const burstCount = 20 + Math.floor(Math.random() * 15);
      for (let i = 0; i < burstCount; i++) {
        const angle = Math.random() * TAU;
        const speed = 3 + Math.random() * 5;
        emitParticle(
          cometX, cometY,
          Math.cos(angle) * speed,
          Math.sin(angle) * speed,
          2 + Math.random() * 4,
          h + (Math.random() - 0.5) * 40, s, 75 + Math.random() * 20
        );
      }
    }
  }
}

function emitTrailEmbers(rms) {
  // Continuous hot ember stream (denser for bigger comet)
  const count = 4 + Math.floor(rms * 5) + Math.floor(ccSmoothed[SLOT_DRIVE] * 5);
  const tailDX = -Math.cos(cometAngle);
  const tailDY = -Math.sin(cometAngle);

  for (let i = 0; i < count; i++) {
    const speed = 0.8 + Math.random() * 2;
    const spread = (Math.random() - 0.5) * 2;
    emitEmber(
      cometX + (Math.random() - 0.5) * 6,
      cometY + (Math.random() - 0.5) * 6,
      tailDX * speed + spread * (-tailDY),
      tailDY * speed + spread * tailDX
    );
  }
}

/* ── Explosions (non-Take-5 note triggers) ───────────────────────── */

function spawnExplosion() {
  if (explosions.length >= MAX_EXPLOSIONS) explosions.shift();
  const count = 40 + Math.floor(Math.random() * 30);
  const hue = Math.random() * 360;
  const parts = [];
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * TAU;
    const speed = 2 + Math.random() * 8;
    parts.push({
      x: cometX, y: cometY,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      size: 1.5 + Math.random() * 4,
      life: 1.0,
    });
  }
  explosions.push({ x: cometX, y: cometY, age: 0, maxAge: 80, hue, particles: parts });
}

function updateExplosions() {
  for (let i = explosions.length - 1; i >= 0; i--) {
    const ex = explosions[i];
    ex.age++;
    if (ex.age > ex.maxAge) { explosions.splice(i, 1); continue; }
    for (const p of ex.particles) {
      p.x += p.vx; p.y += p.vy;
      p.vx *= 0.965; p.vy *= 0.965;
      p.life -= 0.013;
      if (p.life < 0) p.life = 0;
    }
  }
}

function drawExplosions(W, H) {
  if (explosions.length === 0) return;
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  for (const ex of explosions) {
    const progress = ex.age / ex.maxAge;
    // Shockwave ring
    if (progress < 0.5) {
      const ringR = progress * 200;
      const ringAlpha = (1 - progress * 2) * 0.4;
      ctx.strokeStyle = `hsla(${ex.hue}, 80%, 70%, ${ringAlpha})`;
      ctx.lineWidth = 2 + (1 - progress * 2) * 4;
      ctx.beginPath();
      ctx.arc(ex.x, ex.y, ringR, 0, TAU);
      ctx.stroke();
    }
    // Flash
    if (progress < 0.15) {
      const flashR = 60 + (1 - progress / 0.15) * 80;
      const flashAlpha = (1 - progress / 0.15) * 0.5;
      const fg = ctx.createRadialGradient(ex.x, ex.y, 0, ex.x, ex.y, flashR);
      fg.addColorStop(0, `hsla(${ex.hue}, 60%, 95%, ${flashAlpha})`);
      fg.addColorStop(0.4, `hsla(${ex.hue}, 70%, 70%, ${flashAlpha * 0.4})`);
      fg.addColorStop(1, `hsla(${ex.hue}, 80%, 50%, 0)`);
      ctx.fillStyle = fg;
      ctx.fillRect(ex.x - flashR, ex.y - flashR, flashR * 2, flashR * 2);
    }
    // Debris particles
    for (const p of ex.particles) {
      if (p.life <= 0) continue;
      const sz = p.size * p.life;
      const alpha = p.life * 0.8;
      ctx.fillStyle = `hsla(${ex.hue + (Math.random() - 0.5) * 30}, 80%, ${60 + p.life * 30}%, ${alpha})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(0.3, sz), 0, TAU);
      ctx.fill();
    }
  }
  ctx.restore();
}

/* ── Lifecycle ───────────────────────────────────────────────────── */

function onAudioStarted() {
  audioActive = true;
  if (!collapsed) startLoop();
}

function onAudioStopped() {
  audioActive = false;
}

function onTabChanged(tabId) {
  if (tabId === 'ccmonitor' && !collapsed) {
    resizeCanvas();
    startLoop();
  } else if (tabId !== 'ccmonitor') {
    stopLoop();
  }
}

/* ── Init ─────────────────────────────────────────────────────────── */
export function init() {
  bus.on('midi:message', onMidiMessage);
  bus.on('audio:started', onAudioStarted);
  bus.on('audio:stopped', onAudioStopped);
  bus.on('tab:changed', onTabChanged);

  requestAnimationFrame(() => {
    if (!panelBuilt) buildPanel();
  });
}
