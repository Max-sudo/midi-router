// ── Home Tab – Interactive Galaxy Hero ───────────────────────────────
import { $, bus } from './utils.js';

const panel = $('#home-panel');

// Refined SVG icons — filled shapes with detail, not wireframes
const SVG = {
  chat: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="2" y="3" width="20" height="14" rx="3" fill="currentColor" opacity="0.15"/>
    <rect x="2" y="3" width="20" height="14" rx="3" stroke="currentColor" stroke-width="1.5"/>
    <path d="M6 21l3-4h-3" fill="currentColor" opacity="0.15"/>
    <path d="M6 21l3-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
    <circle cx="8" cy="10" r="1" fill="currentColor"/><circle cx="12" cy="10" r="1" fill="currentColor"/><circle cx="16" cy="10" r="1" fill="currentColor"/>
  </svg>`,
  midi: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="1" y="5" width="22" height="14" rx="3" fill="currentColor" opacity="0.15"/>
    <rect x="1" y="5" width="22" height="14" rx="3" stroke="currentColor" stroke-width="1.5"/>
    <circle cx="7" cy="13" r="2" stroke="currentColor" stroke-width="1.2"/><circle cx="12" cy="13" r="2" stroke="currentColor" stroke-width="1.2"/><circle cx="17" cy="13" r="2" stroke="currentColor" stroke-width="1.2"/>
    <line x1="7" y1="8" x2="7" y2="10" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
    <line x1="12" y1="8" x2="12" y2="10" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
    <line x1="17" y1="8" x2="17" y2="10" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
  </svg>`,
  launchpad: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="2" y="2" width="8.5" height="8.5" rx="2.5" fill="currentColor" opacity="0.2" stroke="currentColor" stroke-width="1.3"/>
    <rect x="13.5" y="2" width="8.5" height="8.5" rx="2.5" fill="currentColor" opacity="0.15" stroke="currentColor" stroke-width="1.3"/>
    <rect x="2" y="13.5" width="8.5" height="8.5" rx="2.5" fill="currentColor" opacity="0.15" stroke="currentColor" stroke-width="1.3"/>
    <rect x="13.5" y="13.5" width="8.5" height="8.5" rx="2.5" fill="currentColor" opacity="0.2" stroke="currentColor" stroke-width="1.3"/>
  </svg>`,
  leadsheets: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M9 18V5l12-2v13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="6" cy="18" r="3" fill="currentColor" opacity="0.2" stroke="currentColor" stroke-width="1.3"/>
    <circle cx="18" cy="16" r="3" fill="currentColor" opacity="0.2" stroke="currentColor" stroke-width="1.3"/>
    <line x1="9" y1="9" x2="21" y2="7" stroke="currentColor" stroke-width="1" opacity="0.4"/>
  </svg>`,
  ccmonitor: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="2" y="3" width="20" height="18" rx="3" fill="currentColor" opacity="0.1" stroke="currentColor" stroke-width="1.5"/>
    <polyline points="6,15 9,9 12,17 15,7 18,13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`,
};

const TOOLS = [
  { tab: 'chat',        label: 'Chat',           icon: SVG.chat,       color: '#00f0ff' },
  { tab: 'midi',        label: 'MIDI Router',    icon: SVG.midi,       color: '#ff2d55' },

  { tab: 'launchpad',   label: 'Launchpad',      icon: SVG.launchpad,  color: '#ff9f0a' },
  { tab: 'leadsheets',  label: 'Lead Sheets',    icon: SVG.leadsheets, color: '#bf5af2' },
  { tab: 'ccmonitor',   label: 'Helix Monitor',  icon: SVG.ccmonitor,  color: '#5e5ce6' },
];

let canvas, ctx, animId;
let stars = [];      // background stars (static, many)
let spiralPts = [];  // galaxy spiral arm particles
let corePts = [];    // dense galactic core particles
let dustClouds = []; // nebula dust blobs
let nebulae = [];    // pre-rendered nebula textures
let cards = [];
let mouse = { x: 0, y: 0, down: false, dragX: 0, dragY: 0 };
let camera = { x: 0, y: 0, tx: 0, ty: 0 };
let W, H;
let hoverCard = null;

