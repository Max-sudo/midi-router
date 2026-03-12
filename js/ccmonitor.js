// ── CC Monitor: real-time MIDI CC display ────────────────────────────
import { bus, $ } from './utils.js';
import * as midi from './midi.js';

const STORAGE_KEY = 'cc-monitor-groups';
const USER_PRESETS_KEY = 'cc-monitor-user-presets';
const ACTIVE_PRESET_KEY = 'cc-monitor-active-preset';

let panel = null;
let userPresets = {};  // name → group config (same shape as PRESETS entries)
let groupsContainer = null;
let activePresetName = '';  // currently loaded preset name
const ccState = new Map();   // cc# → { value, groupName, barEl, valEl, labelEl }
let groups = {};             // groupName → { color, ccs: { cc#: label } }
let draggingGroupName = null; // track which group is being dragged
let layoutMode = 'vertical';  // 'vertical' | 'horizontal'

// Palette for group colors
const GROUP_COLORS = [
  { name: 'cyan',    fill: '#00f0ff', glow: 'rgba(0, 240, 255, 0.25)',  border: 'rgba(0, 240, 255, 0.4)'  },
  { name: 'orange',  fill: '#ff9f0a', glow: 'rgba(255, 159, 10, 0.25)', border: 'rgba(255, 159, 10, 0.4)' },
  { name: 'purple',  fill: '#bf5af2', glow: 'rgba(191, 90, 242, 0.25)', border: 'rgba(191, 90, 242, 0.4)' },
  { name: 'green',   fill: '#30d158', glow: 'rgba(48, 209, 88, 0.25)',  border: 'rgba(48, 209, 88, 0.4)'  },
  { name: 'magenta', fill: '#ff2d55', glow: 'rgba(255, 45, 85, 0.25)',  border: 'rgba(255, 45, 85, 0.4)'  },
  { name: 'blue',    fill: '#5e5ce6', glow: 'rgba(94, 92, 230, 0.25)',  border: 'rgba(94, 92, 230, 0.4)'  },
  { name: 'yellow',  fill: '#ffd60a', glow: 'rgba(255, 214, 10, 0.25)', border: 'rgba(255, 214, 10, 0.4)' },
  { name: 'teal',    fill: '#64d2ff', glow: 'rgba(100, 210, 255, 0.25)',border: 'rgba(100, 210, 255, 0.4)'},
];

const DEFAULT_GROUPS = {
  'Reverb':  { color: 0, ccs: {} },
  'Delay':   { color: 1, ccs: {} },
  'Chorus':  { color: 2, ccs: {} },
};


/* ── Presets ──────────────────────────────────────────────────────── */
const PRESETS = {
  'lead groove': {
    'AM Ring Mod':    { color: 0, icon: 'Modulation',  bypassCC: 7,  ccs: { 25: 'Mix', 26: 'Frequency', 27: 'AM Freq' } },
    'Alpaca Rouge':   { color: 1, icon: 'Distortion',  bypassCC: 41, ccs: { 11: 'Drive', 9: 'High Cut', 10: 'Level' } },
    'Dynamic Hall':   { color: 2, icon: 'Reverb',      bypassCC: 44, ccs: { 5: 'Decay', 4: 'Mix' } },
    'Simple Delay':   { color: 3, icon: 'Delay',       bypassCC: 43, ccs: { 19: 'Feedback', 17: 'Mix', 20: 'Scale', 18: 'Time' } },
    'Simple EQ':      { color: 4, icon: 'EQ',          bypassCC: 82, ccs: { 24: 'High Gain', 22: 'Low Gain', 21: 'Mid Freq', 23: 'Mid Gain' } },
    'Trinity Chorus': { color: 5, icon: 'Modulation',  bypassCC: 15, ccs: { 12: 'Mix', 13: 'Rate' } },
  },
};

/* ── Persistence ──────────────────────────────────────────────────── */
function loadGroups() {
  // Clear legacy storage key from old version
  localStorage.removeItem('cc-monitor-labels');

  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (saved && Object.keys(saved).length > 0) {
      // Migrate old format: ensure every group has a `color` number
      let needsSave = false;
      let colorIdx = 0;
      for (const [name, g] of Object.entries(saved)) {
        if (typeof g.color !== 'number') {
          g.color = colorIdx;
          needsSave = true;
        }
        if (!g.ccs) { g.ccs = {}; needsSave = true; }
        colorIdx++;
      }
      groups = saved;
      if (needsSave) saveGroups();
    } else {
      groups = JSON.parse(JSON.stringify(DEFAULT_GROUPS));
      saveGroups();
    }
  } catch {
    groups = JSON.parse(JSON.stringify(DEFAULT_GROUPS));
    saveGroups();
  }
}

function saveGroups() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(groups));
}

function getGroupColor(groupName) {
  const idx = groups[groupName]?.color ?? 0;
  return GROUP_COLORS[idx % GROUP_COLORS.length];
}

