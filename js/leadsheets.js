// ── Lead Sheets Tab ─────────────────────────────────────────────────
import { $ } from './utils.js';

const FILES = [
  'All Of Me.png',
  'Autumn Leaves.png',
  'Beautiful Love.png',
  'Bewitched.png',
  'Blue in Green.png',
  'Body and Soul.png',
  'Cheek To Cheek.png',
  'Dont Get Around much Anymore.png',
  'Dream a Little Dream.png',
  'Emily.png',
  'How High The Moon.png',
  'Its Only A Paper Moon.png',
  'Mercy Mercy Mercy.png',
  'Misty.png',
  'My Favorite Things.png',
  'My Funny Valentine.png',
  'Someday My Prince.png',
  'Stella By Starlight.png',
  'Summertime.png',
  'Sunday Kind of Love.png',
  'there-will-never-be-another-you.png',
];

const TAG_LABELS = { ballad: 'Ballad', mid: 'Mid', up: 'Up' };

const sheets = FILES
  .map(f => ({
    title: f.replace('.png', '').replace(/-/g, ' '),
    url: `/assets/leadsheets/${encodeURIComponent(f)}`,
  }))
  .sort((a, b) => a.title.localeCompare(b.title));

// ── Persistence ────────────────────────────────────────────────────
function loadTags() {
  try {
    const raw = JSON.parse(localStorage.getItem('ls_tags') || '{}');
    // Migrate old string values to arrays
    const out = {};
    for (const [k, v] of Object.entries(raw)) {
      out[k] = Array.isArray(v) ? v : (v ? [v] : []);
    }
    return out;
  } catch { return {}; }
}
function saveTags(t) { localStorage.setItem('ls_tags', JSON.stringify(t)); }

function loadSetLists() {
  try { return JSON.parse(localStorage.getItem('ls_setlists') || '[]'); } catch { return []; }
}
function saveSetLists(sl) { localStorage.setItem('ls_setlists', JSON.stringify(sl)); }

// ── State ──────────────────────────────────────────────────────────
let tags = loadTags();
let setLists = loadSetLists();
let selectedTitle = null;
let activeSetListId = null;
let tagFilters = new Set();   // empty = show all
let filteredSheets = [...sheets];

// DOM refs
let listEl, setListsEl, viewerImg, viewerTitleEl, viewerEmpty,
    viewerHeader, tagPickerEl, sheetPanel, setListPanel,
    setListNameEl, setListSongsEl, searchEl;

// ── Tag helpers ────────────────────────────────────────────────────
function getTags(title) { return tags[title] || []; }
function toggleTag(title, tag) {
  const current = getTags(title);
  const idx = current.indexOf(tag);
  if (idx === -1) current.push(tag);
  else current.splice(idx, 1);
  tags[title] = current;
  saveTags(tags);
}

// ── Set list helpers ───────────────────────────────────────────────
function getSetList(id) { return setLists.find(sl => sl.id === id); }
function newSetList() {
  const sl = { id: Date.now().toString(), name: 'New Set List', songs: [] };
  setLists.push(sl);
  saveSetLists(setLists);
  return sl;
}

// ── Filter ─────────────────────────────────────────────────────────
function applyFilter(query = searchEl?.value || '') {
  const q = query.toLowerCase();
  filteredSheets = sheets.filter(s => {
    const matchesSearch = !q || s.title.toLowerCase().includes(q);
    if (!matchesSearch) return false;
    if (tagFilters.size === 0) return true;
    const songTags = getTags(s.title);
    return [...tagFilters].some(t => songTags.includes(t));
  });
  renderList();
}

