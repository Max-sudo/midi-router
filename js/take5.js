// ── Sequential Take 5 — Interactive Visual Panel ─────────────────────
import { bus, $ } from './utils.js';

/* ── Take 5 MIDI CC Map ──────────────────────────────────────────────
   Organized by panel section, matching the physical hardware layout.
   Each entry: { cc, label, type, section }
   type: 'knob' (continuous 0-127), 'switch' (on/off), 'select' (discrete)
*/
const SECTIONS = [
  // Row 1 left: LFOs
  {
    name: 'LFO 1', color: '#5e5ce6', row: 1,
    controls: [
      { cc: 75, label: 'Rate',     type: 'knob' },
      { cc: 76, label: 'Amount',   type: 'knob' },
      { cc: 77, label: 'Shape',    type: 'select' },
      { cc: 78, label: 'Sync',     type: 'switch' },
      { cc: 79, label: 'Reset',    type: 'switch' },
    ]
  },
  {
    name: 'LFO 2', color: '#8e8ce6', row: 1,
    controls: [
      { cc: 80, label: 'Rate',     type: 'knob' },
      { cc: 81, label: 'Amount',   type: 'knob' },
      { cc: 82, label: 'Shape',    type: 'select' },
      { cc: 83, label: 'Sync',     type: 'switch' },
      { cc: 84, label: 'Reset',    type: 'switch' },
    ]
  },
  // Row 1 right: Effects/Reverb/FilterEnv/AmpEnv stacked vertically
  {
    name: 'EFFECTS', color: '#ffd60a', row: 1, stack: 'right',
    controls: [
      { cc: 16, label: 'On/Off',   type: 'switch' },
      { cc: 17, label: 'Type',     type: 'select' },
      { cc: 18, label: 'Depth',    type: 'knob' },
      { cc: 19, label: 'Time',     type: 'knob' },
      { cc: 20, label: 'Feedback', type: 'knob' },
      { cc: 21, label: 'Clock',    type: 'switch' },
      { cc: 22, label: 'Tap Div',  type: 'select' },
    ]
  },
  {
    name: 'REVERB', color: '#ff9f0a', row: 1, stack: 'right',
    controls: [
      { cc: 23, label: 'On/Off',   type: 'switch' },
      { cc: 24, label: 'Mix',      type: 'knob' },
      { cc: 25, label: 'Size',     type: 'knob' },
      { cc: 26, label: 'Pre-Dly',  type: 'knob' },
      { cc: 27, label: 'Decay',    type: 'knob' },
      { cc: 28, label: 'Tone',     type: 'knob' },
    ]
  },
  {
    name: 'FILTER ENV', color: '#bf5af2', row: 1, stack: 'right',
    controls: [
      { cc: 45, label: 'Delay',    type: 'knob' },
      { cc: 46, label: 'Attack',   type: 'knob' },
      { cc: 47, label: 'Decay',    type: 'knob' },
      { cc: 48, label: 'Sustain',  type: 'knob' },
      { cc: 49, label: 'Release',  type: 'knob' },
      { cc: 50, label: 'Amount',   type: 'knob' },
      { cc: 51, label: 'Velocity', type: 'knob' },
    ]
  },
  {
    name: 'AMP ENV', color: '#ff2d55', row: 1, stack: 'right',
    controls: [
      { cc: 52, label: 'Delay',    type: 'knob' },
      { cc: 53, label: 'Attack',   type: 'knob' },
      { cc: 54, label: 'Decay',    type: 'knob' },
      { cc: 55, label: 'Sustain',  type: 'knob' },
      { cc: 56, label: 'Release',  type: 'knob' },
      { cc: 57, label: 'Amount',   type: 'knob' },
      { cc: 58, label: 'Velocity', type: 'knob' },
    ]
  },
  // Row 2: OSCs, Mixer, Filter
  {
    name: 'OSC 1', color: '#00f0ff', row: 2,
    controls: [
      { cc: 8,  label: 'Octave',   type: 'select' },
      { cc: 9,  label: 'Fine',     type: 'knob' },
      { cc: 10, label: 'Shape',    type: 'knob' },
      { cc: 40, label: 'Level',    type: 'knob' },
      { cc: 65, label: 'Glide',    type: 'knob' },
      { cc: 87, label: 'Key Trk',  type: 'switch' },
    ]
  },
  {
    name: 'OSC 2', color: '#64d2ff', row: 2,
    controls: [
      { cc: 13, label: 'Octave',   type: 'select' },
      { cc: 14, label: 'Fine',     type: 'knob' },
      { cc: 15, label: 'Shape',    type: 'knob' },
      { cc: 41, label: 'Level',    type: 'knob' },
      { cc: 66, label: 'Glide',    type: 'knob' },
      { cc: 88, label: 'Key Trk',  type: 'switch' },
    ]
  },
  {
    name: 'MIXER', color: '#30d158', row: 2,
    controls: [
      { cc: 42, label: 'Sub',      type: 'knob' },
      { cc: 43, label: 'Noise',    type: 'knob' },
      { cc: 39, label: 'Sync',     type: 'switch' },
    ]
  },
  {
    name: 'FILTER', color: '#ff9f0a', row: 2,
    controls: [
      { cc: 33, label: 'Cutoff',   type: 'knob', size: 'large' },
      { cc: 34, label: 'Resonance',type: 'knob' },
      { cc: 35, label: 'Drive',    type: 'knob' },
      { cc: 36, label: 'Key Trk',  type: 'knob' },
    ]
  },
  // Row 3: Perform
  {
    name: 'PERFORM', color: '#64d2ff', row: 3,
    controls: [
      { cc: 68, label: 'Glide',    type: 'switch' },
      { cc: 70, label: 'Unison',   type: 'switch' },
      { cc: 71, label: 'Uni Mode', type: 'select' },
      { cc: 72, label: 'Uni Dtune',type: 'knob' },
      { cc: 85, label: 'PB Up',    type: 'knob' },
      { cc: 86, label: 'PB Down',  type: 'knob' },
    ]
  },
];

