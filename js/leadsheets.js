// ── Lead Sheets Tab ─────────────────────────────────────────────────
import { $ } from './utils.js';

const FILES = [
  "'Round_Midnight.png",
  "A_Sunday_Kind_Of_Love.png",
  "Afternoon_in_Paris.png",
  "Alice_in_Wonderland.png",
  "All_Blues.png",
  "All_by_Myself.png",
  "All_of_Me.png",
  "All_of_You.png",
  "All_the_Things_You_Are.png",
  "Always.png",
  "Anthropology.png",
  "April_in_Paris.png",
  "Autumn_Leaves.png",
  "Autumn_in_New_York.png",
  "Beautiful_Love.png",
  "Beauty_and_the_Beast.png",
  "Bessies_Blues.png",
  "Bewitched.png",
  "Black_Coffee.png",
  "Black_Narcissus.png",
  "Black_Orpheus.png",
  "Blue_Bossa.png",
  "Blue_Monk.png",
  "Blue_Train.png",
  "Blue_in_Green.png",
  "Blues_for_Alice.png",
  "Body_and_Soul.png",
  "Boplicity.png",
  "But_Beautiful.png",
  "Call_Me_Irresponsible.png",
  "Cant_Help_Lovin_Dat_Man.png",
  "Cest_Si_Bon.png",
  "Cherokee.png",
  "Chitlins_Con_Carne.png",
  "Cloud_It_Be_You.png",
  "Come_Sunday.png",
  "Darn_That_Dream.png",
  "Dont_Blame_Me.png",
  "Dont_Get_Around_Much_Anymore.png",
  "Dream_a_Little_Dream_of_Me.png",
  "El_Gaucho.png",
  "Emily.png",
  "Footprints.png",
  "For_Sentimental_Reasons.png",
  "Forest_Flower.png",
  "Four.png",
  "Freddie_Freeloader.png",
  "Freedom_Jazz_Dance.png",
  "Gee_Baby_Aint_I_Good_to_You.png",
  "Giant_Steps.png",
  "Girl_From_Ipanema.png",
  "Have_You_Met_Miss_Jones.png",
  "Heres_That_Rainy_Day.png",
  "How_High_the_Moon.png",
  "How_My_Heart_Sings.png",
  "I'll_Never_Smile_Again.png",
  "I'll_Remember_April.png",
  "I'm_Beginning_To_See_The_Light.png",
  "I_Cant_Get_Started_With_You.png",
  "I_Cant_Give_You_Anything_But_Love.png",
  "I_Could_Write_a_Book.png",
  "I_Got_It_Bad_and_That_Aint_Good.png",
  "I_Let_a_Song_Go_Out_of_My_Heart.png",
  "I_Love_Paris.png",
  "I_Love_You.png",
  "I_Mean_You.png",
  "I_Remember_Clifford.png",
  "I_Wish_I_Knew_How_It_Would_Feel_To_Be_Free.png",
  "In_A_Mellow_Tone.png",
  "In_A_Sentimental_Mood.png",
  "In_The_Wee_Small_Hours_Of_The_Morning.png",
  "It_Don't_Mean_A_Thing_(If_It_Ain't_Got_That_Swing).png",
  "Joy_Spring.png",
  "Like_Someone_In_Love.png",
  "Lush_Life.png",
  "Misty.png",
  "My_Favorite_Things.png",
  "My_Foolish_Heart.png",
  "My_Funny_Valentine.png",
  "My_One_And_Only_Love.png",
  "Nobody_Knows_You_When_You're_Down_And_Out.png",
  "Oleo.png",
  "One_Note_Samba.png",
  "Ornithology.png",
  "Peace.png",
  "Pent_Up_House.png",
  "Peri's_Scope.png",
  "Pfrancing_(No_Blues).png",
  "Recorda_Me.png",
  "Reflections.png",
  "Satin_Doll.png",
  "Scotch_And_Soda.png",
  "Scrapple_From_The_Apple.png",
  "So_What.png",
  "Solar.png",
  "Solitude.png",
  "Some_Day_My_Prince_Will_Come.png",
  "Some_Other_Spring.png",
  "Song_For_My_Father.png",
  "Stella_By_Starlight.png",
  "Straight_No_Chaser.png",
  "Summertime.png",
  "Take_Five.png",
  "Take_The_A_Train.png",
  "The_Surrey_With_The_Fringe_On_Top.png",
  "There_Is_No_Greater_Love.png",
  "There_Will_Never_Be_Another_You.png",
  "Unchain_My_Heart.png",
  "Waltz_For_Debby.png",
  "Well_You_Needn't.png",
  "When_I_Fall_In_Love.png",
  "When_Sunny_Gets_Blue.png",
  "When_You_Wish_Upon_A_Star.png",
  "Yesterday.png",
  "You_Don't_Know_What_Love_Is.png",
  "You're_Nobody_'til_Somebody_Loves_You.png",
];

