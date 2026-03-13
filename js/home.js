// ── Home Tab – Hero Landing Page ──────────────────────────────────
import { $ } from './utils.js';

const panel = $('#home-panel');

export function init() {
  if (!panel) return;

  panel.innerHTML = `
    <div class="home-hero">
      <div class="home-hero__grid">
        <div></div><div></div><div></div><div></div><div></div>
      </div>
      <div class="home-hero__bg"></div>
      <div class="home-hero__overlay"></div>
      <div class="home-hero__content">
        <h1 class="home-hero__title">Your Wildest Musical Dreams Are Here</h1>
        <p class="home-hero__subtitle">Route. Control. Create.</p>
      </div>
    </div>
  `;
}
