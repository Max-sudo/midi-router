// ── Web MIDI API wrapper ───────────────────────────────────────────
import { bus, midiStatusToType, midiChannel } from './utils.js';

let midiAccess = null;
const inputListeners = new Map(); // inputId → onmidimessage handler

// ── Initialise Web MIDI ────────────────────────────────────────────
export async function init() {
  if (!navigator.requestMIDIAccess) {
    bus.emit('midi:error', 'Web MIDI API not supported. Use Chrome or Edge.');
    return false;
  }
  try {
    midiAccess = await navigator.requestMIDIAccess({ sysex: false });
    // Try upgrading to sysex for Launchpad Pro support
    try {
      midiAccess = await navigator.requestMIDIAccess({ sysex: true });
    } catch { /* sysex upgrade failed, continue without it */ }
  } catch (err) {
    bus.emit('midi:error', `MIDI access denied: ${err.message}`);
    return false;
  }
  midiAccess.onstatechange = handleStateChange;
  startGlobalListening();
  bus.emit('midi:ready', getDevices());
  return true;
}

// ── Device filtering ───────────────────────────────────────────────
const HIDDEN_KEYWORDS = ['hui', 'din', 'daw'];

function isHidden(name) {
  const lower = (name || '').toLowerCase();
  return HIDDEN_KEYWORDS.some(kw => lower.includes(kw));
}

// ── Device enumeration ─────────────────────────────────────────────
export function getDevices() {
  if (!midiAccess) return { inputs: [], outputs: [] };

  const inputs = [];
  for (const [id, input] of midiAccess.inputs) {
    if (!isHidden(input.name)) {
      inputs.push({ id, name: input.name, manufacturer: input.manufacturer, state: input.state });
    }
  }

  const outputs = [];
  for (const [id, output] of midiAccess.outputs) {
    if (!isHidden(output.name)) {
      outputs.push({ id, name: output.name, manufacturer: output.manufacturer, state: output.state });
    }
  }

  // Alphabetical sort
  inputs.sort((a, b) => a.name.localeCompare(b.name));
  outputs.sort((a, b) => a.name.localeCompare(b.name));

  return { inputs, outputs };
}

// Unfiltered version — includes DAW/hidden ports for preset resolution
export function getAllDevicesUnfiltered() {
  if (!midiAccess) return { inputs: [], outputs: [] };
  const inputs = [];
  for (const [id, input] of midiAccess.inputs) {
    inputs.push({ id, name: input.name, manufacturer: input.manufacturer, state: input.state });
  }
  const outputs = [];
  for (const [id, output] of midiAccess.outputs) {
    outputs.push({ id, name: output.name, manufacturer: output.manufacturer, state: output.state });
  }
  inputs.sort((a, b) => a.name.localeCompare(b.name));
  outputs.sort((a, b) => a.name.localeCompare(b.name));
  return { inputs, outputs };
}

// ── Listen to an input device ──────────────────────────────────────
export function listenToInput(inputId, callback) {
  if (!midiAccess) return;
  const input = midiAccess.inputs.get(inputId);
  if (!input) return;

  // Remove any existing listener for this input
  stopListeningToInput(inputId);

  const handler = (event) => {
    callback(inputId, event.data, event.timeStamp);
  };
  input.addEventListener('midimessage', handler);
  inputListeners.set(inputId, handler);
}

export function stopListeningToInput(inputId) {
  if (!midiAccess) return;
  const input = midiAccess.inputs.get(inputId);
  const handler = inputListeners.get(inputId);
  if (input && handler) input.removeEventListener('midimessage', handler);
  inputListeners.delete(inputId);
}

// ── Listen to all inputs ───────────────────────────────────────────
export function listenToAllInputs(callback) {
  if (!midiAccess) return;
  for (const [id] of midiAccess.inputs) {
    listenToInput(id, callback);
  }
}

export function stopAllListeners() {
  if (!midiAccess) return;
  for (const [id] of midiAccess.inputs) {
    stopListeningToInput(id);
  }
}

// ── Global broadcast — always listens to all inputs ─────────────────
const globalHandlers = new Map(); // inputId → handler

function startGlobalListening() {
  if (!midiAccess) return;
  for (const [id, input] of midiAccess.inputs) {
    if (globalHandlers.has(id)) continue;
    const handler = (event) => {
      const data = event.data;
      const msgType = midiStatusToType(data[0]);
      const channel = midiChannel(data[0]);
      bus.emit('midi:message', { inputId: id, data, msgType, channel, timestamp: event.timeStamp });
    };
    input.addEventListener('midimessage', handler);
    globalHandlers.set(id, handler);
  }
}

function refreshGlobalListening() {
  if (!midiAccess) return;
  // Remove handlers for disconnected inputs
  for (const [id, handler] of globalHandlers) {
    const input = midiAccess.inputs.get(id);
    if (!input) {
      globalHandlers.delete(id);
    }
  }
  // Add handlers for new inputs
  startGlobalListening();
}

// ── Send MIDI data to an output ────────────────────────────────────
export function sendToOutput(outputId, data) {
  if (!midiAccess) return;
  const output = midiAccess.outputs.get(outputId);
  if (!output) return;
  try {
    output.send(data);
  } catch (err) {
    bus.emit('midi:send-error', { outputId, error: err.message });
  }
}

// ── Hot-plug handling ──────────────────────────────────────────────
function handleStateChange(event) {
  const port = event.port;
  bus.emit('midi:state-change', {
    id: port.id,
    name: port.name,
    type: port.type,       // 'input' or 'output'
    state: port.state,     // 'connected' or 'disconnected'
    connection: port.connection,
  });
  // Pick up new inputs for global listening
  refreshGlobalListening();
  // Re-emit full device list for UI refresh
  bus.emit('midi:devices-changed', getDevices());
}

// ── Accessors ──────────────────────────────────────────────────────
export function getAccess() {
  return midiAccess;
}

export function isReady() {
  return midiAccess !== null;
}
