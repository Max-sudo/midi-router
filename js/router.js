// ── Router: route CRUD, message filtering, channel remapping ───────
import { bus, uid, nextCableColor, midiStatusToType, midiChannel } from './utils.js';
import * as midi from './midi.js';
import * as patchbay from './patchbay.js';
import * as splits from './splits.js';

const routes = new Map(); // id → route object

// ── Route model ────────────────────────────────────────────────────
function createRoute(inputId, outputId, overrides = {}) {
  return {
    id: uid(),
    inputId,
    outputId,
    zone: 'all',        // 'all' | 'low' | 'mid' | 'high' | 'custom'
    noteLow:  0,
    noteHigh: 127,
    channelIn:  null,    // null = all channels
    channelOut: null,    // null = pass-through
    passCC: true,
    passPitchBend: true,
    passProgramChange: true,
    passAftertouch: true,
    enabled: true,
    color: nextCableColor(),
    ccMap: null,          // null = pass-through, or Array<{ fromCC, toCC, toChannel }>
    ...overrides,
  };
}

// ── Effective note range (resolves zone → actual numbers) ──────────
function effectiveRange(route) {
  if (route.zone === 'custom' || route.zone === 'all') {
    return { noteLow: route.noteLow, noteHigh: route.noteHigh };
  }
  return splits.getZoneRange(route.zone);
}

// ── CRUD ───────────────────────────────────────────────────────────
export function addRoute(inputId, outputId, overrides = {}) {
  const route = createRoute(inputId, outputId, overrides);
  routes.set(route.id, route);
  patchbay.addCable(route.id, inputId, outputId, route.color);
  emitCountChanged();
  ensureListening(inputId);
  bus.emit('route:added', route);
  return route;
}

export function removeRoute(routeId) {
  const route = routes.get(routeId);
  if (!route) return;
  routes.delete(routeId);
  patchbay.removeCable(routeId);
  emitCountChanged();
  cleanupListening(route.inputId);
  bus.emit('route:removed', route);
}

export function updateRoute(routeId, updates) {
  const route = routes.get(routeId);
  if (!route) return;
  Object.assign(route, updates);
  bus.emit('route:updated', route);
}

export function getRoute(routeId) {
  return routes.get(routeId);
}

export function getAllRoutes() {
  return [...routes.values()];
}

export function findRouteByPorts(inputId, outputId) {
  return [...routes.values()].find(r => r.inputId === inputId && r.outputId === outputId) || null;
}

export function clearAllRoutes() {
  for (const id of [...routes.keys()]) {
    removeRoute(id);
  }
}

// ── Message handling ───────────────────────────────────────────────
let _loggedFirst = false;
function handleMessage(inputId, data, timestamp) {
  const status  = data[0];
  const msgType = midiStatusToType(status);
  const channel = midiChannel(status);

  if (!_loggedFirst && msgType === 'noteon') {
    console.log(`[Router] First note received: input=${inputId}, routes=${routes.size}, note=${data[1]}`);
    for (const r of routes.values()) {
      const range = effectiveRange(r);
      console.log(`  Route ${r.id}: zone=${r.zone}, range=${range.noteLow}-${range.noteHigh}, input=${r.inputId}`);
    }
    _loggedFirst = true;
  }

  // Flash input LED
  patchbay.flashInputLED(inputId);

  // Emit for keyboard visualizer
  bus.emit('midi:message', { inputId, data, msgType, channel, timestamp });

  for (const route of routes.values()) {
    if (!route.enabled) continue;
    if (route.inputId !== inputId) continue;

    // Channel filter
    if (route.channelIn !== null && channel !== route.channelIn) continue;

    // Message type filter
    if (msgType === 'cc'             && !route.passCC) continue;
    if (msgType === 'pitchbend'      && !route.passPitchBend) continue;
    if (msgType === 'programchange'  && !route.passProgramChange) continue;
    if ((msgType === 'aftertouch' || msgType === 'channelpressure') && !route.passAftertouch) continue;

    // Note range filter — use effective range (resolves zone dynamically)
    if ((msgType === 'noteon' || msgType === 'noteoff' || msgType === 'aftertouch') && data.length >= 2) {
      const note = data[1];
      const range = effectiveRange(route);
      if (note < range.noteLow || note > range.noteHigh) {
        if (msgType === 'noteon') {
          console.log(`[Router] Filtered note ${note} (zone: ${route.zone}, range: ${range.noteLow}-${range.noteHigh})`);
        }
        continue;
      }
    }

    // CC mapping: rewrite CC number and channel per mapping table
    let outData = data;
    if (msgType === 'cc' && route.ccMap) {
      const ccNum = data[1];
      const mapping = route.ccMap.find(m => m.fromCC === ccNum);
      if (!mapping) continue; // drop unmapped CCs
      outData = new Uint8Array(data);
      outData[1] = mapping.toCC;
      if (mapping.toChannel) {
        outData[0] = 0xB0 | (mapping.toChannel - 1);
      }
    } else if (route.channelOut !== null && channel !== route.channelOut) {
      // Standard channel remap (when no ccMap active)
      outData = new Uint8Array(data);
      outData[0] = (status & 0xF0) | (route.channelOut - 1);
    }

    midi.sendToOutput(route.outputId, outData);
    patchbay.flashCable(route.id);
    patchbay.flashOutputLED(route.outputId);
    bus.emit('midi:message-routed', { routeId: route.id, inputId, outputId: route.outputId, data: outData, msgType });
  }
}

