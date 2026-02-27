// ── 88-key Piano Keyboard Visualizer ───────────────────────────────
import { bus, $, createSVGElement, noteNumberToName } from './utils.js';
import * as splits from './splits.js';

const container = $('#keyboard-container');

// Piano range: A0 (21) to C8 (108) = 88 keys
const FIRST_NOTE = 21;
const LAST_NOTE  = 108;

// Key layout constants
const WHITE_KEY_W = 18;
const WHITE_KEY_H = 80;
const BLACK_KEY_W = 12;
const BLACK_KEY_H = 50;

let svgEl = null;
let svgWidth = 0;
const keyElements = new Map();   // note → SVG rect
const activeNotes = new Map();   // note → Set<color>

// Split marker elements
let splitGroup = null;
let splitMarker1 = null;
let splitMarker2 = null;
let splitLabel1 = null;
let splitLabel2 = null;
let zoneOverlays = { low: null, mid: null, high: null };

// Zone colors
const ZONE_COLORS = {
  low:  'rgba(0, 240, 255, 0.07)',
  mid:  'rgba(191, 90, 242, 0.07)',
  high: 'rgba(255, 159, 10, 0.07)',
};
export const ZONE_ACCENT = {
  low:  '#00f0ff',
  mid:  '#bf5af2',
  high: '#ff9f0a',
};

// ── Build keyboard SVG ─────────────────────────────────────────────
export function init() {
  build();
  bus.on('midi:message', onMidiMessage);
  bus.on('route:added',   rebuildOverlays);
  bus.on('route:removed', rebuildOverlays);
  bus.on('route:updated', rebuildOverlays);
  bus.on('splits:changed', onSplitsChanged);
}

function build() {
  let whiteCount = 0;
  for (let n = FIRST_NOTE; n <= LAST_NOTE; n++) {
    if (!isBlack(n)) whiteCount++;
  }
  svgWidth = whiteCount * WHITE_KEY_W;
  const svgHeight = WHITE_KEY_H + 20;

  svgEl = createSVGElement('svg', {
    class: 'keyboard-svg',
    viewBox: `0 0 ${svgWidth} ${svgHeight}`,
    width: '100%',
    height: '100%',
    preserveAspectRatio: 'xMidYMid meet',
  });

  // Zone background overlays (behind keys)
  const zoneBg = createSVGElement('g', { class: 'keyboard__zone-bg' });
  zoneOverlays.low  = createSVGElement('rect', { class: 'keyboard__zone', y: 0, height: WHITE_KEY_H, rx: 2 });
  zoneOverlays.mid  = createSVGElement('rect', { class: 'keyboard__zone', y: 0, height: WHITE_KEY_H, rx: 2 });
  zoneOverlays.high = createSVGElement('rect', { class: 'keyboard__zone', y: 0, height: WHITE_KEY_H, rx: 2 });
  zoneBg.appendChild(zoneOverlays.low);
  zoneBg.appendChild(zoneOverlays.mid);
  zoneBg.appendChild(zoneOverlays.high);
  svgEl.appendChild(zoneBg);

  // Route range overlay group
  const overlayGroup = createSVGElement('g', { class: 'keyboard__overlays' });
  svgEl.appendChild(overlayGroup);

  // Draw white keys
  let wx = 0;
  for (let n = FIRST_NOTE; n <= LAST_NOTE; n++) {
    if (isBlack(n)) continue;
    const rect = createSVGElement('rect', {
      class: 'keyboard__key keyboard__key--white',
      x: wx, y: 0,
      width: WHITE_KEY_W - 1, height: WHITE_KEY_H,
      rx: 2, 'data-note': n,
    });
    svgEl.appendChild(rect);
    keyElements.set(n, rect);
    wx += WHITE_KEY_W;
  }

  // Draw black keys
  wx = 0;
  for (let n = FIRST_NOTE; n <= LAST_NOTE; n++) {
    if (isBlack(n)) {
      const bx = wx - BLACK_KEY_W / 2 - 0.5;
      const rect = createSVGElement('rect', {
        class: 'keyboard__key keyboard__key--black',
        x: bx, y: 0,
        width: BLACK_KEY_W, height: BLACK_KEY_H,
        rx: 2, 'data-note': n,
      });
      svgEl.appendChild(rect);
      keyElements.set(n, rect);
    } else {
      wx += WHITE_KEY_W;
    }
  }

  // Split markers group (on top of keys)
  splitGroup = createSVGElement('g', { class: 'keyboard__splits' });

  splitMarker1 = createSVGElement('line', {
    class: 'keyboard__split-line keyboard__split-line--1',
    y1: 0, y2: WHITE_KEY_H, 'stroke-width': 2,
  });
  splitLabel1 = createSVGElement('text', {
    class: 'keyboard__split-label keyboard__split-label--1',
    y: WHITE_KEY_H + 13, 'font-size': '9', 'text-anchor': 'middle',
  });

  splitMarker2 = createSVGElement('line', {
    class: 'keyboard__split-line keyboard__split-line--2',
    y1: 0, y2: WHITE_KEY_H, 'stroke-width': 2,
  });
  splitLabel2 = createSVGElement('text', {
    class: 'keyboard__split-label keyboard__split-label--2',
    y: WHITE_KEY_H + 13, 'font-size': '9', 'text-anchor': 'middle',
  });

  splitGroup.appendChild(splitMarker1);
  splitGroup.appendChild(splitLabel1);
  splitGroup.appendChild(splitMarker2);
  splitGroup.appendChild(splitLabel2);
  svgEl.appendChild(splitGroup);

  container.innerHTML = '';
  container.appendChild(svgEl);

  updateSplitMarkers();
  initSplitDrag();
}

