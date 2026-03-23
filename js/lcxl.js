// ── Launch Control XL Tab ────────────────────────────────────────────
import { $ } from './utils.js';

// ── LCXL Physical Layout (Factory Template 1) ───────────────────────
const KNOB_ROW_1_CCS = [13, 14, 15, 16, 17, 18, 19, 20];
const KNOB_ROW_2_CCS = [29, 30, 31, 32, 33, 34, 35, 36];
const KNOB_ROW_3_CCS = [49, 50, 51, 52, 53, 54, 55, 56];
const FADER_CCS      = [77, 78, 79, 80, 81, 82, 83, 84];
const BTN_FOCUS_NOTES = [41, 42, 43, 44, 57, 58, 59, 60];
const BTN_CTRL_NOTES  = [73, 74, 75, 76, 89, 90, 91, 92];

// Control ID helpers
const knobId  = (row, col) => `knob_${row * 8 + col}`;
const faderId = (col) => `fader_${col}`;
const btnFocusId = (col) => `btn_focus_${col}`;
const btnCtrlId  = (col) => `btn_ctrl_${col}`;

// ── Default XR18 labels ─────────────────────────────────────────────
const XR18_LABELS = ['CP88', 'Take 5', 'Helix', 'SK Pro', 'Vocal', 'Ch 10', 'USB', 'Main'];

// ── API client ──────────────────────────────────────────────────────
const API = '/api/lcxl';