// ── Render song list ───────────────────────────────────────────────
function renderList() {
  listEl.innerHTML = '';
  for (const sheet of filteredSheets) {
    const songTags = getTags(sheet.title);
    const item = document.createElement('div');
    item.className = 'ls-list__item';
    if (sheet.title === selectedTitle) item.classList.add('ls-list__item--active');

    const dots = document.createElement('span');
    dots.className = 'ls-tag-dots';
    for (const tag of ['ballad', 'mid', 'up']) {
      const dot = document.createElement('span');
      dot.className = `ls-tag-dot ls-tag-dot--${songTags.includes(tag) ? tag : 'none'}`;
      dots.appendChild(dot);
    }
    item.appendChild(dots);

    const label = document.createElement('span');
    label.textContent = sheet.title;
    item.appendChild(label);

    item.addEventListener('click', () => {
      if (activeSetListId) addToActiveSetList(sheet.title);
      else selectSheet(sheet);
    });
    listEl.appendChild(item);
  }
}

// ── Render set lists in sidebar ────────────────────────────────────
function renderSetListsSidebar() {
  setListsEl.innerHTML = '';
  for (const sl of setLists) {
    const item = document.createElement('div');
    item.className = 'ls-setlist-item';
    if (sl.id === activeSetListId) item.classList.add('ls-setlist-item--active');
    item.textContent = sl.name;
    item.addEventListener('click', () => {
      if (activeSetListId === sl.id) closeSetList();
      else openSetList(sl.id);
    });
    setListsEl.appendChild(item);
  }
}

function closeSetList() {
  activeSetListId = null;
  sheetPanel.hidden = true;
  setListPanel.hidden = true;
  viewerEmpty.hidden = false;
  renderSetListsSidebar();
}

// ── Select a sheet ─────────────────────────────────────────────────
function selectSheet(sheet) {
  selectedTitle = sheet.title;
  activeSetListId = null;

  for (const item of listEl.querySelectorAll('.ls-list__item')) {
    const isActive = item.querySelector('span:last-child')?.textContent === sheet.title;
    item.classList.toggle('ls-list__item--active', isActive);
  }
  const activeItem = listEl.querySelector('.ls-list__item--active');
  if (activeItem) activeItem.scrollIntoView({ block: 'nearest' });

  sheetPanel.hidden = false;
  setListPanel.hidden = true;
  viewerEmpty.hidden = true;
  viewerImg.hidden = false;
  viewerTitleEl.textContent = sheet.title;
  viewerImg.src = sheet.url;
  viewerHeader.hidden = false;

  renderTagPicker();
  renderSetListsSidebar();
}

// ── Tag picker in viewer header ────────────────────────────────────
function renderTagPicker() {
  tagPickerEl.innerHTML = '';
  const current = getTags(selectedTitle);
  for (const [key, label] of Object.entries(TAG_LABELS)) {
    const btn = document.createElement('button');
    btn.className = `ls-tag-btn ls-tag-btn--${key}`;
    if (current.includes(key)) btn.classList.add('ls-tag-btn--active');
    btn.textContent = label;
    btn.addEventListener('click', () => {
      toggleTag(selectedTitle, key);
      renderTagPicker();
      renderList();
    });
    tagPickerEl.appendChild(btn);
  }
}

// ── Set list operations ────────────────────────────────────────────
function openSetList(id) {
  activeSetListId = id;
  selectedTitle = null;

  sheetPanel.hidden = true;
  setListPanel.hidden = false;
  viewerEmpty.hidden = true;

  for (const item of listEl.querySelectorAll('.ls-list__item')) {
    item.classList.remove('ls-list__item--active');
  }
  renderSetListsSidebar();
  renderSetListEditor();
}

let dragSrcIndex = null;