const TAG_LABELS = { ballad: 'Ballad', mid: 'Mid', up: 'Up', learned: 'Learned' };

// Raw flat list — one entry per file
const rawSheets = FILES
  .map(f => ({
    title: f.replace(/\.png$/i, '').replace(/_/g, ' '),
    url: `assets/leadsheets/${encodeURIComponent(f)}`,
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

function loadRenames() {
  try { return JSON.parse(localStorage.getItem('ls_renames') || '{}'); } catch { return {}; }
}
function saveRenames(r) { localStorage.setItem('ls_renames', JSON.stringify(r)); }

// ── State ──────────────────────────────────────────────────────────
let tags = loadTags();
let setLists = loadSetLists();
let renames = loadRenames();
let selectedTitle = null;
let activeSetListId = null;
let tagFilters = new Set();   // empty = show all

// Display name: use renamed title if set, otherwise original
function displayName(title) { return renames[title] || title; }

// Group raw sheets by display name — sheets renamed to the same name merge into multi-page entries
function buildGroupedSheets() {
  const groups = new Map();
  for (const s of rawSheets) {
    const name = displayName(s.title);
    if (!groups.has(name)) {
      groups.set(name, { name, urls: [], origTitles: [] });
    }
    const g = groups.get(name);
    g.urls.push(s.url);
    g.origTitles.push(s.title);
  }
  return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name));
}

let sheets = buildGroupedSheets();
let filteredSheets = [...sheets];

// DOM refs
let listEl, setListsEl, viewerPages, viewerTitleEl, viewerEmpty,
    viewerHeader, tagPickerEl, sheetPanel, setListPanel,
    setListNameEl, setListSongsEl, searchEl, sidebarEl, toggleBtn;

// ── Tag helpers ────────────────────────────────────────────────────
function getTags(name) {
  // Check by display name first, then fall back to original title
  if (tags[name]) return tags[name];
  // Check if any original title has tags (for migration)
  const sheet = sheets.find(s => s.name === name);
  if (sheet) {
    for (const orig of sheet.origTitles) {
      if (tags[orig] && tags[orig].length) return tags[orig];
    }
  }
  return [];
}
function toggleTag(name, tag) {
  const current = getTags(name);
  const idx = current.indexOf(tag);
  if (idx === -1) current.push(tag);
  else current.splice(idx, 1);
  tags[name] = current;
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
    const matchesSearch = !q || s.name.toLowerCase().includes(q) ||
      s.origTitles.some(t => t.toLowerCase().includes(q));
    if (!matchesSearch) return false;
    if (tagFilters.size === 0) return true;
    const songTags = getTags(s.name);
    return [...tagFilters].some(t => songTags.includes(t));
  });
  renderList();
}

// ── Render song list ───────────────────────────────────────────────
let activeTagPopup = null;

function dismissTagPopup() {
  if (activeTagPopup) {
    activeTagPopup.remove();
    activeTagPopup = null;
  }
}

