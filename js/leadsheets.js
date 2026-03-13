// ── Lead Sheets Tab ─────────────────────────────────────────────────
import { $ } from './utils.js';

const FILES = [
  'Afternoon_in_Paris.png',
  'Alice_in_Wonderland.png',
  'All_Blues.png',
  'All_by_Myself.png',
  'All_of_Me.png',
  'All_of_You.png',
  'All_the_Things_You_Are.png',
  'Always.png',
  'Anthropology.png',
  'April_in_Paris.png',
  'Autumn_in_New_York.png',
  'Autumn_Leaves.png',
  'Beautiful_Love.png',
  'Beauty_and_the_Beast.png',
  'Bessies_Blues.png',
  'Bewitched.png',
  'Black_Coffee.png',
  'Black_Narcissus.png',
  'Black_Orpheus.png',
  'Blue_Bossa.png',
  'Blue_in_Green.png',
  'Blue_Monk.png',
  'Blue_Train.png',
  'Blues_for_Alice.png',
  'Body_and_Soul.png',
  'Boplicity.png',
  'But_Beautiful.png',
  'Cest_Si_Bon.png',
  'Call_Me_Irresponsible.png',
  'Cant_Help_Lovin_Dat_Man.png',
  'Cherokee.png',
  'Chitlins_Con_Carne.png',
  'Come_Sunday.png',
  'Cloud_It_Be_You.png',
  'Darn_That_Dream.png',
  'Dont_Blame_Me.png',
  'Dont_Get_Around_Much_Anymore.png',
  'Dream_a_Little_Dream_of_Me.png',
  'El_Gaucho.png',
  'Emily.png',
  'Footprints.png',
  'For_Sentimental_Reasons.png',
  'Forest_Flower.png',
  'Four.png',
  'Freddie_Freeloader.png',
  'Freedom_Jazz_Dance.png',
  'Gee_Baby_Aint_I_Good_to_You.png',
  'Giant_Steps.png',
  'Girl_From_Ipanema.png',
  'Have_You_Met_Miss_Jones.png',
  'Heres_That_Rainy_Day.png',
  'How_High_the_Moon.png',
  'How_My_Heart_Sings.png',
  'I_Cant_Get_Started_With_You.png',
  'I_Cant_Give_You_Anything_But_Love.png',
  'I_Could_Write_a_Book.png',
  'I_Got_It_Bad_and_That_Aint_Good.png',
  'I_Let_a_Song_Go_Out_of_My_Heart.png',
  'I_Love_Paris.png',
  'I_Love_You.png',
  'I_Mean_You.png',
  'I_Remember_Clifford.png',
  'I_Wish_I_Knew_How_It_Would_Feel_to_Be_Free.png',
  'Ill_Never_Smile_Again.png',
  'Ill_Remember_April.png',
  'Im_Beginning_to_See_the_Light.png',
  'In_a_Mellow_Tone.png',
  'In_a_Sentimental_Mood.png',
  'In_the_Wee_Small_Hours_of_the_Morning.png',
  'Misty.png',
  'Page_069.png',
  'Page_070.png',
  'Page_071.png',
  'Page_072.png',
  'Page_073.png',
  'Page_074.png',
  'Page_075.png',
  'Page_076.png',
  'Page_077.png',
  'Page_078.png',
  'Page_079.png',
  'Page_080.png',
  'Page_081.png',
  'Page_082.png',
  'Page_083.png',
  'Page_084.png',
  'Page_085.png',
  'Page_086.png',
  'Page_087.png',
  'Page_088.png',
  'Page_089.png',
  'Page_090.png',
  'Page_091.png',
  'Page_092.png',
  'Page_093.png',
  'Page_094.png',
  'Page_095.png',
  'Page_096.png',
  'Page_097.png',
  'Page_098.png',
  'Page_099.png',
  'Page_100.png',
  'Page_101.png',
  'Page_102.png',
  'Page_103.png',
  'Page_104.png',
  'Page_105.png',
  'Page_106.png',
  'Page_107.png',
  'Page_108.png',
  'Page_109.png',
  'Page_110.png',
  'Page_111.png',
  'Page_112.png',
  'Page_113.png',
  'Page_114.png',
  'Page_115.png',
  'Page_116.png',
  'Page_117.png',
  'Page_118.png',
  'Page_119.png',
  'Summertime.png',
];

const TAG_LABELS = { ballad: 'Ballad', mid: 'Mid', up: 'Up' };

const sheets = FILES
  .map(f => ({
    title: f.replace('.png', '').replace(/_/g, ' '),
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
