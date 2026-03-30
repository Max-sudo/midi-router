// ── Stream Dock N1 Tab ────────────────────────────────────────────
import { bus, $, createElement } from './utils.js';
import * as api from './streamdock-api.js';

const panel = $('#streamdock-panel');

// State
let mappings = {};         // button_index (string) → { action_type, params, label, icon }
let selectedButton = null; // currently selected button index
let wsConnection = null;
let backendOk = false;
let appList = [];          // cached list of installed macOS apps

// DOM refs
let grid, editor, statusMsg;
let profileSelect, profileSaveBtn, profileDeleteBtn;

// N1: 3 columns × 5 rows = 15 buttons, indexed 0–14
const N1_COLUMNS = 3;
const N1_ROWS = 5;
const BUTTON_COUNT = N1_COLUMNS * N1_ROWS;

const ACTION_TYPES = [
  { value: 'open_app',          label: 'Open App' },
  { value: 'open_url',          label: 'Open URL' },
  { value: 'keyboard_shortcut', label: 'Keyboard Shortcut' },
  { value: 'applescript',       label: 'AppleScript' },
  { value: 'shell',             label: 'Shell Command' },
  { value: 'workspace',         label: 'Workspace' },
  { value: 'media_play_pause',  label: 'Media Play/Pause' },
  { value: 'media_previous',    label: 'Media Previous' },
  { value: 'media_next',        label: 'Media Next' },
  { value: 'volume_up',         label: 'Volume Up' },
  { value: 'volume_down',       label: 'Volume Down' },
  { value: 'toggle_mute',       label: 'Toggle Mute' },
];

// Emoji icons for non-app action types
const ACTION_EMOJI = {
  media_play_pause: '\u23EF\uFE0F',
  media_previous:   '\u23EE\uFE0F',
  media_next:       '\u23ED\uFE0F',
  volume_up:        '\uD83D\uDD0A',
  volume_down:      '\uD83D\uDD09',
  toggle_mute:      '\uD83D\uDD07',
  keyboard_shortcut: '\u2328\uFE0F',
  shell:            '\uD83D\uDCBB',
  applescript:      '\uD83D\uDCDC',
  workspace:        '\uD83D\uDDA5\uFE0F',
};

// ── Build UI ──────────────────────────────────────────────────────

function buildUI() {
  panel.innerHTML = '';

  const container = createElement('div', { className: 'sd-container' });

  // Left: device frame
  const gridSection = createElement('div', { className: 'sd-grid-section' });
  const device = createElement('div', { className: 'sd-device' });

  // Top controls: 2 small buttons + screen strip + knob
  const topControls = createElement('div', { className: 'sd-top-controls' });

  const topBtn1 = createElement('button', { className: 'sd-top-btn', title: 'Top Left Button' });
  const topBtn2 = createElement('button', { className: 'sd-top-btn', title: 'Top Center Button' });

  const topScreen = createElement('div', { className: 'sd-top-screen' });
  topScreen.appendChild(createElement('span', { className: 'sd-top-screen__label', textContent: 'Stream Dock N1' }));

  const knob = createElement('div', { className: 'sd-knob', title: 'Rotary Knob' });

  topControls.appendChild(topBtn1);
  topControls.appendChild(topBtn2);
  topControls.appendChild(topScreen);
  topControls.appendChild(knob);
  device.appendChild(topControls);

  // 3×5 button grid
  grid = createElement('div', { className: 'sd-grid' });

  for (let i = 0; i < BUTTON_COUNT; i++) {
    const btn = createElement('button', {
      className: 'sd-button',
      'data-index': String(i),
    });
    btn.addEventListener('click', () => selectButton(i));
    grid.appendChild(btn);
  }

  device.appendChild(grid);
  gridSection.appendChild(device);

  // Profile bar
  const profileBar = createElement('div', { className: 'sd-profile-bar' });
  const profileLabel = createElement('span', { className: 'field__label', textContent: 'Profile' });
  profileSelect = createElement('select', { className: 'dropdown sd-profile-select' });
  profileSelect.addEventListener('change', onProfileChange);

  profileSaveBtn = createElement('button', { className: 'btn btn--ghost', textContent: 'Save As...' });
  profileSaveBtn.addEventListener('click', onSaveProfile);

  profileDeleteBtn = createElement('button', { className: 'btn btn--ghost btn--clear', textContent: 'Delete' });
  profileDeleteBtn.addEventListener('click', onDeleteProfile);

  profileBar.appendChild(profileLabel);
  profileBar.appendChild(profileSelect);
  profileBar.appendChild(profileSaveBtn);
  profileBar.appendChild(profileDeleteBtn);
  gridSection.appendChild(profileBar);

  // Status
  statusMsg = createElement('div', { className: 'sd-status' });
  gridSection.appendChild(statusMsg);

  container.appendChild(gridSection);

  // Right: action editor
  editor = createElement('div', { className: 'sd-editor' });
  editor.hidden = true;
  container.appendChild(editor);

  panel.appendChild(container);
}