function showTagPopup(item, title) {
  dismissTagPopup();

  const popup = document.createElement('div');
  popup.className = 'ls-tag-popup';

  const current = getTags(title);
  for (const [key, label] of Object.entries(TAG_LABELS)) {
    const btn = document.createElement('button');
    btn.className = `ls-tag-popup__btn ls-tag-popup__btn--${key}`;
    if (current.includes(key)) btn.classList.add('ls-tag-popup__btn--active');
    btn.textContent = label;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleTag(title, key);
      btn.classList.toggle('ls-tag-popup__btn--active', getTags(title).includes(key));
      // Update the dots on the list item
      const dots = item.querySelector('.ls-tag-dots');
      if (dots) {
        const updatedTags = getTags(title);
        dots.querySelectorAll('.ls-tag-dot').forEach((dot, idx) => {
          const tag = ['ballad', 'mid', 'up', 'learned'][idx];
          dot.className = `ls-tag-dot ls-tag-dot--${updatedTags.includes(tag) ? tag : 'none'}`;
        });
      }
    });
    popup.appendChild(btn);
  }

  // Position popup to the right of the item
  const rect = item.getBoundingClientRect();
  const sidebarRect = item.closest('.ls-sidebar').getBoundingClientRect();
  popup.style.top = `${rect.top}px`;
  popup.style.left = `${sidebarRect.right + 4}px`;

  document.body.appendChild(popup);
  activeTagPopup = popup;

  // Dismiss when clicking outside
  const onClickOutside = (e) => {
    if (!popup.contains(e.target) && !item.contains(e.target)) {
      dismissTagPopup();
      document.removeEventListener('click', onClickOutside);
    }
  };
  setTimeout(() => document.addEventListener('click', onClickOutside), 0);
}