function nextColorIndex() {
  const used = new Set(Object.values(groups).map(g => g.color ?? 0));
  for (let i = 0; i < GROUP_COLORS.length; i++) {
    if (!used.has(i)) return i;
  }
  return Object.keys(groups).length % GROUP_COLORS.length;
}

/* ── Bar style helper ─────────────────────────────────────────────── */
function barStyle(pct, fill, glow) {
  return 'height:' + pct + '%;--bar-pct:' + pct + '%;background-color:' + fill + ' !important;box-shadow:0 0 12px ' + glow + ';';
}

/* ── MIDI handling (batched via rAF for smooth updates) ───────────── */
const pendingUpdates = new Map(); // cc → val
let rafId = null;

function onMidiMessage({ data, msgType }) {
  if (msgType !== 'cc') return;
  const cc = data[1];
  const val = data[2];

  // Check if this CC is a bypass toggle for any group
  for (const [gName, g] of Object.entries(groups)) {
    if (g.bypassCC !== undefined && parseInt(g.bypassCC) === cc) {
      const bypassed = val < 64; // 0-63 = bypassed, 64-127 = active
      const groupEl = groupsContainer.querySelector(`[data-group="${CSS.escape(gName)}"]`);
      if (groupEl) groupEl.classList.toggle('ccm-group--bypassed', bypassed);
    }
  }

  if (ccState.has(cc)) {
    // Queue update for next animation frame
    pendingUpdates.set(cc, val);
    if (!rafId) {
      rafId = requestAnimationFrame(flushUpdates);
    }
  } else {
    let found = false;
    for (const [gName, g] of Object.entries(groups)) {
      if (g.ccs && g.ccs[cc] !== undefined) {
        addCCToGroup(cc, val, gName);
        found = true;
        break;
      }
    }
    // Ignore unassigned CCs — don't create an Unassigned group
  }
}

function flushUpdates() {
  rafId = null;
  for (const [cc, val] of pendingUpdates) {
    const state = ccState.get(cc);
    if (!state) continue;
    state.value = val;
    const color = getGroupColor(state.groupName);
    state.barEl.style.cssText = barStyle(val / 127 * 100, color.fill, color.glow);
    state.valEl.textContent = val;
  }
  pendingUpdates.clear();
}

/* ── Apply color to group element ─────────────────────────────────── */
function applyGroupColor(groupEl, groupName) {
  const color = getGroupColor(groupName);
  groupEl.style.setProperty('--group-fill', color.fill);
  groupEl.style.setProperty('--group-glow', color.glow);
  groupEl.style.setProperty('--group-border', color.border);
}

/* ── Color picker popup ───────────────────────────────────────────── */
function showColorPicker(anchorEl, groupEl) {
  // Remove any existing picker
  const existing = panel.querySelector('.ccm-color-picker');
  if (existing) existing.remove();

  const picker = document.createElement('div');
  picker.className = 'ccm-color-picker';

  GROUP_COLORS.forEach((c, idx) => {
    const swatch = document.createElement('button');
    swatch.className = 'ccm-color-swatch';
    swatch.style.background = c.fill;
    swatch.title = c.name;

    // Highlight current selection
    const currentIdx = groups[groupEl.dataset.group]?.color ?? 0;
    if (idx === currentIdx) swatch.classList.add('ccm-color-swatch--active');

    swatch.addEventListener('click', (e) => {
      e.stopPropagation();
      const g = groups[groupEl.dataset.group];
      if (!g) return;
      g.color = idx;
      saveGroups();
      applyGroupColor(groupEl, groupEl.dataset.group);
      recolorGroupBars(groupEl.dataset.group);
      picker.remove();
    });

    picker.appendChild(swatch);
  });

  // Position relative to the group header
  const header = groupEl.querySelector('.ccm-group-header');
  header.style.position = 'relative';
  header.appendChild(picker);

  // Close on click outside
  const closeHandler = (e) => {
    if (!picker.contains(e.target)) {
      picker.remove();
      document.removeEventListener('click', closeHandler);
    }
  };
  setTimeout(() => document.addEventListener('click', closeHandler), 0);
}

/* ── Recolor all bars in a group ───────────────────────────────────── */
function recolorGroupBars(groupName) {
  const color = getGroupColor(groupName);
  for (const [cc, state] of ccState.entries()) {
    if (state.groupName === groupName) {
      const h = (state.value / 127 * 100);
      state.barEl.style.cssText = barStyle(h, color.fill, color.glow);
    }
  }
}

