// ── Patch Bay: port rendering, SVG cables, click-to-connect ────────
import { bus, $, createElement, createSVGElement, nextCableColor } from './utils.js';
import * as keyboard from './keyboard.js';
import * as splits from './splits.js';

const inputsColumn  = $('#inputs-column');
const outputsColumn = $('#outputs-column');
const svg           = $('#connection-svg');
const emptyMsg      = $('#patchbay-empty');
const hintMsg       = $('#patchbay-hint');
const cablePopup    = $('#cable-popup');
const cablePopupBtns = $('#cable-popup-buttons');

let inputPorts  = [];  // [{ id, name, el, jackEl }]
let outputPorts = [];

// ── Render port columns ────────────────────────────────────────────
export function renderPorts(devices) {
  renderColumn(inputsColumn, devices.inputs, 'input');
  renderColumn(outputsColumn, devices.outputs, 'output');
  inputPorts  = getPortData(inputsColumn, 'input');
  outputPorts = getPortData(outputsColumn, 'output');
  updateEmptyState();
}

function renderColumn(column, devices, type) {
  const header = column.querySelector('.port-column__header');
  column.innerHTML = '';
  column.appendChild(header);

  for (const device of devices) {
    const node = createPortNode(device, type);
    column.appendChild(node);
  }
}

function createPortNode(device, type) {
  const node = createElement('div', {
    className: 'port-node',
    'data-port-id': device.id,
    'data-port-type': type,
  });

  const jack = createElement('div', { className: 'port-node__jack' });
  const led  = createElement('div', { className: 'port-node__led' });

  // Label block: device name + optional manufacturer subtitle
  const labelWrap = createElement('div', { className: 'port-node__label' });
  const nameEl = createElement('div', {
    className: 'port-node__name',
    textContent: device.name,
  });
  labelWrap.appendChild(nameEl);

  if (device.manufacturer) {
    const mfr = createElement('div', {
      className: 'port-node__manufacturer',
      textContent: device.manufacturer,
    });
    labelWrap.appendChild(mfr);
  }

  if (type === 'input') {
    node.appendChild(labelWrap);
    node.appendChild(led);
    node.appendChild(jack);
  } else {
    node.appendChild(jack);
    node.appendChild(led);
    node.appendChild(labelWrap);
  }

  return node;
}

function getPortData(column, type) {
  const nodes = column.querySelectorAll('.port-node');
  return [...nodes].map(el => ({
    id: el.dataset.portId,
    type,
    el,
    jackEl: el.querySelector('.port-node__jack'),
  }));
}

// ── Empty state ────────────────────────────────────────────────────
function updateEmptyState() {
  const hasDevices = inputPorts.length > 0 || outputPorts.length > 0;
  if (!hasDevices) {
    emptyMsg.textContent = 'No MIDI devices detected';
    emptyMsg.hidden = false;
    hintMsg.hidden = true;
  } else if (cables.size === 0) {
    emptyMsg.textContent = 'Click an input to activate it, then click outputs to connect';
    emptyMsg.hidden = false;
    hintMsg.hidden = true;
  } else {
    emptyMsg.hidden = true;
    hintMsg.hidden = false;
  }
}

function updateEmptyMessage() {
  updateEmptyState();
}

// ── Jack position helpers (for cable endpoints) ────────────────────
export function getJackCenter(jackEl) {
  const rect = jackEl.getBoundingClientRect();
  const svgRect = svg.getBoundingClientRect();
  return {
    x: rect.left + rect.width / 2 - svgRect.left,
    y: rect.top + rect.height / 2 - svgRect.top,
  };
}

// ── SVG cable rendering ────────────────────────────────────────────
const cables = new Map(); // routeId → { groupEl, color, inputId, outputId }

export function addCable(routeId, inputId, outputId, color) {
  const inputPort  = inputPorts.find(p => p.id === inputId);
  const outputPort = outputPorts.find(p => p.id === outputId);
  if (!inputPort || !outputPort) return;

  const group = createSVGElement('g', { class: 'cable', 'data-route-id': routeId });

  const glow = createSVGElement('path', {
    class: 'cable__glow',
    stroke: color,
    'stroke-width': '6',
    fill: 'none',
    opacity: '0.3',
    filter: 'blur(4px)',
  });

  const line = createSVGElement('path', {
    class: 'cable__line',
    stroke: color,
    'stroke-width': '2.5',
    fill: 'none',
    'stroke-linecap': 'round',
  });

  group.appendChild(glow);
  group.appendChild(line);
  svg.appendChild(group);

  cables.set(routeId, { groupEl: group, color, inputId, outputId });
  updateCable(routeId);
  updateEmptyMessage();
}

