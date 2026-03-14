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

/* ── Reverb space atmosphere ──────────────────────────────────────── */
// Reverb = the space you're in. It paints the entire background atmosphere,
// not just a haze near the comet. Mix = intensity, Decay = how expansive.

function drawReverbHaze(W, H) {
  const mix = ccSmoothed[SLOT_REVERB_MIX];
  const decay = ccSmoothed[SLOT_REVERB_DECAY];
  const alpha = mix * 0.25; // strong — reverb should be unmistakable

  ctx.save();
  ctx.globalCompositeOperation = 'screen';

  // Full-screen atmospheric wash — like being inside a reverberant space
  const edgeGrad = ctx.createRadialGradient(W/2, H/2, Math.min(W, H) * 0.05, W/2, H/2, Math.max(W, H) * 0.9);
  edgeGrad.addColorStop(0, `hsla(${bgHue + 40}, ${40 + decay * 40}%, 30%, ${alpha * 0.4})`);
  edgeGrad.addColorStop(0.4, `hsla(${bgHue + 50}, ${35 + decay * 35}%, 25%, ${alpha * 0.7})`);
  edgeGrad.addColorStop(0.8, `hsla(${bgHue + 60}, ${30 + decay * 30}%, 18%, ${alpha * 0.9})`);
  edgeGrad.addColorStop(1, `hsla(${bgHue + 60}, ${25 + decay * 25}%, 12%, ${alpha})`);
  ctx.fillStyle = edgeGrad;
  ctx.fillRect(0, 0, W, H);

  // Corner fog — decay makes the space feel more enclosed/expansive
  const fogR = Math.max(W, H) * (0.4 + decay * 0.6);
  const corners = [[0, 0], [W, 0], [0, H], [W, H]];
  for (const [cx, cy] of corners) {
    const fg = ctx.createRadialGradient(cx, cy, 0, cx, cy, fogR);
    fg.addColorStop(0, `hsla(${bgHue + 55}, ${45 + decay * 35}%, 35%, ${alpha * 0.7})`);
    fg.addColorStop(0.4, `hsla(${bgHue + 50}, ${35 + decay * 25}%, 25%, ${alpha * 0.3})`);
    fg.addColorStop(0.8, `hsla(${bgHue + 45}, ${25 + decay * 20}%, 18%, ${alpha * 0.08})`);
    fg.addColorStop(1, 'hsla(270, 20%, 10%, 0)');
    ctx.fillStyle = fg;
    ctx.fillRect(cx - fogR, cy - fogR, fogR * 2, fogR * 2);
  }

  // Top/bottom edge glow for immersion
  const edgeAlpha = alpha * 0.5;
  const topGrad = ctx.createLinearGradient(0, 0, 0, H * 0.3);
  topGrad.addColorStop(0, `hsla(${bgHue + 50}, ${40 + decay * 30}%, 25%, ${edgeAlpha})`);
  topGrad.addColorStop(1, 'hsla(270, 20%, 10%, 0)');
  ctx.fillStyle = topGrad;
  ctx.fillRect(0, 0, W, H * 0.3);

  const botGrad = ctx.createLinearGradient(0, H * 0.7, 0, H);
  botGrad.addColorStop(0, 'hsla(270, 20%, 10%, 0)');
  botGrad.addColorStop(1, `hsla(${bgHue + 50}, ${40 + decay * 30}%, 25%, ${edgeAlpha})`);
  ctx.fillStyle = botGrad;
  ctx.fillRect(0, H * 0.7, W, H * 0.3);

  ctx.restore();
}

/* ── Delay ghosts ────────────────────────────────────────────────── */

