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
const STAR_COUNT = 300;
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
let targetY = 0;
let cometAngle = 0; // direction of travel
let lastMidiNote = 60; // persist last pitch — doesn't reset on note-off
let smoothedMidiNote = 60; // heavily smoothed version for visual position
let cometInitialized = false;

// Smoothed delay spacing (prevents jerky ghost repositioning)
let smoothedDelaySpacing = 30;

// Background hue (driven by reverb)
let bgHue = 220; // default deep blue space
let bgHueTarget = 220;
let bgSat = 8;
let bgSatTarget = 8;

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
const TRAIL_LEN = 600;

// (reverb haze is now full-screen, no trailing position needed)

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
  // Large pre-rendered core glow — warm solar amber
  cometCoreTexture = makeGlow(256, [
    [0, 'rgba(255, 250, 230, 1.0)'],
    [0.02, 'rgba(255, 240, 200, 0.9)'],
    [0.06, 'rgba(255, 210, 140, 0.6)'],
    [0.12, 'rgba(255, 170, 80, 0.3)'],
    [0.25, 'rgba(230, 120, 40, 0.12)'],
    [0.45, 'rgba(180, 70, 20, 0.04)'],
    [0.7, 'rgba(120, 40, 10, 0.01)'],
    [1, 'rgba(80, 20, 5, 0)'],
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

  if (msgType === 'noteon' && data[2] > 0) {
    // Track pitch from note-on — persists (doesn't reset on note-off)
    lastMidiNote = data[1];

    // Explosion on note-on from non-Take-5 instruments (Take 5 = channel 1)
    if (channel !== 1) {
      spawnExplosion();
    }
  }
}

function smoothCC() {
  for (let i = 0; i < SLOT_COUNT; i++) {
    ccSmoothed[i] += (ccRaw[i] - ccSmoothed[i]) * SMOOTH_ALPHA;
  }
}

/* ── Color blending ──────────────────────────────────────────────── */
// Effect LEVELS (mix amounts) drive the comet's color.
// Additional params (rate, time, feedback, freq, decay) drive visual components only.

function blendEffectColors() {
  // Each effect's level/mix controls how much its color contributes.
  // The default warm-white is always present and fades out as effects come in.
  const BASE_H = 30, BASE_S = 20, BASE_L = 82; // warm white baseline

  const entries = [
    { h: 28,  s: 95, l: 55, w: ccSmoothed[SLOT_DRIVE_LEVEL] },    // orange (level CC)
    { h: 210, s: 80, l: 60, w: ccSmoothed[SLOT_CHORUS_MIX] },    // blue
    { h: 140, s: 70, l: 55, w: ccSmoothed[SLOT_DELAY_MIX] },     // green
    { h: 185, s: 90, l: 55, w: ccSmoothed[SLOT_RING_MIX] },      // cyan
  ];
  // Note: reverb does NOT color the comet — it colors the BACKGROUND/space

  // Always include the baseline with a fixed weight.
  // As effects increase, they gradually overpower the baseline.
  const baseWeight = 0.6;
  let totalW = baseWeight;
  let hX = Math.cos(BASE_H * Math.PI / 180) * baseWeight;
  let hY = Math.sin(BASE_H * Math.PI / 180) * baseWeight;
  let sSum = BASE_S * baseWeight;
  let lSum = BASE_L * baseWeight;

  for (const e of entries) {
    if (e.w < 0.005) continue;
    // Scale effect weight so it gradually blends (not binary)
    const w = e.w * e.w * 2; // quadratic curve — gentle start, stronger at high values
    totalW += w;
    hX += Math.cos(e.h * Math.PI / 180) * w;
    hY += Math.sin(e.h * Math.PI / 180) * w;
    sSum += e.s * w;
    lSum += e.l * w;
  }

  let h = ((Math.atan2(hY, hX) * 180 / Math.PI) + 360) % 360;
  const s = sSum / totalW;
  const l = lSum / totalW;
  // EQ shifts color temperature
  const tempShift = (ccSmoothed[SLOT_EQ_HIGH] - ccSmoothed[SLOT_EQ_LOW]) * 30;
  h = (h + tempShift + 360) % 360;
  blendedColor = { h, s, l };

  // Reverb drives the background hue — more reverb = deeper purple space,
  // decay extends how saturated/vivid the space becomes
  const reverbMix = ccSmoothed[SLOT_REVERB_MIX];
  const reverbDecay = ccSmoothed[SLOT_REVERB_DECAY];
  if (reverbMix > 0.02) {
    bgHueTarget = 220 + reverbMix * 60; // shift from blue toward purple (280)
    bgSatTarget = 8 + reverbMix * 55 + reverbDecay * 25; // much more vivid space
  } else {
    bgHueTarget = 220;
    bgSatTarget = 8;
  }
  bgHue += (bgHueTarget - bgHue) * 0.03;
  bgSat += (bgSatTarget - bgSat) * 0.03;
}

/* ── Comet position logic ────────────────────────────────────────── */

function updateCometPosition(W, H) {
  const rmsHistory = getRmsHistory();
  const rms = rmsHistory && rmsHistory.length > 0 ? rmsHistory[rmsHistory.length - 1] : 0;

  // Also check audio pitch detection as fallback (in case MIDI note-on
  // isn't reaching us, e.g. if Take 5 sends on a different bus path)
  const pitchHistory = getPitchHistory();
  if (pitchHistory) {
    for (let i = pitchHistory.length - 1; i >= 0; i--) {
      if (pitchHistory[i]) {
        lastMidiNote = pitchHistory[i].midiNote;
        break;
      }
    }
  }

  // Heavy smoothing on pitch — captures general direction, not every wiggle.
  // This is a two-stage smooth: first smooth the MIDI note itself (very slow),
  // then smooth the comet Y position (moderate).
  smoothedMidiNote += (lastMidiNote - smoothedMidiNote) * 0.025; // very slow pitch tracking

  // Fixed horizontal position — comet stays center, space moves around it
  const anchorX = W * 0.5;

  // Pitch maps to Y: low notes = bottom, high notes = top
  // Range: MIDI 36 (C2) to 84 (C6) mapped to 85% → 15% of canvas height
  const pitchNorm = Math.max(0, Math.min(1, (smoothedMidiNote - 36) / (84 - 36)));
  targetY = H * (0.85 - pitchNorm * 0.70);

  // Initialize comet to target on first frame (no slow drift from 0,0)
  if (!cometInitialized) {
    cometX = anchorX;
    smoothedMidiNote = lastMidiNote;
    cometY = targetY;
    cometInitialized = true;
  }

  // Smooth follow — moderate speed for silky movement
  cometX = anchorX; // locked horizontally
  const prevY = cometY;
  cometY += (targetY - cometY) * 0.08;

  // Travel angle: nearly horizontal, slight vertical pitch from Y movement
  const dy = cometY - prevY;
  const pitchAngle = Math.atan2(dy, 12); // large denominator keeps it nearly horizontal
  cometAngle += (pitchAngle - cometAngle) * 0.06;

  // Record trail — trail positions are in "world space" that scrolls leftward,
  // so the tail naturally extends behind the comet even though it's screen-fixed.
  // worldX advances constantly to simulate rightward flight.
  const worldX = time * 180; // virtual horizontal position (pixels/sec of travel)
  trail.push({ wx: worldX, y: cometY, rms, drive: ccSmoothed[SLOT_DRIVE] });
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
  // Particles drift leftward to simulate the comet flying rightward through space
  const worldDrift = -2.0; // px/frame leftward drift
  for (let i = 0; i < MAX_PARTICLES; i++) {
    if (pLife[i] <= 0) continue;
    pX[i] += pVX[i] + worldDrift;
    pY[i] += pVY[i];
    pVX[i] *= 0.975; pVY[i] *= 0.975;
    pLife[i] -= 0.012;
    if (pLife[i] < 0) pLife[i] = 0;
  }
  for (let i = 0; i < MAX_EMBERS; i++) {
    if (eLife[i] <= 0) continue;
    eX[i] += eVX[i] + worldDrift;
    eY[i] += eVY[i];
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

  // 1. Deep space background — hue shifts with reverb
  const bgL = 2 + bgSat * 0.08; // brighter when reverb adds saturation
  ctx.fillStyle = `hsl(${bgHue}, ${bgSat}%, ${bgL}%)`;
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

  // 9. Ring mod — chaotic visuals
  if (ccSmoothed[SLOT_RING_MIX] > 0.01 || ringPool.length > 0) drawRingRipples();

  // 9.5 EQ spectral bands
  drawEQ(W, H, rms);

  // 10. Comet head (the star)
  drawCometHead(W, H, rms);

  // 10.5 Reverb blur — everything drawn so far gets hazed
  applyReverbBlur(W, H);

  // 10.6 Reverb nebula shell (drawn OVER the blurred scene)
  if (ccSmoothed[SLOT_REVERB_MIX] > 0.01) drawReverbShell(W, H, rms);

  // 11. Emit
  emitCometParticles(rms);
  spawnRingRipple();
  emitTrailEmbers(rms);
}

/* ── Nebulae ─────────────────────────────────────────────────────── */

function drawNebulae(W, H) {
  const reverbMix = ccSmoothed[SLOT_REVERB_MIX];
  // Reverb brightens nebulae — makes the space feel more alive
  const reverbBoost = 1 + reverbMix * 3;
  const nebulaeDrift = time * 0.02; // drift with star field

  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  for (const n of nebulae) {
    // Drift leftward like stars
    const driftX = ((n.x - nebulaeDrift * (0.3 + n.rx * 0.001)) % 1 + 1) % 1;
    const nx = driftX * W;
    const ny = n.y * H;
    const breathe = 1 + Math.sin(time * 0.15 + n.rotation) * 0.1;
    const rx = n.rx * breathe;
    const ry = n.ry * breathe;

    ctx.save();
    ctx.translate(nx, ny);
    ctx.rotate(n.rotation + time * 0.005);
    ctx.scale(1, ry / rx);

    const alpha = n.alpha * reverbBoost;
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
    g.addColorStop(0, `hsla(${n.hue}, 50%, 40%, ${alpha * 1.5})`);
    g.addColorStop(0.4, `hsla(${n.hue}, 40%, 30%, ${alpha})`);
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
  const drift = time * 0.06; // blazing through space
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

/* ── Reverb blur — ethereal haze on all elements ─────────────────── */
// When reverb is cranked, everything gets dreamy and blurred,
// like sound fading into the background — barely making it out.

function applyReverbBlur(W, H) {
  const mix = ccSmoothed[SLOT_REVERB_MIX];
  const decay = ccSmoothed[SLOT_REVERB_DECAY];
  if (mix < 0.05) return;

  // Blur amount: 0 at mix=0.05, up to ~6px at full mix+decay
  const blurPx = (mix - 0.05) * 4 + decay * mix * 3;
  if (blurPx < 0.3) return;

  // Draw blurred copy of current canvas over itself at reduced opacity
  // This creates a dreamy haze without fully destroying detail
  const dpr = window.devicePixelRatio || 1;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0); // reset to pixel space
  ctx.filter = `blur(${blurPx * dpr}px)`;
  ctx.globalAlpha = 0.3 + mix * 0.35; // blend: more reverb = more of the blur layer
  ctx.drawImage(canvas, 0, 0);
  ctx.filter = 'none';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // restore
  ctx.globalAlpha = 1;
  ctx.restore();
}

/* ── Reverb space atmosphere ──────────────────────────────────────── */
// Reverb = the space you're in. It paints the entire background atmosphere,
// not just a haze near the comet. Mix = intensity, Decay = how expansive.

function drawReverbHaze(W, H) {
  const mix = ccSmoothed[SLOT_REVERB_MIX];
  const decay = ccSmoothed[SLOT_REVERB_DECAY];
  const alpha = mix * 0.2;

  ctx.save();
  ctx.globalCompositeOperation = 'screen';

  // Base atmospheric wash
  const edgeGrad = ctx.createRadialGradient(W/2, H/2, Math.min(W, H) * 0.05, W/2, H/2, Math.max(W, H) * 0.9);
  edgeGrad.addColorStop(0, `hsla(${bgHue + 40}, ${40 + decay * 40}%, 30%, ${alpha * 0.3})`);
  edgeGrad.addColorStop(0.5, `hsla(${bgHue + 50}, ${35 + decay * 30}%, 22%, ${alpha * 0.5})`);
  edgeGrad.addColorStop(1, `hsla(${bgHue + 60}, ${25 + decay * 25}%, 12%, ${alpha * 0.7})`);
  ctx.fillStyle = edgeGrad;
  ctx.fillRect(0, 0, W, H);

  // Drifting fog blobs — organic, cloudy texture that moves slowly
  // These give the nebulous, textured look from the reference
  const blobCount = 8 + Math.floor(decay * 6);
  for (let i = 0; i < blobCount; i++) {
    const seed = i * 3.14159 + 1.41;
    // Blobs drift slowly across the screen
    const bx = ((Math.sin(seed * 1.3 + time * 0.04) * 0.5 + 0.5) * 1.4 - 0.2) * W;
    const by = ((Math.cos(seed * 1.7 + time * 0.03) * 0.5 + 0.5) * 1.4 - 0.2) * H;
    const br = 80 + decay * 150 + Math.sin(time * 0.2 + seed * 2.3) * 40;
    const blobHue = bgHue + 30 + Math.sin(seed * 2.7) * 30;
    const blobAlpha = alpha * (0.12 + Math.sin(time * 0.15 + seed * 1.9) * 0.05);

    // Elliptical blob for more organic shape
    ctx.save();
    ctx.translate(bx, by);
    ctx.rotate(seed + time * 0.02);
    ctx.scale(1, 0.6 + Math.sin(seed * 3.1) * 0.3);
    const bg = ctx.createRadialGradient(0, 0, 0, 0, 0, br);
    bg.addColorStop(0, `hsla(${blobHue}, ${35 + decay * 25}%, 40%, ${blobAlpha})`);
    bg.addColorStop(0.4, `hsla(${blobHue + 10}, ${30 + decay * 20}%, 30%, ${blobAlpha * 0.5})`);
    bg.addColorStop(1, `hsla(${blobHue + 20}, 25%, 20%, 0)`);
    ctx.fillStyle = bg;
    ctx.fillRect(-br, -br, br * 2, br * 2);
    ctx.restore();
  }

  // Edge vignette
  const edgeAlpha = alpha * 0.4;
  const topGrad = ctx.createLinearGradient(0, 0, 0, H * 0.25);
  topGrad.addColorStop(0, `hsla(${bgHue + 50}, ${35 + decay * 25}%, 25%, ${edgeAlpha})`);
  topGrad.addColorStop(1, 'hsla(270, 20%, 10%, 0)');
  ctx.fillStyle = topGrad;
  ctx.fillRect(0, 0, W, H * 0.25);
  const botGrad = ctx.createLinearGradient(0, H * 0.75, 0, H);
  botGrad.addColorStop(0, 'hsla(270, 20%, 10%, 0)');
  botGrad.addColorStop(1, `hsla(${bgHue + 50}, ${35 + decay * 25}%, 25%, ${edgeAlpha})`);
  ctx.fillStyle = botGrad;
  ctx.fillRect(0, H * 0.75, W, H * 0.25);

  ctx.restore();
}

/* ── Reverb nebula shell — translucent cosmic membrane ────────────── */
// Inspired by supernova remnant shells: large wispy, flowing curves
// wrapping around the comet in purple/violet/pink tones.

function drawReverbShell(W, H, rms) {
  const mix = ccSmoothed[SLOT_REVERB_MIX];
  const decay = ccSmoothed[SLOT_REVERB_DECAY];
  if (mix < 0.02) return;

  const cx = cometX, cy = cometY;
  const baseR = 70 + mix * 120 + decay * 100;
  const alpha = mix * 0.35;

  ctx.save();
  ctx.globalCompositeOperation = 'screen';

  // === 1. Diffuse nebulous clouds orbiting the comet ===
  // Soft, wide blobs instead of sharp lines — like gaseous remnants
  const cloudCount = 7 + Math.floor(decay * 5);
  for (let i = 0; i < cloudCount; i++) {
    const seed = i * 2.618 + 0.3;
    const angle = (i / cloudCount) * TAU + time * 0.08 + Math.sin(time * 0.2 + seed) * 0.3;
    const dist = baseR * (0.75 + Math.sin(time * 0.3 + seed * 1.7) * 0.2);
    const cloudX = cx + Math.cos(angle) * dist;
    const cloudY = cy + Math.sin(angle) * dist;
    const cloudR = 25 + mix * 40 + decay * 30 + Math.sin(time * 0.5 + seed * 2.3) * 15;
    const cloudHue = 265 + Math.sin(seed * 1.3) * 35;
    const cloudAlpha = alpha * (0.12 + Math.sin(time * 0.4 + seed * 1.9) * 0.05);

    // Elliptical cloud for organic shape
    ctx.save();
    ctx.translate(cloudX, cloudY);
    ctx.rotate(angle + time * 0.05);
    ctx.scale(1.4 + Math.sin(seed * 2.1) * 0.4, 0.7 + Math.cos(seed * 1.7) * 0.2);
    const cg = ctx.createRadialGradient(0, 0, 0, 0, 0, cloudR);
    cg.addColorStop(0, `hsla(${cloudHue}, 50%, 70%, ${cloudAlpha})`);
    cg.addColorStop(0.3, `hsla(${cloudHue + 10}, 45%, 58%, ${cloudAlpha * 0.6})`);
    cg.addColorStop(0.7, `hsla(${cloudHue + 20}, 35%, 45%, ${cloudAlpha * 0.15})`);
    cg.addColorStop(1, `hsla(${cloudHue + 25}, 30%, 35%, 0)`);
    ctx.fillStyle = cg;
    ctx.fillRect(-cloudR, -cloudR, cloudR * 2, cloudR * 2);
    ctx.restore();
  }

  // === 2. Inner warm glow ===
  const innerR = baseR * 0.6;
  const ig = ctx.createRadialGradient(cx, cy, baseR * 0.1, cx, cy, innerR);
  ig.addColorStop(0, `hsla(310, 40%, 55%, ${alpha * 0.1})`);
  ig.addColorStop(0.5, `hsla(285, 35%, 45%, ${alpha * 0.05})`);
  ig.addColorStop(1, 'hsla(270, 30%, 35%, 0)');
  ctx.fillStyle = ig;
  ctx.beginPath(); ctx.arc(cx, cy, innerR, 0, TAU); ctx.fill();

  ctx.restore();
}

/* ── Delay ghosts ────────────────────────────────────────────────── */

function drawDelayGhosts(W, H, rms) {
  const mix = ccSmoothed[SLOT_DELAY_MIX];
  const delayTime = ccSmoothed[SLOT_DELAY_TIME];
  const feedback = ccSmoothed[SLOT_DELAY_FB];

  // Feedback controls how many echoes (1-8), time controls spacing
  const ghostCount = Math.floor(feedback * 7) + 1;
  const targetSpacing = Math.max(15, Math.floor(delayTime * 250));
  smoothedDelaySpacing += (targetSpacing - smoothedDelaySpacing) * 0.04; // smooth transitions
  const spacing = Math.round(smoothedDelaySpacing);
  const len = trail.length;

  // Draw furthest ghosts first (back to front)
  for (let g = ghostCount; g >= 1; g--) {
    const idx = len - 1 - (g * spacing);
    if (idx < 0) continue;
    const t = trail[idx];
    if (!t) continue;

    const gx = trailScreenX(t);
    const gy = t.y;
    if (gx < -600 || gx > W + 600) continue;

    // Each successive ghost is fainter (exponential feedback decay)
    const falloff = Math.pow(feedback, g - 1);
    // At full mix + feedback, ghosts are identical to the lead comet
    const alpha = mix * falloff;
    if (alpha <= 0.01) continue;

    // Scale: identical to lead comet at full feedback
    const ghostScale = 0.85 + falloff * 0.15;

    // Draw the FULL comet head with all effects (drive, chorus, plasma, etc.)
    // using the shared drawCometHeadAt function — true delayed copies
    drawCometHeadAt(W, H, rms, gx, gy, ghostScale, alpha);
  }
}

/* ── Comet tail ──────────────────────────────────────────────────── */

// Convert trail world-X to screen-X relative to the comet head
function trailScreenX(trailEntry) {
  const headWx = trail.length > 0 ? trail[trail.length - 1].wx : 0;
  return cometX - (headWx - trailEntry.wx); // older entries are further left
}

function drawCometTail(W, H, rms) {
  const { h, s, l } = blendedColor;
  const len = trail.length;

  // === Broad glow pass ===
  ctx.save();
  ctx.globalCompositeOperation = 'screen';

  for (let i = 1; i < len; i++) {
    const t = trail[i];
    let tx = trailScreenX(t);
    let ty = t.y;
    if (tx < -100 || tx > W + 100) continue;
    const progress = i / len;
    const alpha = progress * progress * 0.08 * (1 + rms * 2);
    const glowR = 25 + progress * 50 + rms * 35;
    if (alpha < 0.003) continue;

    // Ring mod warps glow positions too
    const rmW = ringModWarp(tx, ty, i * 0.3);
    tx += rmW.dx * 0.4;
    ty += rmW.dy * 0.4;

    const g = ctx.createRadialGradient(tx, ty, 0, tx, ty, glowR);
    g.addColorStop(0, `hsla(${h}, ${s}%, ${l + 10}%, ${alpha})`);
    g.addColorStop(1, `hsla(${h}, ${s}%, ${l}%, 0)`);
    ctx.fillStyle = g;
    ctx.fillRect(tx - glowR, ty - glowR, glowR * 2, glowR * 2);
  }

  ctx.restore();

  // === Core line pass ===
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
      let x = trailScreenX(t), y = t.y;

      if (drive > 0.05) {
        const noise = Math.sin(i * 17.3 + time * 4.1) * Math.cos(i * 11.7 + time * 3.3);
        y += noise * drive * 10;
      }

      // Ring mod mangles the trail path
      const rmW = ringModWarp(x, y, i * 0.7);
      x += rmW.dx * 0.6;
      y += rmW.dy * 0.6;

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
    let x = eX[i], y = eY[i];
    // Ring mod warps ember positions
    const rmW = ringModWarp(x, y, i * 0.17);
    x += rmW.dx * 0.4;
    y += rmW.dy * 0.4;
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

    let x = pX[i], y = pY[i];
    // Ring mod warps particle positions
    const rmW = ringModWarp(x, y, i * 0.13);
    x += rmW.dx * 0.5;
    y += rmW.dy * 0.5;
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

/* ── Ring mod — mangles the comet and trail directly ──────────────── */
// Ring mod distortion is applied INSIDE the comet head and trail rendering,
// not as a separate overlay. These helper functions compute the distortion.

// Returns a position offset for ring mod warping at a given point
function ringModWarp(x, y, seedOffset) {
  const ringMix = ccSmoothed[SLOT_RING_MIX];
  const ringFreq = ccSmoothed[SLOT_RING_FREQ];
  if (ringMix < 0.02) return { dx: 0, dy: 0 };

  const speed = 4 + ringFreq * 25;
  // Exponential scaling — gentle at low values, absolutely unhinged at extremes
  const intensity = ringMix * ringMix; // quadratic
  const amount = 20 + intensity * 60; // 20-80px displacement
  // At extreme freq (>0.8), add chaotic high-frequency harmonics
  const extreme = Math.max(0, ringFreq - 0.6) * 2.5; // 0 below 0.6, ramps to 2.5 at 1.0
  const spatialFreq = 0.05 + extreme * 0.15; // spatial warp gets tighter at extremes

  // Base warp — two inharmonic sine layers
  let dx = Math.sin(x * spatialFreq + time * speed + seedOffset) * amount
         + Math.sin(y * spatialFreq * 1.6 + time * speed * 1.3 + seedOffset * 2.1) * amount * 0.5;
  let dy = Math.cos(y * spatialFreq + time * speed * 0.9 + seedOffset * 1.7) * amount
         + Math.cos(x * spatialFreq * 1.4 + time * speed * 1.1 + seedOffset * 3.3) * amount * 0.5;

  // Extreme range: add harsh high-frequency interference patterns
  if (extreme > 0.1) {
    const hfAmount = extreme * amount * 0.8;
    const hfSpeed = speed * 2.5;
    dx += Math.sin(x * 0.2 + time * hfSpeed + seedOffset * 5.7) * hfAmount;
    dx += Math.cos(y * 0.15 + time * hfSpeed * 0.7 + seedOffset * 7.3) * hfAmount * 0.4;
    dy += Math.cos(y * 0.18 + time * hfSpeed * 1.2 + seedOffset * 4.1) * hfAmount;
    dy += Math.sin(x * 0.22 + time * hfSpeed * 0.6 + seedOffset * 6.9) * hfAmount * 0.4;
  }

  // Clamp displacement to prevent screen blowout — enough to look chaotic, not enough to stack everything
  const maxDisp = 120;
  const fdx = Math.max(-maxDisp, Math.min(maxDisp, dx * ringMix));
  const fdy = Math.max(-maxDisp, Math.min(maxDisp, dy * ringMix));
  return { dx: fdx, dy: fdy };
}

// No-op — ring pool is no longer used for standalone visuals
function drawRingRipples() {}
function spawnRingRipple() {}

/* ── EQ spectral bands ───────────────────────────────────────────── */
// Low = warm amber aurora below the comet
// Mid = golden presence glow around the comet
// High = cool blue-white sparkle/shimmer above the comet

function drawEQ(W, H, rms) {
  const eqLow = ccSmoothed[SLOT_EQ_LOW];
  const eqMid = ccSmoothed[SLOT_EQ_MID];
  const eqHigh = ccSmoothed[SLOT_EQ_HIGH];

  if (eqLow < 0.02 && eqMid < 0.02 && eqHigh < 0.02) return;

  ctx.save();
  ctx.globalCompositeOperation = 'screen';

  // === LOW — warm amber aurora sweeping below the comet ===
  if (eqLow > 0.02) {
    const lowAlpha = eqLow * 0.35;
    const lowR = 60 + eqLow * 120;
    // Wide band below the comet
    const lowY = cometY + 30 + eqLow * 20;
    const lg = ctx.createRadialGradient(cometX, lowY, 10, cometX, lowY, lowR);
    lg.addColorStop(0, `hsla(25, 90%, 55%, ${lowAlpha})`);
    lg.addColorStop(0.3, `hsla(18, 85%, 45%, ${lowAlpha * 0.5})`);
    lg.addColorStop(0.7, `hsla(10, 75%, 35%, ${lowAlpha * 0.12})`);
    lg.addColorStop(1, 'hsla(5, 70%, 25%, 0)');
    ctx.fillStyle = lg;
    ctx.fillRect(cometX - lowR, lowY - lowR, lowR * 2, lowR * 2);

    // Pulsing low-frequency wave bands
    for (let i = 0; i < 3; i++) {
      const waveY = lowY + Math.sin(time * 1.5 + i * 1.2) * 15;
      const waveR = lowR * (0.6 + i * 0.25);
      const waveAlpha = lowAlpha * (0.3 - i * 0.08);
      ctx.beginPath();
      ctx.ellipse(cometX, waveY, waveR, waveR * 0.3, 0, 0, TAU);
      ctx.strokeStyle = `hsla(20, 90%, 55%, ${waveAlpha})`;
      ctx.lineWidth = 2 + eqLow * 3;
      ctx.stroke();
    }
  }

  // === MID — golden presence ring/aura around the comet ===
  if (eqMid > 0.02) {
    const midAlpha = eqMid * 0.3;
    const midR = 40 + eqMid * 80;

    // Warm golden ring
    const mg = ctx.createRadialGradient(cometX, cometY, midR * 0.4, cometX, cometY, midR);
    mg.addColorStop(0, `hsla(45, 85%, 60%, ${midAlpha * 0.5})`);
    mg.addColorStop(0.5, `hsla(40, 80%, 50%, ${midAlpha * 0.3})`);
    mg.addColorStop(1, 'hsla(35, 70%, 40%, 0)');
    ctx.fillStyle = mg;
    ctx.beginPath();
    ctx.arc(cometX, cometY, midR, 0, TAU);
    ctx.fill();

    // Rotating mid presence arcs
    const arcCount = 4 + Math.floor(eqMid * 4);
    for (let i = 0; i < arcCount; i++) {
      const angle = (i / arcCount) * TAU + time * 0.8;
      const arcR = midR * (0.7 + Math.sin(time * 2.5 + i * 1.7) * 0.2);
      const arcAlpha = midAlpha * 0.5 * (0.6 + Math.sin(time * 3 + i * 2.1) * 0.4);
      ctx.beginPath();
      ctx.arc(cometX, cometY, arcR, angle, angle + 0.5 + eqMid * 0.5);
      ctx.strokeStyle = `hsla(42, 85%, 65%, ${arcAlpha})`;
      ctx.lineWidth = 1.5 + eqMid * 3;
      ctx.stroke();
    }
  }

  // === HIGH — cool blue-white sparkle/shimmer above the comet ===
  if (eqHigh > 0.02) {
    const highAlpha = eqHigh * 0.4;
    const highR = 50 + eqHigh * 100;
    const highY = cometY - 25 - eqHigh * 15;

    // Cool shimmer glow above
    const hg = ctx.createRadialGradient(cometX, highY, 5, cometX, highY, highR);
    hg.addColorStop(0, `hsla(210, 70%, 85%, ${highAlpha})`);
    hg.addColorStop(0.3, `hsla(220, 60%, 75%, ${highAlpha * 0.4})`);
    hg.addColorStop(0.7, `hsla(230, 50%, 60%, ${highAlpha * 0.08})`);
    hg.addColorStop(1, 'hsla(240, 40%, 50%, 0)');
    ctx.fillStyle = hg;
    ctx.fillRect(cometX - highR, highY - highR, highR * 2, highR * 2);

    // Sparkle particles — tiny bright dots that flicker
    const sparkleCount = 6 + Math.floor(eqHigh * 12);
    for (let i = 0; i < sparkleCount; i++) {
      // Pseudo-random positions that shift over time
      const seed = i * 7.31 + 3.17;
      const sx = cometX + Math.sin(seed + time * 1.3) * highR * 0.8;
      const sy = highY + Math.cos(seed * 1.7 + time * 1.1) * highR * 0.5;
      const flicker = 0.3 + 0.7 * Math.pow(Math.sin(time * 8 + seed * 2.3) * 0.5 + 0.5, 2);
      const sparkAlpha = highAlpha * flicker * 0.7;
      const sparkSize = 1 + eqHigh * 2.5 * flicker;

      // Bright dot
      ctx.fillStyle = `hsla(210, 60%, 95%, ${sparkAlpha})`;
      ctx.beginPath();
      ctx.arc(sx, sy, sparkSize, 0, TAU);
      ctx.fill();

      // Tiny cross on brightest sparkles
      if (flicker > 0.7) {
        const crossLen = sparkSize * 3;
        ctx.strokeStyle = `hsla(215, 50%, 90%, ${sparkAlpha * 0.4})`;
        ctx.lineWidth = 0.5;
        ctx.beginPath(); ctx.moveTo(sx - crossLen, sy); ctx.lineTo(sx + crossLen, sy); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(sx, sy - crossLen); ctx.lineTo(sx, sy + crossLen); ctx.stroke();
      }
    }
  }

  ctx.restore();
}

/* ── Comet head ──────────────────────────────────────────────────── */
// Draws a full comet head at (hx, hy) with given scale and alpha.
// scale=1, masterAlpha=1 for the main comet. Delay ghosts call with reduced values.

function drawCometHeadAt(W, H, rms, hx, hy, scale, masterAlpha) {
  const drive = ccSmoothed[SLOT_DRIVE];
  const driveLevel = ccSmoothed[SLOT_DRIVE_LEVEL];
  const chorusMix = ccSmoothed[SLOT_CHORUS_MIX];
  const chorusRate = ccSmoothed[SLOT_CHORUS_RATE];
  const { h, s, l } = blendedColor;

  // For delay ghosts (masterAlpha < 1), render to an offscreen canvas at full
  // brightness, then stamp it onto the main canvas at reduced opacity.
  // This ensures ghosts are true faded copies with all detail intact.
  const brightness = 0.7 + driveLevel * 0.25 + rms * 0.35;
  const R = (20 + rms * 32) * scale;

  const useOffscreen = masterAlpha < 0.99;
  let mainCtx = ctx;
  let offCanvas = null;
  if (useOffscreen) {
    const margin = R * 14; // enough space for all glow layers
    const size = Math.ceil(margin * 2);
    offCanvas = document.createElement('canvas');
    offCanvas.width = size;
    offCanvas.height = size;
    ctx = offCanvas.getContext('2d');
    // Translate so hx,hy maps to center of offscreen canvas
    ctx.translate(margin - hx, margin - hy);
  }

  // ── Ring mod position mangling ──
  const ringMix = ccSmoothed[SLOT_RING_MIX];
  const ringFreq = ccSmoothed[SLOT_RING_FREQ];
  const rmWarp = ringModWarp(hx, hy, 0);
  // At high ring mod, the comet head itself jitters
  hx += rmWarp.dx * 0.4;
  hy += rmWarp.dy * 0.4;

  // ── 1. OUTER CORONA GLOW — deep amber atmospheric haze ──
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  if (cometCoreTexture) {
    const sz = R * 24;
    ctx.globalAlpha = brightness * 0.45;
    ctx.drawImage(cometCoreTexture, hx - sz/2, hy - sz/2, sz, sz);
  }
  ctx.restore();

  // Effect-colored aura (blended color from effect levels)
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  const auraR = R * 6;
  const ag = ctx.createRadialGradient(hx, hy, R * 0.5, hx, hy, auraR);
  ag.addColorStop(0, `hsla(${h}, ${s}%, ${l + 10}%, ${brightness * 0.2})`);
  ag.addColorStop(0.4, `hsla(${h}, ${s - 10}%, ${l}%, ${brightness * 0.06})`);
  ag.addColorStop(1, `hsla(${h}, ${s}%, ${l - 10}%, 0)`);
  ctx.fillStyle = ag;
  ctx.beginPath(); ctx.arc(hx, hy, auraR, 0, TAU); ctx.fill();
  ctx.restore();

  // ── 2. SOLAR PROMINENCES — organic plasma tendrils ──
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  const prominenceCount = 8 + Math.floor(drive * 10);
  for (let i = 0; i < prominenceCount; i++) {
    const seed = i * 2.618 + 0.5; // golden ratio spread
    const baseAngle = (i / prominenceCount) * TAU + Math.sin(time * 0.7 + seed) * 0.3;
    const len = R * (1.2 + Math.sin(time * 1.3 + seed * 3.7) * 0.5 + drive * 1.5);
    const thickness = 2 + R * 0.08 + drive * 4;
    const prominence_a = brightness * 0.25 * (0.4 + Math.sin(time * 2.5 + seed * 2.1) * 0.6);

    // Curved tendril (quadratic bezier)
    const x1 = hx + Math.cos(baseAngle) * R * 0.7;
    const y1 = hy + Math.sin(baseAngle) * R * 0.7;
    const bend = Math.sin(time * 1.8 + seed * 4.3) * len * 0.4;
    const perpAngle = baseAngle + Math.PI * 0.5;
    const cpx = hx + Math.cos(baseAngle) * len * 0.6 + Math.cos(perpAngle) * bend;
    const cpy = hy + Math.sin(baseAngle) * len * 0.6 + Math.sin(perpAngle) * bend;
    const x2 = hx + Math.cos(baseAngle) * len;
    const y2 = hy + Math.sin(baseAngle) * len;

    const tg = ctx.createLinearGradient(x1, y1, x2, y2);
    tg.addColorStop(0, `hsla(40, 100%, 75%, ${prominence_a})`);
    tg.addColorStop(0.4, `hsla(30, 95%, 60%, ${prominence_a * 0.6})`);
    tg.addColorStop(0.8, `hsla(15, 90%, 45%, ${prominence_a * 0.2})`);
    tg.addColorStop(1, 'hsla(5, 80%, 30%, 0)');
    ctx.strokeStyle = tg;
    ctx.lineWidth = thickness;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.quadraticCurveTo(cpx, cpy, x2, y2);
    ctx.stroke();
  }
  ctx.restore();

  // ── 3. CHORUS — multiple detuned copies of the fireball ──
  // Chorus = layered copies slightly offset, like double/triple vision.
  // Rate controls how much the copies drift. Mix controls how visible they are.
  if (chorusMix > 0.02) {
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const copies = 3;
    const driftAmount = 5 + chorusMix * 15 + chorusRate * 30;
    const driftSpeed = 0.3 + chorusRate * 4;
    const cA = chorusMix * 0.8; // strong — chorus should be very visible

    for (let c = 0; c < copies; c++) {
      const phase = (c / copies) * TAU;
      const dx = Math.sin(time * driftSpeed + phase) * driftAmount;
      const dy = Math.cos(time * driftSpeed * 0.7 + phase) * driftAmount * 0.6;
      const copyX = hx + dx;
      const copyY = hy + dy;
      const copyR = R * (0.95 + Math.sin(time * driftSpeed * 1.3 + phase) * 0.05);

      // Wide ambient glow matching the main comet's corona texture
      if (cometCoreTexture) {
        ctx.save();
        ctx.globalAlpha = cA * 0.3;
        const glowSz = copyR * 18;
        ctx.drawImage(cometCoreTexture, copyX - glowSz/2, copyY - glowSz/2, glowSz, glowSz);
        ctx.restore();
      }

      // Colored glow halo
      const og = ctx.createRadialGradient(copyX, copyY, copyR * 0.2, copyX, copyY, copyR * 3);
      og.addColorStop(0, `hsla(40, 95%, 70%, ${cA * 0.35})`);
      og.addColorStop(0.3, `hsla(30, 90%, 55%, ${cA * 0.15})`);
      og.addColorStop(0.7, `hsla(18, 80%, 40%, ${cA * 0.04})`);
      og.addColorStop(1, 'hsla(10, 70%, 30%, 0)');
      ctx.fillStyle = og;
      ctx.beginPath(); ctx.arc(copyX, copyY, copyR * 3, 0, TAU); ctx.fill();

      // Copy sphere body — full fireball gradient
      const cg = ctx.createRadialGradient(
        copyX - copyR * 0.15, copyY - copyR * 0.15, 0,
        copyX, copyY, copyR
      );
      cg.addColorStop(0, `hsla(50, 100%, 95%, ${cA * 0.8})`);
      cg.addColorStop(0.15, `hsla(45, 100%, 82%, ${cA * 0.7})`);
      cg.addColorStop(0.35, `hsla(35, 95%, 65%, ${cA * 0.5})`);
      cg.addColorStop(0.6, `hsla(22, 90%, 48%, ${cA * 0.3})`);
      cg.addColorStop(0.85, `hsla(10, 85%, 32%, ${cA * 0.12})`);
      cg.addColorStop(1, 'hsla(0, 80%, 20%, 0)');
      ctx.fillStyle = cg;
      ctx.beginPath(); ctx.arc(copyX, copyY, copyR, 0, TAU); ctx.fill();

      // Specular highlight on copy
      const specR = copyR * 0.3;
      const sg = ctx.createRadialGradient(
        copyX - copyR * 0.2, copyY - copyR * 0.2, 0,
        copyX - copyR * 0.2, copyY - copyR * 0.2, specR
      );
      sg.addColorStop(0, `rgba(255, 255, 240, ${cA * 0.4})`);
      sg.addColorStop(1, 'rgba(255, 245, 200, 0)');
      ctx.fillStyle = sg;
      ctx.beginPath(); ctx.arc(copyX - copyR * 0.2, copyY - copyR * 0.2, specR, 0, TAU); ctx.fill();
    }

    ctx.restore();
  }

  // ── 4. SOLAR SURFACE — textured granulation cells ──
  // Multiple plasma cells create a mottled, sun-like surface
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  const cellCount = 10;
  for (let i = 0; i < cellCount; i++) {
    const seed = i * 3.14159 + 1.732;
    const cellAngle = (i / cellCount) * TAU + Math.sin(time * 0.9 + seed) * 0.4;
    const cellDist = R * (0.15 + Math.sin(time * 1.1 + seed * 2.3) * 0.15);
    let cx2 = hx + Math.cos(cellAngle) * cellDist;
    let cy2 = hy + Math.sin(cellAngle) * cellDist;
    // Ring mod warps granulation cells
    const cellWarp = ringModWarp(cx2, cy2, seed * 0.5);
    cx2 += cellWarp.dx * 0.3;
    cy2 += cellWarp.dy * 0.3;
    const cellR = R * (0.35 + Math.sin(time * 1.7 + seed * 1.5) * 0.1);
    const cellBright = brightness * (0.15 + Math.sin(time * 2.3 + seed * 3.1) * 0.08);

    const cg = ctx.createRadialGradient(cx2, cy2, 0, cx2, cy2, cellR);
    cg.addColorStop(0, `hsla(45, 100%, 85%, ${cellBright})`);
    cg.addColorStop(0.3, `hsla(38, 95%, 65%, ${cellBright * 0.6})`);
    cg.addColorStop(0.7, `hsla(25, 90%, 45%, ${cellBright * 0.2})`);
    cg.addColorStop(1, 'hsla(15, 80%, 30%, 0)');
    ctx.fillStyle = cg;
    ctx.beginPath(); ctx.arc(cx2, cy2, cellR, 0, TAU); ctx.fill();
  }
  ctx.restore();

  // ── 5. MAIN BODY — deep amber/orange fireball sphere ──
  const coreGrad = ctx.createRadialGradient(hx - R * 0.15, hy - R * 0.15, 0, hx, hy, R);
  coreGrad.addColorStop(0, `hsla(50, 100%, 95%, ${brightness})`);      // white-yellow center
  coreGrad.addColorStop(0.1, `hsla(45, 100%, 85%, ${brightness * 0.95})`);
  coreGrad.addColorStop(0.25, `hsla(38, 95%, 70%, ${brightness * 0.8})`); // bright yellow-orange
  coreGrad.addColorStop(0.5, `hsla(28, 95%, 55%, ${brightness * 0.65})`); // deep orange
  coreGrad.addColorStop(0.75, `hsla(15, 90%, 40%, ${brightness * 0.4})`); // burnt orange
  coreGrad.addColorStop(0.9, `hsla(5, 85%, 28%, ${brightness * 0.2})`);   // dark red edge
  coreGrad.addColorStop(1, `hsla(0, 80%, 18%, 0)`);                        // fade out
  ctx.fillStyle = coreGrad;
  ctx.beginPath(); ctx.arc(hx, hy, R, 0, TAU); ctx.fill();

  // ── 5b. RING MOD FRAGMENTATION — split/mangled copies of the sphere ──
  if (ringMix > 0.03) {
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const extreme = Math.max(0, ringFreq - 0.6) * 2.5;
    // Cap fragment count to prevent brightness blowout
    const fragCount = Math.min(8, 2 + Math.floor(ringMix * 3) + Math.floor(extreme * 3));
    const rmSpeed = 4 + ringFreq * 25;
    // Total alpha budget — spread across fragments so they don't blow out to white
    const alphaBudget = 0.35;
    for (let f = 0; f < fragCount; f++) {
      const seed = f * 2.71 + 0.5;
      const fw = ringModWarp(hx + f * 50, hy + f * 30, seed);
      // Fragments spread outward — further at extreme
      const spread = 0.5 + f * 0.12 + extreme * 0.4;
      const fx = hx + fw.dx * spread;
      const fy = hy + fw.dy * spread;
      const sizeVar = extreme > 0.1 ? Math.sin(time * rmSpeed * 0.5 + seed * 4.7) * 0.25 : 0;
      const fR = R * (0.35 + sizeVar + Math.sin(time * rmSpeed * 0.3 + seed * 2.1) * 0.12);
      // Each fragment gets a share of the alpha budget — prevents stacking to white
      const fragAlpha = (alphaBudget / fragCount) * ringMix * (1 - f / (fragCount + 2));

      const fg = ctx.createRadialGradient(fx, fy, 0, fx, fy, fR);
      fg.addColorStop(0, `hsla(45, 100%, 75%, ${fragAlpha})`);
      fg.addColorStop(0.3, `hsla(30, 90%, 55%, ${fragAlpha * 0.5})`);
      fg.addColorStop(0.7, `hsla(15, 80%, 38%, ${fragAlpha * 0.15})`);
      fg.addColorStop(1, 'hsla(5, 70%, 25%, 0)');
      ctx.fillStyle = fg;
      ctx.beginPath(); ctx.arc(fx, fy, fR, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }

  // ── 6. SURFACE DETAIL — dark convection boundaries (solar granulation) ──
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  for (let i = 0; i < 8; i++) {
    const seed = i * 4.17 + 2.33;
    const da = (i / 8) * TAU + Math.sin(time * 0.6 + seed) * 0.5;
    const dd = R * (0.2 + Math.sin(time * 0.8 + seed * 1.7) * 0.15);
    const dx = hx + Math.cos(da) * dd;
    const dy = hy + Math.sin(da) * dd;
    const dr = R * (0.2 + Math.sin(time * 1.2 + seed * 2.5) * 0.08);
    const darkAlpha = 0.08 + drive * 0.06;

    const dg = ctx.createRadialGradient(dx, dy, 0, dx, dy, dr);
    dg.addColorStop(0, `hsla(10, 70%, 20%, ${darkAlpha * masterAlpha})`);
    dg.addColorStop(0.6, `hsla(15, 60%, 30%, ${darkAlpha * 0.3 * masterAlpha})`);
    dg.addColorStop(1, 'hsla(20, 50%, 40%, 0)');
    ctx.fillStyle = dg;
    ctx.beginPath(); ctx.arc(dx, dy, dr, 0, TAU); ctx.fill();
  }
  ctx.restore();

  // ── 7. HOT SPOTS — bright yellow-white patches ──
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  for (let i = 0; i < 5; i++) {
    const seed = i * 5.31 + 0.77;
    const ha = (i / 5) * TAU + time * 0.4 + Math.sin(time * 1.5 + seed) * 0.6;
    const hd = R * (0.1 + Math.sin(time * 2.1 + seed * 1.9) * 0.2);
    const hpx = hx + Math.cos(ha) * hd;
    const hpy = hy + Math.sin(ha) * hd;
    const hr = R * (0.15 + Math.sin(time * 2.7 + seed * 3.3) * 0.05);
    const hotAlpha = brightness * (0.2 + Math.sin(time * 3.1 + seed * 2.7) * 0.1);

    const hg = ctx.createRadialGradient(hpx, hpy, 0, hpx, hpy, hr);
    hg.addColorStop(0, `hsla(55, 100%, 95%, ${hotAlpha})`);
    hg.addColorStop(0.3, `hsla(48, 100%, 80%, ${hotAlpha * 0.5})`);
    hg.addColorStop(1, 'hsla(40, 95%, 65%, 0)');
    ctx.fillStyle = hg;
    ctx.beginPath(); ctx.arc(hpx, hpy, hr, 0, TAU); ctx.fill();
  }
  ctx.restore();

  // ── 8. LIMB DARKENING — subtle darker edge for 3D spherical look ──
  const limbGrad = ctx.createRadialGradient(hx, hy, R * 0.7, hx, hy, R);
  limbGrad.addColorStop(0, 'hsla(0, 0%, 0%, 0)');
  limbGrad.addColorStop(0.7, `hsla(10, 80%, 20%, ${brightness * 0.08})`);
  limbGrad.addColorStop(1, `hsla(0, 70%, 12%, ${brightness * 0.2})`);
  ctx.fillStyle = limbGrad;
  ctx.beginPath(); ctx.arc(hx, hy, R, 0, TAU); ctx.fill();

  // ── 9. SPECULAR HIGHLIGHT — bright spot for 3D depth ──
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  const specR = R * 0.35;
  const specX = hx - R * 0.2;
  const specY = hy - R * 0.2;
  const specGrad = ctx.createRadialGradient(specX, specY, 0, specX, specY, specR);
  specGrad.addColorStop(0, `rgba(255, 255, 240, ${brightness * 0.5})`);
  specGrad.addColorStop(0.4, `rgba(255, 250, 220, ${brightness * 0.15})`);
  specGrad.addColorStop(1, 'rgba(255, 245, 200, 0)');
  ctx.fillStyle = specGrad;
  ctx.beginPath(); ctx.arc(specX, specY, specR, 0, TAU); ctx.fill();
  ctx.restore();

  // ── 10. LENS FLARE — cinematic ──
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  const flareLen = R * 3.5 + rms * 40;
  const flareAlpha = brightness * 0.12;
  const fg = ctx.createLinearGradient(hx - flareLen, hy, hx + flareLen, hy);
  fg.addColorStop(0, 'rgba(255, 240, 200, 0)');
  fg.addColorStop(0.35, `rgba(255, 240, 200, ${flareAlpha * 0.3})`);
  fg.addColorStop(0.5, `rgba(255, 255, 240, ${flareAlpha})`);
  fg.addColorStop(0.65, `rgba(255, 240, 200, ${flareAlpha * 0.3})`);
  fg.addColorStop(1, 'rgba(255, 240, 200, 0)');
  ctx.strokeStyle = fg;
  ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(hx - flareLen, hy); ctx.lineTo(hx + flareLen, hy); ctx.stroke();
  ctx.restore();

  // Stamp offscreen canvas back at masterAlpha
  if (useOffscreen && offCanvas) {
    ctx = mainCtx;
    const margin = R * 14;
    ctx.save();
    ctx.globalAlpha = masterAlpha;
    ctx.drawImage(offCanvas, hx - margin, hy - margin);
    ctx.restore();
  }
}

// Convenience wrapper for the main comet
function drawCometHead(W, H, rms) {
  drawCometHeadAt(W, H, rms, cometX, cometY, 1, 1);
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