export function removeCable(routeId) {
  const cable = cables.get(routeId);
  if (cable) {
    cable.groupEl.remove();
    cables.delete(routeId);
  }
  updateEmptyMessage();
}

export function updateCable(routeId) {
  const cable = cables.get(routeId);
  if (!cable) return;

  const inputPort  = inputPorts.find(p => p.id === cable.inputId);
  const outputPort = outputPorts.find(p => p.id === cable.outputId);
  if (!inputPort || !outputPort) return;

  const start = getJackCenter(inputPort.jackEl);
  const end   = getJackCenter(outputPort.jackEl);
  const d     = bezierPath(start, end);

  const paths = cable.groupEl.querySelectorAll('path');
  paths.forEach(p => p.setAttribute('d', d));
}

export function updateAllCables() {
  for (const routeId of cables.keys()) {
    updateCable(routeId);
  }
}

function bezierPath(start, end) {
  const dx = Math.abs(end.x - start.x);
  const cp = Math.max(dx * 0.4, 60);
  return `M ${start.x} ${start.y} C ${start.x + cp} ${start.y}, ${end.x - cp} ${end.y}, ${end.x} ${end.y}`;
}

// ── Cable activity flash ───────────────────────────────────────────
export function flashCable(routeId) {
  const cable = cables.get(routeId);
  if (!cable) return;
  const line = cable.groupEl.querySelector('.cable__line');
  line.classList.add('cable--active');
  setTimeout(() => line.classList.remove('cable--active'), 100);
}

// ── LED activity flash ─────────────────────────────────────────────
export function flashInputLED(inputId) {
  const port = inputPorts.find(p => p.id === inputId);
  if (!port) return;
  const led = port.el.querySelector('.port-node__led');
  led.classList.add('port-node__led--active');
  setTimeout(() => led.classList.remove('port-node__led--active'), 80);
}

export function flashOutputLED(outputId) {
  const port = outputPorts.find(p => p.id === outputId);
  if (!port) return;
  const led = port.el.querySelector('.port-node__led');
  led.classList.add('port-node__led--active');
  setTimeout(() => led.classList.remove('port-node__led--active'), 80);
}

// ── Click-to-connect ───────────────────────────────────────────────
//
// Workflow:
//   1. Click an input  → it becomes "activated" (highlighted, stays on)
//   2. Click any output → a route is created connecting activated input → that output
//   3. Click more outputs → more routes from the same input
//   4. Click the activated input again, or press Esc, or click another input → deactivate
//

let activatedInputId = null;
let suppressNextCableClick = false;

function initClickConnect() {
  // Click on any port node (or its children)
  document.addEventListener('click', (e) => {
    const node = e.target.closest('.port-node');
    if (!node) return;

    const portType = node.dataset.portType;
    const portId   = node.dataset.portId;

    if (portType === 'input') {
      handleInputClick(portId);
    } else if (portType === 'output') {
      handleOutputClick(portId);
    }
  });

  // Escape to deactivate
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && activatedInputId) {
      deactivateInput();
    }
  });

  // Cable click → select route for editing (suppressed after drag)
  svg.addEventListener('click', (e) => {
    if (suppressNextCableClick) { suppressNextCableClick = false; return; }
    const cable = e.target.closest('.cable');
    if (cable) {
      e.stopPropagation();
      bus.emit('patchbay:cable-click', cable.dataset.routeId);
    }
  });
}

function handleInputClick(portId) {
  if (activatedInputId === portId) {
    // Clicking same input again → deactivate
    deactivateInput();
  } else {
    // Activate this input (deactivate previous if any)
    deactivateInput();
    activateInput(portId);
  }
}

function handleOutputClick(portId) {
  if (!activatedInputId) return; // no input activated, ignore output clicks

  // Check if this connection already exists → toggle it off
  const existing = findExistingRoute(activatedInputId, portId);
  if (existing) {
    bus.emit('patchbay:disconnect', { routeId: existing.routeId });
    markOutputConnected(portId, false);
  } else {
    bus.emit('patchbay:connect', { inputId: activatedInputId, outputId: portId });
    markOutputConnected(portId, true);
  }
}

// Check cables map for an existing route between input and output
function findExistingRoute(inputId, outputId) {
  for (const [routeId, cable] of cables) {
    if (cable.inputId === inputId && cable.outputId === outputId) {
      return { routeId };
    }
  }
  return null;
}

