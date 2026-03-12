// ── MIDI Map: visual LCXL → Helix CC mapping editor ──────────────────
import { bus, $ } from './utils.js';
import * as midi from './midi.js';

const STORAGE_KEY = 'midimap-presets';
const ACTIVE_PRESET_KEY = 'midimap-active-preset';

let panel = null;
let gridContainer = null;
let userPresets = {};
let activePresetName = '';
let learnTarget = null;       // slotId currently in learn mode
let learnAllQueue = null;     // array of slotIds for sequential learn
let midiHandler = null;       // bound handler ref for removeEventListener
let selectedInputId = null;   // LCXL input device id
let selectedOutputId = null;  // Helix output device id
const slotEls = new Map();    // slotId → { el, ccEl, labelInput, blockInput, valueFill, learnBtn }
const slotData = new Map();   // slotId → { sourceCC, label, block, lastValue }
const ccToSlot = new Map();   // sourceCC → slotId (reverse lookup for live updates)

// rAF batching for value updates
const pendingUpdates = new Map();
let rafId = null;

// ── Physical layout of the Launch Control XL ─────────────────────────
const LCXL_LAYOUT = [
  { type: 'knob',   label: 'Send A',        count: 8, row: 0 },
  { type: 'knob',   label: 'Send B',        count: 8, row: 1 },
  { type: 'knob',   label: 'Pan/Device',    count: 8, row: 2 },
  { type: 'fader',  label: 'Faders',        count: 8, row: 3 },
  { type: 'button', label: 'Track Focus',   count: 8, row: 4 },
  { type: 'button', label: 'Track Control', count: 8, row: 5 },
];

function makeSlotId(type, row, col) {
  return type + '-' + row + '-' + col;
}

/* ── Persistence ──────────────────────────────────────────────────── */
function loadPresets() {
  try {
    userPresets = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  } catch { userPresets = {}; }
}

function savePresetsToStorage() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(userPresets));
}

function snapshotSlots() {
  const slots = {};
  for (const [id, data] of slotData) {
    if (data.sourceCC !== null || data.label || data.block) {
      slots[id] = { ...data };
    }
  }
  return slots;
}

function applySlotData(slots) {
  ccToSlot.clear();
  for (const [id] of slotData) {
    slotData.set(id, { sourceCC: null, label: '', block: '', lastValue: 0 });
    const els = slotEls.get(id);
    if (els) {
      els.ccEl.textContent = 'CC --';
      els.labelInput.value = '';
      els.blockInput.value = '';
      els.valueFill.style.width = '0%';
      els.el.classList.remove('mm-slot--assigned');
    }
  }
  if (!slots) return;
  for (const [id, data] of Object.entries(slots)) {
    if (!slotData.has(id)) continue;
    slotData.set(id, { ...data });
    if (data.sourceCC !== null) ccToSlot.set(data.sourceCC, id);
    const els = slotEls.get(id);
    if (els) {
      els.ccEl.textContent = data.sourceCC !== null ? 'CC ' + data.sourceCC : 'CC --';
      els.labelInput.value = data.label || '';
      els.blockInput.value = data.block || '';
      els.valueFill.style.width = (data.lastValue / 127 * 100) + '%';
      if (data.sourceCC !== null) els.el.classList.add('mm-slot--assigned');
    }
  }
}

/* ── Preset system ────────────────────────────────────────────────── */
function rebuildPresetDropdown(selectValue) {
  const sel = panel.querySelector('#mm-preset-select');
  if (!sel) return;
  let html = '<option value="">— Presets —</option>';
  for (const name of Object.keys(userPresets)) {
    html += '<option value="' + name + '">' + name + '</option>';
  }
  sel.innerHTML = html;
  if (selectValue) sel.value = selectValue;
}

function loadPreset(name) {
  const preset = userPresets[name];
  if (!preset) return;
  activePresetName = name;
  localStorage.setItem(ACTIVE_PRESET_KEY, name);
  applySlotData(preset.slots);
  if (preset.lcxlInputId) {
    selectedInputId = preset.lcxlInputId;
    const inSel = panel.querySelector('#mm-input-select');
    if (inSel) inSel.value = selectedInputId;
  }
  if (preset.helixOutputId) {
    selectedOutputId = preset.helixOutputId;
    const outSel = panel.querySelector('#mm-output-select');
    if (outSel) outSel.value = selectedOutputId;
  }
  rebuildPresetDropdown(name);
  attachMidiListener();
}

