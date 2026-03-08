// ── AV Sync Tab ───────────────────────────────────────────────────
import { bus, $, createElement } from './utils.js';
import * as api from './avsync-api.js';

const panel = $('#avsync-panel');

// State
let videoPath = '';
let audioPath = '';
let videoInfo = null;
let audioInfo = null;
let syncOffset = null;
let syncConfidence = null;
let backendOk = false;

// DOM refs (set in init)
let videoPathInput, videoMeta, videoBrowse;
let audioPathInput, audioMeta, audioBrowse;
let analyzeBtn, analyzeProgress, analyzeBar, analyzeText, analyzeResult;
let offsetInput, confidenceBadge;
let outputPathInput, outputBrowse;
let renderBtn, renderProgress, renderBar, renderText, renderResult;
let statusMsg;

// ── Build UI ──────────────────────────────────────────────────────
function buildUI() {
  panel.innerHTML = '';

  const container = createElement('div', { className: 'avsync-container' });

  // ── File selection row ──────────────────────────────────────────
  const fileRow = createElement('div', { className: 'avsync-file-row' });

  // Video slot
  const videoSlot = buildFileSlot('Video File', 'video/*,.mp4,.mov,.mts,.mxf', (path) => {
    videoPath = path;
    probeVideo();
  });
  videoPathInput = videoSlot.pathInput;
  videoMeta = videoSlot.meta;
  videoBrowse = videoSlot.browseInput;

  // Audio slot
  const audioSlot = buildFileSlot('Audio File', 'audio/*,.wav,.aif,.aiff,.mp3,.m4a', (path) => {
    audioPath = path;
    probeAudio();
  });
  audioPathInput = audioSlot.pathInput;
  audioMeta = audioSlot.meta;
  audioBrowse = audioSlot.browseInput;

  fileRow.appendChild(videoSlot.el);
  fileRow.appendChild(audioSlot.el);
  container.appendChild(fileRow);

  // ── Analysis section ────────────────────────────────────────────
  const analysisSection = createElement('div', { className: 'avsync-section' });

  analyzeBtn = createElement('button', {
    className: 'btn btn--primary avsync-action-btn',
    textContent: 'Analyze Sync',
  });
  analyzeBtn.disabled = true;
  analyzeBtn.addEventListener('click', runAnalysis);

  analyzeProgress = createElement('div', { className: 'progress-bar', hidden: true });
  analyzeBar = createElement('div', { className: 'progress-bar__fill' });
  analyzeText = createElement('span', { className: 'progress-bar__text' });
  analyzeProgress.appendChild(analyzeBar);
  analyzeProgress.appendChild(analyzeText);

  analyzeResult = createElement('div', { className: 'avsync-result', hidden: true });

  // Offset manual adjust
  const offsetRow = createElement('div', { className: 'avsync-offset-row' });
  const offsetLabel = createElement('span', { className: 'field__label', textContent: 'Offset (ms)' });
  offsetInput = createElement('input', {
    type: 'number',
    className: 'field__input field__input--narrow',
    value: '0',
  });
  offsetInput.addEventListener('change', () => {
    syncOffset = parseFloat(offsetInput.value) || 0;
    updateRenderState();
  });

  confidenceBadge = createElement('span', { className: 'confidence-badge' });

  offsetRow.appendChild(offsetLabel);
  offsetRow.appendChild(offsetInput);
  offsetRow.appendChild(confidenceBadge);

  analysisSection.appendChild(analyzeBtn);
  analysisSection.appendChild(analyzeProgress);
  analysisSection.appendChild(analyzeResult);
  analysisSection.appendChild(offsetRow);
  container.appendChild(analysisSection);

  // ── Render section ──────────────────────────────────────────────
  const renderSection = createElement('div', { className: 'avsync-section' });

  // Output path
  const outputSlot = createElement('div', { className: 'avsync-output-row' });
  const outputLabel = createElement('span', { className: 'field__label', textContent: 'Output Path' });
  outputPathInput = createElement('input', {
    type: 'text',
    className: 'field__input avsync-path-input',
    placeholder: 'Output file path...',
  });
  outputSlot.appendChild(outputLabel);
  outputSlot.appendChild(outputPathInput);

  renderBtn = createElement('button', {
    className: 'btn btn--primary avsync-action-btn',
    textContent: 'Render',
  });
  renderBtn.disabled = true;
  renderBtn.addEventListener('click', runRender);

  renderProgress = createElement('div', { className: 'progress-bar', hidden: true });
  renderBar = createElement('div', { className: 'progress-bar__fill' });
  renderText = createElement('span', { className: 'progress-bar__text' });
  renderProgress.appendChild(renderBar);
  renderProgress.appendChild(renderText);

  renderResult = createElement('div', { className: 'avsync-result', hidden: true });

  renderSection.appendChild(outputSlot);
  renderSection.appendChild(renderBtn);
  renderSection.appendChild(renderProgress);
  renderSection.appendChild(renderResult);
  container.appendChild(renderSection);

  // ── Status ──────────────────────────────────────────────────────
  statusMsg = createElement('div', { className: 'avsync-status' });
  container.appendChild(statusMsg);

  panel.appendChild(container);
}