/* ── Group / bar rendering ────────────────────────────────────────── */
function getOrCreateGroupEl(groupName) {
  let groupEl = groupsContainer.querySelector(`[data-group="${CSS.escape(groupName)}"]`);
  if (groupEl) return groupEl;

  groupEl = document.createElement('div');
  groupEl.className = 'ccm-group';
  groupEl.dataset.group = groupName;
  applyGroupColor(groupEl, groupName);

  const header = document.createElement('div');
  header.className = 'ccm-group-header';

  // Category icon (if group has one from preset)
  const iconName = groups[groupName]?.icon;
  if (iconName) {
    const iconEl = document.createElement('img');
    iconEl.className = 'ccm-group-icon';
    iconEl.src = 'icons_category/' + iconName + '.png';
    iconEl.alt = iconName;
    iconEl.draggable = false;
    header.appendChild(iconEl);
  }

  // Title row — wraps title + color dot together
  const titleRow = document.createElement('div');
  titleRow.className = 'ccm-group-title-row';

  const titleInput = document.createElement('input');
  titleInput.className = 'ccm-group-title';
  titleInput.type = 'text';
  titleInput.value = groupName;
  titleInput.addEventListener('change', () => {
    const newName = titleInput.value.trim();
    if (!newName || newName === groupName || groups[newName]) {
      titleInput.value = groupName;
      return;
    }
    groups[newName] = groups[groupName];
    delete groups[groupName];
    groupEl.dataset.group = newName;
    for (const [cc, state] of ccState.entries()) {
      if (state.groupName === groupName) state.groupName = newName;
    }
    saveGroups();
  });
  titleInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') titleInput.blur();
  });
  titleRow.appendChild(titleInput);

  const colorBtn = document.createElement('button');
  colorBtn.className = 'ccm-group-color-btn';
  colorBtn.title = 'Change color';
  colorBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    showColorPicker(header, groupEl);
  });
  titleRow.appendChild(colorBtn);

  header.appendChild(titleRow);

  // Bypass CC indicator — small tag showing bypass CC#
  const bypassTag = document.createElement('span');
  bypassTag.className = 'ccm-group-bypass-tag';
  const bcc = groups[groupName]?.bypassCC;
  bypassTag.textContent = bcc !== undefined ? `BP:${bcc}` : 'BP';
  bypassTag.title = 'Set bypass CC (click to edit)';
  bypassTag.addEventListener('click', (e) => {
    e.stopPropagation();
    const current = groups[groupName]?.bypassCC;
    const input = prompt('Bypass CC# for ' + groupName + ':\n(Leave empty to remove)', current !== undefined ? current : '');
    if (input === null) return; // cancelled
    const trimmed = input.trim();
    if (trimmed === '') {
      delete groups[groupName].bypassCC;
      bypassTag.textContent = 'BP';
      // Remove bypassed state
      groupEl.classList.remove('ccm-group--bypassed');
    } else {
      const num = parseInt(trimmed);
      if (!isNaN(num) && num >= 0 && num <= 127) {
        groups[groupName].bypassCC = num;
        bypassTag.textContent = `BP:${num}`;
      }
    }
    saveGroups();
  });
  header.appendChild(bypassTag);

  // Remove button (top-right corner)
  const removeBtn = document.createElement('button');
  removeBtn.className = 'ccm-group-remove';
  removeBtn.textContent = '\u00d7';
  removeBtn.title = 'Remove group (CCs move to Unassigned)';
  removeBtn.addEventListener('click', () => removeGroup(groupEl.dataset.group));
  header.appendChild(removeBtn);

  // Right-click on header or title to pick color
  header.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    showColorPicker(header, groupEl);
  });
  titleInput.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    showColorPicker(header, groupEl);
  });

  const barsRow = document.createElement('div');
  barsRow.className = 'ccm-bars';

  groupEl.appendChild(header);
  groupEl.appendChild(barsRow);

  // ── Group-level drag (header is the handle) ──
  header.draggable = true;
  header.addEventListener('mousedown', (e) => {
    // Disable drag when clicking interactive elements
    if (e.target.closest('input, button')) {
      header.draggable = false;
      // Re-enable after interaction
      const restore = () => { header.draggable = true; document.removeEventListener('mouseup', restore); };
      document.addEventListener('mouseup', restore);
    }
  });
  header.addEventListener('dragstart', (e) => {
    e.dataTransfer.setData('application/x-ccm-group', groupEl.dataset.group);
    e.dataTransfer.effectAllowed = 'move';
    // Use the whole group box as the drag image
    const rect = groupEl.getBoundingClientRect();
    e.dataTransfer.setDragImage(groupEl, e.clientX - rect.left, e.clientY - rect.top);
    draggingGroupName = groupEl.dataset.group;
    requestAnimationFrame(() => groupEl.classList.add('ccm-group--dragging'));
    e.stopPropagation();
  });
  header.addEventListener('dragend', () => {
    draggingGroupName = null;
    groupEl.classList.remove('ccm-group--dragging');
    clearGroupDropIndicators();
  });

  groupEl.addEventListener('dragover', (e) => {
    // Check if this is a group drag (not a bar drag)
    if (!e.dataTransfer.types.includes('application/x-ccm-group')) return;
    // Skip if dragging over self
    if (draggingGroupName === groupEl.dataset.group) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    clearGroupDropIndicators();
    const rect = groupEl.getBoundingClientRect();
    const midX = rect.left + rect.width / 2;
    if (e.clientX < midX) {
      groupEl.classList.add('ccm-group--drop-before');
    } else {
      groupEl.classList.add('ccm-group--drop-after');
    }
  });

  groupEl.addEventListener('dragleave', (e) => {
    if (!groupEl.contains(e.relatedTarget)) {
      groupEl.classList.remove('ccm-group--drop-before', 'ccm-group--drop-after');
    }
  });

  groupEl.addEventListener('drop', (e) => {
    if (!e.dataTransfer.types.includes('application/x-ccm-group')) return;
    e.preventDefault();
    e.stopPropagation();
    const draggedName = e.dataTransfer.getData('application/x-ccm-group');
    const draggedEl = groupsContainer.querySelector(`[data-group="${CSS.escape(draggedName)}"]`);
    if (!draggedEl || draggedEl === groupEl) { clearGroupDropIndicators(); return; }

    const rect = groupEl.getBoundingClientRect();
    const midX = rect.left + rect.width / 2;
    if (e.clientX < midX) {
      groupsContainer.insertBefore(draggedEl, groupEl);
    } else {
      groupsContainer.insertBefore(draggedEl, groupEl.nextElementSibling);
    }
    clearGroupDropIndicators();
    saveGroupOrder();
  });

  // Unassigned always last
  let inserted = false;
  for (const existing of groupsContainer.querySelectorAll('.ccm-group')) {
    if (existing.dataset.group === 'Unassigned') {
      groupsContainer.insertBefore(groupEl, existing);
      inserted = true;
      break;
    }
  }
  if (!inserted) groupsContainer.appendChild(groupEl);

  return groupEl;
}