/* ── State ────────────────────────────────────────────────────────── */
let panelEl = null;
let built = false;
const ccElements = new Map();  // cc# → { knobEl, valueEl, indicatorEl, type }
const ccValues = new Map();    // cc# → current value (0-127)

// Batch updates via rAF
const pendingCCs = new Map();
let updateRafId = null;

/* ── Build Panel ─────────────────────────────────────────────────── */

function buildPanel() {
  const container = $('#ccmonitor-panel');
  if (!container) return;

  panelEl = document.createElement('div');
  panelEl.className = 'take5-panel';
  panelEl.id = 'take5-panel';

  // Header
  const header = document.createElement('div');
  header.className = 'take5-header';
  header.innerHTML =
    '<button class="take5-toggle" id="take5-toggle">&#9654;</button>' +
    '<span class="take5-brand">Sequential</span>' +
    '<span class="take5-model">Take 5</span>' +
    '<span class="take5-status" id="take5-status">Waiting for MIDI…</span>';
  panelEl.appendChild(header);

  // Body (collapsible)
  const body = document.createElement('div');
  body.className = 'take5-body';
  body.id = 'take5-body';
  body.hidden = true;

  // Sections grouped by row
  const rows = new Map();
  for (const section of SECTIONS) {
    const r = section.row || 1;
    if (!rows.has(r)) rows.set(r, []);
    rows.get(r).push(section);
  }

  function buildSectionEl(section) {
    const sectionEl = document.createElement('div');
    sectionEl.className = 'take5-section';

    const sectionHead = document.createElement('div');
    sectionHead.className = 'take5-section-name';
    sectionHead.style.color = section.color;
    sectionHead.textContent = section.name;
    sectionEl.appendChild(sectionHead);

    const controlsRow = document.createElement('div');
    controlsRow.className = 'take5-controls';

    for (const ctrl of section.controls) {
      const controlEl = document.createElement('div');
      controlEl.className = 'take5-control';
      controlEl.dataset.cc = ctrl.cc;

      if (ctrl.type === 'knob') {
        const size = ctrl.size === 'large' ? 44 : 32;
        controlEl.appendChild(createKnobSVG(ctrl.cc, size, section.color));
      } else if (ctrl.type === 'switch') {
        controlEl.appendChild(createSwitch(ctrl.cc, section.color));
      } else if (ctrl.type === 'select') {
        controlEl.appendChild(createKnobSVG(ctrl.cc, 28, section.color));
      }

      const label = document.createElement('span');
      label.className = 'take5-label';
      label.textContent = ctrl.label;
      controlEl.appendChild(label);

      const value = document.createElement('span');
      value.className = 'take5-value';
      value.id = `take5-val-${ctrl.cc}`;
      value.textContent = '0';
      controlEl.appendChild(value);

      controlsRow.appendChild(controlEl);
      ccValues.set(ctrl.cc, 0);
    }

    sectionEl.appendChild(controlsRow);
    return sectionEl;
  }

  for (const [, rowSections] of [...rows.entries()].sort((a, b) => a[0] - b[0])) {
    const rowEl = document.createElement('div');
    rowEl.className = 'take5-row';

    // Separate normal sections from stacked sections
    const normal = rowSections.filter(s => !s.stack);
    const stacked = rowSections.filter(s => s.stack);

    for (const section of normal) {
      rowEl.appendChild(buildSectionEl(section));
    }

    if (stacked.length) {
      const stackEl = document.createElement('div');
      stackEl.className = 'take5-stack';
      for (const section of stacked) {
        stackEl.appendChild(buildSectionEl(section));
      }
      rowEl.appendChild(stackEl);
    }

    body.appendChild(rowEl);
  }

  panelEl.appendChild(body);

  // Insert before the analysis section or groups
  const analysisEl = container.querySelector('.ccm-analysis');
  const groupsEl = container.querySelector('.ccm-groups');
  const insertBefore = analysisEl || groupsEl;
  if (insertBefore) {
    container.insertBefore(panelEl, insertBefore);
  } else {
    container.appendChild(panelEl);
  }

  // Toggle
  header.querySelector('#take5-toggle').addEventListener('click', togglePanel);

  built = true;
}

