// ── Home Tab – Studio Hero ───────────────────────────────────────────
import { $, bus } from './utils.js';

const panel = $('#home-panel');

const SUBTITLES = [
  'Route anything, anywhere.',
  'Create anything, anytime.',
  'Control anything, anyhow.',
];

export function init() {
  if (!panel) return;

  panel.innerHTML = `
    <div class="home-hero" id="home-hero">
      <div class="home-hero__overlay"></div>
      <div class="home-hero__content" id="hero-content">
        <h1 class="home-hero__title">Your wildest musical dreams are here.</h1>
        <p class="home-hero__subtitle" id="hero-subtitle"></p>
      </div>
    </div>
  `;

  initSubtitles();
}

function initSubtitles() {
  const el = document.getElementById('hero-subtitle');
  if (!el) return;
  let idx = 0;

  function show() {
    el.textContent = SUBTITLES[idx];
    el.classList.remove('subtitle--out');
    el.classList.add('subtitle--in');
  }

  function cycle() {
    el.classList.remove('subtitle--in');
    el.classList.add('subtitle--out');
    setTimeout(() => {
      idx = (idx + 1) % SUBTITLES.length;
      show();
    }, 600);
  }

  show();
  setInterval(cycle, 3500);
}