const STAR_COUNT = 500;
const SPIRAL_COUNT = 4500;
const DUST_COUNT = 150;
const CORE_COUNT = 800;

export function init() {
  if (!panel) return;

  panel.innerHTML = `
    <div class="home-hero" id="home-hero">
      <canvas class="home-hero__canvas" id="hero-canvas"></canvas>
      <div class="home-hero__content" id="hero-content">
        <h1 class="home-hero__title">Studio Tools</h1>
        <p class="home-hero__tagline" id="hero-tagline"></p>
      </div>
      <div class="home-hero__cards" id="hero-cards"></div>
    </div>
  `;

  canvas = document.getElementById('hero-canvas');
  ctx = canvas.getContext('2d');

  initGalaxy();
  initCards();
  initTagline();
  bindEvents();
  resize();
  animate();
}

// ── Galaxy generation ──────────────────────────────────────────────
function initGalaxy() {
  stars = [];
  spiralPts = [];
  corePts = [];
  dustClouds = [];
  nebulae = [];

  // Background stars — scattered across the field
  for (let i = 0; i < STAR_COUNT; i++) {
    stars.push({
      x: Math.random() * 2 - 1,
      y: Math.random() * 2 - 1,
      size: Math.random() * 1.4 + 0.3,
      alpha: Math.random() * 0.5 + 0.1,
      twinkleSpeed: Math.random() * 3 + 1,
      twinkleOffset: Math.random() * Math.PI * 2,
    });
  }

  // Dense galactic core — hot white/blue cluster
  for (let i = 0; i < CORE_COUNT; i++) {
    // Gaussian-ish distribution concentrated at center
    const r = (Math.random() + Math.random() + Math.random()) / 3 * 0.10;
    const a = Math.random() * Math.PI * 2;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r * 0.55; // flatten

    const dist = Math.sqrt(x * x + y * y);
    const hue = 200 + Math.random() * 40; // blue-white
    const light = 85 + Math.random() * 15;

    corePts.push({
      x, y,
      size: Math.random() * 1.8 + 0.3,
      alpha: (0.6 + Math.random() * 0.4) * Math.max(0, 1 - dist * 6),
      hue,
      sat: 20 + Math.random() * 30,
      light,
      speed: 0.02 + Math.random() * 0.015,
      baseAngle: Math.atan2(y, x),
      baseRadius: Math.sqrt(x * x + y * y),
    });
  }

  // Spiral arm particles — 2 major arms + 2 minor arms
  const arms = 2;
  for (let i = 0; i < SPIRAL_COUNT; i++) {
    const isMajor = i < SPIRAL_COUNT * 0.7;
    const arm = i % arms;
    const t = (i / SPIRAL_COUNT) * 4.0;
    const armAngle = (arm / arms) * Math.PI * 2;
    // Add offset for minor arms (between major arms)
    const armOff = isMajor ? 0 : Math.PI / arms;
    const angle = armAngle + armOff + t * 1.4; // tighter spiral
    const radius = t * 0.18;

    // Very tight spread for defined arms
    const spread = isMajor ? 0.025 + t * 0.012 : 0.04 + t * 0.018;
    const ox = (Math.random() - 0.5) * spread;
    const oy = (Math.random() - 0.5) * spread;

    const x = Math.cos(angle) * radius + ox;
    const y = Math.sin(angle) * radius * 0.55 + oy;

    // Color: warm white core → cyan → blue → magenta at outer edge
    const colorMix = Math.min(t / 3.5, 1);
    const hue = 190 + colorMix * 140;

    // Brighter particles near arm centerline
    const distFromArm = Math.sqrt(ox * ox + oy * oy) / spread;
    const armBrightness = 1 - distFromArm * 0.6;

    spiralPts.push({
      x, y,
      size: isMajor ? Math.random() * 2.0 + 0.4 : Math.random() * 1.4 + 0.3,
      alpha: (0.6 + Math.random() * 0.4) * armBrightness * (isMajor ? 1 : 0.45) * (1 - t * 0.06),
      hue,
      sat: 60 + Math.random() * 35,
      light: 65 + Math.random() * 30,
      speed: 0.012 + Math.random() * 0.008,
      baseAngle: Math.atan2(y, x),
      baseRadius: Math.sqrt(x * x + y * y),
    });
  }

  // Dust clouds along spiral arms — denser, more varied
  for (let i = 0; i < DUST_COUNT; i++) {
    const arm = i % arms;
    const t = (i / DUST_COUNT) * 3.0;
    const armAngle = (arm / arms) * Math.PI * 2;
    const angle = armAngle + t * 1.4;
    const radius = t * 0.16;
    const spread = 0.06;

    dustClouds.push({
      x: Math.cos(angle) * radius + (Math.random() - 0.5) * spread,
      y: Math.sin(angle) * radius * 0.55 + (Math.random() - 0.5) * spread * 0.6,
      size: 30 + Math.random() * 70,
      alpha: 0.03 + Math.random() * 0.04,
      hue: 190 + (t / 3.0) * 140,
      speed: 0.012 + Math.random() * 0.005,
      baseAngle: angle,
      baseRadius: radius,
    });
  }

  // Pre-rendered Hubble-style nebulae — wispy, filamentary gas clouds
  const nebulaConfigs = [
    {
      cx: -0.30, cy: -0.15, rotation: 0.4,
      // Pillars-of-Creation inspired: warm golds, dusty browns, teal rims
      palette: [
        { h: 35, s: 80, l: 45, w: 0.4 },   // warm gold
        { h: 20, s: 70, l: 35, w: 0.25 },   // dusty brown
        { h: 180, s: 70, l: 50, w: 0.2 },   // teal rim
        { h: 50, s: 90, l: 60, w: 0.15 },   // bright yellow highlight
      ],
    },
    {
      cx: 0.28, cy: 0.20, rotation: -0.3,
      // Carina-inspired: deep magenta, rose, hot pink with cyan edges
      palette: [
        { h: 330, s: 85, l: 50, w: 0.35 },  // deep magenta
        { h: 345, s: 90, l: 60, w: 0.25 },   // rose pink
        { h: 190, s: 80, l: 55, w: 0.2 },    // cyan edge
        { h: 280, s: 75, l: 45, w: 0.2 },    // purple shadow
      ],
    },
    {
      cx: -0.05, cy: 0.30, rotation: 1.2,
      // Orion-inspired: electric blue, violet, white-hot core
      palette: [
        { h: 220, s: 90, l: 55, w: 0.35 },   // electric blue
        { h: 270, s: 80, l: 50, w: 0.25 },    // violet
        { h: 200, s: 60, l: 80, w: 0.2 },     // white-blue hot
        { h: 340, s: 70, l: 45, w: 0.2 },     // dark magenta border
      ],
    },
  ];

  for (const cfg of nebulaConfigs) {
    nebulae.push({
      ...cfg,
      canvas: _renderNebulaTexture(cfg, 768),
      breathSpeed: 0.25 + Math.random() * 0.3,
      breathOffset: Math.random() * Math.PI * 2,
      driftSpeed: 0.004 + Math.random() * 0.004,
      driftAngle: Math.random() * Math.PI * 2,
    });
  }
}