// ── Button selection & editor ────────────────────────────────────

function selectButton(index) {
  selectedButton = index;

  for (const btn of grid.querySelectorAll('.sd-button')) {
    btn.classList.toggle('sd-button--selected', parseInt(btn.dataset.index) === index);
  }

  showEditor(index);
}

function showEditor(index) {
  const mapping = mappings[String(index)] || null;

  editor.hidden = false;
  editor.innerHTML = '';

  // Header
  const header = createElement('div', { className: 'sd-editor__header' });
  header.appendChild(createElement('span', { className: 'sd-editor__title', textContent: `Button ${index}` }));
  const closeBtn = createElement('button', { className: 'btn btn--icon', textContent: '\u00d7' });
  closeBtn.addEventListener('click', () => {
    editor.hidden = true;
    selectedButton = null;
    for (const btn of grid.querySelectorAll('.sd-button')) btn.classList.remove('sd-button--selected');
  });
  header.appendChild(closeBtn);
  editor.appendChild(header);

  // Action type
  const typeField = createElement('div', { className: 'field' });
  typeField.appendChild(createElement('label', { className: 'field__label', textContent: 'Action Type' }));
  const typeSel = createElement('select', { className: 'dropdown' });
  typeSel.appendChild(new Option('— None —', ''));
  for (const at of ACTION_TYPES) {
    typeSel.appendChild(new Option(at.label, at.value));
  }
  typeSel.value = mapping?.action_type || '';
  typeField.appendChild(typeSel);
  editor.appendChild(typeField);

  // Dynamic params container
  const paramsContainer = createElement('div', { className: 'sd-editor__params' });
  editor.appendChild(paramsContainer);

  // Label
  const labelField = createElement('div', { className: 'field' });
  labelField.appendChild(createElement('label', { className: 'field__label', textContent: 'Button Label' }));
  const labelInput = createElement('input', {
    type: 'text',
    className: 'field__input',
    placeholder: 'Auto from action...',
    value: mapping?.label || '',
  });
  labelField.appendChild(labelInput);
  editor.appendChild(labelField);

  // Buttons
  const actions = createElement('div', { className: 'sd-editor__actions' });
  const saveBtn = createElement('button', { className: 'btn btn--primary', textContent: 'Save' });
  saveBtn.addEventListener('click', async () => {
    const actionType = typeSel.value;
    if (!actionType) {
      await api.deleteMapping(index);
      delete mappings[String(index)];
      updateGrid();
      editor.hidden = true;
      selectedButton = null;
      bus.emit('toast', `Button ${index} cleared`);
      return;
    }

    const params = getParamsFromContainer(paramsContainer, actionType);
    const label = labelInput.value.trim() || autoLabel(actionType, params);
    const action = { action_type: actionType, params, label, icon: '' };

    try {
      await api.setMapping(index, action);
      mappings[String(index)] = action;
      updateGrid();
      bus.emit('toast', `Button ${index} saved`);
    } catch (e) {
      bus.emit('toast', `Save failed: ${e.message}`);
    }
  });

  const testBtn = createElement('button', { className: 'btn btn--ghost', textContent: 'Test' });
  testBtn.addEventListener('click', async () => {
    try {
      const result = await api.testAction(index);
      bus.emit('toast', result.success ? 'Action OK' : `Failed: ${result.error}`);
    } catch (e) {
      bus.emit('toast', `Test failed: ${e.message}`);
    }
  });

  const clearBtn = createElement('button', { className: 'btn btn--danger', textContent: 'Clear' });
  clearBtn.addEventListener('click', async () => {
    try {
      await api.deleteMapping(index);
      delete mappings[String(index)];
      updateGrid();
      editor.hidden = true;
      selectedButton = null;
      bus.emit('toast', `Button ${index} cleared`);
    } catch (e) {
      bus.emit('toast', `Clear failed: ${e.message}`);
    }
  });

  actions.appendChild(saveBtn);
  actions.appendChild(testBtn);
  actions.appendChild(clearBtn);
  editor.appendChild(actions);

  // Build initial params fields
  buildParamsFields(paramsContainer, typeSel.value, mapping?.params || {});

  typeSel.addEventListener('change', () => {
    buildParamsFields(paramsContainer, typeSel.value, {});
  });
}

