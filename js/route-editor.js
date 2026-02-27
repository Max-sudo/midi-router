// ── Route Editor Panel ─────────────────────────────────────────────
import { bus, $, noteNumberToName } from './utils.js';
import * as router from './router.js';
import * as splits from './splits.js';
import { startRangeSelect } from './keyboard.js';

const panel      = $('#route-editor');
const title      = $('#route-editor-title');
const closeBtn   = $('#route-editor-close');
const deleteBtn  = $('#route-delete');
const zoneSel    = $('#route-zone');
const rangeField = $('#route-range-field');
const noteLow    = $('#route-note-low');
const noteHigh   = $('#route-note-high');
const channelIn  = $('#route-channel-in');
const channelOut = $('#route-channel-out');
const passCC     = $('#route-pass-cc');
const passPB     = $('#route-pass-pb');
const passPC     = $('#route-pass-pc');
const passAT     = $('#route-pass-at');
const selectBtn  = $('#route-select-range');

let currentRouteId = null;

// Zone display names
const ZONE_LABELS = {
  all:    'All (Full Range)',
  low:    'Low Zone',
  mid:    'Mid Zone',
  high:   'High Zone',
  custom: 'Custom Range',
};

// ── Populate channel dropdowns ─────────────────────────────────────
function populateChannels() {
  for (let ch = 1; ch <= 16; ch++) {
    channelIn.appendChild(new Option(`Channel ${ch}`, ch));
    channelOut.appendChild(new Option(`Channel ${ch}`, ch));
  }
}

// ── Zone helpers ───────────────────────────────────────────────────
function rebuildZoneOptions() {
  const current = zoneSel.value;
  zoneSel.innerHTML = '';

  zoneSel.appendChild(new Option(ZONE_LABELS.all, 'all'));

  const zones = splits.getAvailableZones();
  if (zones.length > 1) {
    for (const z of zones) {
      if (z === 'all') continue;
      zoneSel.appendChild(new Option(ZONE_LABELS[z], z));
    }
  }

  zoneSel.appendChild(new Option(ZONE_LABELS.custom, 'custom'));

  // Try to keep previous selection
  const options = [...zoneSel.options].map(o => o.value);
  if (options.includes(current)) {
    zoneSel.value = current;
  } else {
    zoneSel.value = 'all';
  }
}

function detectZone(low, high) {
  // Check 'all' first
  const allRange = splits.getZoneRange('all');
  if (low === allRange.noteLow && high === allRange.noteHigh) return 'all';

  // Check each available zone
  for (const z of splits.getAvailableZones()) {
    if (z === 'all') continue;
    const range = splits.getZoneRange(z);
    if (low === range.noteLow && high === range.noteHigh) return z;
  }
  return 'custom';
}

function updateRangeFieldVisibility() {
  const isCustom = zoneSel.value === 'custom';
  rangeField.style.display = isCustom ? '' : 'none';
}

function applyZoneToRange() {
  const zone = zoneSel.value;
  if (zone === 'custom') return;
  const range = splits.getZoneRange(zone);
  noteLow.value  = range.noteLow;
  noteHigh.value = range.noteHigh;
  saveChanges();
}

// ── Open / Close ───────────────────────────────────────────────────
export function open(routeId) {
  const route = router.getRoute(routeId);
  if (!route) return;
  currentRouteId = routeId;

  title.textContent = `Edit Route`;
  noteLow.value  = route.noteLow;
  noteHigh.value = route.noteHigh;
  channelIn.value  = route.channelIn  ?? '';
  channelOut.value = route.channelOut ?? '';
  passCC.checked = route.passCC;
  passPB.checked = route.passPitchBend;
  passPC.checked = route.passProgramChange;
  passAT.checked = route.passAftertouch;

  // Rebuild zone options and set from stored zone
  rebuildZoneOptions();
  zoneSel.value = route.zone || detectZone(route.noteLow, route.noteHigh);
  updateRangeFieldVisibility();

  panel.hidden = false;
  panel.classList.add('route-editor--open');
}

export function close() {
  currentRouteId = null;
  panel.hidden = true;
  panel.classList.remove('route-editor--open');
}

// ── Save changes on input ──────────────────────────────────────────
function saveChanges() {
  if (!currentRouteId) return;
  router.updateRoute(currentRouteId, {
    zone:       zoneSel.value,
    noteLow:    clamp(parseInt(noteLow.value) || 0, 0, 127),
    noteHigh:   clamp(parseInt(noteHigh.value) || 127, 0, 127),
    channelIn:  channelIn.value ? parseInt(channelIn.value) : null,
    channelOut: channelOut.value ? parseInt(channelOut.value) : null,
    passCC:             passCC.checked,
    passPitchBend:      passPB.checked,
    passProgramChange:  passPC.checked,
    passAftertouch:     passAT.checked,
  });
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

// ── Init ───────────────────────────────────────────────────────────
export function init() {
  populateChannels();
  rebuildZoneOptions();

  closeBtn.addEventListener('click', close);

  deleteBtn.addEventListener('click', () => {
    if (currentRouteId) {
      router.removeRoute(currentRouteId);
      close();
    }
  });

  // Zone selector
  zoneSel.addEventListener('change', () => {
    updateRangeFieldVisibility();
    applyZoneToRange();
  });

  // Real-time updates
  for (const el of [noteLow, noteHigh, channelIn, channelOut, passCC, passPB, passPC, passAT]) {
    el.addEventListener('change', () => {
      // If manual note range edit, switch zone to custom
      if (el === noteLow || el === noteHigh) {
        zoneSel.value = detectZone(
          parseInt(noteLow.value) || 0,
          parseInt(noteHigh.value) || 127,
        );
        updateRangeFieldVisibility();
      }
      saveChanges();
    });
    el.addEventListener('input', () => {
      if (el === noteLow || el === noteHigh) return; // wait for change
      saveChanges();
    });
  }

  // Select range on keyboard
  selectBtn.addEventListener('click', () => {
    startRangeSelect((low, high) => {
      noteLow.value  = low;
      noteHigh.value = high;
      zoneSel.value = detectZone(low, high);
      updateRangeFieldVisibility();
      saveChanges();
    });
  });

  // When splits change, rebuild zone options and refresh displayed range
  bus.on('splits:changed', () => {
    rebuildZoneOptions();
    if (!currentRouteId) return;
    const zone = zoneSel.value;
    if (zone !== 'custom' && zone !== 'all') {
      const range = splits.getZoneRange(zone);
      noteLow.value  = range.noteLow;
      noteHigh.value = range.noteHigh;
    }
  });

  // Open on cable click
  bus.on('patchbay:cable-click', (routeId) => {
    open(routeId);
  });

  // Close on route removal
  bus.on('route:removed', (route) => {
    if (route.id === currentRouteId) close();
  });

  // Escape key closes
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !panel.hidden) close();
  });
}