// ── Split marker positioning ───────────────────────────────────────
function updateSplitMarkers() {
  const count = splits.getCount();
  const x1 = getNoteX(splits.getSplit1());
  const x2 = getNoteX(splits.getSplit2());

  // Show/hide markers based on count
  const show1 = count >= 1;
  const show2 = count >= 2;

  splitMarker1.setAttribute('visibility', show1 ? 'visible' : 'hidden');
  splitLabel1.setAttribute('visibility', show1 ? 'visible' : 'hidden');
  splitMarker2.setAttribute('visibility', show2 ? 'visible' : 'hidden');
  splitLabel2.setAttribute('visibility', show2 ? 'visible' : 'hidden');

  if (show1) {
    splitMarker1.setAttribute('x1', x1);
    splitMarker1.setAttribute('x2', x1);
    splitLabel1.setAttribute('x', x1);
    splitLabel1.textContent = noteNumberToName(splits.getSplit1());
  }

  if (show2) {
    splitMarker2.setAttribute('x1', x2);
    splitMarker2.setAttribute('x2', x2);
    splitLabel2.setAttribute('x', x2);
    splitLabel2.textContent = noteNumberToName(splits.getSplit2());
  }

  // Zone backgrounds
  if (count === 0) {
    // No zones — hide all overlays
    zoneOverlays.low.setAttribute('width', 0);
    zoneOverlays.mid.setAttribute('width', 0);
    zoneOverlays.high.setAttribute('width', 0);
  } else if (count === 1) {
    // Two zones: low | high
    zoneOverlays.low.setAttribute('x', 0);
    zoneOverlays.low.setAttribute('width', Math.max(x1, 0));
    zoneOverlays.low.setAttribute('fill', ZONE_COLORS.low);

    zoneOverlays.mid.setAttribute('width', 0);

    zoneOverlays.high.setAttribute('x', x1);
    zoneOverlays.high.setAttribute('width', Math.max(svgWidth - x1, 0));
    zoneOverlays.high.setAttribute('fill', ZONE_COLORS.high);
  } else {
    // Three zones: low | mid | high
    zoneOverlays.low.setAttribute('x', 0);
    zoneOverlays.low.setAttribute('width', Math.max(x1, 0));
    zoneOverlays.low.setAttribute('fill', ZONE_COLORS.low);

    zoneOverlays.mid.setAttribute('x', x1);
    zoneOverlays.mid.setAttribute('width', Math.max(x2 - x1, 0));
    zoneOverlays.mid.setAttribute('fill', ZONE_COLORS.mid);

    zoneOverlays.high.setAttribute('x', x2);
    zoneOverlays.high.setAttribute('width', Math.max(svgWidth - x2, 0));
    zoneOverlays.high.setAttribute('fill', ZONE_COLORS.high);
  }
}

function onSplitsChanged() {
  if (svgEl) updateSplitMarkers();
}

// ── Draggable split markers ────────────────────────────────────────
function initSplitDrag() {
  let dragging = null;

  svgEl.addEventListener('pointerdown', (e) => {
    const count = splits.getCount();
    if (count >= 1 && (e.target === splitMarker1 || e.target === splitLabel1)) dragging = 'split1';
    else if (count >= 2 && (e.target === splitMarker2 || e.target === splitLabel2)) dragging = 'split2';
    else return;
    e.preventDefault();
    svgEl.setPointerCapture(e.pointerId);
    svgEl.style.cursor = 'ew-resize';
  });

  svgEl.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const note = xToNote(e);
    if (note === null) return;
    if (dragging === 'split1') splits.setSplit1(note);
    else splits.setSplit2(note);
  });

  svgEl.addEventListener('pointerup', (e) => {
    if (!dragging) return;
    dragging = null;
    svgEl.releasePointerCapture(e.pointerId);
    svgEl.style.cursor = '';
  });
}

function xToNote(e) {
  const svgRect = svgEl.getBoundingClientRect();
  const scaleX = svgWidth / svgRect.width;
  const svgX = (e.clientX - svgRect.left) * scaleX;

  let closest = FIRST_NOTE;
  let closestDist = Infinity;
  for (let n = FIRST_NOTE; n <= LAST_NOTE; n++) {
    if (isBlack(n)) continue;
    const dist = Math.abs(getNoteX(n) - svgX);
    if (dist < closestDist) {
      closestDist = dist;
      closest = n;
    }
  }
  return closest;
}