function clearGroupDropIndicators() {
  for (const el of groupsContainer.querySelectorAll('.ccm-group--drop-before,.ccm-group--drop-after')) {
    el.classList.remove('ccm-group--drop-before', 'ccm-group--drop-after');
  }
}

function saveGroupOrder() {
  const order = [...groupsContainer.querySelectorAll('.ccm-group')].map(el => el.dataset.group);
  localStorage.setItem('cc-monitor-group-order', JSON.stringify(order));
  // Rebuild groups object in new order so saveGroups preserves it
  const reordered = {};
  for (const name of order) {
    if (groups[name]) reordered[name] = groups[name];
  }
  // Include any groups not in the DOM (shouldn't happen, but safety)
  for (const name of Object.keys(groups)) {
    if (!reordered[name]) reordered[name] = groups[name];
  }
  groups = reordered;
  saveGroups();
}

function getOrderedGroupNames() {
  const names = Object.keys(groups);
  try {
    const saved = JSON.parse(localStorage.getItem('cc-monitor-group-order') || '[]');
    if (saved.length) {
      const ordered = saved.filter(n => names.includes(n));
      for (const n of names) {
        if (!ordered.includes(n)) ordered.push(n);
      }
      return ordered;
    }
  } catch {}
  return names;
}

function addCCToGroup(cc, val, groupName) {
  const groupEl = getOrCreateGroupEl(groupName);
  const barsRow = groupEl.querySelector('.ccm-bars');

  const barCol = document.createElement('div');
  barCol.className = 'ccm-bar-col';
  barCol.dataset.cc = cc;
  barCol.draggable = true;

  barCol.addEventListener('dragstart', (e) => {
    e.dataTransfer.setData('text/plain', String(cc));
    barCol.classList.add('ccm-bar-col--dragging');
  });
  barCol.addEventListener('dragend', () => {
    barCol.classList.remove('ccm-bar-col--dragging');
  });

  const barTrack = document.createElement('div');
  barTrack.className = 'ccm-bar-track';

  const barFill = document.createElement('div');
  barFill.className = 'ccm-bar-fill';
  barFill.style.height = (val / 127 * 100) + '%';

  const valEl = document.createElement('span');
  valEl.className = 'ccm-bar-value';
  valEl.textContent = val;

  barTrack.appendChild(barFill);
  barTrack.appendChild(valEl);

  const labelEl = document.createElement('input');
  labelEl.className = 'ccm-bar-label';
  labelEl.type = 'text';
  const savedLabel = groups[groupName]?.ccs?.[cc] || '';
  labelEl.value = savedLabel;
  labelEl.placeholder = 'CC ' + cc;
  labelEl.addEventListener('input', () => {
    const currentGroup = ccState.get(cc)?.groupName;
    if (currentGroup && groups[currentGroup]?.ccs) {
      groups[currentGroup].ccs[cc] = labelEl.value;
      saveGroups();
    }
  });
  labelEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') labelEl.blur();
  });

  const ccTag = document.createElement('span');
  ccTag.className = 'ccm-bar-cc';
  ccTag.textContent = cc;

  barCol.appendChild(barTrack);
  barCol.appendChild(labelEl);
  barCol.appendChild(ccTag);

  barsRow.appendChild(barCol);

  // Apply group color directly to bar via cssText to guarantee override
  const groupColor = getGroupColor(groupName);
  barFill.style.cssText = barStyle(val / 127 * 100, groupColor.fill, groupColor.glow);

  ccState.set(cc, { value: val, groupName, barEl: barFill, valEl, labelEl });
}