function renderSetListEditor() {
  const sl = getSetList(activeSetListId);
  if (!sl) return;

  setListNameEl.value = sl.name;
  setListSongsEl.innerHTML = '';

  if (!sl.songs.length) {
    setListSongsEl.innerHTML = '<p class="ls-setlist-empty">No songs yet. Click songs in the library to add them.</p>';
    return;
  }

  sl.songs.forEach((title, i) => {
    const row = document.createElement('div');
    row.className = 'ls-setlist-row';
    row.draggable = true;
    row.dataset.index = i;

    // Drag handle
    const handle = document.createElement('span');
    handle.className = 'ls-setlist-row__handle';
    handle.innerHTML = '⠿';

    const num = document.createElement('span');
    num.className = 'ls-setlist-row__num';
    num.textContent = i + 1;

    const songTags = getTags(title);
    const dots = document.createElement('span');
    dots.className = 'ls-tag-dots';
    for (const tag of ['ballad', 'mid', 'up']) {
      const dot = document.createElement('span');
      dot.className = `ls-tag-dot ls-tag-dot--${songTags.includes(tag) ? tag : 'none'}`;
      dots.appendChild(dot);
    }

    const name = document.createElement('span');
    name.className = 'ls-setlist-row__name';
    name.textContent = title;
    name.addEventListener('click', () => {
      const sheet = sheets.find(s => s.title === title);
      if (sheet) selectSheet(sheet);
    });

    const removeBtn = document.createElement('button');
    removeBtn.className = 'ls-setlist-row__btn ls-setlist-row__btn--remove';
    removeBtn.textContent = '✕';
    removeBtn.addEventListener('click', () => {
      sl.songs.splice(i, 1);
      saveSetLists(setLists);
      renderSetListEditor();
    });

    // Drag events
    row.addEventListener('dragstart', (e) => {
      dragSrcIndex = i;
      row.classList.add('ls-setlist-row--dragging');
      e.dataTransfer.effectAllowed = 'move';
    });
    row.addEventListener('dragend', () => {
      row.classList.remove('ls-setlist-row--dragging');
      for (const r of setListSongsEl.querySelectorAll('.ls-setlist-row')) {
        r.classList.remove('ls-setlist-row--over');
      }
    });
    row.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      for (const r of setListSongsEl.querySelectorAll('.ls-setlist-row')) {
        r.classList.remove('ls-setlist-row--over');
      }
      row.classList.add('ls-setlist-row--over');
    });
    row.addEventListener('drop', (e) => {
      e.preventDefault();
      if (dragSrcIndex === null || dragSrcIndex === i) return;
      const [moved] = sl.songs.splice(dragSrcIndex, 1);
      sl.songs.splice(i, 0, moved);
      dragSrcIndex = null;
      saveSetLists(setLists);
      renderSetListEditor();
    });

    row.appendChild(handle);
    row.appendChild(num);
    row.appendChild(dots);
    row.appendChild(name);
    row.appendChild(removeBtn);
    setListSongsEl.appendChild(row);
  });
}

function addToActiveSetList(title) {
  const sl = getSetList(activeSetListId);
  if (!sl || sl.songs.includes(title)) return;
  sl.songs.push(title);
  saveSetLists(setLists);
  renderSetListEditor();
}

// ── Keyboard navigation ────────────────────────────────────────────
function navigate(dir) {
  if (activeSetListId) return;
  const current = selectedTitle ? sheets.findIndex(s => s.title === selectedTitle) : -1;
  const next = current + dir;
  if (next < 0 || next >= sheets.length) return;
  selectSheet(sheets[next]);
  applyFilter();
}