async function apiGet(path) {
  const res = await fetch(`${API}${path}`);
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

async function apiPut(path, body) {
  const res = await fetch(`${API}${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

async function apiPost(path, body) {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

async function apiDel(path) {
  const res = await fetch(`${API}${path}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

// ── State ───────────────────────────────────────────────────────────
let mappings = {};
let selectedControl = null;
let backendOk = false;
let wsConnection = null;
let faderValues = {};    // control_id -> 0-127
let knobValues = {};
let muteStates = {};     // control_id -> true/false (muted)

// ── DOM refs ────────────────────────────────────────────────────────
let panel, statusMsg, editorEl, profileSelect;

// ── Init ────────────────────────────────────────────────────────────
export function init() {
  panel = $('#lcxl-panel');
  if (!panel) return;
  buildUI();
  loadData();
}

// ── Build UI ────────────────────────────────────────────────────────
function buildUI() {
  panel.innerHTML = `
    <div class="lcxl-container">
      <div class="lcxl-device">
        <div class="lcxl-header">
          <div class="lcxl-header__left">
            <span class="lcxl-header__brand">NOVATION</span>
            <span class="lcxl-header__model">Launch Control XL</span>
          </div>
          <div class="lcxl-header__right">
            <div class="lcxl-profile-bar">
              <select class="lcxl-profile-select" id="lcxl-profile-select">
                <option value="">— Presets —</option>
              </select>
              <button class="lcxl-btn" id="lcxl-profile-save">Save</button>
              <button class="lcxl-btn" id="lcxl-profile-save-as">Save As</button>
            </div>
            <span class="lcxl-status" id="lcxl-status">Connecting...</span>
          </div>
        </div>

        <!-- Knob Rows -->
        <div class="lcxl-section lcxl-section--knobs">
          <div class="lcxl-row" id="lcxl-knob-row-0"></div>
          <div class="lcxl-row" id="lcxl-knob-row-1"></div>
          <div class="lcxl-row" id="lcxl-knob-row-2"></div>
        </div>

        <!-- Button Rows -->
        <div class="lcxl-section lcxl-section--buttons">
          <div class="lcxl-row" id="lcxl-btn-focus-row"></div>
          <div class="lcxl-row" id="lcxl-btn-ctrl-row"></div>
        </div>

        <!-- Faders -->
        <div class="lcxl-section lcxl-section--faders">
          <div class="lcxl-row lcxl-row--faders" id="lcxl-fader-row"></div>
        </div>

        <!-- Channel Labels -->
        <div class="lcxl-section lcxl-section--labels">
          <div class="lcxl-row lcxl-row--labels" id="lcxl-label-row"></div>
        </div>
      </div>

      <!-- Editor Panel -->
      <div class="lcxl-editor" id="lcxl-editor" hidden>
        <div class="lcxl-editor__header">
          <span class="lcxl-editor__title" id="lcxl-editor-title">Edit Control</span>
          <button class="lcxl-editor__close" id="lcxl-editor-close">&times;</button>
        </div>
        <div class="lcxl-editor__body" id="lcxl-editor-body"></div>
        <div class="lcxl-editor__actions">
          <button class="lcxl-btn lcxl-btn--primary" id="lcxl-editor-save">Save</button>
          <button class="lcxl-btn lcxl-btn--danger" id="lcxl-editor-clear">Clear</button>
        </div>
      </div>
    </div>
  `;

  statusMsg = panel.querySelector('#lcxl-status');
  editorEl = panel.querySelector('#lcxl-editor');
  profileSelect = panel.querySelector('#lcxl-profile-select');

  // Build controls
  buildKnobRow(0, KNOB_ROW_1_CCS);
  buildKnobRow(1, KNOB_ROW_2_CCS);
  buildKnobRow(2, KNOB_ROW_3_CCS);
  buildButtonRow('focus', BTN_FOCUS_NOTES);
  buildButtonRow('ctrl', BTN_CTRL_NOTES);
  buildFaderRow();
  buildLabelRow();

  // Event listeners
  panel.querySelector('#lcxl-editor-close').addEventListener('click', closeEditor);
  panel.querySelector('#lcxl-editor-save').addEventListener('click', saveMapping);
  panel.querySelector('#lcxl-editor-clear').addEventListener('click', clearMapping);
  panel.querySelector('#lcxl-profile-save').addEventListener('click', saveProfile);
  panel.querySelector('#lcxl-profile-save-as').addEventListener('click', saveProfileAs);
  profileSelect.addEventListener('change', applyProfile);
}

function buildKnobRow(row, ccs) {
  const container = panel.querySelector(`#lcxl-knob-row-${row}`);
  ccs.forEach((cc, col) => {
    const id = knobId(row, col);
    const el = document.createElement('div');
    el.className = 'lcxl-knob';
    el.dataset.controlId = id;
    el.innerHTML = `
      <div class="lcxl-knob__dial" id="dial-${id}">
        <div class="lcxl-knob__indicator"></div>
      </div>
      <span class="lcxl-knob__label" id="label-${id}"></span>
    `;
    el.addEventListener('click', () => selectControl(id));
    container.appendChild(el);
  });
}

function buildButtonRow(type, notes) {
  const container = panel.querySelector(`#lcxl-btn-${type}-row`);
  notes.forEach((note, col) => {
    const id = type === 'focus' ? btnFocusId(col) : btnCtrlId(col);
    const el = document.createElement('button');
    el.className = 'lcxl-button';
    el.dataset.controlId = id;
    el.id = `pad-${id}`;
    el.innerHTML = `<span class="lcxl-button__label" id="label-${id}"></span>`;
    el.addEventListener('click', () => selectControl(id));
    container.appendChild(el);
  });
}

function buildFaderRow() {
  const container = panel.querySelector('#lcxl-fader-row');
  for (let col = 0; col < 8; col++) {
    const id = faderId(col);
    const el = document.createElement('div');
    el.className = 'lcxl-fader';
    el.dataset.controlId = id;
    el.innerHTML = `
      <div class="lcxl-fader__track">
        <div class="lcxl-fader__fill" id="fill-${id}"></div>
        <div class="lcxl-fader__thumb" id="thumb-${id}"></div>
      </div>
      <span class="lcxl-fader__value" id="val-${id}">0</span>
    `;
    el.addEventListener('click', () => selectControl(id));
    container.appendChild(el);
  }
}

function buildLabelRow() {
  const container = panel.querySelector('#lcxl-label-row');
  for (let col = 0; col < 8; col++) {
    const el = document.createElement('span');
    el.className = 'lcxl-channel-label';
    el.id = `ch-label-${col}`;
    el.textContent = XR18_LABELS[col];
    container.appendChild(el);
  }
}

// ── Update display ──────────────────────────────────────────────────
function updateDisplay() {
  // Update labels from mappings
  for (const [controlId, mapping] of Object.entries(mappings)) {
    const labelEl = panel.querySelector(`#label-${controlId}`);
    if (labelEl) labelEl.textContent = mapping.label || '';
  }

  // Update fader positions
  for (const [controlId, value] of Object.entries(faderValues)) {
    const fillEl = panel.querySelector(`#fill-${controlId}`);
    const thumbEl = panel.querySelector(`#thumb-${controlId}`);
    const valEl = panel.querySelector(`#val-${controlId}`);
    if (fillEl) {
      const pct = (value / 127) * 100;
      fillEl.style.height = `${pct}%`;
      thumbEl.style.bottom = `${pct}%`;
    }
    if (valEl) valEl.textContent = value;
  }

  // Update knob rotations
  for (const [controlId, value] of Object.entries(knobValues)) {
    const dialEl = panel.querySelector(`#dial-${controlId}`);
    if (dialEl) {
      const angle = (value / 127) * 270 - 135; // -135 to 135
      dialEl.style.transform = `rotate(${angle}deg)`;
    }
  }

  // Update mute button states
  for (const [controlId, muted] of Object.entries(muteStates)) {
    const btnEl = panel.querySelector(`#pad-${controlId}`);
    if (btnEl) {
      btnEl.classList.toggle('lcxl-button--muted', muted);
      btnEl.classList.toggle('lcxl-button--active', !muted);
    }
  }

  // Highlight selected
  for (const el of panel.querySelectorAll('.lcxl-knob--selected, .lcxl-fader--selected, .lcxl-button--selected')) {
    el.classList.remove('lcxl-knob--selected', 'lcxl-fader--selected', 'lcxl-button--selected');
  }
  if (selectedControl) {
    const el = panel.querySelector(`[data-control-id="${selectedControl}"]`);
    if (el) {
      if (selectedControl.startsWith('knob')) el.classList.add('lcxl-knob--selected');
      else if (selectedControl.startsWith('fader')) el.classList.add('lcxl-fader--selected');
      else el.classList.add('lcxl-button--selected');
    }
  }

  // Update channel labels from fader mappings
  for (let col = 0; col < 8; col++) {
    const id = faderId(col);
    const labelEl = panel.querySelector(`#ch-label-${col}`);
    const mapping = mappings[id];
    if (labelEl && mapping?.label) {
      labelEl.textContent = mapping.label;
    }
  }
}

// ── Control selection & editor ──────────────────────────────────────
function selectControl(controlId) {
  selectedControl = controlId;
  showEditor(controlId);
  updateDisplay();
}

function closeEditor() {
  selectedControl = null;
  editorEl.hidden = true;
  updateDisplay();
}

function showEditor(controlId) {
  const mapping = mappings[controlId] || {};
  const titleEl = panel.querySelector('#lcxl-editor-title');
  const bodyEl = panel.querySelector('#lcxl-editor-body');

  // Friendly name
  let name = controlId;
  if (controlId.startsWith('knob_')) {
    const idx = parseInt(controlId.split('_')[1]);
    const row = Math.floor(idx / 8) + 1;
    const col = (idx % 8) + 1;
    name = `Knob Row ${row}, Col ${col}`;
  } else if (controlId.startsWith('fader_')) {
    const col = parseInt(controlId.split('_')[1]) + 1;
    name = `Fader ${col}`;
  } else if (controlId.startsWith('btn_focus_')) {
    const col = parseInt(controlId.split('_')[2]) + 1;
    name = `Track Focus Button ${col}`;
  } else if (controlId.startsWith('btn_ctrl_')) {
    const col = parseInt(controlId.split('_')[2]) + 1;
    name = `Track Control Button ${col}`;
  }

  titleEl.textContent = name;
  editorEl.hidden = false;

  bodyEl.innerHTML = `
    <div class="lcxl-field">
      <label class="lcxl-field__label">Label</label>
      <input class="lcxl-field__input" id="lcxl-edit-label" type="text"
             value="${mapping.label || ''}" placeholder="e.g. CP88 Vol">
    </div>
    <div class="lcxl-field">
      <label class="lcxl-field__label">Target MIDI Channel</label>
      <select class="lcxl-field__select" id="lcxl-edit-target-ch">
        ${[...Array(16)].map((_, i) =>
          `<option value="${i + 1}" ${(mapping.target_channel || 1) === i + 1 ? 'selected' : ''}>Ch ${i + 1}</option>`
        ).join('')}
      </select>
    </div>
    <div class="lcxl-field">
      <label class="lcxl-field__label">Target CC Number</label>
      <input class="lcxl-field__input" id="lcxl-edit-target-cc" type="number" min="0" max="127"
             value="${mapping.target_cc ?? ''}">
    </div>
    <div class="lcxl-field">
      <label class="lcxl-field__label">Behavior</label>
      <select class="lcxl-field__select" id="lcxl-edit-behavior">
        <option value="passthrough" ${(mapping.behavior || 'passthrough') === 'passthrough' ? 'selected' : ''}>Pass CC value through</option>
        <option value="toggle" ${mapping.behavior === 'toggle' ? 'selected' : ''}>Toggle (0/127)</option>
        <option value="momentary" ${mapping.behavior === 'momentary' ? 'selected' : ''}>Momentary (127 on press)</option>
        <option value="program_change" ${mapping.behavior === 'program_change' ? 'selected' : ''}>Program Change</option>
      </select>
    </div>
    <div class="lcxl-field" id="lcxl-pc-field" ${mapping.behavior !== 'program_change' ? 'hidden' : ''}>
      <label class="lcxl-field__label">Program Number</label>
      <input class="lcxl-field__input" id="lcxl-edit-pc-num" type="number" min="0" max="127"
             value="${mapping.pc_number ?? 0}">
    </div>
  `;

  // Show/hide PC field based on behavior
  bodyEl.querySelector('#lcxl-edit-behavior').addEventListener('change', (e) => {
    bodyEl.querySelector('#lcxl-pc-field').hidden = e.target.value !== 'program_change';
  });
}

async function saveMapping() {
  if (!selectedControl) return;
  const mapping = {
    label: panel.querySelector('#lcxl-edit-label').value,
    target_channel: parseInt(panel.querySelector('#lcxl-edit-target-ch').value),
    target_cc: parseInt(panel.querySelector('#lcxl-edit-target-cc').value),
    behavior: panel.querySelector('#lcxl-edit-behavior').value,
    pc_number: parseInt(panel.querySelector('#lcxl-edit-pc-num')?.value || 0),
  };

  try {
    await apiPut(`/mappings/${selectedControl}`, mapping);
    mappings[selectedControl] = mapping;
    updateDisplay();
  } catch (e) {
    console.error('Failed to save mapping:', e);
  }
}

async function clearMapping() {
  if (!selectedControl) return;
  try {
    await apiDel(`/mappings/${selectedControl}`);
    delete mappings[selectedControl];
    closeEditor();
  } catch (e) {
    console.error('Failed to clear mapping:', e);
  }
}

// ── Profiles ────────────────────────────────────────────────────────
async function loadProfiles() {
  try {
    const data = await apiGet('/profiles');
    profileSelect.innerHTML = '<option value="">— Presets —</option>';
    for (const name of data.profiles) {
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name;
      if (name === data.active) opt.selected = true;
      profileSelect.appendChild(opt);
    }
  } catch {}
}

async function applyProfile() {
  const name = profileSelect.value;
  if (!name) return;
  try {
    const data = await apiPut(`/profiles/${encodeURIComponent(name)}/apply`);
    mappings = data.mappings || {};
    updateDisplay();
  } catch (e) {
    console.error('Failed to apply profile:', e);
  }
}

async function saveProfile() {
  const name = profileSelect.value;
  if (!name) return saveProfileAs();
  try {
    await apiPost(`/profiles/${encodeURIComponent(name)}`);
  } catch (e) {
    console.error('Failed to save profile:', e);
  }
}

async function saveProfileAs() {
  const name = prompt('Profile name:');
  if (!name) return;
  try {
    await apiPost(`/profiles/${encodeURIComponent(name)}`);
    await loadProfiles();
  } catch (e) {
    console.error('Failed to save profile:', e);
  }
}

// ── Data loading ────────────────────────────────────────────────────
async function loadData() {
  await checkBackend();
  if (backendOk) {
    await loadMappings();
    await loadProfiles();
    connectWebSocket();
  }
  // Poll status
  setInterval(checkBackend, 5000);
}

async function checkBackend() {
  try {
    const status = await apiGet('/status');
    backendOk = true;
    if (status.connected) {
      statusMsg.textContent = `Connected: ${status.port_name}`;
      statusMsg.classList.remove('lcxl-status--error');
    } else if (status.listener_running) {
      statusMsg.textContent = 'Listening for Launch Control XL...';
      statusMsg.classList.remove('lcxl-status--error');
    } else {
      statusMsg.textContent = 'MIDI listener not active';
      statusMsg.classList.add('lcxl-status--error');
    }
  } catch {
    backendOk = false;
    statusMsg.textContent = 'Backend not running';
    statusMsg.classList.add('lcxl-status--error');
  }
}

async function loadMappings() {
  try {
    const data = await apiGet('/mappings');
    mappings = data.mappings || {};
    updateDisplay();
  } catch {}
}

// ── WebSocket ───────────────────────────────────────────────────────
function connectWebSocket() {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const ws = new WebSocket(`${protocol}//${location.host}${API}/ws`);

  ws.onmessage = (e) => {
    const event = JSON.parse(e.data);

    if (event.type === 'control_event') {
      const controlId = event.control_id;
      if (controlId?.startsWith('fader_')) {
        faderValues[controlId] = event.value;
      } else if (controlId?.startsWith('knob_')) {
        knobValues[controlId] = event.value;
      } else if (controlId?.startsWith('btn_')) {
        // Flash the button
        const btnEl = panel.querySelector(`#pad-${controlId}`);
        if (btnEl) {
          btnEl.classList.add('lcxl-button--flash');
          setTimeout(() => btnEl.classList.remove('lcxl-button--flash'), 200);
        }
      }
      updateDisplay();
    } else if (event.type === 'toggle_state') {
      const controlId = event.control_id;
      if (controlId) {
        muteStates[controlId] = event.state;
        updateDisplay();
      }
    } else if (event.type === 'status') {
      checkBackend();
    }
  };

  ws.onclose = () => {
    setTimeout(connectWebSocket, 3000);
  };

  wsConnection = ws;
}
