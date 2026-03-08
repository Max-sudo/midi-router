// ── Launchpad Tab ─────────────────────────────────────────────────
import { bus, $, createElement } from './utils.js';
import * as api from './launchpad-api.js';

const panel = $('#launchpad-panel');

// State
let mappings = {};      // pad_note (string) → { action_type, params, label, color }
let selectedPad = null; // currently selected pad note number
let wsConnection = null;
let backendOk = false;
let appList = [];       // cached list of installed macOS apps

// DOM refs
let grid, editor, statusMsg;
let profileSelect, profileSaveBtn, profileDeleteBtn;

// Launchpad Pro MK3 Mini note layout (8x8 grid, bottom-left = 11)
// Row 1 (top):    81 82 83 84 85 86 87 88
// Row 2:          71 72 73 74 75 76 77 78
// ...
// Row 8 (bottom): 11 12 13 14 15 16 17 18
const PAD_LAYOUT = [];
for (let row = 8; row >= 1; row--) {
  const r = [];
  for (let col = 1; col <= 8; col++) {
    r.push(row * 10 + col);
  }
  PAD_LAYOUT.push(r);
}

const PAD_COLORS = [
  '#ff0000', '#ff4400', '#ff8800', '#ffcc00',
  '#ffff00', '#88ff00', '#00ff00', '#00ff88',
  '#00ffff', '#0088ff', '#0000ff', '#4400ff',
  '#8800ff', '#ff00ff', '#ff0088', '#ffffff',
];

const ACTION_TYPES = [
  { value: 'open_app', label: 'Open App' },
  { value: 'keyboard_shortcut', label: 'Keyboard Shortcut' },
  { value: 'applescript', label: 'AppleScript' },
  { value: 'shell', label: 'Shell Command' },
];

// ── Build UI ──────────────────────────────────────────────────────

function buildUI() {
  panel.innerHTML = '';

  const container = createElement('div', { className: 'lp-container' });

  // Left: pad grid
  const gridSection = createElement('div', { className: 'lp-grid-section' });
  grid = createElement('div', { className: 'lp-grid' });

  for (const row of PAD_LAYOUT) {
    for (const note of row) {
      const pad = createElement('button', {
        className: 'lp-pad',
        'data-note': String(note),
      });
      pad.addEventListener('click', () => selectPad(note));

      // Drop target
      pad.addEventListener('dragover', (e) => {
        e.preventDefault();
        pad.classList.add('lp-pad--drop-target');
      });
      pad.addEventListener('dragleave', () => {
        pad.classList.remove('lp-pad--drop-target');
      });
      pad.addEventListener('drop', (e) => {
        e.preventDefault();
        pad.classList.remove('lp-pad--drop-target');
        const fromNote = e.dataTransfer.getData('text/plain');
        const toNote = pad.dataset.note;
        if (fromNote && fromNote !== toNote) {
          movePad(fromNote, toNote);
        }
      });

      grid.appendChild(pad);
    }
  }

  gridSection.appendChild(grid);

  // Profile bar under grid
  const profileBar = createElement('div', { className: 'lp-profile-bar' });
  const profileLabel = createElement('span', { className: 'field__label', textContent: 'Profile' });
  profileSelect = createElement('select', { className: 'dropdown lp-profile-select' });
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
  statusMsg = createElement('div', { className: 'lp-status' });
  gridSection.appendChild(statusMsg);

  container.appendChild(gridSection);

  // Right: action editor
  editor = createElement('div', { className: 'lp-editor' });
  editor.hidden = true;
  container.appendChild(editor);

  panel.appendChild(container);
}

// ── Pad selection & editor ────────────────────────────────────────

function selectPad(note) {
  selectedPad = note;

  // Update grid selection
  for (const pad of grid.querySelectorAll('.lp-pad')) {
    pad.classList.toggle('lp-pad--selected', parseInt(pad.dataset.note) === note);
  }

  showEditor(note);
}