// ── Param fields (reuses Launchpad patterns) ────────────────────

function buildParamsFields(container, actionType, params) {
  container.innerHTML = '';

  if (actionType === 'open_app') {
    const field = createElement('div', { className: 'field' });
    field.appendChild(createElement('label', { className: 'field__label', textContent: 'Application' }));

    const searchInput = createElement('input', {
      type: 'text', className: 'field__input', placeholder: 'Filter apps...', autocomplete: 'off',
    });
    const appSelect = createElement('select', { className: 'dropdown', name: 'app_name' });

    function populateSelect(filter = '') {
      appSelect.innerHTML = '';
      appSelect.appendChild(new Option('— Select an app —', ''));
      const query = filter.toLowerCase();
      const filtered = appList.filter(a => !query || a.toLowerCase().includes(query));
      for (const name of filtered) appSelect.appendChild(new Option(name, name));
      if (params.app_name) appSelect.value = params.app_name;
    }

    if (appList.length === 0) {
      loadApps().then(() => populateSelect());
    } else {
      populateSelect();
    }

    searchInput.addEventListener('input', () => populateSelect(searchInput.value));
    field.appendChild(searchInput);
    field.appendChild(appSelect);
    container.appendChild(field);

  } else if (actionType === 'keyboard_shortcut') {
    const field = createElement('div', { className: 'field' });
    field.appendChild(createElement('label', { className: 'field__label', textContent: 'Shortcut' }));
    const display = createElement('div', {
      className: 'field__input lp-shortcut-capture', tabindex: '0',
    });
    const hiddenInput = createElement('input', { type: 'hidden', name: 'keys' });
    hiddenInput.value = params.keys || '';

    if (params.keys) {
      display.textContent = formatShortcut(params.keys);
      display.classList.add('lp-shortcut-capture--set');
    } else {
      display.textContent = 'Click here, then press a shortcut...';
    }

    display.addEventListener('focus', () => {
      display.textContent = 'Press a key combination...';
      display.classList.add('lp-shortcut-capture--recording');
    });
    display.addEventListener('blur', () => {
      display.classList.remove('lp-shortcut-capture--recording');
      if (!hiddenInput.value) {
        display.textContent = 'Click here, then press a shortcut...';
        display.classList.remove('lp-shortcut-capture--set');
      }
    });
    display.addEventListener('keydown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (['Meta', 'Shift', 'Control', 'Alt'].includes(e.key)) return;

      const parts = [];
      if (e.metaKey) parts.push('cmd');
      if (e.ctrlKey) parts.push('ctrl');
      if (e.altKey) parts.push('alt');
      if (e.shiftKey) parts.push('shift');

      let key = e.key.toLowerCase();
      const keyMap = {
        ' ': 'space', 'arrowup': 'up', 'arrowdown': 'down',
        'arrowleft': 'left', 'arrowright': 'right', 'backspace': 'delete',
      };
      if (keyMap[key]) key = keyMap[key];
      parts.push(key);

      const combo = parts.join('+');
      hiddenInput.value = combo;
      display.textContent = formatShortcut(combo);
      display.classList.add('lp-shortcut-capture--set');
      display.blur();
    });

    field.appendChild(display);
    field.appendChild(hiddenInput);
    container.appendChild(field);

  } else if (actionType === 'applescript') {
    const field = createElement('div', { className: 'field' });
    field.appendChild(createElement('label', { className: 'field__label', textContent: 'Script' }));
    const textarea = createElement('textarea', {
      className: 'field__input sd-textarea',
      placeholder: 'tell application "Finder" to ...',
      name: 'script',
    });
    textarea.value = params.script || '';
    field.appendChild(textarea);
    container.appendChild(field);

  } else if (actionType === 'open_url') {
    const urlField = createElement('div', { className: 'field' });
    urlField.appendChild(createElement('label', { className: 'field__label', textContent: 'URL' }));
    urlField.appendChild(createElement('input', {
      type: 'text', className: 'field__input',
      placeholder: 'https://...', value: params.url || '', name: 'url',
    }));
    container.appendChild(urlField);

    const browserField = createElement('div', { className: 'field' });
    browserField.appendChild(createElement('label', { className: 'field__label', textContent: 'Browser' }));
    browserField.appendChild(createElement('input', {
      type: 'text', className: 'field__input',
      placeholder: 'Brave Browser', value: params.browser || 'Brave Browser', name: 'browser',
    }));
    container.appendChild(browserField);

  } else if (actionType === 'shell') {
    const field = createElement('div', { className: 'field' });
    field.appendChild(createElement('label', { className: 'field__label', textContent: 'Command' }));
    field.appendChild(createElement('input', {
      type: 'text', className: 'field__input',
      placeholder: 'e.g. open -a "Activity Monitor"',
      value: params.command || '', name: 'command',
    }));
    container.appendChild(field);

  } else if (actionType === 'volume_up' || actionType === 'volume_down') {
    const field = createElement('div', { className: 'field' });
    field.appendChild(createElement('label', { className: 'field__label', textContent: 'Step (1-100)' }));
    field.appendChild(createElement('input', {
      type: 'number', className: 'field__input',
      placeholder: '10', min: '1', max: '100',
      value: params.step || '10', name: 'step',
    }));
    container.appendChild(field);

  } else if (actionType === 'workspace') {
    const field = createElement('div', { className: 'field' });
    field.appendChild(createElement('label', { className: 'field__label', textContent: 'Desktop (Space)' }));
    field.appendChild(createElement('input', {
      type: 'number', className: 'field__input', name: 'desktop',
      placeholder: '1', min: '1', max: '16',
      value: params.desktop || '',
    }));
    container.appendChild(field);
  }
  // media_play_pause and toggle_mute have no params
}