function activateInput(inputId) {
  activatedInputId = inputId;

  // Highlight the activated input
  const inputPort = inputPorts.find(p => p.id === inputId);
  if (inputPort) {
    inputPort.el.classList.add('port-node--activated');
  }

  // Mark all outputs as targets, and flag already-connected ones
  const connectedOutputIds = new Set();
  for (const cable of cables.values()) {
    if (cable.inputId === inputId) connectedOutputIds.add(cable.outputId);
  }
  outputPorts.forEach(p => {
    p.el.classList.add('port-node--target');
    if (connectedOutputIds.has(p.id)) {
      p.el.classList.add('port-node--connected');
    }
  });
}

function deactivateInput() {
  if (!activatedInputId) return;

  // Remove activated highlight
  const inputPort = inputPorts.find(p => p.id === activatedInputId);
  if (inputPort) {
    inputPort.el.classList.remove('port-node--activated');
  }

  // Remove target and connected highlights from outputs
  outputPorts.forEach(p => {
    p.el.classList.remove('port-node--target');
    p.el.classList.remove('port-node--connected');
  });

  activatedInputId = null;
}

function markOutputConnected(outputId, connected) {
  const port = outputPorts.find(p => p.id === outputId);
  if (!port) return;
  if (connected) {
    port.el.classList.add('port-node--connected');
  } else {
    port.el.classList.remove('port-node--connected');
  }
}

// ── Drag cable to keyboard zone ───────────────────────────────────
function initCableDrag() {
  let dragRouteId = null;
  let dragPointerId = null;
  let dragStartY = 0;
  const DRAG_THRESHOLD = 8;
  let dragActive = false;

  svg.addEventListener('pointerdown', (e) => {
    const cableEl = e.target.closest('.cable');
    if (!cableEl) return;
    // Hide popup during drag
    cablePopup.hidden = true;
    clearHideTimer();
    dragRouteId = cableEl.dataset.routeId;
    dragPointerId = e.pointerId;
    dragStartY = e.clientY;
    dragActive = false;
    // Don't capture pointer yet — let click events work normally.
    // Capture only once drag threshold is exceeded.
  });

  svg.addEventListener('pointermove', (e) => {
    if (!dragRouteId) return;

    // Only activate drag after vertical threshold (prefer downward toward keyboard)
    if (!dragActive) {
      if (Math.abs(e.clientY - dragStartY) < DRAG_THRESHOLD) return;
      dragActive = true;
      // NOW capture pointer so drag continues outside SVG
      svg.setPointerCapture(dragPointerId);
      // Dim the cable being dragged
      const cable = cables.get(dragRouteId);
      if (cable) cable.groupEl.classList.add('cable--dragging');
      document.body.style.cursor = 'grabbing';
    }

    // Check if pointer is over the keyboard container
    const kbContainer = keyboard.getContainerElement();
    const kbRect = kbContainer.getBoundingClientRect();
    if (e.clientY >= kbRect.top && e.clientY <= kbRect.bottom &&
        e.clientX >= kbRect.left && e.clientX <= kbRect.right) {
      const zone = keyboard.getZoneAtClientX(e.clientX);
      if (zone) keyboard.highlightDropZone(zone);
    } else {
      keyboard.clearDropZone();
    }
  });

  svg.addEventListener('pointerup', (e) => {
    if (!dragRouteId) return;
    if (dragActive) svg.releasePointerCapture(e.pointerId);

    if (dragActive) {
      // Suppress the click event that follows pointerup
      suppressNextCableClick = true;

      // Clean up drag visuals
      const cable = cables.get(dragRouteId);
      if (cable) cable.groupEl.classList.remove('cable--dragging');
      document.body.style.cursor = '';
      keyboard.clearDropZone();

      // Check if dropped over keyboard
      const kbContainer = keyboard.getContainerElement();
      const kbRect = kbContainer.getBoundingClientRect();
      if (e.clientY >= kbRect.top && e.clientY <= kbRect.bottom &&
          e.clientX >= kbRect.left && e.clientX <= kbRect.right) {
        const zone = keyboard.getZoneAtClientX(e.clientX);
        if (zone) {
          const range = splits.getZoneRange(zone);
          bus.emit('patchbay:assign-zone', { routeId: dragRouteId, zone, ...range });
        }
      }
    }

    dragRouteId = null;
    dragPointerId = null;
    dragActive = false;
  });

  svg.addEventListener('pointercancel', () => {
    if (dragRouteId) {
      const cable = cables.get(dragRouteId);
      if (cable) cable.groupEl.classList.remove('cable--dragging');
      document.body.style.cursor = '';
      keyboard.clearDropZone();
    }
    dragRouteId = null;
    dragPointerId = null;
    dragActive = false;
  });
}