function renderList() {
  listEl.innerHTML = '';
  for (const sheet of filteredSheets) {
    const songTags = getTags(sheet.name);
    const item = document.createElement('div');
    item.className = 'ls-list__item';
    if (sheet.name === selectedTitle) item.classList.add('ls-list__item--active');

    const dots = document.createElement('span');
    dots.className = 'ls-tag-dots';
    for (const tag of ['ballad', 'mid', 'up', 'learned']) {
      const dot = document.createElement('span');
      dot.className = `ls-tag-dot ls-tag-dot--${songTags.includes(tag) ? tag : 'none'}`;
      dots.appendChild(dot);
    }
    item.appendChild(dots);

    // Page count badge for multi-page sheets
    if (sheet.urls.length > 1) {
      const badge = document.createElement('span');
      badge.className = 'ls-page-badge';
      badge.textContent = sheet.urls.length;
      item.appendChild(badge);
    }

    const label = document.createElement('span');
    label.textContent = sheet.name;
    item.appendChild(label);

    item.addEventListener('click', () => {
      dismissTagPopup();
      if (activeSetListId) addToActiveSetList(sheet.name);
      else selectSheet(sheet);
    });

    // Long-press / right-click to show tag popup
    let longPressTimer = null;
    item.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      showTagPopup(item, sheet.name);
    });
    item.addEventListener('touchstart', () => {
      longPressTimer = setTimeout(() => showTagPopup(item, sheet.name), 500);
    }, { passive: true });
    item.addEventListener('touchend', () => clearTimeout(longPressTimer));
    item.addEventListener('touchmove', () => clearTimeout(longPressTimer));

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
  selectedTitle = sheet.name;
  activeSetListId = null;

  for (const item of listEl.querySelectorAll('.ls-list__item')) {
    const isActive = item.querySelector('span:last-child')?.textContent === sheet.name;
    item.classList.toggle('ls-list__item--active', isActive);
  }
  const activeItem = listEl.querySelector('.ls-list__item--active');
  if (activeItem) activeItem.scrollIntoView({ block: 'nearest' });

  sheetPanel.hidden = false;
  setListPanel.hidden = true;
  viewerEmpty.hidden = true;
  viewerTitleEl.textContent = sheet.name;
  viewerHeader.hidden = false;

  // Render pages
  viewerPages.innerHTML = '';
  for (const url of sheet.urls) {
    const img = document.createElement('img');
    img.className = 'ls-viewer__img';
    img.src = url;
    img.alt = sheet.name;
    viewerPages.appendChild(img);
  }

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

  // Compute set numbers from break positions
  let setNumber = 1;
  let songNum = 0;

  sl.songs.forEach((entry, i) => {
    const isBreak = entry === '__break__';

    if (isBreak) {
      // Render set break divider
      const breakRow = document.createElement('div');
      breakRow.className = 'ls-setlist-break';
      breakRow.draggable = true;
      breakRow.dataset.index = i;

      const label = document.createElement('span');
      label.className = 'ls-setlist-break__label';
      setNumber++;
      label.textContent = `Set ${setNumber}`;

      const removeBtn = document.createElement('button');
      removeBtn.className = 'ls-setlist-row__btn ls-setlist-row__btn--remove';
      removeBtn.textContent = '✕';
      removeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        sl.songs.splice(i, 1);
        saveSetLists(setLists);
        renderSetListEditor();
      });

      breakRow.appendChild(label);
      breakRow.appendChild(removeBtn);

      attachDragEvents(breakRow, i, sl);

      setListSongsEl.appendChild(breakRow);
      songNum = 0;
      return;
    }

    const title = entry;
    songNum++;

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
    num.textContent = songNum;

    const songTags = getTags(title);
    const dots = document.createElement('span');
    dots.className = 'ls-tag-dots';
    for (const tag of ['ballad', 'mid', 'up', 'learned']) {
      const dot = document.createElement('span');
      dot.className = `ls-tag-dot ls-tag-dot--${songTags.includes(tag) ? tag : 'none'}`;
      dots.appendChild(dot);
    }

    const name = document.createElement('span');
    name.className = 'ls-setlist-row__name';
    name.textContent = displayName(title);
    name.addEventListener('click', (e) => {
      e.stopPropagation();
      const sheet = sheets.find(s => s.name === displayName(title) || s.origTitles.includes(title));
      if (sheet) selectSheet(sheet);
    });

    const removeBtn = document.createElement('button');
    removeBtn.className = 'ls-setlist-row__btn ls-setlist-row__btn--remove';
    removeBtn.textContent = '✕';
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      sl.songs.splice(i, 1);
      saveSetLists(setLists);
      renderSetListEditor();
    });

    attachDragEvents(row, i, sl);

    row.appendChild(handle);
    row.appendChild(num);
    row.appendChild(dots);
    row.appendChild(name);
    row.appendChild(removeBtn);
    setListSongsEl.appendChild(row);
  });
}

const DRAG_ROW_SELECTOR = '.ls-setlist-row, .ls-setlist-break';

