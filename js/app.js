// ── Studio Tools – App Entry Point ─────────────────────────────────
import { bus, $ } from './utils.js';
import * as tabs from './tabs.js';
import * as midi from './midi.js';
import * as patchbay from './patchbay.js';
import * as router from './router.js';
import * as keyboard from './keyboard.js';
import * as routeEditor from './route-editor.js';
import * as presets from './presets.js';
import * as splits from './splits.js';
import * as pcEditor from './pc-editor.js';
import * as avsync from './avsync.js';
import * as launchpad from './launchpad.js';
import * as home from './home.js';

// ── DOM references ─────────────────────────────────────────────────
const statusDot      = $('#midi-status-dot');
const statusText     = $('#midi-status-text');
const routeCount     = $('#route-count');
const toastContainer = $('#toast-container');

// ── Boot sequence ──────────────────────────────────────────────────
async function boot() {
  // 1. Event listeners
  bus.on('midi:ready', onMidiReady);
  bus.on('midi:error', onMidiError);
  bus.on('midi:devices-changed', onDevicesChanged);

  // 2. Init modules (they subscribe to bus events internally)
  tabs.init();
  home.init();
  splits.init();
  patchbay.init();
  router.init();
  keyboard.init();
  routeEditor.init();
  pcEditor.init();
  avsync.init();
  launchpad.init();
  presets.init();

  // 3. Web MIDI (triggers midi:ready → modules react)
  const ok = await midi.init();
  if (!ok) return;
}

// ── MIDI event handlers ────────────────────────────────────────────
function onMidiReady(devices) {
  const total = devices.inputs.length + devices.outputs.length;
  setStatus('connected', `${total} device${total !== 1 ? 's' : ''} found`);
  console.log('[MIDI Router] Devices:', devices);
}

function onMidiError(msg) {
  setStatus('error', msg);
}

function onDevicesChanged(devices) {
  const total = devices.inputs.length + devices.outputs.length;
  setStatus('connected', `${total} device${total !== 1 ? 's' : ''} found`);
}

// ── Status bar ─────────────────────────────────────────────────────
function setStatus(state, text) {
  statusDot.className = 'status-bar__dot';
  if (state === 'connected') statusDot.classList.add('status-bar__dot--connected');
  else if (state === 'error') statusDot.classList.add('status-bar__dot--error');
  statusText.textContent = text;
}

// ── Route count ────────────────────────────────────────────────────
bus.on('routes:count-changed', (count) => {
  routeCount.textContent = count;
});

// ── Toast notifications ────────────────────────────────────────────
bus.on('toast', (message) => {
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  toastContainer.appendChild(toast);
  toast.style.animation = 'slide-up 300ms ease forwards';
  setTimeout(() => {
    toast.style.animation = 'fade-out 300ms ease forwards';
    toast.addEventListener('animationend', () => toast.remove());
  }, 2500);
});

// ── Split controls ──────────────────────────────────────────────────
const splitAddBtn    = $('#split-add');
const splitRemoveBtn = $('#split-remove');
const splitLabel     = $('#split-label');

splitAddBtn.addEventListener('click', () => {
  splits.addSplit();
  const routeCount = router.getAllRoutes().length;
  if (routeCount > 0) {
    bus.emit('toast', 'Click a cable to assign it to a zone');
  }
});
splitRemoveBtn.addEventListener('click', () => splits.removeSplit());

function updateSplitControls({ splitCount }) {
  splitAddBtn.disabled = splitCount >= 2;
  splitRemoveBtn.disabled = splitCount <= 0;
  if (splitCount === 0) splitLabel.textContent = 'No splits';
  else if (splitCount === 1) splitLabel.textContent = '1 split · 2 zones';
  else splitLabel.textContent = '2 splits · 3 zones';
}

bus.on('splits:changed', updateSplitControls);
// Set initial state
updateSplitControls({ splitCount: splits.getCount() });

// ── Clear all routes ──────────────────────────────────────────────
$('#clear-routes').addEventListener('click', () => {
  const count = router.getAllRoutes().length;
  if (count === 0) return;
  router.clearAllRoutes();
  routeEditor.close();
  bus.emit('toast', `Cleared ${count} route${count !== 1 ? 's' : ''}`);
});

// ── Keyboard shortcut: Delete selected route ───────────────────────
document.addEventListener('keydown', (e) => {
  if (e.key === 'Delete' || e.key === 'Backspace') {
    // Only if not typing in an input
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
    // Handled by route-editor if open
  }
});

// ── Launch ─────────────────────────────────────────────────────────
boot();