function removeGroup(groupName) {
  const ccsToMove = groups[groupName]?.ccs || {};

  if (groupName === 'Unassigned') {
    // Removing Unassigned — just discard its CCs
    for (const cc of Object.keys(ccsToMove)) {
      ccState.delete(parseInt(cc));
    }
  } else {
    // Move CCs to Unassigned
    if (!groups['Unassigned']) groups['Unassigned'] = { color: GROUP_COLORS.length - 1, ccs: {} };
    for (const [cc, label] of Object.entries(ccsToMove)) {
      groups['Unassigned'].ccs[cc] = label;
      const state = ccState.get(parseInt(cc));
      if (state) {
        state.groupName = 'Unassigned';
        const unassignedEl = getOrCreateGroupEl('Unassigned');
        const barsRow = unassignedEl.querySelector('.ccm-bars');
        const barCol = groupsContainer.querySelector(`.ccm-bar-col[data-cc="${cc}"]`);
        if (barCol) barsRow.appendChild(barCol);
      }
    }
  }

  delete groups[groupName];
  saveGroups();

  const groupEl = groupsContainer.querySelector(`[data-group="${CSS.escape(groupName)}"]`);
  if (groupEl) groupEl.remove();
}

/* ── Drop targets on groups (handles both cross-group and reorder) ── */
function setupGroupDropTarget(groupEl) {
  const barsRow = groupEl.querySelector('.ccm-bars');

  groupEl.addEventListener('dragover', (e) => {
    e.preventDefault();
    groupEl.classList.add('ccm-group--dragover');

    // Show drop indicator between bars
    clearDropIndicators(barsRow);
    const target = e.target.closest('.ccm-bar-col');
    if (target && barsRow.contains(target)) {
      const rect = target.getBoundingClientRect();
      const midX = rect.left + rect.width / 2;
      if (e.clientX < midX) {
        target.classList.add('ccm-drop-before');
      } else {
        target.classList.add('ccm-drop-after');
      }
    }
  });

  groupEl.addEventListener('dragleave', (e) => {
    // Only remove if leaving the group entirely
    if (!groupEl.contains(e.relatedTarget)) {
      groupEl.classList.remove('ccm-group--dragover');
      clearDropIndicators(barsRow);
    }
  });

  groupEl.addEventListener('drop', (e) => {
    e.preventDefault();
    groupEl.classList.remove('ccm-group--dragover');
    const cc = parseInt(e.dataTransfer.getData('text/plain'));
    const targetGroup = groupEl.dataset.group;

    // Find drop position
    const dropTarget = e.target.closest('.ccm-bar-col');
    let beforeEl = null;
    if (dropTarget && barsRow.contains(dropTarget)) {
      const rect = dropTarget.getBoundingClientRect();
      const midX = rect.left + rect.width / 2;
      if (e.clientX < midX) {
        beforeEl = dropTarget;
      } else {
        beforeEl = dropTarget.nextElementSibling;
      }
    }

    clearDropIndicators(barsRow);
    moveCCToGroup(cc, targetGroup, beforeEl);
  });
}

function clearDropIndicators(barsRow) {
  for (const el of barsRow.querySelectorAll('.ccm-drop-before,.ccm-drop-after')) {
    el.classList.remove('ccm-drop-before', 'ccm-drop-after');
  }
}

function moveCCToGroup(cc, targetGroup, beforeEl) {
  const state = ccState.get(cc);
  if (!state) return;

  const oldGroup = state.groupName;
  const sameGroup = oldGroup === targetGroup;

  if (!sameGroup) {
    if (groups[oldGroup]?.ccs) {
      delete groups[oldGroup].ccs[cc];
    }
    if (!groups[targetGroup]) groups[targetGroup] = { color: nextColorIndex(), ccs: {} };
    groups[targetGroup].ccs[cc] = state.labelEl.value;
    state.groupName = targetGroup;
  }

  const barCol = groupsContainer.querySelector(`.ccm-bar-col[data-cc="${cc}"]`);
  const targetEl = getOrCreateGroupEl(targetGroup);
  const barsRow = targetEl.querySelector('.ccm-bars');

  if (barCol) {
    if (beforeEl && barsRow.contains(beforeEl) && beforeEl !== barCol) {
      barsRow.insertBefore(barCol, beforeEl);
    } else if (!beforeEl || !barsRow.contains(beforeEl)) {
      barsRow.appendChild(barCol);
    }
  }

  if (!sameGroup) {
    // Recolor bar to match new group
    const color = getGroupColor(targetGroup);
    const h = (state.value / 127 * 100);
    state.barEl.style.cssText = barStyle(h, color.fill, color.glow);
    // Save order for old group too
    saveBarOrder(oldGroup);
  }
  saveBarOrder(targetGroup);
  saveGroups();
}