function flashBtn(btnEl, text) {
  const orig = btnEl.textContent;
  btnEl.textContent = text;
  btnEl.classList.add('mm-btn--confirmed');
  setTimeout(() => {
    btnEl.textContent = orig;
    btnEl.classList.remove('mm-btn--confirmed');
  }, 1200);
}

function savePreset() {
  if (!activePresetName) { savePresetAs(); return; }
  userPresets[activePresetName] = {
    lcxlInputId: selectedInputId,
    helixOutputId: selectedOutputId,
    slots: snapshotSlots(),
  };
  savePresetsToStorage();
  rebuildPresetDropdown(activePresetName);
  const btn = panel.querySelector('#mm-save-preset');
  if (btn) flashBtn(btn, 'Saved!');
}

function savePresetAs() {
  const name = prompt('Preset name:', activePresetName || '');
  if (!name || !name.trim()) return;
  const key = name.trim();
  userPresets[key] = {
    lcxlInputId: selectedInputId,
    helixOutputId: selectedOutputId,
    slots: snapshotSlots(),
  };
  savePresetsToStorage();
  activePresetName = key;
  localStorage.setItem(ACTIVE_PRESET_KEY, key);
  rebuildPresetDropdown(key);
  const btn = panel.querySelector('#mm-save-as-preset');
  if (btn) flashBtn(btn, 'Saved!');
}

/* ── Device selectors ─────────────────────────────────────────────── */
function refreshDeviceSelectors() {
  const devices = midi.getDevices();
  const inSel = panel.querySelector('#mm-input-select');
  const outSel = panel.querySelector('#mm-output-select');
  if (!inSel || !outSel) return;

  let inHtml = '<option value="">— Select Input —</option>';
  let autoInput = null;
  for (const d of devices.inputs) {
    inHtml += '<option value="' + d.id + '">' + d.name + '</option>';
    if (d.name.toLowerCase().includes('launch control xl')) autoInput = d.id;
  }
  inSel.innerHTML = inHtml;

  let outHtml = '<option value="">— Select Output —</option>';
  let autoOutput = null;
  for (const d of devices.outputs) {
    outHtml += '<option value="' + d.id + '">' + d.name + '</option>';
    if (d.name.toLowerCase().includes('helix')) autoOutput = d.id;
  }
  outSel.innerHTML = outHtml;

  if (!selectedInputId && autoInput) selectedInputId = autoInput;
  if (!selectedOutputId && autoOutput) selectedOutputId = autoOutput;
  if (selectedInputId) inSel.value = selectedInputId;
  if (selectedOutputId) outSel.value = selectedOutputId;
}

/* ── MIDI listener (direct addEventListener to coexist with router) ── */
function onMidiInput(event) {
  const data = event.data;
  if (!data || data.length < 3) return;
  const status = data[0] & 0xF0;
  if (status !== 0xB0) return; // Only CC messages
  const cc = data[1];
  const val = data[2];

  // MIDI Learn: assign CC to the learn target slot
  if (learnTarget) {
    assignCC(learnTarget, cc);
    const d = slotData.get(learnTarget);
    if (d) d.lastValue = val;
    const els = slotEls.get(learnTarget);
    if (els) els.valueFill.style.width = (val / 127 * 100) + '%';

    bus.emit('toast', 'Learned CC ' + cc);
    const wasLearnAll = learnAllQueue !== null;
    stopLearn();

    // Advance learn-all queue
    if (wasLearnAll && learnAllQueue) {
      learnAllQueue.shift();
      if (learnAllQueue.length > 0) {
        startLearn(learnAllQueue[0]);
      } else {
        learnAllQueue = null;
        bus.emit('toast', 'Learn All complete');
      }
    }
    return;
  }

  // Live update: find slot by CC
  const sid = ccToSlot.get(cc);
  if (sid) {
    pendingUpdates.set(sid, val);
    if (!rafId) rafId = requestAnimationFrame(flushUpdates);
  }
}

function flushUpdates() {
  rafId = null;
  for (const [sid, val] of pendingUpdates) {
    const data = slotData.get(sid);
    if (data) data.lastValue = val;
    const els = slotEls.get(sid);
    if (els) {
      els.valueFill.style.width = (val / 127 * 100) + '%';
      els.el.classList.add('mm-slot--active');
      setTimeout(() => els.el.classList.remove('mm-slot--active'), 300);
    }
  }
  pendingUpdates.clear();
}

function attachMidiListener() {
  detachMidiListener();
  if (!selectedInputId) return;
  const access = midi.getAccess();
  if (!access) return;
  const input = access.inputs.get(selectedInputId);
  if (!input) return;
  midiHandler = onMidiInput;
  input.addEventListener('midimessage', midiHandler);
}