// ── Pre-render a single nebula texture onto an offscreen canvas ────
function _renderNebulaTexture(cfg, size) {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const g = c.getContext('2d');
  const cx = size / 2;
  const cy = size / 2;
  const maxR = size * 0.48;

  // Simple seeded pseudo-random for deterministic textures
  let _seed = (cfg.cx * 10000 + cfg.cy * 7777) | 0;
  function rand() { _seed = (_seed * 16807 + 0) % 2147483647; return (_seed & 0x7fffffff) / 0x7fffffff; }

  // Pick a weighted random color from the palette
  function pickColor(alphaBase) {
    const r = rand();
    let cumulative = 0;
    for (const c of cfg.palette) {
      cumulative += c.w;
      if (r <= cumulative) {
        const hShift = (rand() - 0.5) * 20;
        const lShift = (rand() - 0.5) * 15;
        return `hsla(${c.h + hShift}, ${c.s}%, ${c.l + lShift}%, ${alphaBase})`;
      }
    }
    const last = cfg.palette[cfg.palette.length - 1];
    return `hsla(${last.h}, ${last.s}%, ${last.l}%, ${alphaBase})`;
  }

  // Layer 1: Large soft foundation blobs (the overall shape)
  for (let i = 0; i < 18; i++) {
    const angle = rand() * Math.PI * 2;
    const dist = rand() * maxR * 0.5;
    const bx = cx + Math.cos(angle) * dist;
    const by = cy + Math.sin(angle) * dist * (0.5 + rand() * 0.5);
    const br = maxR * (0.3 + rand() * 0.45);

    const grad = g.createRadialGradient(bx, by, 0, bx, by, br);
    grad.addColorStop(0, pickColor(0.14 + rand() * 0.08));
    grad.addColorStop(0.4, pickColor(0.07 + rand() * 0.04));
    grad.addColorStop(1, pickColor(0));
    g.fillStyle = grad;
    g.fillRect(bx - br, by - br, br * 2, br * 2);
  }

  // Layer 2: Filamentary wisps — elongated ellipses at various angles
  g.save();
  for (let i = 0; i < 45; i++) {
    const angle = rand() * Math.PI * 2;
    const dist = rand() * maxR * 0.6;
    const fx = cx + Math.cos(angle) * dist;
    const fy = cy + Math.sin(angle) * dist * 0.7;
    const fAngle = rand() * Math.PI;
    const fLen = maxR * (0.15 + rand() * 0.35);
    const fWidth = fLen * (0.08 + rand() * 0.15);

    g.save();
    g.translate(fx, fy);
    g.rotate(fAngle);

    const grad = g.createRadialGradient(0, 0, 0, 0, 0, fLen);
    grad.addColorStop(0, pickColor(0.10 + rand() * 0.06));
    grad.addColorStop(0.6, pickColor(0.04));
    grad.addColorStop(1, pickColor(0));
    g.fillStyle = grad;

    g.scale(1, fWidth / fLen);
    g.beginPath();
    g.arc(0, 0, fLen, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }
  g.restore();

  // Layer 3: Dense particle cloud — hundreds of tiny dots for texture
  for (let i = 0; i < 1000; i++) {
    const angle = rand() * Math.PI * 2;
    // Gaussian-ish distribution: sum of randoms
    const dist = (rand() + rand() + rand()) / 3 * maxR * 0.8;
    const px = cx + Math.cos(angle) * dist;
    const py = cy + Math.sin(angle) * dist * (0.5 + rand() * 0.4);

    const pSize = 0.5 + rand() * 3;
    const alpha = 0.04 + rand() * 0.10;

    g.fillStyle = pickColor(alpha);
    g.beginPath();
    g.arc(px, py, pSize, 0, Math.PI * 2);
    g.fill();

    // Some particles get a soft glow halo
    if (rand() > 0.7) {
      const haloR = pSize * (3 + rand() * 5);
      const hGrad = g.createRadialGradient(px, py, 0, px, py, haloR);
      hGrad.addColorStop(0, pickColor(alpha * 0.4));
      hGrad.addColorStop(1, pickColor(0));
      g.fillStyle = hGrad;
      g.fillRect(px - haloR, py - haloR, haloR * 2, haloR * 2);
    }
  }

  // Layer 3.5: Dark dust lanes — absorption features that cut through the gas
  g.save();
  g.globalCompositeOperation = 'multiply';
  for (let i = 0; i < 12; i++) {
    const angle = rand() * Math.PI;
    const dist = rand() * maxR * 0.45;
    const dx = cx + Math.cos(angle + 0.5) * dist;
    const dy = cy + Math.sin(angle + 0.5) * dist * 0.5;
    const dAngle = angle + (rand() - 0.5) * 0.6;
    const dLen = maxR * (0.2 + rand() * 0.3);
    const dWidth = dLen * (0.03 + rand() * 0.06);

    g.save();
    g.translate(dx, dy);
    g.rotate(dAngle);

    const dGrad = g.createRadialGradient(0, 0, 0, 0, 0, dLen);
    const darkAlpha = 0.3 + rand() * 0.4;
    dGrad.addColorStop(0, `rgba(5, 3, 10, ${darkAlpha})`);
    dGrad.addColorStop(0.7, `rgba(5, 3, 10, ${darkAlpha * 0.3})`);
    dGrad.addColorStop(1, `rgba(5, 3, 10, 0)`);
    g.fillStyle = dGrad;

    g.scale(1, dWidth / dLen);
    g.beginPath();
    g.arc(0, 0, dLen, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }
  g.restore();

  // Layer 4: Bright rim/edge highlights — the iconic glowing edges of Hubble nebulae
  for (let i = 0; i < 25; i++) {
    const angle = rand() * Math.PI * 2;
    const dist = maxR * (0.25 + rand() * 0.3);
    const ex = cx + Math.cos(angle) * dist;
    const ey = cy + Math.sin(angle) * dist * 0.6;
    const eSize = maxR * (0.05 + rand() * 0.1);

    const eGrad = g.createRadialGradient(ex, ey, 0, ex, ey, eSize);
    // Brighter, more saturated
    const ec = cfg.palette[0];
    const eHue = ec.h + (rand() - 0.5) * 30;
    eGrad.addColorStop(0, `hsla(${eHue}, 95%, 75%, ${0.15 + rand() * 0.1})`);
    eGrad.addColorStop(0.5, `hsla(${eHue}, 90%, 65%, 0.05)`);
    eGrad.addColorStop(1, `hsla(${eHue}, 90%, 65%, 0)`);
    g.fillStyle = eGrad;
    g.fillRect(ex - eSize, ey - eSize, eSize * 2, eSize * 2);
  }

  // Layer 5: Embedded stars within the nebula
  for (let i = 0; i < 20; i++) {
    const angle = rand() * Math.PI * 2;
    const dist = rand() * maxR * 0.6;
    const sx = cx + Math.cos(angle) * dist;
    const sy = cy + Math.sin(angle) * dist * 0.6;
    const sSize = 0.8 + rand() * 1.5;
    const sAlpha = 0.4 + rand() * 0.5;

    // Star core
    g.fillStyle = `rgba(255, 255, 255, ${sAlpha})`;
    g.beginPath();
    g.arc(sx, sy, sSize, 0, Math.PI * 2);
    g.fill();

    // Star glow
    const sGrad = g.createRadialGradient(sx, sy, 0, sx, sy, sSize * 6);
    const sHue = cfg.palette[Math.floor(rand() * cfg.palette.length)].h;
    sGrad.addColorStop(0, `hsla(${sHue}, 80%, 85%, ${sAlpha * 0.3})`);
    sGrad.addColorStop(1, `hsla(${sHue}, 80%, 85%, 0)`);
    g.fillStyle = sGrad;
    g.fillRect(sx - sSize * 6, sy - sSize * 6, sSize * 12, sSize * 12);
  }

  return c;
}

// ── Floating Cards ─────────────────────────────────────────────────
function initCards() {
  const container = document.getElementById('hero-cards');
  if (!container) return;
  container.innerHTML = '';
  cards = [];

  TOOLS.forEach((tool, i) => {
    const angle = (i / TOOLS.length) * Math.PI * 2 - Math.PI / 2;

    const card = document.createElement('button');
    card.className = 'hero-card';
    card.dataset.tab = tool.tab;
    card.style.setProperty('--card-color', tool.color);
    card.innerHTML = `
      <span class="hero-card__icon">${tool.icon}</span>
      <span class="hero-card__label">${tool.label}</span>
    `;

    card.addEventListener('click', () => {
      const tabBtn = document.querySelector(`.tab-btn[data-tab="${tool.tab}"]`);
      if (tabBtn) tabBtn.click();
    });

    card.addEventListener('mouseenter', () => { hoverCard = i; });
    card.addEventListener('mouseleave', () => { hoverCard = null; });

    container.appendChild(card);

    cards.push({
      el: card,
      baseAngle: angle,
      angle: angle,
      radiusX: 0.38,
      radiusY: 0.28,
      z: 0.4 + Math.random() * 0.3,
      orbitSpeed: 0.08 + Math.random() * 0.04,
      bobOffset: Math.random() * Math.PI * 2,
      bobSpeed: 0.6 + Math.random() * 0.3,
    });
  });
}

// ── Events ─────────────────────────────────────────────────────────
function bindEvents() {
  const hero = document.getElementById('home-hero');
  if (!hero) return;

  hero.addEventListener('mousemove', (e) => {
    const rect = hero.getBoundingClientRect();
    mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = ((e.clientY - rect.top) / rect.height) * 2 - 1;
    if (mouse.down) {
      camera.tx += (e.clientX - mouse.dragX) * 0.003;
      camera.ty += (e.clientY - mouse.dragY) * 0.003;
      mouse.dragX = e.clientX;
      mouse.dragY = e.clientY;
    }
  });

  hero.addEventListener('mousedown', (e) => {
    if (e.target.closest('.hero-card')) return;
    mouse.down = true;
    mouse.dragX = e.clientX;
    mouse.dragY = e.clientY;
    hero.style.cursor = 'grabbing';
  });

  window.addEventListener('mouseup', () => {
    mouse.down = false;
    const h = document.getElementById('home-hero');
    if (h) h.style.cursor = 'grab';
  });

  window.addEventListener('resize', resize);
}

function resize() {
  if (!canvas) return;
  const hero = document.getElementById('home-hero');
  if (!hero) return;
  W = hero.clientWidth;
  H = hero.clientHeight;
  canvas.width = W * devicePixelRatio;
  canvas.height = H * devicePixelRatio;
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';
  ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
}

// ── Animation Loop ─────────────────────────────────────────────────
function animate() {
  const hero = document.getElementById('home-hero');
  if (!hero || hero.closest('[hidden]')) {
    animId = requestAnimationFrame(animate);
    return;
  }

  const t = performance.now() * 0.001;

  camera.x += (camera.tx - camera.x) * 0.05;
  camera.y += (camera.ty - camera.y) * 0.05;

  drawScene(t);
  updateCards(t);

  animId = requestAnimationFrame(animate);
}

// ── Draw full scene ────────────────────────────────────────────────
function drawScene(t) {
  // Deep space background
  ctx.fillStyle = '#020112';
  ctx.fillRect(0, 0, W, H);

  const cx = W * 0.5 - camera.x * 30;
  const cy = H * 0.5 - camera.y * 30;
  const scale = W * 2; // galaxy coordinate scale

  // === Layer 0: Broad galactic haze — soft colored glow filling the arms ===
  const haze1 = ctx.createRadialGradient(cx, cy, 0, cx, cy, W * 0.45);
  haze1.addColorStop(0, 'rgba(180, 200, 255, 0.12)');
  haze1.addColorStop(0.2, 'rgba(100, 180, 255, 0.06)');
  haze1.addColorStop(0.5, 'rgba(80, 50, 180, 0.03)');
  haze1.addColorStop(0.8, 'rgba(160, 40, 180, 0.015)');
  haze1.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = haze1;
  ctx.fillRect(0, 0, W, H);

  // === Layer 1: Core glow — intense white-blue center ===
  const coreR = W * 0.15;
  const core1 = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR);
  core1.addColorStop(0, 'rgba(255, 252, 255, 0.45)');
  core1.addColorStop(0.08, 'rgba(220, 240, 255, 0.35)');
  core1.addColorStop(0.2, 'rgba(150, 200, 255, 0.2)');
  core1.addColorStop(0.5, 'rgba(80, 140, 255, 0.08)');
  core1.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = core1;
  ctx.fillRect(0, 0, W, H);

  // Second core layer — warmer ring
  const core2 = ctx.createRadialGradient(cx, cy, coreR * 0.1, cx, cy, coreR * 0.6);
  core2.addColorStop(0, 'rgba(255, 240, 220, 0.25)');
  core2.addColorStop(0.5, 'rgba(255, 200, 150, 0.08)');
  core2.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = core2;
  ctx.fillRect(0, 0, W, H);

  // === Layer 2: Background stars ===
  for (const s of stars) {
    const sx = (s.x - camera.x * 0.15) * W * 0.5 + W * 0.5;
    const sy = (s.y - camera.y * 0.15) * H * 0.5 + H * 0.5;
    const twinkle = 0.6 + Math.sin(t * s.twinkleSpeed + s.twinkleOffset) * 0.4;
    ctx.fillStyle = `rgba(255, 255, 255, ${s.alpha * twinkle})`;
    ctx.beginPath();
    ctx.arc(sx, sy, s.size, 0, Math.PI * 2);
    ctx.fill();
  }

  // === Layer 3: Dust clouds along arms ===
  for (const d of dustClouds) {
    const rot = t * d.speed;
    const a = d.baseAngle + rot;
    const r = d.baseRadius;
    const dx = Math.cos(a) * r;
    const dy = Math.sin(a) * r * 0.55;

    const px = (dx - camera.x * 0.4) * scale + W * 0.5;
    const py = (dy - camera.y * 0.4) * scale + H * 0.5;

    const grad = ctx.createRadialGradient(px, py, 0, px, py, d.size);
    grad.addColorStop(0, `hsla(${d.hue}, 85%, 60%, ${d.alpha})`);
    grad.addColorStop(0.5, `hsla(${d.hue}, 80%, 55%, ${d.alpha * 0.4})`);
    grad.addColorStop(1, `hsla(${d.hue}, 80%, 50%, 0)`);
    ctx.fillStyle = grad;
    ctx.fillRect(px - d.size, py - d.size, d.size * 2, d.size * 2);
  }

  // === Layer 4: Pre-rendered Hubble nebulae ===
  for (const n of nebulae) {
    const drift = t * n.driftSpeed;
    const nx = n.cx + Math.cos(n.driftAngle + drift) * 0.02;
    const ny = n.cy + Math.sin(n.driftAngle + drift) * 0.015;

    const px = (nx - camera.x * 0.25) * scale + W * 0.5;
    const py = (ny - camera.y * 0.25) * scale + H * 0.5;

    const breath = 1 + Math.sin(t * n.breathSpeed + n.breathOffset) * 0.06;
    const drawSize = Math.max(W, H) * 0.6 * breath;
    const alpha = 0.8 + Math.sin(t * n.breathSpeed * 0.5 + n.breathOffset) * 0.1;

    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(n.rotation + t * 0.008);
    ctx.globalAlpha = alpha;
    ctx.drawImage(n.canvas, -drawSize / 2, -drawSize / 2, drawSize, drawSize);
    ctx.restore();

    // Emission glow pass
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.translate(px, py);
    ctx.rotate(n.rotation + t * 0.008);
    ctx.globalAlpha = alpha * 0.35;
    ctx.drawImage(n.canvas, -drawSize / 2, -drawSize / 2, drawSize, drawSize);
    ctx.restore();
  }

  // === Layer 5: Spiral arm particles ===
  for (const p of spiralPts) {
    const rot = t * p.speed;
    const a = p.baseAngle + rot;
    const r = p.baseRadius;
    const dx = Math.cos(a) * r;
    const dy = Math.sin(a) * r * 0.55;

    const parallax = 0.3 + r * 2;
    const px = (dx - camera.x * 0.05 * parallax) * scale + W * 0.5;
    const py = (dy - camera.y * 0.05 * parallax) * scale + H * 0.5;

    const flicker = 0.8 + Math.sin(t * 1.5 + p.baseAngle * 10) * 0.2;
    const alpha = p.alpha * flicker;

    ctx.fillStyle = `hsla(${p.hue}, ${p.sat}%, ${p.light}%, ${alpha})`;
    ctx.beginPath();
    ctx.arc(px, py, p.size, 0, Math.PI * 2);
    ctx.fill();

    // Glow halo for brighter particles
    if (alpha > 0.35 && p.size > 0.7) {
      const glowR = p.size * 4;
      const gGrad = ctx.createRadialGradient(px, py, 0, px, py, glowR);
      gGrad.addColorStop(0, `hsla(${p.hue}, ${p.sat}%, ${p.light}%, ${alpha * 0.15})`);
      gGrad.addColorStop(1, `hsla(${p.hue}, ${p.sat}%, ${p.light}%, 0)`);
      ctx.fillStyle = gGrad;
      ctx.fillRect(px - glowR, py - glowR, glowR * 2, glowR * 2);
    }
  }

  // === Layer 6: Core particles — dense bright cluster ===
  for (const p of corePts) {
    const rot = t * p.speed;
    const a = p.baseAngle + rot;
    const r = p.baseRadius;
    const dx = Math.cos(a) * r;
    const dy = Math.sin(a) * r * 0.55;

    const px = (dx - camera.x * 0.02) * scale + W * 0.5;
    const py = (dy - camera.y * 0.02) * scale + H * 0.5;

    ctx.fillStyle = `hsla(${p.hue}, ${p.sat}%, ${p.light}%, ${p.alpha})`;
    ctx.beginPath();
    ctx.arc(px, py, p.size, 0, Math.PI * 2);
    ctx.fill();
  }

  // === Layer 7: Core bloom — bright central point ===
  const bloom = ctx.createRadialGradient(cx, cy, 0, cx, cy, 30);
  bloom.addColorStop(0, 'rgba(255, 255, 255, 0.6)');
  bloom.addColorStop(0.3, 'rgba(200, 220, 255, 0.2)');
  bloom.addColorStop(1, 'rgba(200, 220, 255, 0)');
  ctx.fillStyle = bloom;
  ctx.fillRect(cx - 30, cy - 30, 60, 60);

  // === Layer 8: Mouse-follow subtle accent ===
  const mx = W * 0.5 + mouse.x * W * 0.12;
  const my = H * 0.5 + mouse.y * H * 0.12;
  const mouseGlow = ctx.createRadialGradient(mx, my, 0, mx, my, W * 0.2);
  mouseGlow.addColorStop(0, 'rgba(0, 240, 255, 0.02)');
  mouseGlow.addColorStop(0.5, 'rgba(140, 60, 220, 0.01)');
  mouseGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = mouseGlow;
  ctx.fillRect(0, 0, W, H);
}

// ── Update card positions ──────────────────────────────────────────
function updateCards(t) {
  for (let i = 0; i < cards.length; i++) {
    const c = cards[i];
    c.angle = c.baseAngle + t * c.orbitSpeed * 0.1;

    const cx = W * 0.5;
    const cy = H * 0.5;

    const x = cx + Math.cos(c.angle) * W * c.radiusX;
    const y = cy + Math.sin(c.angle) * H * c.radiusY;

    const bob = Math.sin(t * c.bobSpeed + c.bobOffset) * 8;

    const parallax = 0.5 + c.z * 0.5;
    const px = x - camera.x * parallax * W * 0.1;
    const py = y + bob - camera.y * parallax * H * 0.1;

    const depthScale = 0.75 + Math.sin(c.angle) * 0.15;
    const isHovered = hoverCard === i;
    const scale = isHovered ? depthScale * 1.15 : depthScale;
    const zIndex = Math.round(depthScale * 10);

    c.el.style.transform = `translate(-50%, -50%) translate(${px}px, ${py}px) scale(${scale})`;
    c.el.style.zIndex = zIndex;
    c.el.style.opacity = 0.6 + depthScale * 0.4;
  }
}

// ── Cycling tagline ────────────────────────────────────────────────
const TAGLINES = [
  'Route anything, anywhere.',
  'Create anything, anytime.',
  'Control anything, anyhow.',
];

function initTagline() {
  const el = document.getElementById('hero-tagline');
  if (!el) return;
  let idx = 0;

  function show() {
    el.textContent = TAGLINES[idx];
    el.classList.remove('tagline--out');
    el.classList.add('tagline--in');
  }

  function cycle() {
    el.classList.remove('tagline--in');
    el.classList.add('tagline--out');
    setTimeout(() => {
      idx = (idx + 1) % TAGLINES.length;
      show();
    }, 600);
  }

  show();
  setInterval(cycle, 3500);
}
