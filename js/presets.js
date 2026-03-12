// ── Presets: localStorage CRUD, export/import, auto-restore ────────
import { bus, $ } from './utils.js';
import * as router from './router.js';
import * as splits from './splits.js';
import * as midi from './midi.js';
import * as pcEditor from './pc-editor.js';

const STORAGE_KEY = 'midi-router-presets';

// Built-in default preset: Launch Control XL → Helix
const BUILTIN_PRESETS = {
  'LCXL → Helix': {
    routes: [{
      inputId: null,
      outputId: null,
      inputName: 'Launch Control XL',
      outputName: 'Helix',
      zone: 'all',
      noteLow: 0,
      noteHigh: 127,
      channelIn: null,
      channelOut: null,
      passCC: true,
      passPitchBend: true,
      passProgramChange: true,
      passAftertouch: true,
      enabled: true,
      color: null,
    }],
    splits: null,
    programChanges: [],
  },
};

const dropdown   = $('#preset-select');
const saveBtn    = $('#preset-save');
const deleteBtn  = $('#preset-delete');
const exportBtn  = $('#preset-export');
const importBtn  = $('#preset-import');
const importFile = $('#preset-import-file');

let presets  = {};   // { name: { routes: [...] } }
let lastUsed = null;

// ── Storage ────────────────────────────────────────────────────────
function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    presets  = data.presets || {};
    lastUsed = data.lastUsed || null;
  } catch {
    presets  = {};
    lastUsed = null;
  }
}

function saveToStorage() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    version: 1,
    lastUsed,
    presets,
  }));
}

// ── Dropdown UI ────────────────────────────────────────────────────
function getAllPresets() {
  return { ...BUILTIN_PRESETS, ...presets };
}

function refreshDropdown() {
  dropdown.innerHTML = '';
  const all = getAllPresets();
  const names = Object.keys(all).sort();

  if (names.length === 0) {
    dropdown.appendChild(new Option('No presets', '', true, true));
    dropdown.options[0].disabled = true;
    return;
  }

  dropdown.appendChild(new Option('— Select preset —', '', true, true));
  dropdown.options[0].disabled = true;

  // Built-in presets first
  const builtInNames = Object.keys(BUILTIN_PRESETS).sort();
  for (const name of builtInNames) {
    dropdown.appendChild(new Option(name, name));
  }

  // User presets
  const userNames = Object.keys(presets).sort();
  if (userNames.length > 0 && builtInNames.length > 0) {
    const sep = new Option('──────────', '');
    sep.disabled = true;
    dropdown.appendChild(sep);
  }
  for (const name of userNames) {
    dropdown.appendChild(new Option(name, name));
  }

  if (lastUsed && all[lastUsed]) {
    dropdown.value = lastUsed;
  }
}

// ── Actions ────────────────────────────────────────────────────────
function savePreset() {
  const name = prompt('Preset name:', lastUsed || '');
  if (!name || !name.trim()) return;
  const trimmed = name.trim();

  presets[trimmed] = {
    routes: router.serialiseRoutes(),
    splits: splits.serialise(),
    programChanges: pcEditor.getProgramChanges(),
  };
  lastUsed = trimmed;
  saveToStorage();
  refreshDropdown();
  dropdown.value = trimmed;
  showToast(`Preset "${trimmed}" saved`);
}

function deletePreset() {
  const name = dropdown.value;
  if (!name) return;
  if (BUILTIN_PRESETS[name]) {
    showToast('Cannot delete a built-in preset');
    return;
  }
  if (!presets[name]) return;
  if (!confirm(`Delete preset "${name}"?`)) return;

  delete presets[name];
  if (lastUsed === name) lastUsed = null;
  saveToStorage();
  refreshDropdown();
  showToast(`Preset "${name}" deleted`);
}