function getParamsFromContainer(container, actionType) {
  const params = {};
  if (actionType === 'open_app') {
    params.app_name = container.querySelector('[name="app_name"]')?.value || '';
  } else if (actionType === 'keyboard_shortcut') {
    params.keys = container.querySelector('[name="keys"]')?.value || '';
  } else if (actionType === 'applescript') {
    params.script = container.querySelector('[name="script"]')?.value || '';
  } else if (actionType === 'open_url') {
    params.url = container.querySelector('[name="url"]')?.value || '';
    params.browser = container.querySelector('[name="browser"]')?.value || 'Brave Browser';
  } else if (actionType === 'shell') {
    params.command = container.querySelector('[name="command"]')?.value || '';
  } else if (actionType === 'volume_up' || actionType === 'volume_down') {
    params.step = parseInt(container.querySelector('[name="step"]')?.value || '10', 10);
  } else if (actionType === 'workspace') {
    const desktop = container.querySelector('[name="desktop"]')?.value;
    if (desktop) params.desktop = parseInt(desktop, 10);
  }
  return params;
}

function formatShortcut(combo) {
  const symbols = {
    cmd: '\u2318', ctrl: '\u2303', alt: '\u2325', option: '\u2325',
    shift: '\u21E7', space: 'Space', up: '\u2191', down: '\u2193',
    left: '\u2190', right: '\u2192', delete: '\u232B', return: '\u23CE',
    enter: '\u23CE', tab: '\u21E5', escape: 'Esc',
  };
  return combo.split('+').map(k => symbols[k] || k.toUpperCase()).join(' ');
}

function autoLabel(actionType, params) {
  if (actionType === 'open_app') return params.app_name || 'App';
  if (actionType === 'keyboard_shortcut') return formatShortcut(params.keys || '');
  if (actionType === 'applescript') return 'Script';
  if (actionType === 'open_url') {
    try { return new URL(params.url).hostname.replace('www.', ''); } catch { return params.url || 'URL'; }
  }
  if (actionType === 'shell') return params.command?.split(' ')[0] || 'Shell';
  if (actionType === 'workspace') return params.desktop ? `Desktop ${params.desktop}` : 'Workspace';
  if (actionType === 'media_play_pause') return 'Play/Pause';
  if (actionType === 'media_previous') return 'Prev';
  if (actionType === 'media_next') return 'Next';
  if (actionType === 'volume_up') return 'Vol +';
  if (actionType === 'volume_down') return 'Vol -';
  if (actionType === 'toggle_mute') return 'Mute';
  return '';
}

// ── Grid rendering ──────────────────────────────────────────────

