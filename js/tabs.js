// ── Tab switching ──────────────────────────────────────────────────
import { bus, $, $$ } from './utils.js';

let activeTab = 'home';

// Core tabs that cannot be deleted
const CORE_TABS = new Set(['home', 'chat', 'midi', 'launchpad', 'leadsheets', 'ccmonitor']);

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

export async function removeTab(tabId) {
  if (CORE_TABS.has(tabId)) return;

  // If we're deleting the active tab, switch to home first
  if (activeTab === tabId) {
    switchTo('home');
  }

  // Remove from DOM
  const btn = $(`.tab-btn[data-tab="${tabId}"]`);
  const panel = $(`#tab-${tabId}`);
  const controls = $(`.tab-controls[data-tab="${tabId}"]`);
  if (btn) btn.remove();
  if (panel) panel.remove();
  if (controls) controls.remove();

  // Permanently remove from source files via backend
  try {
    await fetch(`/api/tabs/${encodeURIComponent(tabId)}`, { method: 'DELETE' });
  } catch (e) {
    console.warn('Failed to delete tab from source:', e);
  }

  bus.emit('toast', `Removed tab`);
}

export function addTab(tabId, label, contentHtml = '') {
  // Check if tab already exists
  if ($(`.tab-btn[data-tab="${tabId}"]`)) {
    switchTo(tabId);
    return;
  }

  // Create tab button
  const btn = document.createElement('button');
  btn.className = 'tab-btn';
  btn.dataset.tab = tabId;
  btn.textContent = label;
  btn.addEventListener('click', () => switchTo(tabId));
  _addCloseButton(btn);
  $('.header__tabs').appendChild(btn);

  // Create tab content panel
  const panel = document.createElement('div');
  panel.className = 'tab-content';
  panel.id = `tab-${tabId}`;
  panel.hidden = true;
  if (contentHtml) panel.innerHTML = contentHtml;
  // Insert before the closing </main> — after last tab-content
  const allPanels = $$('.tab-content');
  const lastPanel = allPanels[allPanels.length - 1];
  if (lastPanel) lastPanel.parentNode.insertBefore(panel, lastPanel.nextSibling);

  // Switch to new tab
  switchTo(tabId);

  return panel;
}

export function init() {
  for (const btn of $$('.tab-btn')) {
    btn.addEventListener('click', () => switchTo(btn.dataset.tab));
    _addCloseButton(btn);
  }
}

function _addCloseButton(btn) {
  const tabId = btn.dataset.tab;
  if (CORE_TABS.has(tabId)) return;
  if (btn.querySelector('.tab-btn__close')) return;

  btn.classList.add('tab-btn--deletable');
  const closeBtn = document.createElement('span');
  closeBtn.className = 'tab-btn__close';
  closeBtn.innerHTML = '<svg width="8" height="8" viewBox="0 0 8 8" fill="none"><path d="M1 1l6 6M7 1L1 7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';
  closeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    removeTab(tabId);
  });
  btn.appendChild(closeBtn);
}