function showEditor(note) {
  const mapping = mappings[String(note)] || null;

  editor.hidden = false;
  editor.innerHTML = '';

  // Header
  const header = createElement('div', { className: 'lp-editor__header' });
  header.appendChild(createElement('span', { className: 'lp-editor__title', textContent: `Pad ${note}` }));
  const closeBtn = createElement('button', { className: 'btn btn--icon', textContent: '\u00d7' });
  closeBtn.addEventListener('click', () => {
    editor.hidden = true;
    selectedPad = null;
    for (const pad of grid.querySelectorAll('.lp-pad')) pad.classList.remove('lp-pad--selected');
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
  const paramsContainer = createElement('div', { className: 'lp-editor__params' });
  editor.appendChild(paramsContainer);

  // Label (optional override)
  const labelField = createElement('div', { className: 'field' });
  labelField.appendChild(createElement('label', { className: 'field__label', textContent: 'Pad Label' }));
  const labelInput = createElement('input', {
    type: 'text',
    className: 'field__input',
    placeholder: 'Auto from action (or type custom)...',
    value: mapping?.label || '',
  });
  labelField.appendChild(labelInput);
  editor.appendChild(labelField);

  // Color
  const colorField = createElement('div', { className: 'field' });
  colorField.appendChild(createElement('label', { className: 'field__label', textContent: 'Color' }));
  const colorRow = createElement('div', { className: 'lp-color-row' });
  const selectedColor = mapping?.color || PAD_COLORS[0];
  const selectedHex = cssColorToHex(selectedColor);

  // Hidden color picker for custom colors
  const colorPicker = createElement('input', { type: 'color', className: 'lp-color-picker-hidden' });
  colorPicker.value = selectedHex;

  // Custom color swatch — shows current custom color & opens picker
  const customSwatch = createElement('button', { className: 'lp-color-swatch lp-color-swatch--custom' });
  customSwatch.textContent = '+';
  customSwatch.title = 'Custom color';
  customSwatch.addEventListener('click', () => colorPicker.click());

  colorPicker.addEventListener('input', () => {
    customSwatch.style.background = colorPicker.value;
    customSwatch.textContent = '';
    for (const s of colorRow.querySelectorAll('.lp-color-swatch')) s.classList.remove('lp-color-swatch--active');
    customSwatch.classList.add('lp-color-swatch--active');
  });

  // Preset swatches
  let hasPresetMatch = false;
  for (const c of PAD_COLORS) {
    const swatch = createElement('button', { className: 'lp-color-swatch' });
    swatch.style.background = c;
    if (c.toLowerCase() === selectedHex.toLowerCase()) {
      swatch.classList.add('lp-color-swatch--active');
      hasPresetMatch = true;
    }
    swatch.addEventListener('click', () => {
      colorPicker.value = c;
      customSwatch.style.background = '';
      customSwatch.textContent = '+';
      for (const s of colorRow.querySelectorAll('.lp-color-swatch')) s.classList.remove('lp-color-swatch--active');
      swatch.classList.add('lp-color-swatch--active');
    });
    colorRow.appendChild(swatch);
  }

  // If current color isn't a preset, highlight custom swatch
  if (!hasPresetMatch) {
    customSwatch.style.background = selectedHex;
    customSwatch.textContent = '';
    customSwatch.classList.add('lp-color-swatch--active');
  }

  colorRow.appendChild(customSwatch);
  colorRow.appendChild(colorPicker);
  colorField.appendChild(colorRow);
  editor.appendChild(colorField);

  // Buttons
  const actions = createElement('div', { className: 'lp-editor__actions' });
  const saveBtn = createElement('button', { className: 'btn btn--primary', textContent: 'Save' });
  saveBtn.addEventListener('click', async () => {
    const actionType = typeSel.value;
    if (!actionType) {
      // Clear mapping
      await api.deleteMapping(note);
      delete mappings[String(note)];
      updateGrid();
      editor.hidden = true;
      selectedPad = null;
      bus.emit('toast', `Pad ${note} cleared`);
      return;
    }

    const params = getParamsFromContainer(paramsContainer, actionType);
    const color = colorPicker.value;

    const label = labelInput.value.trim() || autoLabel(actionType, params);
    const action = {
      action_type: actionType,
      params,
      label,
      color,
    };

    try {
      await api.setMapping(note, action);
      mappings[String(note)] = action;
      updateGrid();
      bus.emit('toast', `Pad ${note} saved`);
    } catch (e) {
      bus.emit('toast', `Save failed: ${e.message}`);
    }
  });

  const clearBtn = createElement('button', { className: 'btn btn--danger', textContent: 'Clear' });
  clearBtn.addEventListener('click', async () => {
    try {
      await api.deleteMapping(note);
      delete mappings[String(note)];
      updateGrid();
      editor.hidden = true;
      selectedPad = null;
      bus.emit('toast', `Pad ${note} cleared`);
    } catch (e) {
      bus.emit('toast', `Clear failed: ${e.message}`);
    }
  });

  actions.appendChild(saveBtn);
  actions.appendChild(clearBtn);
  editor.appendChild(actions);

  // Build initial params fields
  buildParamsFields(paramsContainer, typeSel.value, mapping?.params || {});

  // Rebuild params when type changes
  typeSel.addEventListener('change', () => {
    buildParamsFields(paramsContainer, typeSel.value, {});
  });
}

function buildParamsFields(container, actionType, params) {
  container.innerHTML = '';

  if (actionType === 'open_app') {
    const field = createElement('div', { className: 'field' });
    field.appendChild(createElement('label', { className: 'field__label', textContent: 'Application' }));

    // Search filter
    const searchInput = createElement('input', {
      type: 'text',
      className: 'field__input lp-app-search',
      placeholder: 'Filter apps...',
      autocomplete: 'off',
    });

    // Select dropdown
    const appSelect = createElement('select', {
      className: 'dropdown lp-app-select',
      name: 'app_name',
    });

    // Get recently used apps from current mappings
    const recentApps = new Set();
    for (const m of Object.values(mappings)) {
      if (m.action_type === 'open_app' && m.params?.app_name) {
        recentApps.add(m.params.app_name);
      }
    }

    function populateSelect(filter = '') {
      appSelect.innerHTML = '';
      const query = filter.toLowerCase();

      appSelect.appendChild(new Option('— Select an app —', ''));

      // Recent group
      const recentMatches = [...recentApps].filter(a => !query || a.toLowerCase().includes(query));
      if (recentMatches.length > 0) {
        const group = createElement('optgroup', { label: 'Recent' });
        for (const name of recentMatches) {
          group.appendChild(new Option(name, name));
        }
        appSelect.appendChild(group);
      }

      // All apps group
      const allMatches = appList.filter(a => !query || a.toLowerCase().includes(query));
      const filtered = allMatches.filter(a => !recentApps.has(a));
      if (filtered.length > 0) {
        const group = createElement('optgroup', { label: 'All Apps' });
        for (const name of filtered) {
          group.appendChild(new Option(name, name));
        }
        appSelect.appendChild(group);
      }

      // Restore selection if it still exists
      if (params.app_name) {
        appSelect.value = params.app_name;
      }
    }

    populateSelect();

    // If current value exists, select it
    if (params.app_name) {
      appSelect.value = params.app_name;
      // If not found in list (custom typed), add it
      if (!appSelect.value) {
        const custom = new Option(params.app_name, params.app_name);
        appSelect.insertBefore(custom, appSelect.children[1]);
        appSelect.value = params.app_name;
      }
    }

    searchInput.addEventListener('input', () => {
      const prev = appSelect.value;
      populateSelect(searchInput.value);
      if (prev) appSelect.value = prev;
    });

    field.appendChild(searchInput);
    field.appendChild(appSelect);
    container.appendChild(field);

  } else if (actionType === 'keyboard_shortcut') {
    const field = createElement('div', { className: 'field' });
    field.appendChild(createElement('label', { className: 'field__label', textContent: 'Shortcut' }));
    const display = createElement('div', {
      className: 'field__input lp-shortcut-capture',
      tabindex: '0',
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

      // Ignore lone modifier presses
      if (['Meta', 'Shift', 'Control', 'Alt'].includes(e.key)) return;

      const parts = [];
      if (e.metaKey) parts.push('cmd');
      if (e.ctrlKey) parts.push('ctrl');
      if (e.altKey) parts.push('alt');
      if (e.shiftKey) parts.push('shift');

      // Map key name
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
      className: 'field__input lp-textarea',
      placeholder: 'tell application "Finder" to ...',
      name: 'script',
    });
    textarea.value = params.script || '';
    field.appendChild(textarea);
    container.appendChild(field);
  } else if (actionType === 'shell') {
    const field = createElement('div', { className: 'field' });
    field.appendChild(createElement('label', { className: 'field__label', textContent: 'Command' }));
    const input = createElement('input', {
      type: 'text',
      className: 'field__input',
      placeholder: 'e.g. open -a "Activity Monitor"',
      value: params.command || '',
      name: 'command',
    });
    field.appendChild(input);
    container.appendChild(field);
  }
}

function cssColorToHex(color) {
  // Handle hex already
  if (color.startsWith('#')) {
    // Ensure 6-digit hex
    const h = color.replace('#', '');
    if (h.length === 3) return '#' + h.split('').map(c => c + c).join('');
    return color.length >= 7 ? color.slice(0, 7) : color;
  }
  // Parse rgb(r, g, b)
  const m = color.match(/(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (m) {
    const toHex = n => parseInt(n).toString(16).padStart(2, '0');
    return `#${toHex(m[1])}${toHex(m[2])}${toHex(m[3])}`;
  }
  // Fallback: use a temporary element to resolve named/other colors
  const tmp = document.createElement('div');
  tmp.style.color = color;
  document.body.appendChild(tmp);
  const computed = getComputedStyle(tmp).color;
  document.body.removeChild(tmp);
  const m2 = computed.match(/(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (m2) {
    const toHex = n => parseInt(n).toString(16).padStart(2, '0');
    return `#${toHex(m2[1])}${toHex(m2[2])}${toHex(m2[3])}`;
  }
  return '#00f0ff';
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
  if (actionType === 'shell') return params.command?.split(' ')[0] || 'Shell';
  return '';
}

function getParamsFromContainer(container, actionType) {
  const params = {};
  if (actionType === 'open_app') {
    params.app_name = container.querySelector('[name="app_name"]')?.value || '';
  } else if (actionType === 'keyboard_shortcut') {
    params.keys = container.querySelector('[name="keys"]')?.value || '';
  } else if (actionType === 'applescript') {
    params.script = container.querySelector('[name="script"]')?.value || '';
  } else if (actionType === 'shell') {
    params.command = container.querySelector('[name="command"]')?.value || '';
  }
  return params;
}

// ── Grid rendering ───────────────────────────────────────────────

function updateGrid() {
  for (const pad of grid.querySelectorAll('.lp-pad')) {
    const note = pad.dataset.note;
    const mapping = mappings[note];

    pad.classList.toggle('lp-pad--mapped', !!mapping);
    pad.draggable = !!mapping;
    pad.innerHTML = '';

    // Drag source (only mapped pads)
    pad.ondragstart = mapping ? (e) => {
      e.dataTransfer.setData('text/plain', note);
      e.dataTransfer.effectAllowed = 'move';
      pad.classList.add('lp-pad--dragging');
    } : null;
    pad.ondragend = () => pad.classList.remove('lp-pad--dragging');

    // Always show MIDI note number
    const noteNum = createElement('span', {
      className: 'lp-pad__note',
      textContent: note,
    });
    pad.appendChild(noteNum);

    if (mapping) {
      // Show app icon if it's an open_app action
      if (mapping.action_type === 'open_app' && mapping.params?.app_name) {
        const icon = createElement('img', {
          className: 'lp-pad__icon',
          src: `/api/launchpad/apps/${encodeURIComponent(mapping.params.app_name)}/icon`,
          alt: '',
        });
        icon.addEventListener('error', () => { icon.hidden = true; });
        pad.appendChild(icon);
      }
      // Label below icon
      const label = createElement('span', {
        className: 'lp-pad__label',
        textContent: mapping.label || '',
      });
      pad.appendChild(label);
    }

    if (mapping?.color) {
      pad.style.setProperty('--pad-color', mapping.color);
    } else {
      pad.style.removeProperty('--pad-color');
    }
  }
}

async function movePad(fromNote, toNote) {
  const fromMapping = mappings[fromNote];
  const toMapping = mappings[toNote];

  if (!fromMapping) return;

  try {
    // Set the source mapping on the target pad
    await api.setMapping(parseInt(toNote), fromMapping);
    mappings[toNote] = fromMapping;

    if (toMapping) {
      // Swap: move target mapping to source pad
      await api.setMapping(parseInt(fromNote), toMapping);
      mappings[fromNote] = toMapping;
    } else {
      // Move: clear source pad
      await api.deleteMapping(parseInt(fromNote));
      delete mappings[fromNote];
    }

    updateGrid();
    selectPad(parseInt(toNote));
    bus.emit('toast', toMapping ? `Swapped pad ${fromNote} ↔ ${toNote}` : `Moved pad ${fromNote} → ${toNote}`);
  } catch (e) {
    bus.emit('toast', `Move failed: ${e.message}`);
  }
}

function flashPad(note) {
  const pad = grid.querySelector(`[data-note="${note}"]`);
  if (!pad) return;
  pad.classList.add('lp-pad--flash');
  setTimeout(() => pad.classList.remove('lp-pad--flash'), 300);
}

// ── Profile management ───────────────────────────────────────────

async function loadProfiles() {
  try {
    const { profiles, active } = await api.getProfiles();
    profileSelect.innerHTML = '';
    for (const name of profiles) {
      profileSelect.appendChild(new Option(name, name));
    }
    profileSelect.value = active;
    profileDeleteBtn.disabled = profiles.length <= 1;
  } catch {
    // ignore
  }
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

// ── Data loading ─────────────────────────────────────────────────

async function loadMappings() {
  try {
    const data = await api.getMappings();
    mappings = data.mappings || {};
    updateGrid();

    // Auto-select first mapped pad if nothing selected
    if (selectedPad === null && Object.keys(mappings).length > 0) {
      const firstNote = parseInt(Object.keys(mappings)[0]);
      selectPad(firstNote);
    }
  } catch {
    // ignore
  }
}

async function loadApps() {
  if (appList.length > 0) return; // already cached
  try {
    const data = await api.getApps();
    appList = data.apps || [];
  } catch {
    // ignore — user can still type manually
  }
}

async function checkBackend() {
  try {
    const status = await api.getStatus();
    backendOk = status.listener_running;
    if (status.connected) {
      statusMsg.textContent = `Connected: ${status.port_name}`;
      statusMsg.classList.remove('lp-status--error');
    } else if (status.listener_running) {
      statusMsg.textContent = 'Listening for Launchpad...';
      statusMsg.classList.remove('lp-status--error');
    } else {
      statusMsg.textContent = 'Backend not running';
      statusMsg.classList.add('lp-status--error');
    }
  } catch {
    backendOk = false;
    statusMsg.textContent = 'Backend not running — start the server with: cd backend && uvicorn server:app --port 8000';
    statusMsg.classList.add('lp-status--error');
  }
}

// ── WebSocket ────────────────────────────────────────────────────

function connectWebSocket() {
  wsConnection = api.connectWS((event) => {
    if (event.type === 'pad_press') {
      flashPad(event.note);
    } else if (event.type === 'status') {
      if (event.connected) {
        statusMsg.textContent = `Connected: ${event.port_name}`;
        statusMsg.classList.remove('lp-status--error');
      } else {
        statusMsg.textContent = 'Listening for Launchpad...';
        statusMsg.classList.remove('lp-status--error');
      }
    }
  });
}

// ── Init ─────────────────────────────────────────────────────────

export function init() {
  buildUI();

  // Load data eagerly so it's ready when user switches to tab
  checkBackend();
  loadMappings();
  loadProfiles();
  loadApps();
  connectWebSocket();

  bus.on('tab:changed', (tabId) => {
    if (tabId === 'launchpad') {
      checkBackend();
      loadMappings();
      loadProfiles();
    }
  });
}