function updateGrid() {
  for (const btn of grid.querySelectorAll('.sd-button')) {
    const index = btn.dataset.index;
    const mapping = mappings[index];

    btn.classList.toggle('sd-button--mapped', !!mapping);
    btn.innerHTML = '';

    // Index number
    btn.appendChild(createElement('span', {
      className: 'sd-button__index',
      textContent: index,
    }));

    if (mapping) {
      // Show app icon if open_app
      if (mapping.action_type === 'open_app' && mapping.params?.app_name) {
        const icon = createElement('img', {
          className: 'sd-button__icon',
          src: `/api/streamdock/apps/${encodeURIComponent(mapping.params.app_name)}/icon`,
          alt: '',
        });
        icon.addEventListener('error', () => { icon.hidden = true; });
        btn.appendChild(icon);
      } else if (ACTION_EMOJI[mapping.action_type]) {
        // Show emoji for media/system actions
        btn.appendChild(createElement('span', {
          className: 'sd-button__emoji',
          textContent: ACTION_EMOJI[mapping.action_type],
        }));
      }

      btn.appendChild(createElement('span', {
        className: 'sd-button__label',
        textContent: mapping.label || '',
      }));
    }
  }
}

function flashButton(index) {
  const btn = grid.querySelector(`[data-index="${index}"]`);
  if (!btn) return;
  btn.classList.add('sd-button--flash');
  setTimeout(() => btn.classList.remove('sd-button--flash'), 300);
}

// ── Profile management ──────────────────────────────────────────

async function loadProfiles() {
  try {
    const { profiles, active } = await api.getProfiles();
    profileSelect.innerHTML = '';
    for (const name of profiles) profileSelect.appendChild(new Option(name, name));
    profileSelect.value = active;
    profileDeleteBtn.disabled = profiles.length <= 1;
  } catch { /* ignore */ }
}

async function onProfileChange() {
  const name = profileSelect.value;
  try {
    const { mappings: newMappings } = await api.applyProfile(name);
    mappings = newMappings;
    updateGrid();
    bus.emit('toast', `Profile: ${name}`);
  } catch (e) {
    bus.emit('toast', `Profile switch failed: ${e.message}`);
  }
}

async function onSaveProfile() {
  const name = prompt('Profile name:');
  if (!name || !name.trim()) return;
  try {
    await api.saveProfile(name.trim());
    await loadProfiles();
    bus.emit('toast', `Saved profile: ${name.trim()}`);
  } catch (e) {
    bus.emit('toast', `Save failed: ${e.message}`);
  }
}

async function onDeleteProfile() {
  const name = profileSelect.value;
  if (!confirm(`Delete profile "${name}"?`)) return;
  try {
    await api.deleteProfile(name);
    await loadProfiles();
    await loadMappings();
    updateGrid();
    bus.emit('toast', `Deleted profile: ${name}`);
  } catch (e) {
    bus.emit('toast', `Delete failed: ${e.message}`);
  }
}

// ── Data loading ────────────────────────────────────────────────

async function loadMappings() {
  try {
    const data = await api.getMappings();
    mappings = data.mappings || {};
    updateGrid();
  } catch { /* ignore */ }
}

async function loadApps() {
  if (appList.length > 0) return;
  try {
    const data = await api.getApps();
    appList = data.apps || [];
  } catch { /* ignore */ }
}

async function checkBackend() {
  try {
    const status = await api.getStatus();
    backendOk = status.listener_running;
    if (status.connected) {
      statusMsg.textContent = `Connected: ${status.device_name || 'Stream Dock N1'}`;
      statusMsg.className = 'sd-status sd-status--connected';
    } else if (status.listener_running) {
      statusMsg.textContent = 'Searching for Stream Dock N1...';
      statusMsg.className = 'sd-status';
    } else {
      statusMsg.textContent = 'Backend not running';
      statusMsg.className = 'sd-status sd-status--error';
    }
  } catch {
    backendOk = false;
    statusMsg.textContent = 'Backend not running';
    statusMsg.className = 'sd-status sd-status--error';
  }
}

// ── WebSocket ───────────────────────────────────────────────────

function connectWebSocket() {
  wsConnection = api.connectWS((event) => {
    if (event.type === 'button_press') {
      flashButton(event.button_index);
    } else if (event.type === 'status') {
      checkBackend();
    }
  });
}

// ── Init ────────────────────────────────────────────────────────

export function init() {
  buildUI();

  checkBackend();
  loadMappings();
  loadProfiles();
  loadApps();
  connectWebSocket();

  bus.on('tab:changed', (tabId) => {
    if (tabId === 'streamdock') {
      checkBackend();
      loadMappings();
      loadProfiles();
    }
  });
}