// ── Cable hover popup (zone selector) ───────────────────────────────
let popupRouteId = null;
let popupHideTimer = null;

function initCablePopup() {
  // Show popup on cable hover
  svg.addEventListener('pointerenter', (e) => {
    const cableEl = e.target.closest('.cable');
    if (!cableEl) return;
    showCablePopup(cableEl, e.clientX, e.clientY);
  }, true);

  svg.addEventListener('pointerleave', (e) => {
    const cableEl = e.target.closest('.cable');
    if (!cableEl) return;
    // Delay hide so user can move to popup
    scheduleHidePopup();
  }, true);

  // Keep popup open while hovering its buttons
  cablePopupBtns.addEventListener('pointerenter', () => {
    clearHideTimer();
  });
  cablePopupBtns.addEventListener('pointerleave', () => {
    scheduleHidePopup();
  });
}

function showCablePopup(cableEl, pointerX, pointerY) {
  clearHideTimer();
  const routeId = cableEl.dataset.routeId;
  const splitCount = splits.getCount();

  // Always show: "All" + available zones
  const zones = [{ key: 'all', label: 'All' }];
  if (splitCount >= 1) {
    zones.push({ key: 'low', label: 'Low' });
    if (splitCount >= 2) zones.push({ key: 'mid', label: 'Mid' });
    zones.push({ key: 'high', label: 'High' });
  }

  // Get current zone for this route
  const cable = cables.get(routeId);
  if (!cable) return;

  popupRouteId = routeId;

  // Match popup color to the cable's color
  cablePopup.style.setProperty('--popup-color', cable.color);

  // Build buttons
  cablePopupBtns.innerHTML = '';
  for (const z of zones) {
    const btn = document.createElement('button');
    btn.className = 'cable-popup__btn';
    btn.textContent = z.label;
    btn.addEventListener('click', () => {
      const range = splits.getZoneRange(z.key);
      bus.emit('patchbay:assign-zone', {
        routeId: popupRouteId,
        zone: z.key,
        ...range,
      });
      // Update active state
      cablePopupBtns.querySelectorAll('.cable-popup__btn').forEach(b =>
        b.classList.remove('cable-popup__btn--active'));
      btn.classList.add('cable-popup__btn--active');
    });
    cablePopupBtns.appendChild(btn);
  }

  // Mark current zone active (dynamic import to avoid circular dependency)
  import('./router.js').then(routerMod => {
    const route = routerMod.getRoute(routeId);
    if (route) {
      const currentZone = route.zone || 'all';
      const btns = cablePopupBtns.querySelectorAll('.cable-popup__btn');
      const zoneKeys = splits.getCount() >= 2
        ? ['all', 'low', 'mid', 'high']
        : splits.getCount() >= 1
          ? ['all', 'low', 'high']
          : ['all'];
      const idx = zoneKeys.indexOf(currentZone);
      const activeBtn = idx >= 0 ? btns[idx] : null;
      if (activeBtn) activeBtn.classList.add('cable-popup__btn--active');
    }
  });

  // Position popup at the pointer location
  cablePopup.style.left = `${pointerX}px`;
  cablePopup.style.top  = `${pointerY - 40}px`;
  cablePopup.style.transform = 'translateX(-50%)';

  cablePopup.hidden = false;
}

function scheduleHidePopup() {
  clearHideTimer();
  popupHideTimer = setTimeout(() => {
    cablePopup.hidden = true;
    popupRouteId = null;
  }, 300);
}

function clearHideTimer() {
  if (popupHideTimer) {
    clearTimeout(popupHideTimer);
    popupHideTimer = null;
  }
}

// ── Window resize → update cable positions ─────────────────────────
let resizeRAF = null;
function onResize() {
  if (resizeRAF) cancelAnimationFrame(resizeRAF);
  resizeRAF = requestAnimationFrame(() => updateAllCables());
}

// ── Init ───────────────────────────────────────────────────────────
export function init() {
  initClickConnect();
  initCableDrag();
  initCablePopup();
  window.addEventListener('resize', onResize);

  bus.on('midi:ready', renderPorts);
  bus.on('midi:devices-changed', (devices) => {
    const savedInputId = activatedInputId;
    deactivateInput();
    renderPorts(devices);
    bus.emit('patchbay:ports-updated', devices);
    // Restore activation if the input still exists
    if (savedInputId && inputPorts.find(p => p.id === savedInputId)) {
      activateInput(savedInputId);
    }
  });
}

// ── Getters ────────────────────────────────────────────────────────
export function getInputPorts()  { return inputPorts; }
export function getOutputPorts() { return outputPorts; }
