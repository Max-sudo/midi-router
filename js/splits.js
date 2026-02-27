// ── Split Points: divide keyboard into 1–3 zones ───────────────────
//
// splitCount 0 → no splits, full range only
// splitCount 1 → one split at split1: Low | High
// splitCount 2 → two splits at split1, split2: Low | Mid | High
//
import { bus } from './utils.js';

const STORAGE_KEY = 'midi-router-splits';

let splitCount = 0;   // 0, 1, or 2
let split1 = 60;      // C4 (Middle C)
let split2 = 84;      // C6

// ── Getters ────────────────────────────────────────────────────────
export function getCount()  { return splitCount; }
export function getSplit1() { return split1; }
export function getSplit2() { return split2; }

export function getZoneRange(zone) {
  if (splitCount === 0) {
    return { noteLow: 0, noteHigh: 127 };
  }
  if (splitCount === 1) {
    switch (zone) {
      case 'low':  return { noteLow: 0,      noteHigh: split1 - 1 };
      case 'high': return { noteLow: split1,  noteHigh: 127 };
      default:     return { noteLow: 0,       noteHigh: 127 };
    }
  }
  // splitCount === 2
  switch (zone) {
    case 'low':  return { noteLow: 0,      noteHigh: split1 - 1 };
    case 'mid':  return { noteLow: split1,  noteHigh: split2 - 1 };
    case 'high': return { noteLow: split2,  noteHigh: 127 };
    case 'all':
    default:     return { noteLow: 0,       noteHigh: 127 };
  }
}

export function getZoneForNote(note) {
  if (splitCount === 0) return 'all';
  if (splitCount === 1) return note < split1 ? 'low' : 'high';
  if (note < split1) return 'low';
  if (note < split2) return 'mid';
  return 'high';
}

/** List the zone names available at the current splitCount */
export function getAvailableZones() {
  if (splitCount === 0) return ['all'];
  if (splitCount === 1) return ['low', 'high'];
  return ['low', 'mid', 'high'];
}

// ── Setters ────────────────────────────────────────────────────────
export function setSplit1(note) {
  const max = splitCount === 2 ? split2 - 1 : 126;
  note = clamp(note, 1, max);
  if (note === split1) return;
  split1 = note;
  save();
  emitChanged();
}

export function setSplit2(note) {
  note = clamp(note, split1 + 1, 126);
  if (note === split2) return;
  split2 = note;
  save();
  emitChanged();
}

export function setSplits(s1, s2) {
  s1 = clamp(s1, 1, 125);
  s2 = clamp(s2, s1 + 1, 126);
  split1 = s1;
  split2 = s2;
  save();
  emitChanged();
}

// ── Add / Remove ──────────────────────────────────────────────────
export function addSplit() {
  if (splitCount >= 2) return;
  splitCount++;
  if (splitCount === 1) {
    split1 = 60; // default to C4
  } else if (splitCount === 2) {
    // Space the two splits sensibly
    if (split1 >= 84) split1 = 60;
    split2 = Math.max(split1 + 12, 84);
    if (split2 > 126) split2 = 126;
  }
  save();
  emitChanged();
}

export function removeSplit() {
  if (splitCount <= 0) return;
  splitCount--;
  save();
  emitChanged();
}

export function setCount(n) {
  n = clamp(n, 0, 2);
  if (n === splitCount) return;
  splitCount = n;
  if (splitCount === 2 && split2 <= split1) {
    split2 = Math.min(split1 + 12, 126);
  }
  save();
  emitChanged();
}

function emitChanged() {
  bus.emit('splits:changed', { splitCount, split1, split2 });
}

// ── Persistence ────────────────────────────────────────────────────
function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ splitCount, split1, split2 }));
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    if (typeof data.splitCount === 'number') splitCount = clamp(data.splitCount, 0, 2);
    if (typeof data.split1 === 'number') split1 = clamp(data.split1, 1, 125);
    if (typeof data.split2 === 'number') split2 = clamp(data.split2, split1 + 1, 126);
    // Legacy: if no splitCount stored but splits exist, assume 2
    if (data.splitCount === undefined && data.split1 !== undefined) splitCount = 2;
  } catch { /* ignore */ }
}

// ── Serialisation (for presets) ────────────────────────────────────
export function serialise() {
  return { splitCount, split1, split2 };
}

export function restore(data) {
  if (!data) return;
  if (typeof data.splitCount === 'number') {
    splitCount = clamp(data.splitCount, 0, 2);
  } else if (data.split1 !== undefined) {
    splitCount = 2; // legacy
  }
  if (typeof data.split1 === 'number' && typeof data.split2 === 'number') {
    split1 = clamp(data.split1, 1, 125);
    split2 = clamp(data.split2, split1 + 1, 126);
  }
  save();
  emitChanged();
}

// ── Init ───────────────────────────────────────────────────────────
export function init() {
  load();
  emitChanged();
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}