/* ── Persist bar order from DOM ──────────────────────────────────── */
function saveBarOrder(groupName) {
  const groupEl = groupsContainer.querySelector(`[data-group="${CSS.escape(groupName)}"]`);
  if (!groupEl) return;
  const barsRow = groupEl.querySelector('.ccm-bars');
  if (!barsRow) return;
  const order = [...barsRow.querySelectorAll('.ccm-bar-col')].map(el => parseInt(el.dataset.cc));
  if (groups[groupName]) {
    groups[groupName].order = order;
  }
}

/* ── Add CCs for a group, respecting saved order ─────────────────── */
function addCCsForGroup(gName) {
  const g = groups[gName];
  if (!g || !g.ccs) return;
  const ccKeys = Object.keys(g.ccs).map(Number);
  // Use saved order if available, fall back to key order
  const order = g.order ? g.order.filter(cc => ccKeys.includes(cc)) : [];
  // Append any CCs not in the saved order
  for (const cc of ccKeys) {
    if (!order.includes(cc)) order.push(cc);
  }
  for (const cc of order) {
    addCCToGroup(cc, 0, gName);
  }
}

/* ── Add group ────────────────────────────────────────────────────── */
function addNewGroup() {
  let name = 'New Effect';
  let i = 1;
  while (groups[name]) { name = `New Effect ${++i}`; }
  groups[name] = { color: nextColorIndex(), ccs: {} };
  saveGroups();
  const groupEl = getOrCreateGroupEl(name);
  const titleInput = groupEl.querySelector('.ccm-group-title');
  if (titleInput) { titleInput.select(); titleInput.focus(); }
}

/* ── Presets (built-in + user) ────────────────────────────────────── */
function loadUserPresets() {
  try {
    userPresets = JSON.parse(localStorage.getItem(USER_PRESETS_KEY) || '{}');
  } catch {
    userPresets = {};
  }
}

function saveUserPresets() {
  localStorage.setItem(USER_PRESETS_KEY, JSON.stringify(userPresets));
}

function getAllPresets() {
  return { ...PRESETS, ...userPresets };
}

function rebuildPresetDropdown(selectValue) {
  const sel = panel.querySelector('#ccm-preset-select');
  if (!sel) return;
  const all = getAllPresets();
  let html = '<option value="">— Presets —</option>';
  const builtIn = Object.keys(PRESETS);
  const user = Object.keys(userPresets);
  for (const name of builtIn) {
    html += '<option value="' + name + '">' + name.charAt(0).toUpperCase() + name.slice(1) + '</option>';
  }
  if (user.length) {
    html += '<option disabled>──────────</option>';
    for (const name of user) {
      html += '<option value="' + name + '">' + name.charAt(0).toUpperCase() + name.slice(1) + '</option>';
    }
  }
  sel.innerHTML = html;
  if (selectValue) sel.value = selectValue;
}

function loadPreset(presetName) {
  const all = getAllPresets();
  const preset = all[presetName];
  if (!preset) return;

  ccState.clear();
  activePresetName = presetName;
  localStorage.setItem(ACTIVE_PRESET_KEY, presetName);
  groups = JSON.parse(JSON.stringify(preset));
  saveGroups();
  localStorage.removeItem('cc-monitor-group-order');
  if (groupsContainer) groupsContainer.innerHTML = '';
  for (const gName of Object.keys(groups)) {
    getOrCreateGroupEl(gName);
    addCCsForGroup(gName);
  }
  saveGroupOrder();

  rebuildPresetDropdown(presetName);
}

function snapshotGroups() {
  for (const gName of Object.keys(groups)) {
    saveBarOrder(gName);
  }
  return JSON.parse(JSON.stringify(groups));
}

function flashSaveConfirmation(btnEl) {
  const orig = btnEl.textContent;
  btnEl.textContent = 'Saved!';
  btnEl.classList.add('ccm-save--confirmed');
  setTimeout(() => {
    btnEl.textContent = orig;
    btnEl.classList.remove('ccm-save--confirmed');
  }, 1200);
}

function savePreset() {
  if (!activePresetName) {
    savePresetAs();
    return;
  }
  userPresets[activePresetName] = snapshotGroups();
  saveUserPresets();
  saveGroups();
  rebuildPresetDropdown(activePresetName);
  const btn = panel.querySelector('#ccm-save-preset');
  if (btn) flashSaveConfirmation(btn);
}

