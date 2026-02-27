// ── EventBus: lightweight pub/sub ──────────────────────────────────
export class EventBus {
  constructor() {
    this._listeners = {};
  }

  on(event, fn) {
    (this._listeners[event] ||= []).push(fn);
    return () => this.off(event, fn);
  }

  off(event, fn) {
    const list = this._listeners[event];
    if (list) this._listeners[event] = list.filter(f => f !== fn);
  }

  emit(event, ...args) {
    (this._listeners[event] || []).forEach(fn => fn(...args));
  }
}

// Singleton bus for app-wide events
export const bus = new EventBus();

// ── MIDI helpers ───────────────────────────────────────────────────
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export function noteNumberToName(n) {
  if (n < 0 || n > 127) return '?';
  const octave = Math.floor(n / 12) - 1;
  return `${NOTE_NAMES[n % 12]}${octave}`;
}

export function midiStatusToType(status) {
  const type = status & 0xF0;
  switch (type) {
    case 0x80: return 'noteoff';
    case 0x90: return 'noteon';
    case 0xA0: return 'aftertouch';
    case 0xB0: return 'cc';
    case 0xC0: return 'programchange';
    case 0xD0: return 'channelpressure';
    case 0xE0: return 'pitchbend';
    default:   return 'other';
  }
}

export function midiChannel(status) {
  return (status & 0x0F) + 1; // 1-16
}

// ── DOM helpers ────────────────────────────────────────────────────
export function $(selector, parent = document) {
  return parent.querySelector(selector);
}

export function $$(selector, parent = document) {
  return [...parent.querySelectorAll(selector)];
}

export function createElement(tag, attrs = {}, children = []) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === 'className') el.className = value;
    else if (key === 'textContent') el.textContent = value;
    else if (key === 'innerHTML') el.innerHTML = value;
    else if (key.startsWith('data')) el.setAttribute(key.replace(/([A-Z])/g, '-$1').toLowerCase(), value);
    else el.setAttribute(key, value);
  }
  for (const child of children) {
    if (typeof child === 'string') el.appendChild(document.createTextNode(child));
    else if (child) el.appendChild(child);
  }
  return el;
}

// SVG namespace helper
export function createSVGElement(tag, attrs = {}) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [key, value] of Object.entries(attrs)) {
    el.setAttribute(key, value);
  }
  return el;
}

// ── Cable colors ───────────────────────────────────────────────────
const CABLE_COLORS = [
  '#00f0ff', '#ff2d55', '#30d158', '#ff9f0a', '#bf5af2',
  '#64d2ff', '#ff375f', '#ffd60a', '#ac8e68', '#5e5ce6',
];
let colorIndex = 0;

export function nextCableColor() {
  const color = CABLE_COLORS[colorIndex % CABLE_COLORS.length];
  colorIndex++;
  return color;
}

export function resetCableColors() {
  colorIndex = 0;
}

// ── ID generator ───────────────────────────────────────────────────
let _id = 0;
export function uid() {
  return `r${++_id}_${Date.now().toString(36)}`;
}