function drawDelayGhosts(W, H, rms) {
  const mix = ccSmoothed[SLOT_DELAY_MIX];
  const delayTime = ccSmoothed[SLOT_DELAY_TIME];
  const feedback = ccSmoothed[SLOT_DELAY_FB];

  // Feedback controls how many echoes (1-8), time controls spacing
  const ghostCount = Math.floor(feedback * 7) + 1;
  const spacing = Math.max(15, Math.floor(delayTime * 250));
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
    const alpha = mix * falloff * 0.85;
    if (alpha <= 0.01) continue;

    // Scale: first ghost is 90% of main comet, diminishing with feedback
    const ghostScale = 0.7 + falloff * 0.25;

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
    const tx = trailScreenX(t);
    if (tx < -100 || tx > W + 100) continue;
    const progress = i / len;
    const alpha = progress * progress * 0.08 * (1 + rms * 2);
    const glowR = 25 + progress * 50 + rms * 35;
    if (alpha < 0.003) continue;

    const g = ctx.createRadialGradient(tx, t.y, 0, tx, t.y, glowR);
    g.addColorStop(0, `hsla(${h}, ${s}%, ${l + 10}%, ${alpha})`);
    g.addColorStop(1, `hsla(${h}, ${s}%, ${l}%, 0)`);
    ctx.fillStyle = g;
    ctx.fillRect(tx - glowR, t.y - glowR, glowR * 2, glowR * 2);
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

/* ── Ring mod — chaotic, glitchy, metallic visuals ────────────────── */
// Ring mod creates harsh inharmonic tones. The visual should feel unstable,
// electric, fractured — like reality is glitching around the comet.

function drawRingRipples() {
  const ringMix = ccSmoothed[SLOT_RING_MIX];
  const ringFreq = ccSmoothed[SLOT_RING_FREQ];
  if (ringMix < 0.02) return;

  ctx.save();
  ctx.globalCompositeOperation = 'screen';

  const cx = cometX, cy = cometY;
  const intensity = ringMix;
  const freq = ringFreq;
  const speed = 4 + freq * 20; // frequency drives visual speed

  // === 1. Expanding interference rings (fast, many) ===
  for (const r of ringPool) {
    // Distorted ring — not a perfect circle, warped by freq
    ctx.beginPath();
    const steps = 60;
    for (let i = 0; i <= steps; i++) {
      const a = (i / steps) * TAU;
      const warp = Math.sin(a * (3 + Math.floor(freq * 8)) + time * speed) * r.radius * 0.15 * intensity;
      const px = r.x + Math.cos(a) * (r.radius + warp);
      const py = r.y + Math.sin(a) * (r.radius + warp);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.strokeStyle = `rgba(0, 240, 255, ${r.alpha})`;
    ctx.lineWidth = 1.5 + intensity * 3;
    ctx.stroke();
  }

  // === 2. Electric arcs — jagged lightning bolts radiating outward ===
  const arcCount = 3 + Math.floor(intensity * 8);
  for (let i = 0; i < arcCount; i++) {
    const angle = (i / arcCount) * TAU + time * speed * 0.3 + Math.sin(time * 3.7 + i) * 0.5;
    const len = 40 + intensity * 120 + Math.sin(time * speed + i * 2.3) * 30;
    const segments = 6 + Math.floor(intensity * 6);
    const arcAlpha = intensity * (0.3 + Math.random() * 0.4);

    ctx.beginPath();
    ctx.moveTo(cx, cy);
    let px = cx, py = cy;
    for (let s = 1; s <= segments; s++) {
      const t2 = s / segments;
      const baseX = cx + Math.cos(angle) * len * t2;
      const baseY = cy + Math.sin(angle) * len * t2;
      // Jagged perpendicular displacement
      const jitter = (Math.random() - 0.5) * 25 * intensity;
      const perpX = -Math.sin(angle);
      const perpY = Math.cos(angle);
      px = baseX + perpX * jitter;
      py = baseY + perpY * jitter;
      ctx.lineTo(px, py);
    }
    ctx.strokeStyle = `hsla(185, 95%, ${70 + Math.random() * 25}%, ${arcAlpha})`;
    ctx.lineWidth = 0.8 + intensity * 2;
    ctx.shadowColor = `hsla(185, 90%, 60%, ${arcAlpha * 0.5})`;
    ctx.shadowBlur = 6 + intensity * 8;
    ctx.stroke();
  }
  ctx.shadowBlur = 0;

  // === 3. Glitch rectangles — screen-tear artifacts ===
  if (intensity > 0.3) {
    const glitchCount = Math.floor((intensity - 0.3) * 15);
    for (let i = 0; i < glitchCount; i++) {
      const gw = 20 + Math.random() * 80 * intensity;
      const gh = 1 + Math.random() * 4;
      const gx = cx - 60 + Math.sin(time * speed * 2 + i * 5.7) * 100 * intensity;
      const gy = cy - 80 + Math.random() * 160;
      const glitchAlpha = (intensity - 0.3) * (0.2 + Math.random() * 0.3);
      ctx.fillStyle = `hsla(${180 + Math.random() * 30}, 90%, ${60 + Math.random() * 30}%, ${glitchAlpha})`;
      ctx.fillRect(gx, gy, gw, gh);
    }
  }

  // === 4. Frequency-modulated halo — pulsing at ring mod rate ===
  const haloR = 50 + intensity * 80;
  const haloPulse = Math.sin(time * speed) * 0.5 + 0.5;
  const haloAlpha = intensity * 0.2 * haloPulse;
  const hg = ctx.createRadialGradient(cx, cy, haloR * 0.3, cx, cy, haloR);
  hg.addColorStop(0, `hsla(185, 90%, 60%, ${haloAlpha})`);
  hg.addColorStop(0.5, `hsla(195, 80%, 50%, ${haloAlpha * 0.4})`);
  hg.addColorStop(1, 'hsla(200, 70%, 40%, 0)');
  ctx.fillStyle = hg;
  ctx.beginPath();
  ctx.arc(cx, cy, haloR, 0, TAU);
  ctx.fill();

  // === 5. Fracture lines — cracks in space radiating from comet ===
  if (intensity > 0.5) {
    const crackCount = Math.floor((intensity - 0.5) * 12);
    for (let i = 0; i < crackCount; i++) {
      const angle = (i / crackCount) * TAU + time * 0.5;
      const crackLen = 60 + intensity * 150;
      const crackAlpha = (intensity - 0.5) * 0.5 * (0.5 + Math.sin(time * 12 + i * 3) * 0.5);
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      let cpx = cx, cpy = cy;
      for (let s = 0; s < 5; s++) {
        const t2 = (s + 1) / 5;
        cpx = cx + Math.cos(angle) * crackLen * t2 + (Math.random() - 0.5) * 15;
        cpy = cy + Math.sin(angle) * crackLen * t2 + (Math.random() - 0.5) * 15;
        ctx.lineTo(cpx, cpy);
      }
      ctx.strokeStyle = `hsla(180, 100%, 90%, ${crackAlpha})`;
      ctx.lineWidth = 0.5 + Math.random() * 1.5;
      ctx.stroke();
    }
  }

  ctx.restore();
}

function spawnRingRipple() {
  const ringMix = ccSmoothed[SLOT_RING_MIX];
  if (ringMix < 0.02) return;
  const ringFreq = ccSmoothed[SLOT_RING_FREQ];
  const interval = Math.max(2, Math.floor(20 - ringFreq * 18));
  if (Math.floor(time * 60) % interval === 0 && ringPool.length < MAX_RINGS) {
    ringPool.push({ x: cometX, y: cometY, radius: 8, alpha: ringMix * 0.5 });
  }
}

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

  const brightness = (0.7 + driveLevel * 0.25 + rms * 0.35) * masterAlpha;
  const coreRadius = (20 + rms * 32) * scale;

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

  // === Chorus visual — swirling orbital aura ===
  // Chorus = modulation/movement. Visual: orbiting light streaks + pulsing rings
  if (chorusMix > 0.02) {
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const chorusSpeed = 3 + chorusRate * 12; // rate controls rotation speed

    // Pulsing blue aura that breathes with the chorus rate
    const pulseR = coreRadius * (2 + chorusMix * 2) + Math.sin(time * chorusSpeed) * chorusMix * 15;
    const pulseAlpha = chorusMix * 0.2;
    const pg = ctx.createRadialGradient(hx, hy, coreRadius * 0.8, hx, hy, pulseR);
    pg.addColorStop(0, `hsla(210, 80%, 70%, ${pulseAlpha * 0.8})`);
    pg.addColorStop(0.5, `hsla(220, 70%, 55%, ${pulseAlpha * 0.3})`);
    pg.addColorStop(1, 'hsla(230, 60%, 40%, 0)');
    ctx.fillStyle = pg;
    ctx.beginPath();
    ctx.arc(hx, hy, pulseR, 0, TAU);
    ctx.fill();

    // Orbiting light streaks (3 pairs, counter-rotating)
    const orbitR = coreRadius * 2.5 + chorusMix * 20;
    for (let i = 0; i < 6; i++) {
      const dir = i < 3 ? 1 : -1;
      const angle = dir * time * chorusSpeed * 0.4 + (i % 3) * TAU / 3;
      const ox = hx + Math.cos(angle) * orbitR;
      const oy = hy + Math.sin(angle) * orbitR * 0.6; // elliptical orbit
      const streakLen = 12 + chorusMix * 20;
      const sx = ox - Math.cos(angle) * streakLen;
      const sy = oy - Math.sin(angle) * streakLen * 0.6;

      const sg = ctx.createLinearGradient(sx, sy, ox, oy);
      sg.addColorStop(0, 'hsla(210, 70%, 60%, 0)');
      sg.addColorStop(0.5, `hsla(215, 80%, 70%, ${chorusMix * 0.4})`);
      sg.addColorStop(1, `hsla(220, 90%, 85%, ${chorusMix * 0.6})`);
      ctx.strokeStyle = sg;
      ctx.lineWidth = 1.5 + chorusMix * 2;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(ox, oy);
      ctx.stroke();

      // Bright dot at streak tip
      ctx.fillStyle = `hsla(210, 80%, 90%, ${chorusMix * 0.5})`;
      ctx.beginPath();
      ctx.arc(ox, oy, 2 + chorusMix * 2, 0, TAU);
      ctx.fill();
    }

    // Shimmer rings (thicker, more visible)
    for (let ring = 0; ring < 3; ring++) {
      const phase = ring * TAU / 3;
      const r = orbitR + Math.sin(time * chorusSpeed + phase) * chorusMix * 15;
      const alpha = chorusMix * 0.25 * (1 - ring * 0.2);
      ctx.beginPath();
      ctx.arc(hx, hy, Math.max(1, r), 0, TAU);
      ctx.strokeStyle = `hsla(215, 70%, 75%, ${alpha})`;
      ctx.lineWidth = 1 + chorusMix * 3;
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