function savePresetAs() {
  const name = prompt('Preset name:', activePresetName && !PRESETS[activePresetName] ? activePresetName : '');
  if (!name || !name.trim()) return;
  const key = name.trim();

  if (PRESETS[key]) {
    alert('Cannot overwrite a built-in preset. Choose a different name.');
    return;
  }

  userPresets[key] = snapshotGroups();
  saveUserPresets();
  activePresetName = key;
  localStorage.setItem(ACTIVE_PRESET_KEY, key);
  rebuildPresetDropdown(key);
  const btn = panel.querySelector('#ccm-save-as-preset');
  if (btn) flashSaveConfirmation(btn);
}

function deleteUserPreset(presetName) {
  if (!userPresets[presetName]) return;
  delete userPresets[presetName];
  saveUserPresets();
  rebuildPresetDropdown('');
}

/* ── Clear ────────────────────────────────────────────────────────── */
function clearAll() {
  ccState.clear();
  activePresetName = '';
  localStorage.removeItem(ACTIVE_PRESET_KEY);
  groups = JSON.parse(JSON.stringify(DEFAULT_GROUPS));
  saveGroups();
  if (groupsContainer) groupsContainer.innerHTML = '';
  for (const gName of Object.keys(groups)) {
    getOrCreateGroupEl(gName);
  }
  // Reset dropdown
  const sel = panel.querySelector('#ccm-preset-select');
  if (sel) sel.value = '';
}

/* ── Observe new groups for drop targets ──────────────────────────── */
function observeGroups() {
  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (node.classList?.contains('ccm-group')) {
          setupGroupDropTarget(node);
        }
      }
    }
  });
  observer.observe(groupsContainer, { childList: true });
}

/* ── Pull current CC state from Launch Control XL ────────────────── */
function findLaunchControlXL() {
  const devices = midi.getDevices();
  const input = devices.inputs.find(d => d.name.toLowerCase().includes('launch control xl'));
  const output = devices.outputs.find(d => d.name.toLowerCase().includes('launch control xl'));
  return input && output ? { inputId: input.id, outputId: output.id, name: input.name } : null;
}

// Persistent direct listener on LCXL so CC Monitor works without routes
let _lcxlDirectHandler = null;
let _lcxlListeningId = null;

function attachLCXLListener() {
  const lcxl = findLaunchControlXL();
  if (!lcxl) return;
  if (_lcxlListeningId === lcxl.inputId) return;

  detachLCXLListener();

  const access = midi.getAccess();
  if (!access) return;
  const input = access.inputs.get(lcxl.inputId);
  if (!input) return;

  _lcxlDirectHandler = (event) => {
    const data = event.data;
    if (data.length < 3) return;
    if ((data[0] & 0xF0) !== 0xB0) return;
    onMidiMessage({ data, msgType: 'cc' });
  };
  input.addEventListener('midimessage', _lcxlDirectHandler);
  _lcxlListeningId = lcxl.inputId;
}

function detachLCXLListener() {
  if (_lcxlListeningId && _lcxlDirectHandler) {
    const access = midi.getAccess();
    const input = access && access.inputs.get(_lcxlListeningId);
    if (input) input.removeEventListener('midimessage', _lcxlDirectHandler);
  }
  _lcxlDirectHandler = null;
  _lcxlListeningId = null;
}

function pullCCState() {
  const lcxl = findLaunchControlXL();
  const btn = panel.querySelector('#ccm-pull-state');

  if (!lcxl) {
    if (btn) {
      btn.textContent = 'No LCXL found';
      btn.classList.add('ccm-save--confirmed');
      setTimeout(() => {
        btn.textContent = 'Pull State';
        btn.classList.remove('ccm-save--confirmed');
      }, 1500);
    }
    return;
  }

  attachLCXLListener();

  // Bounce template selection to force LCXL to re-send CC values.
  // SysEx: F0 00 20 29 02 11 77 <template 0-15> F7
  const access = midi.getAccess();
  const output = access && access.outputs.get(lcxl.outputId);
  if (output) {
    try {
      output.send(new Uint8Array([0xF0, 0x00, 0x20, 0x29, 0x02, 0x11, 0x77, 0x01, 0xF7]));
      setTimeout(() => {
        output.send(new Uint8Array([0xF0, 0x00, 0x20, 0x29, 0x02, 0x11, 0x77, 0x00, 0xF7]));
      }, 100);
    } catch (e) { /* ignore */ }
  }

  if (btn) {
    btn.textContent = 'Pulled!';
    btn.classList.add('ccm-save--confirmed');
    setTimeout(() => {
      btn.textContent = 'Pull State';
      btn.classList.remove('ccm-save--confirmed');
    }, 1500);
  }
}

/* ── Layout toggle ────────────────────────────────────────────────── */
function toggleLayout() {
  layoutMode = layoutMode === 'vertical' ? 'horizontal' : 'vertical';
  localStorage.setItem('cc-monitor-layout', layoutMode);
  applyLayout();
}

