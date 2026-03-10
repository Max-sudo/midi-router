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

// Colors that map exactly to Launchpad Pro MK3 7-bit RGB (0-127).
// Each channel value × 2 = the hex byte, so >> 1 is lossless.
// Organized: reds, oranges, yellows, greens, cyans, blues, purples, pinks, white
const PAD_COLORS = [
  '#fe0000', '#fe3200', '#fe6400', '#fe9600',
  '#fec800', '#fefe00', '#64fe00', '#00fe00',
  '#00fe64', '#00fefe', '#0064fe', '#0000fe',
  '#3200fe', '#6400fe', '#9600fe', '#fe00fe',
  '#fe0096', '#fe0064', '#fe6464', '#fec896',
  '#96fefe', '#9696fe', '#c896fe', '#fefefe',
];

const ACTION_TYPES = [
  { value: 'open_app', label: 'Open App' },
  { value: 'keyboard_shortcut', label: 'Keyboard Shortcut' },
  { value: 'applescript', label: 'AppleScript' },
  { value: 'shell', label: 'Shell Command' },
  { value: 'workspace', label: 'Workspace' },
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
    // Snap to Launchpad-compatible color (even values only, so >>1 is lossless)
    const raw = colorPicker.value;
    const r = parseInt(raw.slice(1, 3), 16) & 0xFE;
    const g = parseInt(raw.slice(3, 5), 16) & 0xFE;
    const b = parseInt(raw.slice(5, 7), 16) & 0xFE;
    const snapped = `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`;
    colorPicker.value = snapped;
    customSwatch.style.background = snapped;
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

  } else if (actionType === 'workspace') {
    // Desktop / Space number
    const desktopField = createElement('div', { className: 'field' });
    desktopField.appendChild(createElement('label', { className: 'field__label', textContent: 'Desktop (Space)' }));
    const desktopInput = createElement('input', {
      type: 'number', className: 'field__input', name: 'desktop',
      placeholder: '1', min: '1', max: '16',
      value: params.desktop || '',
    });
    desktopField.appendChild(desktopInput);
    container.appendChild(desktopField);

    // Hidden container to hold selected app names
    const selectedApps = params.apps || [];
    const appsInput = createElement('input', { type: 'hidden', name: 'apps' });
    appsInput.value = JSON.stringify(selectedApps);

    // Filter out system/utility apps that aren't useful
    const HIDDEN_APPS = new Set([
      'Automator', 'Migration Assistant', 'AirPort Utility', 'Boot Camp Assistant',
      'Bluetooth File Exchange', 'ColorSync Utility', 'Console', 'Directory Utility',
      'Disk Utility', 'Grapher', 'Keychain Access', 'System Information',
      'System Preferences', 'System Settings', 'MIDI Setup', 'Audio MIDI Setup',
      'VoiceOver Utility', 'Accessibility Inspector', 'FileMerge', 'Instruments',
      'Ticket Viewer', 'Certificate Assistant', 'Wireless Diagnostics',
      'Screen Sharing', 'DVD Player', 'Chess',
    ]);

    // Apps section
    const addField = createElement('div', { className: 'field' });
    addField.appendChild(createElement('label', { className: 'field__label', textContent: 'Apps' }));

    // Helper: get display name from a mixed entry (string or {name, path})
    function appName(entry) {
      return typeof entry === 'object' ? entry.name : entry;
    }

    // Selected apps list (rendered above search)
    const selectedList = createElement('div', { className: 'ws-app-list' });

    function renderSelected() {
      selectedList.innerHTML = '';
      for (let i = 0; i < selectedApps.length; i++) {
        const entry = selectedApps[i];
        const displayName = appName(entry);
        const isVSCode = displayName === 'Visual Studio Code';

        const card = createElement('div', { className: 'ws-app-card' + (isVSCode ? ' ws-app-card--has-path' : '') });

        // Top row: icon + name + remove
        const row = createElement('div', { className: 'ws-app-card__row' });
        const icon = createElement('img', {
          className: 'ws-app-card__icon',
          src: `/api/launchpad/apps/${encodeURIComponent(displayName)}/icon`,
          width: 32, height: 32,
        });
        icon.onerror = function() { this.style.display = 'none'; };
        const name = createElement('span', {
          className: 'ws-app-card__name',
          textContent: displayName,
        });
        const removeBtn = createElement('button', {
          className: 'ws-app-card__remove',
          innerHTML: '<svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 2l6 6M8 2L2 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
          type: 'button',
        });
        removeBtn.addEventListener('click', () => {
          selectedApps.splice(i, 1);
          appsInput.value = JSON.stringify(selectedApps);
          renderSelected();
          renderDropdown();
        });
        row.appendChild(icon);
        row.appendChild(name);
        row.appendChild(removeBtn);
        card.appendChild(row);

        // VS Code: folder browser for project path
        if (isVSCode) {
          const currentPath = (typeof entry === 'object' ? entry.path : '') || '';
          const pathWrap = createElement('div', { className: 'ws-folder-picker' });

          const pathDisplay = createElement('div', { className: 'ws-folder-picker__current' });
          pathDisplay.textContent = currentPath || 'No folder selected';
          if (currentPath) pathDisplay.classList.add('ws-folder-picker__current--set');

          const browseBtn = createElement('button', {
            className: 'ws-folder-picker__browse',
            textContent: 'Browse',
            type: 'button',
          });

          const browserPanel = createElement('div', { className: 'ws-folder-browser' });
          browserPanel.hidden = true;

          function updatePath(newPath) {
            if (typeof selectedApps[i] === 'string') {
              selectedApps[i] = { name: 'Visual Studio Code', path: newPath };
            } else {
              selectedApps[i].path = newPath;
            }
            appsInput.value = JSON.stringify(selectedApps);
            pathDisplay.textContent = newPath || 'No folder selected';
            pathDisplay.classList.toggle('ws-folder-picker__current--set', !!newPath);
          }

          async function loadDir(dirPath) {
            try {
              const res = await fetch(`/api/browse?path=${encodeURIComponent(dirPath)}`);
              const data = await res.json();
              browserPanel.innerHTML = '';

              // Header with current path and select button
              const header = createElement('div', { className: 'ws-folder-browser__header' });
              const pathLabel = createElement('span', {
                className: 'ws-folder-browser__path',
                textContent: data.path,
              });
              header.appendChild(pathLabel);
              browserPanel.appendChild(header);

              // Navigation row: back button + select this folder
              const nav = createElement('div', { className: 'ws-folder-browser__nav' });

              if (data.parent !== data.path) {
                const upBtn = createElement('button', {
                  className: 'ws-folder-browser__up',
                  innerHTML: '<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M6 10V2M6 2L2 6M6 2l4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg> Up',
                  type: 'button',
                });
                upBtn.addEventListener('click', () => loadDir(data.parent));
                nav.appendChild(upBtn);
              }

              const selectBtn = createElement('button', {
                className: 'ws-folder-browser__select',
                textContent: 'Select this folder',
                type: 'button',
              });
              selectBtn.addEventListener('click', () => {
                updatePath(data.path);
                browserPanel.hidden = true;
              });
              nav.appendChild(selectBtn);
              browserPanel.appendChild(nav);

              // Folder list
              const list = createElement('div', { className: 'ws-folder-browser__list' });
              for (const item of data.items) {
                const row = createElement('div', { className: 'ws-folder-browser__item' });
                row.innerHTML = '<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M1.5 2.5h4l1.5 1.5h5.5v7.5h-11z" stroke="currentColor" stroke-width="1" fill="rgba(0,240,255,0.1)"/></svg>';
                const label = createElement('span', { textContent: item.name });
                row.appendChild(label);
                row.addEventListener('click', () => loadDir(item.path));
                list.appendChild(row);
              }
              if (data.items.length === 0) {
                list.appendChild(createElement('div', {
                  className: 'ws-folder-browser__empty',
                  textContent: 'No subfolders',
                }));
              }
              browserPanel.appendChild(list);
            } catch (e) {
              browserPanel.innerHTML = '';
              browserPanel.appendChild(createElement('div', {
                className: 'ws-folder-browser__empty',
                textContent: 'Failed to load directory',
              }));
            }
          }

          browseBtn.addEventListener('click', () => {
            browserPanel.hidden = !browserPanel.hidden;
            if (!browserPanel.hidden) {
              loadDir(currentPath || '~');
            }
          });

          pathWrap.appendChild(pathDisplay);
          pathWrap.appendChild(browseBtn);
          card.appendChild(pathWrap);
          card.appendChild(browserPanel);
        }

        selectedList.appendChild(card);
      }
    }

    // Search filter + native select dropdown
    const searchInput = createElement('input', {
      type: 'text', className: 'field__input',
      placeholder: 'Search apps...', autocomplete: 'off',
    });

    const appSelect = createElement('select', { className: 'dropdown', name: '_app_picker' });

    function populateSelect(filter = '') {
      appSelect.innerHTML = '';
      appSelect.appendChild(new Option('— Add an app —', ''));
      const query = filter.toLowerCase();
      const selectedNames = selectedApps.map(e => appName(e));
      const filtered = appList
        .filter(a => !HIDDEN_APPS.has(a))
        .filter(a => !selectedNames.includes(a))
        .filter(a => !query || a.toLowerCase().includes(query));
      for (const name of filtered) {
        appSelect.appendChild(new Option(name, name));
      }
    }

    // Ensure apps are loaded, then populate
    if (appList.length === 0) {
      loadApps().then(() => populateSelect());
    } else {
      populateSelect();
    }

    searchInput.addEventListener('input', () => populateSelect(searchInput.value));

    appSelect.addEventListener('change', () => {
      const val = appSelect.value;
      if (!val) return;
      const entry = val === 'Visual Studio Code'
        ? { name: val, path: '' }
        : val;
      selectedApps.push(entry);
      appsInput.value = JSON.stringify(selectedApps);
      renderSelected();
      populateSelect(searchInput.value);
      appSelect.value = '';
    });

    renderSelected();

    addField.appendChild(searchInput);
    addField.appendChild(appSelect);
    addField.appendChild(selectedList);
    addField.appendChild(appsInput);
    container.appendChild(addField);
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
  if (actionType === 'workspace') {
    const desktop = params.desktop ? `D${params.desktop}` : '';
    const apps = params.apps || [];
    const getName = e => typeof e === 'object' ? e.name : e;
    const getLabel = e => {
      if (typeof e === 'object' && e.path) {
        return e.path.split('/').filter(Boolean).pop() || e.name;
      }
      return getName(e);
    };
    const appLabel = apps.length === 1 ? getLabel(apps[0]) : apps.length > 1 ? `${apps.length} apps` : '';
    return [desktop, appLabel].filter(Boolean).join(': ') || 'Workspace';
  }
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
  } else if (actionType === 'workspace') {
    const desktop = container.querySelector('[name="desktop"]')?.value;
    if (desktop) params.desktop = parseInt(desktop, 10);
    try {
      params.apps = JSON.parse(container.querySelector('[name="apps"]')?.value || '[]');
    } catch { params.apps = []; }
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
