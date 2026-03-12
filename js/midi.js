// ── Web MIDI API wrapper ───────────────────────────────────────────
import { bus } from './utils.js';

let midiAccess = null;
const inputListeners = new Map(); // inputId → onmidimessage handler

// ── Initialise Web MIDI ────────────────────────────────────────────
export async function init() {
  if (!navigator.requestMIDIAccess) {
    bus.emit('midi:error', 'Web MIDI API not supported. Use Chrome or Edge.');
    return false;
  }
  try {
    midiAccess = await navigator.requestMIDIAccess({ sysex: true });
    midiAccess.onstatechange = handleStateChange;
    bus.emit('midi:ready', getDevices());
    return true;
  } catch (err) {
    bus.emit('midi:error', `MIDI access denied: ${err.message}`);
    return false;
  }
}

// ── Device filtering ───────────────────────────────────────────────
const HIDDEN_KEYWORDS = ['hui', 'din'];

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
  input.onmidimessage = handler;
  inputListeners.set(inputId, handler);
}

export function stopListeningToInput(inputId) {
  if (!midiAccess) return;
  const input = midiAccess.inputs.get(inputId);
  if (input) input.onmidimessage = null;
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