function applyLayout() {
  if (!panel) return;
  panel.classList.toggle('ccm--horizontal', layoutMode === 'horizontal');
  const btn = panel.querySelector('#ccm-layout-toggle');
  if (btn) btn.title = layoutMode === 'vertical' ? 'Switch to horizontal' : 'Switch to vertical';
}

/* ── Init ─────────────────────────────────────────────────────────── */
export function init() {
  panel = $('#ccmonitor-panel');
  if (!panel) return;

  loadUserPresets();

  panel.innerHTML =
    '<div class="ccm-toolbar">' +
      '<span class="ccm-title">CC Monitor</span>' +
      '<select class="ccm-preset-select" id="ccm-preset-select"></select>' +
      '<button class="btn btn--ghost ccm-save-preset" id="ccm-save-preset">Save</button>' +
      '<button class="btn btn--ghost ccm-save-as-preset" id="ccm-save-as-preset">Save As</button>' +
      '<button class="btn btn--ghost ccm-layout-toggle" id="ccm-layout-toggle" title="Toggle vertical/horizontal layout">&#9776;</button>' +
      '<span class="ccm-hint"></span>' +
      '<button class="btn btn--ghost ccm-add-group" id="ccm-add-group">+ Group</button>' +
      '<button class="btn btn--ghost ccm-clear" id="ccm-clear">Clear</button>' +
    '</div>' +
    '<div class="ccm-groups" id="ccm-groups"></div>';

  groupsContainer = panel.querySelector('#ccm-groups');
  rebuildPresetDropdown('');

  // Container-level handler for group drags (handles gaps between boxes)
  groupsContainer.addEventListener('dragover', (e) => {
    if (!e.dataTransfer.types.includes('application/x-ccm-group')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  });
  groupsContainer.addEventListener('drop', (e) => {
    if (!e.dataTransfer.types.includes('application/x-ccm-group')) return;
    // Only handle if dropped on the container itself (gap area), not on a group
    if (e.target.closest('.ccm-group')) return;
    e.preventDefault();
    const draggedName = e.dataTransfer.getData('application/x-ccm-group');
    const draggedEl = groupsContainer.querySelector(`[data-group="${CSS.escape(draggedName)}"]`);
    if (!draggedEl) return;
    // Find nearest group by x position and insert accordingly
    let nearest = null;
    let insertAfter = false;
    for (const g of groupsContainer.querySelectorAll('.ccm-group')) {
      if (g === draggedEl) continue;
      const rect = g.getBoundingClientRect();
      const midX = rect.left + rect.width / 2;
      if (e.clientX < midX) { nearest = g; break; }
      nearest = g;
      insertAfter = true;
    }
    if (nearest) {
      if (insertAfter) {
        groupsContainer.insertBefore(draggedEl, nearest.nextElementSibling);
      } else {
        groupsContainer.insertBefore(draggedEl, nearest);
      }
    }
    clearGroupDropIndicators();
    saveGroupOrder();
  });

  observeGroups();

  // Restore working state from localStorage, or auto-load first preset
  const savedGroups = localStorage.getItem(STORAGE_KEY);
  const savedPreset = localStorage.getItem(ACTIVE_PRESET_KEY) || '';
  activePresetName = savedPreset;

  if (savedGroups) {
    // Restore live working state (preserves group order, bar order, etc.)
    loadGroups();
    for (const gName of getOrderedGroupNames()) {
      getOrCreateGroupEl(gName);
      addCCsForGroup(gName);
    }
    rebuildPresetDropdown(savedPreset);
  } else {
    // First visit — load the first available preset
    const all = getAllPresets();
    const firstPreset = Object.keys(all)[0];
    if (firstPreset) {
      loadPreset(firstPreset);
    } else {
      loadGroups();
      for (const gName of getOrderedGroupNames()) {
        getOrCreateGroupEl(gName);
        addCCsForGroup(gName);
      }
    }
  }

  panel.querySelector('#ccm-add-group').addEventListener('click', addNewGroup);
  panel.querySelector('#ccm-layout-toggle').addEventListener('click', toggleLayout);
  panel.querySelector('#ccm-save-preset').addEventListener('click', savePreset);
  panel.querySelector('#ccm-save-as-preset').addEventListener('click', savePresetAs);
  panel.querySelector('#ccm-clear').addEventListener('click', clearAll);
  panel.querySelector('#ccm-preset-select').addEventListener('change', (e) => {
    if (e.target.value) loadPreset(e.target.value);
  });

  // Restore saved layout mode
  layoutMode = localStorage.getItem('cc-monitor-layout') || 'vertical';
  applyLayout();

  bus.on('midi:message', onMidiMessage);

  // Attach direct LCXL listener so CC Monitor works without routes
  attachLCXLListener();
  bus.on('midi:devices-changed', () => attachLCXLListener());
}