/* ── SVG Knob ────────────────────────────────────────────────────── */

function createKnobSVG(cc, size, color) {
  const r = size / 2;
  const strokeW = size > 36 ? 3.5 : 2.5;
  const trackR = r - strokeW - 1;

  // Arc constants: 270° sweep, starting at 135° (bottom-left)
  const startAngle = 135;
  const endAngle = 405; // 135 + 270
  const arcLen = 270;

  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
  svg.classList.add('take5-knob');

  // Background track
  const trackPath = describeArc(r, r, trackR, startAngle, endAngle);
  const track = document.createElementNS(ns, 'path');
  track.setAttribute('d', trackPath);
  track.setAttribute('fill', 'none');
  track.setAttribute('stroke', 'rgba(255,255,255,0.08)');
  track.setAttribute('stroke-width', strokeW);
  track.setAttribute('stroke-linecap', 'round');
  svg.appendChild(track);

  // Value arc (filled portion)
  const valueArc = document.createElementNS(ns, 'path');
  valueArc.setAttribute('d', trackPath); // Will be updated
  valueArc.setAttribute('fill', 'none');
  valueArc.setAttribute('stroke', color);
  valueArc.setAttribute('stroke-width', strokeW);
  valueArc.setAttribute('stroke-linecap', 'round');
  valueArc.setAttribute('opacity', '0.9');
  valueArc.id = `take5-arc-${cc}`;
  svg.appendChild(valueArc);

  // Center dot
  const dot = document.createElementNS(ns, 'circle');
  dot.setAttribute('cx', r);
  dot.setAttribute('cy', r);
  dot.setAttribute('r', trackR - strokeW - 1);
  dot.setAttribute('fill', '#1a1a22');
  dot.setAttribute('stroke', 'rgba(255,255,255,0.06)');
  dot.setAttribute('stroke-width', '0.5');
  svg.appendChild(dot);

  // Indicator line
  const indicator = document.createElementNS(ns, 'line');
  indicator.setAttribute('stroke', color);
  indicator.setAttribute('stroke-width', size > 36 ? 2 : 1.5);
  indicator.setAttribute('stroke-linecap', 'round');
  indicator.id = `take5-ind-${cc}`;
  svg.appendChild(indicator);

  // Store references
  ccElements.set(cc, {
    type: 'knob',
    arcEl: valueArc,
    indicatorEl: indicator,
    valueEl: null, // set after DOM insertion
    size,
    trackR,
    strokeW,
    color,
  });

  // Set initial position
  requestAnimationFrame(() => updateKnob(cc, 0));

  return svg;
}

function createSwitch(cc, color) {
  const el = document.createElement('div');
  el.className = 'take5-switch';
  el.id = `take5-sw-${cc}`;
  el.style.setProperty('--sw-color', color);

  ccElements.set(cc, {
    type: 'switch',
    switchEl: el,
    valueEl: null,
    color,
  });

  return el;
}

