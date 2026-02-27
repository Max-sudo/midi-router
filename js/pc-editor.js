// ── Program Change Editor Panel ────────────────────────────────────
import { bus, $ } from './utils.js';
import * as midi from './midi.js';

const panel    = $('#pc-editor');
const closeBtn = $('#pc-editor-close');
const addBtn   = $('#pc-add');
const body     = $('#pc-editor-body');
const emptyMsg = $('#pc-editor-empty');
const toggleBtn = $('#pc-editor-toggle');

let rows = []; // [{ el, outputSel, channelIn, programIn }]
let _justOpened = false;

// ── Row management ────────────────────────────────────────────────
function addRow(data = {}) {
  const row = document.createElement('div');
  row.className = 'pc-row';

  // Output device dropdown
  const outputSel = document.createElement('select');
  outputSel.className = 'dropdown pc-row__output';
  populateOutputDropdown(outputSel, data.outputId);

  // Channel input
  const chLabel = document.createElement('span');
  chLabel.className = 'pc-row__label';
  chLabel.textContent = 'Ch';

  const channelIn = document.createElement('input');
  channelIn.type = 'number';
  channelIn.className = 'pc-row__input';
  channelIn.min = 1;
  channelIn.max = 16;
  channelIn.value = data.channel || 1;
  channelIn.title = 'MIDI channel (1-16)';

  // Program number input
  const pcLabel = document.createElement('span');
  pcLabel.className = 'pc-row__label';
  pcLabel.textContent = 'PC';

  const programIn = document.createElement('input');
  programIn.type = 'number';
  programIn.className = 'pc-row__input';
  programIn.min = 0;
  programIn.max = 127;
  programIn.value = data.program ?? 0;
  programIn.title = 'Program number (0-127)';

  // Remove button
  const removeBtn = document.createElement('button');
  removeBtn.className = 'pc-row__remove';
  removeBtn.innerHTML = '&times;';
  removeBtn.title = 'Remove';
  removeBtn.addEventListener('click', () => {
    const idx = rows.findIndex(r => r.el === row);
    if (idx >= 0) rows.splice(idx, 1);
    row.remove();
    updateEmptyState();
  });

  row.appendChild(outputSel);
  row.appendChild(chLabel);
  row.appendChild(channelIn);
  row.appendChild(pcLabel);
  row.appendChild(programIn);
  row.appendChild(removeBtn);

  body.appendChild(row);
  rows.push({ el: row, outputSel, channelIn, programIn });
  updateEmptyState();
}

function populateOutputDropdown(sel, selectedId) {
  sel.innerHTML = '';
  const devices = midi.getDevices();
  if (devices.outputs.length === 0) {
    sel.appendChild(new Option('No outputs', ''));
    sel.options[0].disabled = true;
    return;
  }
  for (const d of devices.outputs) {
    sel.appendChild(new Option(d.name, d.id));
  }
  if (selectedId) {
    const exists = devices.outputs.find(d => d.id === selectedId);
    if (exists) sel.value = selectedId;
  }
}

function updateEmptyState() {
  emptyMsg.hidden = rows.length > 0;
}

// ── Open / Close ──────────────────────────────────────────────────
function open() {
  // Refresh output dropdowns with current devices
  for (const row of rows) {
    const currentVal = row.outputSel.value;
    populateOutputDropdown(row.outputSel, currentVal);
  }
  panel.hidden = false;
  _justOpened = true;
  requestAnimationFrame(() => { _justOpened = false; });
}

function close() {
  panel.hidden = true;
}

function toggle() {
  if (panel.hidden) {
    open();
  } else {
    close();
  }
}

// ── Public API ────────────────────────────────────────────────────
export function getProgramChanges() {
  const devices = midi.getDevices();
  return rows.map(r => {
    const outputId = r.outputSel.value;
    const device = devices.outputs.find(d => d.id === outputId);
    return {
      outputId,
      outputName: device ? device.name : '',
      channel: clamp(parseInt(r.channelIn.value) || 1, 1, 16),
      program: clamp(parseInt(r.programIn.value) || 0, 0, 127),
    };
  }).filter(pc => pc.outputId); // skip rows with no output selected
}

export function setProgramChanges(list) {
  // Clear existing rows
  for (const r of rows) r.el.remove();
  rows = [];

  if (list && list.length > 0) {
    for (const pc of list) {
      addRow(pc);
    }
  }
  updateEmptyState();
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

// ── Init ──────────────────────────────────────────────────────────
export function init() {
  toggleBtn.addEventListener('click', toggle);
  closeBtn.addEventListener('click', close);
  addBtn.addEventListener('click', () => addRow());

  // Escape key closes
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !panel.hidden) close();
  });

  // Click outside closes
  document.addEventListener('click', (e) => {
    if (_justOpened) return;
    if (!panel.hidden && !panel.contains(e.target) && e.target !== toggleBtn) {
      close();
    }
  });

  // Refresh dropdowns when devices change
  bus.on('midi:devices-changed', () => {
    for (const row of rows) {
      const currentVal = row.outputSel.value;
      populateOutputDropdown(row.outputSel, currentVal);
    }
  });
}