function applyPreset(name) {
  const all = getAllPresets();
  const preset = all[name];
  if (!preset) return;
  // Restore splits FIRST so zone ranges are available for route restore
  if (preset.splits) {
    splits.restore(preset.splits);
  }
  router.restoreRoutes(preset.routes || []);

  // Restore program changes into the editor
  pcEditor.setProgramChanges(preset.programChanges || []);

  // Send program changes to MIDI outputs
  sendProgramChanges(preset.programChanges || []);

  lastUsed = name;
  // Re-save user preset with current route data (upgrades legacy presets with zone field)
  // Don't overwrite built-in presets
  if (!BUILTIN_PRESETS[name]) {
    presets[name] = {
      routes: router.serialiseRoutes(),
      splits: splits.serialise(),
      programChanges: pcEditor.getProgramChanges(),
    };
  }
  saveToStorage();
  console.log(`[Presets] Applied "${name}": ${(preset.routes || []).length} routes, ${(preset.programChanges || []).length} PCs, splits: ${JSON.stringify(preset.splits || 'none')}`);
}

function autoRestore() {
  const all = getAllPresets();
  if (lastUsed && all[lastUsed]) {
    dropdown.value = lastUsed;
    applyPreset(lastUsed);
  } else {
    // No last-used preset — auto-apply first built-in preset as default
    const defaultName = Object.keys(BUILTIN_PRESETS)[0];
    if (defaultName) {
      dropdown.value = defaultName;
      applyPreset(defaultName);
    }
  }
}

// ── Export / Import ────────────────────────────────────────────────
function exportPresets() {
  const data = JSON.stringify({ version: 1, presets }, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = 'midi-router-presets.json';
  a.click();
  URL.revokeObjectURL(url);
  showToast('Presets exported');
}

function importPresets() {
  importFile.click();
}

function handleImportFile(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (!data.presets) throw new Error('Invalid format');
      const count = Object.keys(data.presets).length;
      Object.assign(presets, data.presets);
      saveToStorage();
      refreshDropdown();
      showToast(`Imported ${count} preset${count !== 1 ? 's' : ''}`);
    } catch (err) {
      showToast(`Import failed: ${err.message}`);
    }
  };
  reader.readAsText(file);
  importFile.value = ''; // allow re-import of same file
}

// ── Program Change sending ─────────────────────────────────────────
function sendProgramChanges(list) {
  if (!list || list.length === 0) return;
  const devices = midi.getDevices();
  for (const pc of list) {
    const outputId = resolveOutputId(pc.outputId, pc.outputName, devices.outputs);
    if (!outputId) {
      console.warn(`[Presets] PC: output not found for "${pc.outputName}"`);
      continue;
    }
    const channel = Math.max(1, Math.min(16, pc.channel || 1));
    const program = Math.max(0, Math.min(127, pc.program || 0));
    const data = new Uint8Array([0xC0 | (channel - 1), program]);
    midi.sendToOutput(outputId, data);
    console.log(`[Presets] Sent PC ${program} on Ch ${channel} to ${pc.outputName || outputId}`);
  }
}

function resolveOutputId(savedId, savedName, deviceList) {
  if (deviceList.find(d => d.id === savedId)) return savedId;
  const byName = deviceList.find(d => d.name === savedName);
  if (byName) return byName.id;
  if (savedName) {
    const partial = deviceList.find(d =>
      d.name.includes(savedName) || savedName.includes(d.name)
    );
    if (partial) return partial.id;
  }
  return null;
}

// ── Toast helper ───────────────────────────────────────────────────
function showToast(message) {
  bus.emit('toast', message);
}

// ── Init ───────────────────────────────────────────────────────────
export function init() {
  loadFromStorage();
  refreshDropdown();

  saveBtn.addEventListener('click', savePreset);
  deleteBtn.addEventListener('click', deletePreset);
  exportBtn.addEventListener('click', exportPresets);
  importBtn.addEventListener('click', importPresets);
  importFile.addEventListener('change', handleImportFile);

  dropdown.addEventListener('change', () => {
    const name = dropdown.value;
    const all = getAllPresets();
    if (name && all[name]) applyPreset(name);
  });

  // Auto-restore after MIDI devices are ready
  bus.on('midi:ready', () => {
    setTimeout(autoRestore, 100); // small delay for ports to render
  });
}