/* ── Arc math ────────────────────────────────────────────────────── */

function polarToCartesian(cx, cy, r, angleDeg) {
  const rad = (angleDeg - 90) * Math.PI / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function describeArc(cx, cy, r, startAngle, endAngle) {
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const sweep = endAngle - startAngle;
  const largeArc = sweep > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 0 ${end.x} ${end.y}`;
}

/* ── Update controls ─────────────────────────────────────────────── */

function updateKnob(cc, val) {
  const el = ccElements.get(cc);
  if (!el || el.type !== 'knob') return;

  const { arcEl, indicatorEl, size, trackR, strokeW } = el;
  const r = size / 2;
  const pct = val / 127;

  // Update value arc
  const startAngle = 135;
  const currentAngle = startAngle + pct * 270;
  if (pct > 0.005) {
    const path = describeArc(r, r, trackR, startAngle, currentAngle);
    arcEl.setAttribute('d', path);
    arcEl.style.display = '';
  } else {
    arcEl.style.display = 'none';
  }

  // Update indicator line
  const innerR = trackR - strokeW - 2;
  const outerR = trackR - 1;
  const angle = startAngle + pct * 270;
  const inner = polarToCartesian(r, r, Math.max(2, innerR - 2), angle);
  const outer = polarToCartesian(r, r, outerR, angle);
  indicatorEl.setAttribute('x1', inner.x);
  indicatorEl.setAttribute('y1', inner.y);
  indicatorEl.setAttribute('x2', outer.x);
  indicatorEl.setAttribute('y2', outer.y);

  // Update value text
  const valEl = document.getElementById(`take5-val-${cc}`);
  if (valEl) valEl.textContent = val;
}

function updateSwitch(cc, val) {
  const el = ccElements.get(cc);
  if (!el || el.type !== 'switch') return;
  const on = val >= 64;
  el.switchEl.classList.toggle('take5-switch--on', on);

  const valEl = document.getElementById(`take5-val-${cc}`);
  if (valEl) valEl.textContent = on ? 'ON' : 'OFF';
}

function updateControl(cc, val) {
  ccValues.set(cc, val);
  const el = ccElements.get(cc);
  if (!el) return;

  if (el.type === 'knob') updateKnob(cc, val);
  else if (el.type === 'switch') updateSwitch(cc, val);
}

/* ── MIDI handler ────────────────────────────────────────────────── */

function onMidiMessage({ data, msgType }) {
  if (msgType !== 'cc') return;
  const cc = data[1];
  const val = data[2];

  if (!ccValues.has(cc)) return; // Not a Take 5 CC

  pendingCCs.set(cc, val);
  if (!updateRafId) {
    updateRafId = requestAnimationFrame(flushCCUpdates);
  }
}

function flushCCUpdates() {
  updateRafId = null;
  let anyUpdate = false;
  for (const [cc, val] of pendingCCs) {
    updateControl(cc, val);
    anyUpdate = true;
  }
  pendingCCs.clear();

  if (anyUpdate) {
    const statusEl = document.getElementById('take5-status');
    if (statusEl) statusEl.textContent = 'Receiving';
  }
}

/* ── Toggle ──────────────────────────────────────────────────────── */

let panelCollapsed = true;

function togglePanel() {
  panelCollapsed = !panelCollapsed;
  const body = document.getElementById('take5-body');
  const btn = document.getElementById('take5-toggle');
  if (body) body.hidden = panelCollapsed;
  if (btn) btn.textContent = panelCollapsed ? '\u25B6' : '\u25BC';
}

/* ── Preset for ccmonitor ────────────────────────────────────────── */

export function getTake5Preset() {
  const preset = {};
  for (const section of SECTIONS) {
    const ccs = {};
    for (const ctrl of section.controls) {
      ccs[ctrl.cc] = ctrl.label;
    }
    preset[section.name] = {
      color: SECTIONS.indexOf(section) % 8,
      icon: section.name,
      ccs,
    };
  }
  return preset;
}

/* ── Init ─────────────────────────────────────────────────────────── */

export function init() {
  // Build on next frame to ensure ccmonitor has initialized
  requestAnimationFrame(() => {
    buildPanel();
  });

  bus.on('midi:message', onMidiMessage);
}