// ── Init ───────────────────────────────────────────────────────────
export function init() {
  const panel = $('#leadsheets-panel');
  if (!panel) return;

  panel.innerHTML = `
    <div class="ls-layout">
      <aside class="ls-sidebar">
        <div class="ls-search">
          <input class="ls-search__input" type="search" placeholder="Search..." autocomplete="off">
        </div>
        <div class="ls-setlists-section">
          <div class="ls-setlists-header">
            <span>Set Lists</span>
            <button class="ls-setlists-new" id="ls-setlists-new">+ New</button>
          </div>
          <div id="ls-setlists-list"></div>
        </div>
        <div class="ls-tag-filters" id="ls-tag-filters">
          <button class="ls-filter-btn ls-filter-btn--ballad" data-tag="ballad">Ballad</button>
          <button class="ls-filter-btn ls-filter-btn--mid" data-tag="mid">Mid</button>
          <button class="ls-filter-btn ls-filter-btn--up" data-tag="up">Up</button>
        </div>
        <div class="ls-list" id="ls-list"></div>
      </aside>
      <main class="ls-viewer">
        <div class="ls-viewer__empty" id="ls-viewer-empty">Select a lead sheet</div>

        <!-- Sheet panel -->
        <div id="ls-sheet-panel" hidden>
          <div class="ls-viewer__header" id="ls-viewer-header">
            <span class="ls-viewer__title" id="ls-viewer-title"></span>
            <div class="ls-tag-picker" id="ls-tag-picker"></div>
          </div>
          <img class="ls-viewer__img" id="ls-viewer-img" alt="">
        </div>

        <!-- Set list editor panel -->
        <div id="ls-setlist-panel" hidden>
          <div class="ls-setlist-editor-header">
            <button class="ls-setlist-close-btn" id="ls-setlist-close">← Library</button>
            <input class="ls-setlist-name" id="ls-setlist-name" type="text">
            <button class="ls-setlist-delete-btn" id="ls-setlist-delete">Delete</button>
          </div>
          <p class="ls-setlist-hint">Click a song in the library to add it to this set list.</p>
          <div class="ls-setlist-songs" id="ls-setlist-songs"></div>
        </div>
      </main>
    </div>
  `;

  listEl         = panel.querySelector('#ls-list');
  setListsEl     = panel.querySelector('#ls-setlists-list');
  viewerImg      = panel.querySelector('#ls-viewer-img');
  viewerTitleEl  = panel.querySelector('#ls-viewer-title');
  viewerEmpty    = panel.querySelector('#ls-viewer-empty');
  viewerHeader   = panel.querySelector('#ls-viewer-header');
  tagPickerEl    = panel.querySelector('#ls-tag-picker');
  sheetPanel     = panel.querySelector('#ls-sheet-panel');
  setListPanel   = panel.querySelector('#ls-setlist-panel');
  setListNameEl  = panel.querySelector('#ls-setlist-name');
  setListSongsEl = panel.querySelector('#ls-setlist-songs');
  searchEl       = panel.querySelector('.ls-search__input');

  searchEl.addEventListener('input', () => applyFilter());

  // Tag filter pills — multi-select toggle
  for (const btn of panel.querySelectorAll('.ls-filter-btn')) {
    btn.addEventListener('click', () => {
      const tag = btn.dataset.tag;
      if (tagFilters.has(tag)) tagFilters.delete(tag);
      else tagFilters.add(tag);
      btn.classList.toggle('ls-filter-btn--active', tagFilters.has(tag));
      applyFilter();
    });
  }

  panel.querySelector('#ls-setlists-new').addEventListener('click', () => {
    const sl = newSetList();
    renderSetListsSidebar();
    openSetList(sl.id);
  });

  setListNameEl.addEventListener('input', () => {
    const sl = getSetList(activeSetListId);
    if (sl) { sl.name = setListNameEl.value; saveSetLists(setLists); renderSetListsSidebar(); }
  });

  panel.querySelector('#ls-setlist-close').addEventListener('click', closeSetList);

  panel.querySelector('#ls-setlist-delete').addEventListener('click', () => {
    setLists = setLists.filter(sl => sl.id !== activeSetListId);
    saveSetLists(setLists);
    activeSetListId = null;
    sheetPanel.hidden = true;
    setListPanel.hidden = true;
    viewerEmpty.hidden = false;
    renderSetListsSidebar();
  });

  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (e.key === 'ArrowRight') navigate(1);
    else if (e.key === 'ArrowLeft') navigate(-1);
  });

  applyFilter();
  renderSetListsSidebar();
}
