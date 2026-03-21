// ── Presets: server-backed CRUD with localStorage fallback ─────────
import { bus, $ } from './utils.js';
import * as router from './router.js';
import * as splits from './splits.js';
import * as midi from './midi.js';
import * as pcEditor from './pc-editor.js';

const STORAGE_KEY = 'midi-router-presets';
const API_BASE = '/api/presets';

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
  'LCXL → Logic Pro': {
    routes: [{
      inputId: null,
      outputId: null,
      inputName: 'Launch Control XL',
      outputName: 'IAC Driver Bus 1',
      zone: 'all',
      noteLow: 0,
      noteHigh: 127,
      channelIn: null,
      channelOut: null,
      passCC: true,
      passPitchBend: false,
      passProgramChange: false,
      passAftertouch: false,
      enabled: true,
      color: null,
      ccMap: [
        { fromCC: 77, toCC: 7, toChannel: 1 },
        { fromCC: 78, toCC: 7, toChannel: 2 },
        { fromCC: 79, toCC: 7, toChannel: 3 },
        { fromCC: 80, toCC: 7, toChannel: 4 },
        { fromCC: 81, toCC: 7, toChannel: 5 },
        { fromCC: 82, toCC: 7, toChannel: 6 },
        { fromCC: 83, toCC: 7, toChannel: 7 },
        { fromCC: 84, toCC: 7, toChannel: 8 },
        { fromCC: 13, toCC: 91, toChannel: 1 },
        { fromCC: 14, toCC: 91, toChannel: 2 },
        { fromCC: 15, toCC: 91, toChannel: 3 },
        { fromCC: 16, toCC: 91, toChannel: 4 },
        { fromCC: 17, toCC: 91, toChannel: 5 },
        { fromCC: 18, toCC: 91, toChannel: 6 },
        { fromCC: 19, toCC: 91, toChannel: 7 },
        { fromCC: 20, toCC: 91, toChannel: 8 },
        { fromCC: 29, toCC: 93, toChannel: 1 },
        { fromCC: 30, toCC: 93, toChannel: 2 },
        { fromCC: 31, toCC: 93, toChannel: 3 },
        { fromCC: 32, toCC: 93, toChannel: 4 },
        { fromCC: 33, toCC: 93, toChannel: 5 },
        { fromCC: 34, toCC: 93, toChannel: 6 },
        { fromCC: 35, toCC: 93, toChannel: 7 },
        { fromCC: 36, toCC: 93, toChannel: 8 },
        { fromCC: 49, toCC: 10, toChannel: 1 },
        { fromCC: 50, toCC: 10, toChannel: 2 },
        { fromCC: 51, toCC: 10, toChannel: 3 },
        { fromCC: 52, toCC: 10, toChannel: 4 },
        { fromCC: 53, toCC: 10, toChannel: 5 },
        { fromCC: 54, toCC: 10, toChannel: 6 },
        { fromCC: 55, toCC: 10, toChannel: 7 },
        { fromCC: 56, toCC: 10, toChannel: 8 },
      ],
    }],
    splits: null,
    programChanges: [],
  },
};

const dropdown   = $('#preset-select');
const saveBtn    = $('#preset-save');
const deleteBtn  = $('#preset-delete');

let presets  = {};
let lastUsed = null;
let useServer = false;  // set to true once server responds

// ── Storage — server-first, localStorage fallback ─────────────────
async function loadFromServer() {
  try {
    const res = await fetch(API_BASE);
    if (!res.ok) throw new Error(res.statusText);
    const data = await res.json();
    presets  = data.presets || {};
    lastUsed = data.lastUsed || null;
    useServer = true;
    // Sync to localStorage as backup
    saveToLocalStorage();
    console.log('[Presets] Loaded from server');
  } catch {
    // Fall back to localStorage
    loadFromLocalStorage();
    console.log('[Presets] Server unavailable, using localStorage');
  }
}

function loadFromLocalStorage() {
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

function saveToLocalStorage() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    version: 1,
    lastUsed,
    presets,
  }));
}

async function saveToServer(name, data) {
  if (!useServer) { saveToLocalStorage(); return; }
  try {
    await fetch(`${API_BASE}/${encodeURIComponent(name)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, data }),
    });
    saveToLocalStorage();  // keep backup in sync
  } catch {
    saveToLocalStorage();
  }
}

async function deleteFromServer(name) {
  if (!useServer) { saveToLocalStorage(); return; }
  try {
    await fetch(`${API_BASE}/${encodeURIComponent(name)}`, { method: 'DELETE' });
    saveToLocalStorage();
  } catch {
    saveToLocalStorage();
  }
}

async function saveLastUsed() {
  saveToLocalStorage();
  if (!useServer) return;
  try {
    await fetch('/api/presets-last-used', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lastUsed }),
    });
  } catch { /* fallback already saved */ }
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

  dropdown.appendChild(new Option('— No Preset —', '', true, true));

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
async function savePreset() {
  const name = prompt('Preset name:', lastUsed || '');
  if (!name || !name.trim()) return;
  const trimmed = name.trim();

  const data = {
    routes: router.serialiseRoutes(),
    splits: splits.serialise(),
    programChanges: pcEditor.getProgramChanges(),
  };
  presets[trimmed] = data;
  lastUsed = trimmed;
  await saveToServer(trimmed, data);
  refreshDropdown();
  dropdown.value = trimmed;
  showToast(`Preset "${trimmed}" saved`);
}

async function deletePreset() {
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
  await deleteFromServer(name);
  refreshDropdown();
  showToast(`Preset "${name}" deleted`);
}

async function applyPreset(name) {
  const all = getAllPresets();
  const preset = all[name];
  if (!preset) return;
  if (preset.splits) {
    splits.restore(preset.splits);
  }
  router.restoreRoutes(preset.routes || []);
  pcEditor.setProgramChanges(preset.programChanges || []);
  sendProgramChanges(preset.programChanges || []);

  lastUsed = name;
  if (!BUILTIN_PRESETS[name]) {
    presets[name] = {
      routes: router.serialiseRoutes(),
      splits: splits.serialise(),
      programChanges: pcEditor.getProgramChanges(),
    };
    await saveToServer(name, presets[name]);
  } else {
    await saveLastUsed();
  }
  console.log(`[Presets] Applied "${name}": ${(preset.routes || []).length} routes, ${(preset.programChanges || []).length} PCs, splits: ${JSON.stringify(preset.splits || 'none')}`);
}

async function autoRestore() {
  const all = getAllPresets();
  if (lastUsed && all[lastUsed]) {
    dropdown.value = lastUsed;
    await applyPreset(lastUsed);
  } else {
    const defaultName = Object.keys(BUILTIN_PRESETS)[0];
    if (defaultName) {
      dropdown.value = defaultName;
      await applyPreset(defaultName);
    }
  }
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
export async function init() {
  await loadFromServer();
  refreshDropdown();

  saveBtn.addEventListener('click', savePreset);
  deleteBtn.addEventListener('click', deletePreset);

  dropdown.addEventListener('change', async () => {
    const name = dropdown.value;
    if (!name) {
      router.restoreRoutes([]);
      splits.restore(null);
      pcEditor.setProgramChanges([]);
      lastUsed = null;
      await saveLastUsed();
      return;
    }
    const all = getAllPresets();
    if (all[name]) await applyPreset(name);
  });

  bus.on('midi:ready', () => {
    setTimeout(autoRestore, 100);
  });
}
