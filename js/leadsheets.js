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

const sheets = FILES.map(f => ({
  title: f.replace('.png', '').replace(/-/g, ' '),
  url: `/assets/leadsheets/${encodeURIComponent(f)}`,
}));

function renderGrid() {
  if (!sheets.length) {
    return '<p class="leadsheets-empty">No lead sheets found. Add PNG files to assets/leadsheets/</p>';
  }
  return `<div class="leadsheets-grid">
    ${sheets.map(s => `
      <div class="leadsheet-card" data-url="${s.url}">
        <img class="leadsheet-card__thumb" src="${s.url}" alt="${s.title}" loading="lazy">
        <div class="leadsheet-card__title">${s.title}</div>
      </div>
    `).join('')}
  </div>`;
}

function openViewer(url, title) {
  // Remove existing viewer if any
  const old = $('#leadsheet-viewer');
  if (old) old.remove();

  const viewer = document.createElement('div');
  viewer.id = 'leadsheet-viewer';
  viewer.className = 'leadsheet-viewer';
  viewer.innerHTML = `
    <div class="leadsheet-viewer__backdrop"></div>
    <div class="leadsheet-viewer__content">
      <div class="leadsheet-viewer__header">
        <span class="leadsheet-viewer__title">${title}</span>
        <button class="leadsheet-viewer__close">&times;</button>
      </div>
      <div class="leadsheet-viewer__body">
        <img src="${url}" alt="${title}">
      </div>
    </div>
  `;
  document.body.appendChild(viewer);

  const close = () => viewer.remove();
  viewer.querySelector('.leadsheet-viewer__backdrop').addEventListener('click', close);
  viewer.querySelector('.leadsheet-viewer__close').addEventListener('click', close);
  document.addEventListener('keydown', function handler(e) {
    if (e.key === 'Escape') { close(); document.removeEventListener('keydown', handler); }
  });
}

function bindCards() {
  for (const card of document.querySelectorAll('.leadsheet-card')) {
    card.addEventListener('click', () => {
      const url = card.dataset.url;
      const title = card.querySelector('.leadsheet-card__title').textContent;
      openViewer(url, title);
    });
  }
}

export function init() {
  const panel = $('#leadsheets-panel');
  if (!panel) return;

  panel.innerHTML = renderGrid();
  bindCards();
}
