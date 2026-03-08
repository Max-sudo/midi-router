// ── Tab switching ──────────────────────────────────────────────────
import { bus, $, $$ } from './utils.js';

let activeTab = 'midi';

export function getActiveTab() {
  return activeTab;
}

export function switchTo(tabId) {
  if (tabId === activeTab) return;

  // Update tab buttons
  for (const btn of $$('.tab-btn')) {
    btn.classList.toggle('tab-btn--active', btn.dataset.tab === tabId);
  }

  // Update tab content panels
  for (const panel of $$('.tab-content')) {
    panel.hidden = panel.id !== `tab-${tabId}`;
  }

  // Update header controls (show only controls for active tab)
  for (const controls of $$('.tab-controls')) {
    controls.hidden = controls.dataset.tab !== tabId;
  }

  activeTab = tabId;
  bus.emit('tab:changed', tabId);
}

export function init() {
  for (const btn of $$('.tab-btn')) {
    btn.addEventListener('click', () => switchTo(btn.dataset.tab));
  }
}
