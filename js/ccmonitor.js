// ── CC Monitor: real-time MIDI CC display ────────────────────────────
import { bus, $ } from './utils.js';

const STORAGE_KEY = 'cc-monitor-labels';

let panel = null;
let gridEl = null;
const ccState = new Map();   // cc# → { value, label, el, barEl, valEl }
let labels = {};              // cc# → user label string

function loadLabels() {
  try { labels = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch { labels = {}; }
}

function saveLabels() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(labels));
}

function onMidiMessage({ data, msgType }) {
  if (msgType !== 'cc') return;
  const cc = data[1];
  const val = data[2];

  if (!ccState.has(cc)) {
    addCC(cc, val);
  } else {
    updateCC(cc, val);
  }
}

function addCC(cc, val) {
  const row = document.createElement('div');
  row.className = 'ccm-row';

  const labelEl = document.createElement('input');
  labelEl.className = 'ccm-label';
  labelEl.type = 'text';
  labelEl.value = labels[cc] || '';
  labelEl.placeholder = 'CC ' + cc;
  labelEl.addEventListener('input', () => {
    labels[cc] = labelEl.value;
    saveLabels();
  });

  const ccNum = document.createElement('span');
  ccNum.className = 'ccm-cc';
  ccNum.textContent = 'CC ' + cc;

  const barWrap = document.createElement('div');
  barWrap.className = 'ccm-bar-wrap';

  const barFill = document.createElement('div');
  barFill.className = 'ccm-bar-fill';
  barFill.style.width = (val / 127 * 100) + '%';

  const valEl = document.createElement('span');
  valEl.className = 'ccm-value';
  valEl.textContent = val;

  barWrap.appendChild(barFill);

  row.appendChild(ccNum);
  row.appendChild(labelEl);
  row.appendChild(barWrap);
  row.appendChild(valEl);

  // Insert sorted by CC number
  const entries = [...ccState.entries()];
  let inserted = false;
  for (const [existingCC, state] of entries) {
    if (cc < existingCC) {
      gridEl.insertBefore(row, state.el);
      inserted = true;
      break;
    }
  }
  if (!inserted) gridEl.appendChild(row);

  ccState.set(cc, { value: val, el: row, barEl: barFill, valEl });
}

function updateCC(cc, val) {
  const state = ccState.get(cc);
  state.value = val;
  state.barEl.style.width = (val / 127 * 100) + '%';
  state.valEl.textContent = val;

  // Flash effect
  state.el.classList.remove('ccm-row--flash');
  void state.el.offsetWidth;
  state.el.classList.add('ccm-row--flash');
}

function clearAll() {
  ccState.clear();
  if (gridEl) gridEl.innerHTML = '';
}

export function init() {
  panel = $('#ccmonitor-panel');
  if (!panel) return;

  loadLabels();

  panel.innerHTML =
    '<div class="ccm-toolbar">' +
      '<span class="ccm-title">CC Monitor</span>' +
      '<span class="ccm-hint">Incoming CCs appear automatically</span>' +
      '<button class="btn btn--ghost ccm-clear" id="ccm-clear">Clear</button>' +
    '</div>' +
    '<div class="ccm-grid" id="ccm-grid"></div>';

  gridEl = panel.querySelector('#ccm-grid');

  panel.querySelector('#ccm-clear').addEventListener('click', clearAll);

  bus.on('midi:message', onMidiMessage);
}