// ── Input listener management ──────────────────────────────────────
const listeningInputs = new Set();

function ensureListening(inputId) {
  if (listeningInputs.has(inputId)) return;
  console.log(`[Router] Listening to input: ${inputId}`);
  midi.listenToInput(inputId, handleMessage);
  listeningInputs.add(inputId);
}

function cleanupListening(inputId) {
  // Only stop if no remaining routes use this input
  const stillUsed = [...routes.values()].some(r => r.inputId === inputId);
  if (!stillUsed) {
    midi.stopListeningToInput(inputId);
    listeningInputs.delete(inputId);
  }
}

// ── Helpers ────────────────────────────────────────────────────────
function emitCountChanged() {
  bus.emit('routes:count-changed', routes.size);
}

// ── Serialisation (for presets) ────────────────────────────────────
export function serialiseRoutes() {
  return getAllRoutes().map(r => ({
    inputId:    r.inputId,
    outputId:   r.outputId,
    zone:       r.zone,
    noteLow:    r.noteLow,
    noteHigh:   r.noteHigh,
    channelIn:  r.channelIn,
    channelOut: r.channelOut,
    passCC:     r.passCC,
    passPitchBend:     r.passPitchBend,
    passProgramChange: r.passProgramChange,
    passAftertouch:    r.passAftertouch,
    enabled:    r.enabled,
    color:      r.color,
    ccMap:      r.ccMap,
    // Store names for fuzzy restore
    inputName:  getDeviceName(r.inputId, 'input'),
    outputName: getDeviceName(r.outputId, 'output'),
  }));
}

export function restoreRoutes(serialised) {
  clearAllRoutes();
  const devices = midi.getAllDevicesUnfiltered();
  for (const s of serialised) {
    const inputId  = resolveDeviceId(s.inputId, s.inputName, devices.inputs);
    const outputId = resolveDeviceId(s.outputId, s.outputName, devices.outputs);
    if (inputId && outputId) {
      // Detect zone from note range if not explicitly saved (legacy presets)
      let zone = s.zone || 'all';
      if (!s.zone && splits.getCount() > 0) {
        zone = detectZoneFromRange(s.noteLow, s.noteHigh);
      }
      console.log(`[Router] Restoring route: ${s.inputName} → ${s.outputName}, zone: ${zone}, range: ${s.noteLow ?? 0}-${s.noteHigh ?? 127}`);
      addRoute(inputId, outputId, {
        zone,
        noteLow:    s.noteLow ?? 0,
        noteHigh:   s.noteHigh ?? 127,
        channelIn:  s.channelIn,
        channelOut: s.channelOut,
        passCC:     s.passCC ?? true,
        passPitchBend:     s.passPitchBend ?? true,
        passProgramChange: s.passProgramChange ?? true,
        passAftertouch:    s.passAftertouch ?? true,
        enabled:    s.enabled ?? true,
        color:      s.color,
        ccMap:      s.ccMap || null,
      });
    }
  }
}

// Detect zone by matching note range against current split positions
function detectZoneFromRange(low, high) {
  if (low === 0 && high === 127) return 'all';
  for (const z of splits.getAvailableZones()) {
    if (z === 'all') continue;
    const range = splits.getZoneRange(z);
    if (low === range.noteLow && high === range.noteHigh) return z;
  }
  return 'custom';
}

function getDeviceName(deviceId, type) {
  const devices = midi.getDevices();
  const list = type === 'input' ? devices.inputs : devices.outputs;
  const d = list.find(d => d.id === deviceId);
  return d ? d.name : '';
}

// Three-tier resolution: exact ID → exact name → partial name
function resolveDeviceId(savedId, savedName, deviceList) {
  // 1. Exact ID match
  if (deviceList.find(d => d.id === savedId)) return savedId;
  // 2. Exact name match
  const byName = deviceList.find(d => d.name === savedName);
  if (byName) return byName.id;
  // 3. Partial name match
  if (savedName) {
    const partial = deviceList.find(d =>
      d.name.includes(savedName) || savedName.includes(d.name)
    );
    if (partial) return partial.id;
  }
  return null;
}

// ── Init ───────────────────────────────────────────────────────────
export function init() {
  // Connect / disconnect from patchbay clicks
  bus.on('patchbay:connect', ({ inputId, outputId }) => {
    addRoute(inputId, outputId);
  });

  bus.on('patchbay:disconnect', ({ routeId }) => {
    removeRoute(routeId);
  });

  // Assign zone from cable drag-to-keyboard
  bus.on('patchbay:assign-zone', ({ routeId, zone, noteLow, noteHigh }) => {
    updateRoute(routeId, { zone, noteLow, noteHigh });
    const label = zone === 'all' ? 'full range' : `${zone} zone`;
    bus.emit('toast', `Route assigned to ${label}`);
  });

  // When splits change, update noteLow/noteHigh on all zone-bound routes
  bus.on('splits:changed', () => {
    for (const route of routes.values()) {
      if (route.zone === 'all' || route.zone === 'custom') continue;
      const range = splits.getZoneRange(route.zone);
      route.noteLow  = range.noteLow;
      route.noteHigh = range.noteHigh;
      bus.emit('route:updated', route);
    }
  });

  // When devices change, re-listen active inputs
  bus.on('patchbay:ports-updated', () => {
    for (const inputId of listeningInputs) {
      midi.listenToInput(inputId, handleMessage);
    }
  });
}