function detachMidiListener() {
  if (!midiHandler) return;
  const access = midi.getAccess();
  if (access && selectedInputId) {
    const input = access.inputs.get(selectedInputId);
    if (input) input.removeEventListener('midimessage', midiHandler);
  }
  midiHandler = null;
}

/* ── MIDI Learn ───────────────────────────────────────────────────── */
function startLearn(sid) {
  if (learnTarget === sid) { stopLearn(); learnAllQueue = null; return; }
  stopLearn();
  learnTarget = sid;
  const els = slotEls.get(sid);
  if (els) {
    els.el.classList.add('mm-slot--learning');
    els.learnBtn.textContent = 'Listening...';
    els.el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
  if (!midiHandler) attachMidiListener();
}

function stopLearn() {
  if (!learnTarget) return;
  const els = slotEls.get(learnTarget);
  if (els) {
    els.el.classList.remove('mm-slot--learning');
    els.learnBtn.textContent = 'Learn';
  }
  learnTarget = null;
}

function startLearnAll() {
  learnAllQueue = [];
  for (const row of LCXL_LAYOUT) {
    for (let col = 0; col < row.count; col++) {
      learnAllQueue.push(makeSlotId(row.type, row.row, col));
    }
  }
  if (learnAllQueue.length > 0) {
    bus.emit('toast', 'Learn All: wiggle each control in order');
    startLearn(learnAllQueue[0]);
  }
}

/* ── Assign CC to slot ────────────────────────────────────────────── */
function assignCC(sid, cc) {
  // Unassign CC from any other slot
  const oldSlot = ccToSlot.get(cc);
  if (oldSlot && oldSlot !== sid) {
    const oldData = slotData.get(oldSlot);
    if (oldData) oldData.sourceCC = null;
    const oldEls = slotEls.get(oldSlot);
    if (oldEls) {
      oldEls.ccEl.textContent = 'CC --';
      oldEls.el.classList.remove('mm-slot--assigned');
    }
  }
  // Clear previous CC from this slot
  const d = slotData.get(sid);
  if (d && d.sourceCC !== null) ccToSlot.delete(d.sourceCC);
  // Assign
  if (d) d.sourceCC = cc;
  ccToSlot.set(cc, sid);
  const els = slotEls.get(sid);
  if (els) {
    els.ccEl.textContent = 'CC ' + cc;
    els.el.classList.add('mm-slot--assigned');
  }
}

/* ── Build grid ───────────────────────────────────────────────────── */
function buildGrid() {
  gridContainer.innerHTML = '';
  slotEls.clear();
  slotData.clear();
  ccToSlot.clear();

  for (const row of LCXL_LAYOUT) {
    const rowEl = document.createElement('div');
    rowEl.className = 'mm-row';

    const labelEl = document.createElement('div');
    labelEl.className = 'mm-row__label';
    labelEl.textContent = row.label;
    rowEl.appendChild(labelEl);

    const slotsContainer = document.createElement('div');
    slotsContainer.className = 'mm-row__slots';

    for (let col = 0; col < row.count; col++) {
      const sid = makeSlotId(row.type, row.row, col);

      const slotEl = document.createElement('div');
      slotEl.className = 'mm-slot mm-slot--' + row.type;
      slotEl.dataset.slot = sid;

      const iconEl = document.createElement('div');
      iconEl.className = 'mm-slot__icon';
      if (row.type === 'knob') iconEl.textContent = '\u25EF';
      else if (row.type === 'fader') iconEl.textContent = '\u2503';
      else iconEl.textContent = '\u25A1';

      const ccEl = document.createElement('div');
      ccEl.className = 'mm-slot__cc';
      ccEl.textContent = 'CC --';
      ccEl.title = 'Click to enter CC number manually';
      ccEl.addEventListener('click', (e) => {
        e.stopPropagation();
        const current = slotData.get(sid)?.sourceCC;
        const val = prompt('Enter CC number (0-127):', current !== null ? current : '');
        if (val === null) return;
        const num = parseInt(val);
        if (isNaN(num) || num < 0 || num > 127) return;
        assignCC(sid, num);
      });

      const blockInput = document.createElement('input');
      blockInput.className = 'mm-slot__block';
      blockInput.type = 'text';
      blockInput.placeholder = 'Block';
      blockInput.addEventListener('input', () => {
        const d = slotData.get(sid);
        if (d) d.block = blockInput.value;
      });
      blockInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') blockInput.blur(); });

      const labelInput = document.createElement('input');
      labelInput.className = 'mm-slot__label';
      labelInput.type = 'text';
      labelInput.placeholder = 'Parameter';
      labelInput.addEventListener('input', () => {
        const d = slotData.get(sid);
        if (d) d.label = labelInput.value;
      });
      labelInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') labelInput.blur(); });

      const valueBar = document.createElement('div');
      valueBar.className = 'mm-slot__value-bar';
      const valueFill = document.createElement('div');
      valueFill.className = 'mm-slot__value-fill';
      valueBar.appendChild(valueFill);

      const learnBtn = document.createElement('button');
      learnBtn.className = 'mm-slot__learn-btn';
      learnBtn.textContent = 'Learn';
      learnBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        startLearn(sid);
      });

      slotEl.appendChild(iconEl);
      slotEl.appendChild(ccEl);
      slotEl.appendChild(blockInput);
      slotEl.appendChild(labelInput);
      slotEl.appendChild(valueBar);
      slotEl.appendChild(learnBtn);

      slotEl.addEventListener('click', () => startLearn(sid));

      slotsContainer.appendChild(slotEl);
      slotEls.set(sid, { el: slotEl, ccEl, labelInput, blockInput, valueFill, learnBtn });
      slotData.set(sid, { sourceCC: null, label: '', block: '', lastValue: 0 });
    }

    rowEl.appendChild(slotsContainer);
    gridContainer.appendChild(rowEl);
  }
}