function buildFileSlot(label, accept, onPathChange) {
  const el = createElement('div', { className: 'file-slot' });
  const labelEl = createElement('div', { className: 'file-slot__label', textContent: label });

  const row = createElement('div', { className: 'file-slot__row' });
  const pathInput = createElement('input', {
    type: 'text',
    className: 'field__input avsync-path-input',
    placeholder: 'Paste file path or use Browse...',
  });
  pathInput.addEventListener('change', () => onPathChange(pathInput.value));

  const browseBtn = createElement('button', {
    className: 'btn btn--ghost',
    textContent: 'Browse',
  });
  const browseInput = createElement('input', { type: 'file', accept, hidden: true });
  browseBtn.addEventListener('click', () => browseInput.click());
  browseInput.addEventListener('change', () => {
    if (browseInput.files.length > 0) {
      const file = browseInput.files[0];
      // Browser doesn't give full path — show filename as hint
      pathInput.value = file.name;
      pathInput.placeholder = `Paste full path for: ${file.name}`;
      // Cannot auto-probe without full path
    }
  });

  row.appendChild(pathInput);
  row.appendChild(browseBtn);

  const meta = createElement('div', { className: 'file-slot__meta' });

  el.appendChild(labelEl);
  el.appendChild(row);
  el.appendChild(meta);

  return { el, pathInput, meta, browseInput, browseBtn };
}

// ── Probe files ───────────────────────────────────────────────────
async function probeVideo() {
  if (!videoPath) return;
  videoMeta.textContent = 'Probing...';
  try {
    videoInfo = await api.probeFile(videoPath);
    videoMeta.textContent = `${videoInfo.codec} · ${formatDuration(videoInfo.duration_s)} · ${videoInfo.has_audio ? 'has audio' : 'no audio'}`;
    if (!videoInfo.has_audio) {
      videoMeta.textContent += ' (no scratch audio to sync!)';
    }
    suggestOutputPath();
  } catch (e) {
    videoMeta.textContent = `Error: ${e.message}`;
    videoInfo = null;
  }
  updateAnalyzeState();
}

async function probeAudio() {
  if (!audioPath) return;
  audioMeta.textContent = 'Probing...';
  try {
    audioInfo = await api.probeFile(audioPath);
    audioMeta.textContent = `${audioInfo.codec} · ${formatDuration(audioInfo.duration_s)} · ${audioInfo.sample_rate || '?'} Hz`;
  } catch (e) {
    audioMeta.textContent = `Error: ${e.message}`;
    audioInfo = null;
  }
  updateAnalyzeState();
}

function suggestOutputPath() {
  if (videoPath && !outputPathInput.value) {
    const dot = videoPath.lastIndexOf('.');
    const base = dot > 0 ? videoPath.substring(0, dot) : videoPath;
    outputPathInput.value = `${base}_synced.mp4`;
  }
}

// ── Analysis ──────────────────────────────────────────────────────
function updateAnalyzeState() {
  analyzeBtn.disabled = !videoInfo || !audioInfo || !videoInfo.has_audio || !backendOk;
}

async function runAnalysis() {
  analyzeBtn.disabled = true;
  analyzeProgress.hidden = false;
  analyzeResult.hidden = true;
  analyzeBar.style.width = '0%';
  analyzeText.textContent = 'Starting...';

  try {
    const { job_id } = await api.analyzeSync(videoPath, audioPath);

    api.connectProgress(job_id, 'analyze',
      // onProgress
      (data) => {
        analyzeBar.style.width = `${data.percent}%`;
        analyzeText.textContent = data.message || `${data.percent}%`;
      },
      // onComplete
      (data) => {
        syncOffset = data.offset_ms;
        syncConfidence = data.confidence;
        offsetInput.value = syncOffset;

        analyzeBar.style.width = '100%';
        analyzeText.textContent = 'Done';
        analyzeProgress.hidden = true;

        // Show result
        analyzeResult.hidden = false;
        analyzeResult.textContent = `Offset: ${syncOffset > 0 ? '+' : ''}${syncOffset} ms`;

        // Confidence badge
        confidenceBadge.textContent = `${syncConfidence}%`;
        confidenceBadge.className = 'confidence-badge';
        if (syncConfidence >= 90) confidenceBadge.classList.add('confidence-badge--high');
        else if (syncConfidence >= 70) confidenceBadge.classList.add('confidence-badge--mid');
        else confidenceBadge.classList.add('confidence-badge--low');

        if (syncConfidence < 70) {
          bus.emit('toast', 'Low confidence — verify offset manually before rendering');
        }

        updateRenderState();
        analyzeBtn.disabled = false;
      },
      // onError
      (err) => {
        analyzeProgress.hidden = true;
        analyzeResult.hidden = false;
        analyzeResult.textContent = `Error: ${err}`;
        analyzeBtn.disabled = false;
        bus.emit('toast', `Analysis failed: ${err}`);
      },
    );
  } catch (e) {
    analyzeProgress.hidden = true;
    analyzeBtn.disabled = false;
    bus.emit('toast', `Analysis failed: ${e.message}`);
  }
}