function attachDragEvents(row, i, sl) {
  row.addEventListener('dragstart', (e) => {
    dragSrcIndex = i;
    row.classList.add('ls-setlist-row--dragging');
    e.dataTransfer.effectAllowed = 'move';
  });
  row.addEventListener('dragend', () => {
    row.classList.remove('ls-setlist-row--dragging');
    for (const r of setListSongsEl.querySelectorAll(DRAG_ROW_SELECTOR)) {
      r.classList.remove('ls-setlist-row--over');
    }
  });
  row.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    for (const r of setListSongsEl.querySelectorAll(DRAG_ROW_SELECTOR)) {
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

  // Touch drag events
  row.addEventListener('touchstart', (e) => {
    if (e.target.closest('.ls-setlist-row__btn') || e.target.closest('.ls-setlist-row__name')) return;
    dragSrcIndex = i;
    row.classList.add('ls-setlist-row--dragging');
  }, { passive: true });
  row.addEventListener('touchmove', (e) => {
    if (dragSrcIndex === null) return;
    e.preventDefault();
    const touch = e.touches[0];
    const target = document.elementFromPoint(touch.clientX, touch.clientY);
    const targetRow = target?.closest(DRAG_ROW_SELECTOR);
    for (const r of setListSongsEl.querySelectorAll(DRAG_ROW_SELECTOR)) {
      r.classList.remove('ls-setlist-row--over');
    }
    if (targetRow) targetRow.classList.add('ls-setlist-row--over');
  }, { passive: false });
  row.addEventListener('touchend', (e) => {
    if (dragSrcIndex === null) return;
    row.classList.remove('ls-setlist-row--dragging');
    const touch = e.changedTouches[0];
    const target = document.elementFromPoint(touch.clientX, touch.clientY);
    const targetRow = target?.closest(DRAG_ROW_SELECTOR);
    const targetIndex = targetRow ? parseInt(targetRow.dataset.index) : null;
    for (const r of setListSongsEl.querySelectorAll(DRAG_ROW_SELECTOR)) {
      r.classList.remove('ls-setlist-row--over');
    }
    if (targetIndex !== null && targetIndex !== dragSrcIndex) {
      const [moved] = sl.songs.splice(dragSrcIndex, 1);
      sl.songs.splice(targetIndex, 0, moved);
      saveSetLists(setLists);
      renderSetListEditor();
    }
    dragSrcIndex = null;
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
  const current = selectedTitle ? sheets.findIndex(s => s.name === selectedTitle) : -1;
  const next = current + dir;
  if (next < 0 || next >= sheets.length) return;
  selectSheet(sheets[next]);
  applyFilter();
}

// ── Set list play mode ───────────────────────────────────────────────
let playState = null; // { slId, songs: [{name, urls}], index, drawerOpen }

function getPlaySongs(sl) {
  // Build ordered list of songs (with break markers) from set list
  const items = [];
  let setNum = 1;
  for (const entry of sl.songs) {
    if (entry === '__break__') {
      setNum++;
      items.push({ type: 'break', label: `Set ${setNum}` });
    } else {
      const sheet = sheets.find(s => s.name === displayName(entry) || s.origTitles?.includes(entry));
      if (sheet) {
        items.push({ type: 'song', name: sheet.name, urls: sheet.urls });
      }
    }
  }
  return items;
}

function startPlayMode(slId) {
  const sl = getSetList(slId);
  if (!sl || !sl.songs.length) return;

  const items = getPlaySongs(sl);
  const songItems = items.filter(it => it.type === 'song');
  if (!songItems.length) return;

  playState = { slId, items, songItems, index: 0, drawerOpen: false };

  // Hide everything else
  sheetPanel.hidden = true;
  setListPanel.hidden = true;
  viewerEmpty.hidden = true;
  sidebarEl.classList.add('ls-sidebar--hidden');

  const playPanel = document.querySelector('#ls-play-panel');
  playPanel.hidden = false;

  renderPlayView();
}

function stopPlayMode() {
  playState = null;
  const playPanel = document.querySelector('#ls-play-panel');
  playPanel.hidden = true;
  // Return to set list editor
  openSetList(activeSetListId);
  sidebarEl.classList.remove('ls-sidebar--hidden');
}

function renderPlayView() {
  if (!playState) return;

  const song = playState.songItems[playState.index];
  const titleEl = document.querySelector('#ls-play-title');
  const posEl = document.querySelector('#ls-play-pos');
  const pagesEl = document.querySelector('#ls-play-pages');

  titleEl.textContent = song.name;
  posEl.textContent = `${playState.index + 1} / ${playState.songItems.length}`;

  pagesEl.innerHTML = '';
  for (const url of song.urls) {
    const img = document.createElement('img');
    img.className = 'ls-viewer__img';
    img.src = url;
    img.alt = song.name;
    pagesEl.appendChild(img);
  }

  // Update drawer highlight if open
  if (playState.drawerOpen) renderPlayDrawer();
}

function renderPlayDrawer() {
  const listEl = document.querySelector('#ls-play-drawer-list');
  listEl.innerHTML = '';

  let songIdx = 0;
  for (const item of playState.items) {
    if (item.type === 'break') {
      const breakEl = document.createElement('div');
      breakEl.className = 'ls-play-drawer__break';
      breakEl.textContent = item.label;
      listEl.appendChild(breakEl);
    } else {
      const idx = songIdx;
      const row = document.createElement('div');
      row.className = 'ls-play-drawer__item';
      if (idx === playState.index) row.classList.add('ls-play-drawer__item--active');
      row.textContent = item.name;
      row.addEventListener('click', () => {
        playState.index = idx;
        togglePlayDrawer(false);
        renderPlayView();
      });
      listEl.appendChild(row);
      songIdx++;
    }
  }
}

function togglePlayDrawer(force) {
  const drawer = document.querySelector('#ls-play-drawer');
  const open = force !== undefined ? force : !playState.drawerOpen;
  playState.drawerOpen = open;
  drawer.hidden = !open;
  if (open) renderPlayDrawer();
}

function playNavigate(dir) {
  if (!playState) return;
  const next = playState.index + dir;
  if (next < 0 || next >= playState.songItems.length) return;
  playState.index = next;
  renderPlayView();
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
          <button class="ls-filter-btn ls-filter-btn--learned" data-tag="learned">Learned</button>
        </div>
        <div class="ls-list" id="ls-list"></div>
        <div class="ls-sidebar__footer">
          <button class="ls-rename-start-btn" id="ls-rename-start">Rename Sheets</button>
          <button class="ls-download-btn" id="ls-download-btn">Download for Offline</button>
        </div>
      </aside>
      <main class="ls-viewer">
        <button class="ls-toggle" id="ls-toggle" title="Toggle sidebar">☰</button>
        <div class="ls-viewer__empty" id="ls-viewer-empty">Select a lead sheet</div>

        <!-- Sheet panel -->
        <div id="ls-sheet-panel" hidden>
          <div class="ls-viewer__header" id="ls-viewer-header">
            <span class="ls-viewer__title" id="ls-viewer-title"></span>
            <div class="ls-tag-picker" id="ls-tag-picker"></div>
          </div>
          <div class="ls-viewer__pages" id="ls-viewer-pages"></div>
        </div>

        <!-- Rename panel -->
        <div id="ls-rename-panel" hidden>
          <div class="ls-rename-bar">
            <input class="ls-rename-input" id="ls-rename-input" type="text" placeholder="Enter song name..." autocomplete="off">
            <button class="ls-rename-skip" id="ls-rename-skip">Skip</button>
            <button class="ls-rename-done" id="ls-rename-done">Done</button>
          </div>
          <div class="ls-rename-counter" id="ls-rename-counter"></div>
          <img class="ls-viewer__img" id="ls-rename-img" alt="">
        </div>

        <!-- Set list editor panel -->
        <div id="ls-setlist-panel" hidden>
          <div class="ls-setlist-editor-header">
            <button class="ls-setlist-close-btn" id="ls-setlist-close">← Library</button>
            <input class="ls-setlist-name" id="ls-setlist-name" type="text">
            <button class="ls-setlist-play-btn" id="ls-setlist-play">Play</button>
            <button class="ls-setlist-delete-btn" id="ls-setlist-delete">Delete</button>
          </div>
          <div class="ls-setlist-toolbar">
            <p class="ls-setlist-hint">Click a song in the library to add it.</p>
            <button class="ls-setlist-break-btn" id="ls-setlist-break">+ Set Break</button>
          </div>
          <div class="ls-setlist-songs" id="ls-setlist-songs"></div>
        </div>

        <!-- Set list play mode -->
        <div id="ls-play-panel" hidden>
          <div class="ls-play-header" id="ls-play-header">
            <button class="ls-play-back-btn" id="ls-play-back">← Set List</button>
            <span class="ls-play-title" id="ls-play-title"></span>
            <span class="ls-play-pos" id="ls-play-pos"></span>
          </div>
          <div class="ls-play-pages" id="ls-play-pages"></div>
          <div class="ls-play-drawer" id="ls-play-drawer" hidden>
            <div class="ls-play-drawer__list" id="ls-play-drawer-list"></div>
          </div>
        </div>
      </main>
    </div>
  `;

  listEl         = panel.querySelector('#ls-list');
  setListsEl     = panel.querySelector('#ls-setlists-list');
  viewerPages    = panel.querySelector('#ls-viewer-pages');
  viewerTitleEl  = panel.querySelector('#ls-viewer-title');
  viewerEmpty    = panel.querySelector('#ls-viewer-empty');
  viewerHeader   = panel.querySelector('#ls-viewer-header');
  tagPickerEl    = panel.querySelector('#ls-tag-picker');
  sheetPanel     = panel.querySelector('#ls-sheet-panel');
  setListPanel   = panel.querySelector('#ls-setlist-panel');
  setListNameEl  = panel.querySelector('#ls-setlist-name');
  setListSongsEl = panel.querySelector('#ls-setlist-songs');
  searchEl       = panel.querySelector('.ls-search__input');
  sidebarEl      = panel.querySelector('.ls-sidebar');
  toggleBtn      = panel.querySelector('#ls-toggle');

  // Sidebar toggle — tap the lead sheet image to collapse/expand sidebar
  viewerPages.addEventListener('click', () => {
    sidebarEl.classList.toggle('ls-sidebar--hidden');
  });
  // Also keep the hamburger button as a fallback
  toggleBtn.addEventListener('click', () => {
    sidebarEl.classList.toggle('ls-sidebar--hidden');
  });

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

  panel.querySelector('#ls-setlist-break').addEventListener('click', () => {
    const sl = getSetList(activeSetListId);
    if (!sl) return;
    sl.songs.push('__break__');
    saveSetLists(setLists);
    renderSetListEditor();
  });

  panel.querySelector('#ls-setlist-delete').addEventListener('click', () => {
    setLists = setLists.filter(sl => sl.id !== activeSetListId);
    saveSetLists(setLists);
    activeSetListId = null;
    sheetPanel.hidden = true;
    setListPanel.hidden = true;
    viewerEmpty.hidden = false;
    renderSetListsSidebar();
  });

  // Play mode
  panel.querySelector('#ls-setlist-play').addEventListener('click', () => {
    startPlayMode(activeSetListId);
  });

  panel.querySelector('#ls-play-back').addEventListener('click', stopPlayMode);

  // Tap header to toggle drawer
  panel.querySelector('#ls-play-title').addEventListener('click', () => {
    if (playState) togglePlayDrawer();
  });
  panel.querySelector('#ls-play-pos').addEventListener('click', () => {
    if (playState) togglePlayDrawer();
  });

  // Swipe on play pages
  const playPages = panel.querySelector('#ls-play-pages');
  let touchStartX = 0;
  let touchStartY = 0;
  playPages.addEventListener('touchstart', (e) => {
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
  }, { passive: true });
  playPages.addEventListener('touchend', (e) => {
    if (!playState) return;
    const dx = e.changedTouches[0].clientX - touchStartX;
    const dy = e.changedTouches[0].clientY - touchStartY;
    // Only trigger on horizontal swipes (not vertical scrolling)
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      if (dx < 0) playNavigate(1);  // swipe left = next
      else playNavigate(-1);         // swipe right = prev
    }
  }, { passive: true });

  // Tap play pages to toggle drawer
  playPages.addEventListener('click', () => {
    if (playState) togglePlayDrawer();
  });

  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (playState) {
      if (e.key === 'ArrowRight') playNavigate(1);
      else if (e.key === 'ArrowLeft') playNavigate(-1);
      else if (e.key === 'Escape') stopPlayMode();
    } else {
      if (e.key === 'ArrowRight') navigate(1);
      else if (e.key === 'ArrowLeft') navigate(-1);
    }
  });

  // Rename mode
  initRenameMode(panel);

  // Offline download button
  const downloadBtn = panel.querySelector('#ls-download-btn');
  initOfflineDownload(downloadBtn);

  applyFilter();
  renderSetListsSidebar();
}

// ── Bulk rename mode ─────────────────────────────────────────────────
function initRenameMode(panel) {
  const renamePanel = panel.querySelector('#ls-rename-panel');
  const renameInput = panel.querySelector('#ls-rename-input');
  const renameImg   = panel.querySelector('#ls-rename-img');
  const renameCounter = panel.querySelector('#ls-rename-counter');
  const startBtn    = panel.querySelector('#ls-rename-start');
  const skipBtn     = panel.querySelector('#ls-rename-skip');
  const doneBtn     = panel.querySelector('#ls-rename-done');

  let renameQueue = [];
  let renameIndex = 0;

  function showCurrentSheet() {
    if (renameIndex >= renameQueue.length) {
      exitRename();
      return;
    }
    const raw = renameQueue[renameIndex];
    renameImg.src = raw.url;
    renameInput.value = displayName(raw.title);
    renameInput.select();
    renameInput.focus();
    renameCounter.textContent = `${renameIndex + 1} of ${renameQueue.length}`;
  }

  function saveAndNext() {
    const raw = renameQueue[renameIndex];
    const newName = renameInput.value.trim();
    if (newName && newName !== raw.title) {
      renames[raw.title] = newName;
    } else if (newName === raw.title) {
      delete renames[raw.title];
    }
    saveRenames(renames);
    renameIndex++;
    showCurrentSheet();
  }

  function enterRename() {
    // Build queue from raw (ungrouped) sheets, filtered by current search
    const q = (searchEl?.value || '').toLowerCase();
    renameQueue = rawSheets.filter(s => {
      if (!q) return true;
      return displayName(s.title).toLowerCase().includes(q) || s.title.toLowerCase().includes(q);
    });

    // Start from the currently selected sheet if there is one
    renameIndex = 0;
    if (selectedTitle) {
      const selected = sheets.find(s => s.name === selectedTitle);
      if (selected) {
        const startIdx = renameQueue.findIndex(s => selected.origTitles.includes(s.title));
        if (startIdx > 0) renameIndex = startIdx;
      }
    }

    sheetPanel.hidden = true;
    setListPanel.hidden = true;
    viewerEmpty.hidden = true;
    renamePanel.hidden = false;

    showCurrentSheet();
  }

  function exitRename() {
    renamePanel.hidden = true;
    viewerEmpty.hidden = false;
    renameQueue = [];
    renameIndex = 0;
    // Rebuild grouped sheets and refresh
    sheets = buildGroupedSheets();
    applyFilter();
    renderSetListsSidebar();
  }

  startBtn.addEventListener('click', enterRename);

  renameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      saveAndNext();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      exitRename();
    }
  });

  skipBtn.addEventListener('click', () => {
    renameIndex++;
    showCurrentSheet();
  });

  doneBtn.addEventListener('click', exitRename);
}

// ── Offline download ────────────────────────────────────────────────
function initOfflineDownload(btn) {
  if (!('serviceWorker' in navigator)) {
    btn.style.display = 'none';
    return;
  }

  const allUrls = rawSheets.map(s => s.url);

  // Check current cache status on load
  navigator.serviceWorker.ready.then(() => {
    navigator.serviceWorker.controller?.postMessage({ type: 'CHECK_CACHE', urls: allUrls });
  });

  navigator.serviceWorker.addEventListener('message', (e) => {
    if (e.data.type === 'CACHE_STATUS') {
      if (e.data.cachedCount === e.data.total) {
        btn.textContent = 'Available Offline';
        btn.classList.add('ls-download-btn--done');
        btn.disabled = true;
      }
    }
    if (e.data.type === 'CACHE_PROGRESS') {
      const pct = Math.round((e.data.done / e.data.total) * 100);
      btn.textContent = `Downloading... ${pct}%`;
    }
    if (e.data.type === 'CACHE_DONE') {
      btn.textContent = 'Available Offline';
      btn.classList.add('ls-download-btn--done');
      btn.disabled = true;
    }
  });

  btn.addEventListener('click', () => {
    btn.disabled = true;
    btn.textContent = 'Downloading... 0%';
    navigator.serviceWorker.controller?.postMessage({ type: 'CACHE_LEADSHEETS', urls: allUrls });
  });
}
