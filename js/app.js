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

import * as launchpad from './launchpad.js';
import * as home from './home.js';
import * as chat from './chat.js';
import * as leadsheets from './leadsheets.js';
import * as ccmonitor from './ccmonitor.js';
import * as audioAnalysis from './audio-analysis.js';
import * as take5 from './take5.js';
import * as cosmicComet from './cosmic-comet.js';


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
  chat.init();
  splits.init();
  patchbay.init();
  router.init();
  keyboard.init();
  routeEditor.init();
  pcEditor.init();

  launchpad.init();
  leadsheets.init();
  ccmonitor.init();
  audioAnalysis.init();
  take5.init();
  cosmicComet.init();

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
  setStatus('error', msg, true);
}

function onDevicesChanged(devices) {
  const total = devices.inputs.length + devices.outputs.length;
  setStatus('connected', `${total} device${total !== 1 ? 's' : ''} found`);
}

// ── Status bar ─────────────────────────────────────────────────────
function setStatus(state, text, showHelp = false) {
  statusDot.className = 'status-bar__dot';
  if (state === 'connected') statusDot.classList.add('status-bar__dot--connected');
  else if (state === 'error') statusDot.classList.add('status-bar__dot--error');
  statusText.textContent = text;

  // Add or remove help link
  let helpLink = document.getElementById('midi-help-link');
  if (showHelp && !helpLink) {
    helpLink = document.createElement('button');
    helpLink.id = 'midi-help-link';
    helpLink.className = 'status-bar__help';
    helpLink.textContent = 'Fix';
    helpLink.addEventListener('click', toggleMidiHelp);
    statusText.parentElement.appendChild(helpLink);
  } else if (!showHelp && helpLink) {
    helpLink.remove();
    const popup = document.getElementById('midi-help-popup');
    if (popup) popup.remove();
  }
}

function toggleMidiHelp() {
  let popup = document.getElementById('midi-help-popup');
  if (popup) { popup.remove(); return; }

  popup = document.createElement('div');
  popup.id = 'midi-help-popup';
  popup.className = 'midi-help-popup';
  popup.innerHTML =
    '<p>Your browser may be blocking MIDI access.</p>' +
    '<p>Check your browser settings and make sure MIDI devices are allowed for this site, then reload the page.</p>';

  const bar = document.getElementById('status-bar');
  bar.appendChild(popup);

  // Close on click outside
  setTimeout(() => {
    document.addEventListener('click', function closeMidiHelp(e) {
      if (!popup.contains(e.target) && e.target.id !== 'midi-help-link') {
        popup.remove();
        document.removeEventListener('click', closeMidiHelp);
      }
    });
  }, 0);
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

// ── Service worker (offline lead sheets) ──────────────────────────
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).catch(() => {});
}

// ── Launch ─────────────────────────────────────────────────────────
boot();