// ── Render ─────────────────────────────────────────────────────────
function updateRenderState() {
  const hasOffset = syncOffset !== null || (offsetInput.value && offsetInput.value !== '');
  renderBtn.disabled = !hasOffset || !videoInfo || !audioInfo || !outputPathInput.value;
}

async function runRender() {
  const offset = parseFloat(offsetInput.value) || 0;
  const outputPath = outputPathInput.value.trim();
  if (!outputPath) {
    bus.emit('toast', 'Please specify an output path');
    return;
  }

  renderBtn.disabled = true;
  renderProgress.hidden = false;
  renderResult.hidden = true;
  renderBar.style.width = '0%';
  renderText.textContent = 'Starting...';

  try {
    const { job_id } = await api.startRender(videoPath, audioPath, offset, outputPath);

    api.connectProgress(job_id, 'render',
      // onProgress
      (data) => {
        renderBar.style.width = `${data.percent}%`;
        renderText.textContent = data.message || `${data.percent}%`;
      },
      // onComplete
      (data) => {
        renderBar.style.width = '100%';
        renderText.textContent = 'Done';
        renderProgress.hidden = true;

        renderResult.hidden = false;
        renderResult.textContent = `Saved to: ${data.output_path}`;
        renderResult.classList.add('avsync-result--success');

        renderBtn.disabled = false;
        bus.emit('toast', 'Render complete!');
      },
      // onError
      (err) => {
        renderProgress.hidden = true;
        renderResult.hidden = false;
        renderResult.textContent = `Error: ${err}`;
        renderResult.classList.remove('avsync-result--success');
        renderBtn.disabled = false;
        bus.emit('toast', `Render failed: ${err}`);
      },
    );
  } catch (e) {
    renderProgress.hidden = true;
    renderBtn.disabled = false;
    bus.emit('toast', `Render failed: ${e.message}`);
  }
}

// ── Helpers ───────────────────────────────────────────────────────
function formatDuration(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// ── Health check ──────────────────────────────────────────────────
async function checkBackend() {
  try {
    const health = await api.checkHealth();
    backendOk = health.status === 'ok' && health.ffmpeg;
    if (!health.ffmpeg) {
      statusMsg.textContent = 'ffmpeg not found — install it to use AV Sync';
      statusMsg.classList.add('avsync-status--error');
    } else {
      statusMsg.textContent = 'Backend connected · ffmpeg available';
      statusMsg.classList.remove('avsync-status--error');
    }
  } catch {
    backendOk = false;
    statusMsg.textContent = 'Backend not running — start the server with: cd backend && uvicorn server:app --port 8000';
    statusMsg.classList.add('avsync-status--error');
  }
  updateAnalyzeState();
}

// ── Reset ─────────────────────────────────────────────────────────
export function reset() {
  videoPath = '';
  audioPath = '';
  videoInfo = null;
  audioInfo = null;
  syncOffset = null;
  syncConfidence = null;
  if (videoPathInput) videoPathInput.value = '';
  if (audioPathInput) audioPathInput.value = '';
  if (videoMeta) videoMeta.textContent = '';
  if (audioMeta) audioMeta.textContent = '';
  if (outputPathInput) outputPathInput.value = '';
  if (analyzeResult) analyzeResult.hidden = true;
  if (renderResult) renderResult.hidden = true;
  if (offsetInput) offsetInput.value = '0';
  if (confidenceBadge) confidenceBadge.textContent = '';
  updateAnalyzeState();
  updateRenderState();
}

// ── Init ──────────────────────────────────────────────────────────
export function init() {
  buildUI();

  // Reset button
  const resetBtn = $('#avsync-reset');
  if (resetBtn) resetBtn.addEventListener('click', reset);

  // Check backend when tab is shown
  bus.on('tab:changed', (tabId) => {
    if (tabId === 'avsync') checkBackend();
  });

  // Also listen for path input changes to update render state
  if (outputPathInput) {
    outputPathInput.addEventListener('input', updateRenderState);
  }
}