/* ── Clear all mappings ───────────────────────────────────────────── */
function clearAll() {
  stopLearn();
  learnAllQueue = null;
  applySlotData(null);
  activePresetName = '';
  localStorage.removeItem(ACTIVE_PRESET_KEY);
  const sel = panel.querySelector('#mm-preset-select');
  if (sel) sel.value = '';
}

/* ── Init ─────────────────────────────────────────────────────────── */
export function init() {
  panel = $('#midimap-panel');
  if (!panel) return;

  loadPresets();

  panel.innerHTML =
    '<div class="mm-toolbar">' +
      '<span class="mm-title">MIDI Map</span>' +
      '<select class="mm-device-select" id="mm-input-select" title="LCXL Input"></select>' +
      '<span class="mm-arrow">\u2192</span>' +
      '<select class="mm-device-select" id="mm-output-select" title="Helix Output"></select>' +
      '<span class="mm-divider"></span>' +
      '<select class="mm-preset-select" id="mm-preset-select"></select>' +
      '<button class="btn btn--ghost" id="mm-save-preset">Save</button>' +
      '<button class="btn btn--ghost" id="mm-save-as-preset">Save As</button>' +
      '<span class="mm-hint">Click a slot or Learn button, then wiggle a knob</span>' +
      '<button class="btn btn--ghost" id="mm-learn-all" title="Learn all slots sequentially">Learn All</button>' +
      '<button class="btn btn--ghost" id="mm-clear">Clear</button>' +
    '</div>' +
    '<div class="mm-grid" id="mm-grid"></div>';

  gridContainer = panel.querySelector('#mm-grid');
  buildGrid();
  rebuildPresetDropdown('');
  refreshDeviceSelectors();

  // Restore last active preset
  const savedPreset = localStorage.getItem(ACTIVE_PRESET_KEY) || '';
  if (savedPreset && userPresets[savedPreset]) {
    loadPreset(savedPreset);
  }

  // Event listeners
  panel.querySelector('#mm-save-preset').addEventListener('click', savePreset);
  panel.querySelector('#mm-save-as-preset').addEventListener('click', savePresetAs);
  panel.querySelector('#mm-clear').addEventListener('click', clearAll);
  panel.querySelector('#mm-learn-all').addEventListener('click', startLearnAll);
  panel.querySelector('#mm-preset-select').addEventListener('change', (e) => {
    if (e.target.value) loadPreset(e.target.value);
  });
  panel.querySelector('#mm-input-select').addEventListener('change', (e) => {
    selectedInputId = e.target.value || null;
    attachMidiListener();
  });
  panel.querySelector('#mm-output-select').addEventListener('change', (e) => {
    selectedOutputId = e.target.value || null;
  });

  // Escape to cancel learn
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && learnTarget) {
      learnAllQueue = null;
      stopLearn();
    }
  });

  // Device changes
  bus.on('midi:devices-changed', refreshDeviceSelectors);
  bus.on('midi:ready', () => {
    refreshDeviceSelectors();
    if (selectedInputId) attachMidiListener();
  });

  // Attach listener if devices already ready
  if (midi.isReady() && selectedInputId) {
    attachMidiListener();
  }
}