// ── Note highlight ─────────────────────────────────────────────────
function onMidiMessage({ data, msgType }) {
  if (msgType === 'noteon' && data[2] > 0) {
    highlightNote(data[1], '#00f0ff');
  } else if (msgType === 'noteoff' || (msgType === 'noteon' && data[2] === 0)) {
    unhighlightNote(data[1], '#00f0ff');
  }
}

export function highlightNote(note, color = '#00f0ff') {
  const el = keyElements.get(note);
  if (!el) return;
  if (!activeNotes.has(note)) activeNotes.set(note, new Set());
  activeNotes.get(note).add(color);
  el.style.fill = color;
  el.classList.add('keyboard__key--active');
}

export function unhighlightNote(note, color = '#00f0ff') {
  const el = keyElements.get(note);
  if (!el) return;
  const colors = activeNotes.get(note);
  if (colors) {
    colors.delete(color);
    if (colors.size === 0) {
      activeNotes.delete(note);
      el.style.fill = '';
      el.classList.remove('keyboard__key--active');
    } else {
      el.style.fill = [...colors][0];
    }
  }
}

// ── Range overlays ─────────────────────────────────────────────────
export function setRangeOverlays(routeRanges) {
  const overlayGroup = svgEl?.querySelector('.keyboard__overlays');
  if (!overlayGroup) return;
  overlayGroup.innerHTML = '';

  for (const { noteLow, noteHigh, color } of routeRanges) {
    const startX = getNoteX(noteLow);
    const endX   = getNoteX(noteHigh) + (isBlack(noteHigh) ? BLACK_KEY_W : WHITE_KEY_W - 1);
    const rect = createSVGElement('rect', {
      class: 'keyboard__range-overlay',
      x: startX, y: WHITE_KEY_H - 6,
      width: Math.max(endX - startX, 2), height: 6,
      rx: 2, fill: color, opacity: '0.6',
    });
    overlayGroup.appendChild(rect);
  }
}

function rebuildOverlays() {
  import('./router.js').then(router => {
    const routes = router.getAllRoutes();
    const ranges = routes
      .filter(r => r.enabled && (r.noteLow > 0 || r.noteHigh < 127))
      .map(r => ({ noteLow: r.noteLow, noteHigh: r.noteHigh, color: r.color }));
    setRangeOverlays(ranges);
  });
}

// ── Helpers ────────────────────────────────────────────────────────
function isBlack(note) {
  return [1, 3, 6, 8, 10].includes(note % 12);
}

export function getNoteX(note) {
  let wx = 0;
  for (let n = FIRST_NOTE; n < note; n++) {
    if (!isBlack(n)) wx += WHITE_KEY_W;
  }
  if (isBlack(note)) return wx - BLACK_KEY_W / 2 - 0.5;
  return wx;
}

// ── Drop-zone detection (for cable drag-to-zone) ──────────────────
export function getZoneAtClientX(clientX) {
  if (!svgEl) return null;
  const count = splits.getCount();
  if (count === 0) return 'all';

  const svgRect = svgEl.getBoundingClientRect();
  const scaleX = svgWidth / svgRect.width;
  const svgX = (clientX - svgRect.left) * scaleX;

  const x1 = getNoteX(splits.getSplit1());

  if (count === 1) {
    return svgX < x1 ? 'low' : 'high';
  }

  const x2 = getNoteX(splits.getSplit2());
  if (svgX < x1) return 'low';
  if (svgX < x2) return 'mid';
  return 'high';
}

export function highlightDropZone(zone) {
  container.classList.add('keyboard-container--drop-target');
  const activeZones = splits.getCount() === 0 ? [] : splits.getAvailableZones();
  for (const [key, el] of Object.entries(zoneOverlays)) {
    if (!activeZones.includes(key)) continue;
    if (key === zone) {
      el.setAttribute('fill', ZONE_COLORS[key].replace('0.07', '0.25'));
      el.classList.add('keyboard__zone--drop-hover');
    } else {
      el.setAttribute('fill', ZONE_COLORS[key]);
      el.classList.remove('keyboard__zone--drop-hover');
    }
  }
}

export function clearDropZone() {
  container.classList.remove('keyboard-container--drop-target');
  for (const [key, el] of Object.entries(zoneOverlays)) {
    el.classList.remove('keyboard__zone--drop-hover');
  }
  // Restore proper fills
  if (svgEl) updateSplitMarkers();
}

export function getContainerElement() {
  return container;
}

// ── Range selection mode ───────────────────────────────────────────
let selectCallback = null;
let selectLow = null;

export function startRangeSelect(callback) {
  selectCallback = callback;
  selectLow = null;
  container.classList.add('keyboard--selecting');

  const clickHandler = (e) => {
    const key = e.target.closest('[data-note]');
    if (!key) return;
    const note = parseInt(key.dataset.note);

    if (selectLow === null) {
      selectLow = note;
      highlightNote(note, '#ff9f0a');
    } else {
      const low  = Math.min(selectLow, note);
      const high = Math.max(selectLow, note);
      unhighlightNote(selectLow, '#ff9f0a');
      container.classList.remove('keyboard--selecting');
      svgEl.removeEventListener('click', clickHandler);
      selectCallback = null;
      callback(low, high);
    }
  };

  svgEl.addEventListener('click', clickHandler);
}
