// ── Audio Analysis Panel: Spectrum, Pitch, Envelope ──────────────────
import { bus, $ } from './utils.js';

/* ── Constants ────────────────────────────────────────────────────── */
const NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const RMS_HISTORY_LEN = 300;        // ~5 seconds at 60fps
const PITCH_HISTORY_LEN = 300;      // ~5 seconds at 60fps
const TRANSIENT_THRESHOLD = 0.08;   // RMS delta for attack detection
const TRANSIENT_FADE = 0.015;       // opacity per frame (~1s fade)
const PITCH_SMOOTH = 0.3;           // exponential smoothing weight (lower = faster response)
const PITCH_CONFIDENCE_MIN = 0.8;   // normalized autocorrelation threshold
const PITCH_RMS_GATE = 0.01;        // minimum RMS to attempt pitch
const SPECTRUM_BAR_CAP = 200;       // max bars regardless of canvas width
const LABEL_FREQS = [50, 100, 200, 500, 1000, 2000, 5000, 10000];
const INPUT2_DEVICE_KEY = 'cc-monitor-analysis-input2';
const INPUT1_CHANNELS_KEY = 'cc-monitor-analysis-input1-channels';

// Pitch chart: fixed range C2–C6
const PITCH_NOTE_MIN = 36;  // C2
const PITCH_NOTE_MAX = 84;  // C6

/* ── State ────────────────────────────────────────────────────────── */
let audioCtx = null;
let sourceNode = null;
let spectrumAnalyser = null;
let envelopeAnalyser = null;

let specCanvas = null, specCtx = null;
let envCanvas = null, envCtx = null;
let pitchCanvas = null, pitchCtx = null;

// Pre-allocated typed arrays (set once in onAudioStarted)
let freqData = null;
let timeDomainFloat = null;
let envTimeDomain = null;

let rafId = null;
let collapsed = true;
let frameCount = 0;
let panelBuilt = false;

// Pitch state
let smoothedHz = 0;
let pitchHistory = [];  // array of { midiNote, confidence } or null

// Envelope state
let rmsHistory = [];
let transients = [];

// Channel splitting state (for primary input)
let splitterNode = null;
let mergerNode = null;
let input1Channels = '0-1';

// Second input state (separate device)
let input2Stream = null;
let input2Source = null;
let input2Analyser = null;
let input2FreqData = null;
let input2Ctx = null;
let streamChannelCount = 2;

/* ── Audio lifecycle ──────────────────────────────────────────────── */

function onAudioStarted({ ctx, stream }) {
  audioCtx = ctx;
  const track = stream.getAudioTracks()[0];
  const settings = track ? track.getSettings() : {};
  streamChannelCount = settings.channelCount || 2;

  sourceNode = ctx.createMediaStreamSource(stream);
  setupChannelRouting(ctx, sourceNode, streamChannelCount);

  envelopeAnalyser = ctx.createAnalyser();
  envelopeAnalyser.fftSize = 2048;
  envelopeAnalyser.smoothingTimeConstant = 0.3;
  sourceNode.connect(envelopeAnalyser);

  envTimeDomain = new Uint8Array(envelopeAnalyser.frequencyBinCount);

  rmsHistory = new Array(RMS_HISTORY_LEN).fill(0);
  pitchHistory = [];
  transients = [];
  smoothedHz = 0;

  if (!panelBuilt) buildPanel();
  updateChannelDropdowns();
  startDataLoop(); // always compute data for cosmic-comet
  if (!collapsed) startLoop();
}

function setupChannelRouting(ctx, source, channelCount) {
  if (splitterNode) { try { splitterNode.disconnect(); } catch(e) {} }
  if (mergerNode) { try { mergerNode.disconnect(); } catch(e) {} }

  spectrumAnalyser = ctx.createAnalyser();
  spectrumAnalyser.fftSize = 4096;
  spectrumAnalyser.smoothingTimeConstant = 0.8;

  if (channelCount > 2) {
    splitterNode = ctx.createChannelSplitter(channelCount);
    mergerNode = ctx.createChannelMerger(2);
    source.connect(splitterNode);
    const pair = parseChannelPair(input1Channels);
    splitterNode.connect(mergerNode, pair[0], 0);
    splitterNode.connect(mergerNode, pair[1], 1);
    mergerNode.connect(spectrumAnalyser);
  } else {
    splitterNode = null;
    mergerNode = null;
    source.connect(spectrumAnalyser);
  }

  freqData = new Uint8Array(spectrumAnalyser.frequencyBinCount);
  timeDomainFloat = new Float32Array(spectrumAnalyser.fftSize);
}

function parseChannelPair(str) {
  const parts = str.split('-').map(Number);
  return [parts[0] || 0, parts[1] || 1];
}

function onAudioStopped() {
  stopLoop();
  stopDataLoop();
  if (sourceNode) { sourceNode.disconnect(); sourceNode = null; }
  if (splitterNode) { splitterNode.disconnect(); splitterNode = null; }
  if (mergerNode) { mergerNode.disconnect(); mergerNode = null; }
  spectrumAnalyser = null;
  envelopeAnalyser = null;
  audioCtx = null;
  freqData = null;
  timeDomainFloat = null;
  envTimeDomain = null;
  streamChannelCount = 2;
  updateIdleState();
}

/* ── DOM construction ─────────────────────────────────────────────── */

function buildPanel() {
  const panel = $('#ccmonitor-panel');
  if (!panel || panel.querySelector('.ccm-analysis')) return;

  const oscSection = panel.querySelector('.ccm-osc');

  const section = document.createElement('div');
  section.className = 'ccm-analysis';
  section.innerHTML =
    '<div class="ccm-analysis-header">' +
      '<button class="ccm-analysis-toggle" id="ccm-analysis-toggle">&#9654;</button>' +
      '<span class="ccm-analysis-title">Audio Analysis</span>' +
      '<div class="ccm-analysis-channels">' +
        '<label class="ccm-analysis-ch-label ccm-analysis-ch-label--cyan">Input 1</label>' +
        '<select class="ccm-analysis-ch-select" id="ccm-analysis-ch1" title="Channel pair for cyan spectrum">' +
          '<option value="0-1">Ch 1–2</option>' +
        '</select>' +
        '<label class="ccm-analysis-ch-label ccm-analysis-ch-label--magenta">Input 2</label>' +
        '<select class="ccm-analysis-ch-select ccm-analysis-ch-select--magenta" id="ccm-analysis-input2-select">' +
          '<option value="">Off</option>' +
        '</select>' +
      '</div>' +
    '</div>' +
    '<div class="ccm-analysis-body" id="ccm-analysis-body" hidden>' +
      // Row 1: Pitch readout + Oscilloscope (left) | Pitch chart (right)
      '<div class="ccm-analysis-row">' +
        '<div class="ccm-analysis-half">' +
          '<div class="ccm-pitch-display">' +
            '<span class="ccm-pitch-note-lg" id="ccm-pitch-note">--</span>' +
            '<div class="ccm-pitch-detail">' +
              '<span class="ccm-pitch-hz-lg" id="ccm-pitch-hz"></span>' +
              '<span class="ccm-pitch-cents-lg" id="ccm-pitch-cents"></span>' +
            '</div>' +
          '</div>' +
          '<div id="ccm-analysis-osc-slot"></div>' +
        '</div>' +
        '<div class="ccm-analysis-half">' +
          '<div class="ccm-analysis-section-head">' +
            '<span class="ccm-analysis-label">Pitch History</span>' +
          '</div>' +
          '<div class="ccm-pitch-chart-wrap"><canvas id="ccm-pitch-canvas"></canvas></div>' +
        '</div>' +
      '</div>' +
      // Row 2: Spectrum + Envelope side by side
      '<div class="ccm-analysis-row">' +
        '<div class="ccm-analysis-half">' +
          '<div class="ccm-analysis-section-head">' +
            '<span class="ccm-analysis-label">Spectrum</span>' +
            '<span class="ccm-analysis-readout" id="ccm-peak-freq">--</span>' +
          '</div>' +
          '<div class="ccm-spectrum-wrap"><canvas id="ccm-spectrum-canvas"></canvas></div>' +
        '</div>' +
        '<div class="ccm-analysis-half">' +
          '<div class="ccm-analysis-section-head">' +
            '<span class="ccm-analysis-label">Envelope</span>' +
            '<span class="ccm-analysis-readout" id="ccm-rms-val">--</span>' +
          '</div>' +
          '<div class="ccm-envelope-wrap"><canvas id="ccm-envelope-canvas"></canvas></div>' +
        '</div>' +
      '</div>' +
    '</div>';

  const groupsEl = panel.querySelector('.ccm-groups');
  panel.insertBefore(section, groupsEl);

  // Move oscilloscope into the analysis panel
  if (oscSection) {
    const oscSlot = section.querySelector('#ccm-analysis-osc-slot');
    oscSlot.appendChild(oscSection);
  }

  specCanvas = section.querySelector('#ccm-spectrum-canvas');
  specCtx = specCanvas.getContext('2d');
  envCanvas = section.querySelector('#ccm-envelope-canvas');
  envCtx = envCanvas.getContext('2d');
  pitchCanvas = section.querySelector('#ccm-pitch-canvas');
  pitchCtx = pitchCanvas.getContext('2d');

  section.querySelector('#ccm-analysis-toggle').addEventListener('click', toggleCollapse);

  const ch1Select = section.querySelector('#ccm-analysis-ch1');
  ch1Select.addEventListener('change', onInput1ChannelsChanged);
  const saved1 = localStorage.getItem(INPUT1_CHANNELS_KEY);
  if (saved1) input1Channels = saved1;

  const input2Select = section.querySelector('#ccm-analysis-input2-select');
  input2Select.addEventListener('change', onInput2Changed);
  populateInput2Devices();
  navigator.mediaDevices.addEventListener('devicechange', () => populateInput2Devices());

  window.addEventListener('resize', resizeCanvases);
  panelBuilt = true;
}

function updateChannelDropdowns() {
  const ch1Select = document.getElementById('ccm-analysis-ch1');
  if (!ch1Select) return;

  ch1Select.innerHTML = '';
  for (let i = 0; i < streamChannelCount; i += 2) {
    const end = Math.min(i + 1, streamChannelCount - 1);
    const opt = document.createElement('option');
    opt.value = `${i}-${end}`;
    opt.textContent = `Ch ${i + 1}–${end + 1}`;
    ch1Select.appendChild(opt);
  }

  ch1Select.value = input1Channels;
  if (!ch1Select.value) {
    ch1Select.value = '0-1';
    input1Channels = '0-1';
  }
}

function onInput1ChannelsChanged(e) {
  input1Channels = e.target.value;
  localStorage.setItem(INPUT1_CHANNELS_KEY, input1Channels);
  if (audioCtx && sourceNode && streamChannelCount > 2) {
    setupChannelRouting(audioCtx, sourceNode, streamChannelCount);
  }
}

function toggleCollapse() {
  collapsed = !collapsed;
  const body = document.getElementById('ccm-analysis-body');
  const btn = document.getElementById('ccm-analysis-toggle');
  if (body) body.hidden = collapsed;
  if (btn) btn.textContent = collapsed ? '\u25B6' : '\u25BC';

  if (!collapsed && spectrumAnalyser) {
    resizeCanvases();
    startLoop();
  } else {
    stopLoop();
  }
}

function updateIdleState() {
  const noteEl = document.getElementById('ccm-pitch-note');
  const hzEl = document.getElementById('ccm-pitch-hz');
  const centsEl = document.getElementById('ccm-pitch-cents');
  const peakEl = document.getElementById('ccm-peak-freq');
  const rmsEl = document.getElementById('ccm-rms-val');
  if (noteEl) noteEl.textContent = '--';
  if (hzEl) hzEl.textContent = '';
  if (centsEl) centsEl.textContent = '';
  if (peakEl) peakEl.textContent = '--';
  if (rmsEl) rmsEl.textContent = '--';
}

/* ── Second audio input ───────────────────────────────────────────── */

async function populateInput2Devices() {
  const select = document.getElementById('ccm-analysis-input2-select');
  if (!select) return;

  const currentVal = select.value;
  while (select.options.length > 1) select.remove(1);

  const devices = await navigator.mediaDevices.enumerateDevices();
  const audioInputs = devices.filter(d => d.kind === 'audioinput');

  for (let i = 0; i < audioInputs.length; i++) {
    const dev = audioInputs[i];
    const opt = document.createElement('option');
    opt.value = dev.deviceId || `__idx_${i}`;
    opt.textContent = dev.label || `Audio Input ${i + 1}`;
    select.appendChild(opt);
  }

  if (currentVal) {
    select.value = currentVal;
    if (!select.value) select.value = '';
  } else {
    const saved = localStorage.getItem(INPUT2_DEVICE_KEY);
    if (saved && audioInputs.some(d => d.deviceId === saved)) {
      select.value = saved;
      startInput2(saved);
    }
  }
}

async function onInput2Changed(e) {
  const deviceId = e.target.value;
  if (!deviceId) {
    stopInput2();
    localStorage.removeItem(INPUT2_DEVICE_KEY);
    return;
  }
  localStorage.setItem(INPUT2_DEVICE_KEY, deviceId);
  await startInput2(deviceId);
}

async function startInput2(deviceId) {
  stopInput2();
  const realId = (deviceId && !deviceId.startsWith('__idx_')) ? deviceId : null;

  const attempts = [];
  if (realId) {
    attempts.push({ audio: { deviceId: { exact: realId } } });
    attempts.push({ audio: { deviceId: { ideal: realId } } });
  }
  attempts.push({ audio: true });

  for (const constraints of attempts) {
    try {
      input2Stream = await navigator.mediaDevices.getUserMedia(constraints);
      break;
    } catch (e) {
      console.warn('Analysis Input 2: getUserMedia failed —', e.name, e.message);
      input2Stream = null;
    }
  }

  if (!input2Stream) {
    bus.emit('toast', 'Could not access second audio input');
    return;
  }

  await populateInput2Devices();

  input2Ctx = new AudioContext();
  input2Source = input2Ctx.createMediaStreamSource(input2Stream);
  input2Analyser = input2Ctx.createAnalyser();
  input2Analyser.fftSize = 4096;
  input2Analyser.smoothingTimeConstant = 0.8;
  input2Source.connect(input2Analyser);
  input2FreqData = new Uint8Array(input2Analyser.frequencyBinCount);
}

function stopInput2() {
  if (input2Source) { input2Source.disconnect(); input2Source = null; }
  if (input2Ctx) { input2Ctx.close().catch(() => {}); input2Ctx = null; }
  if (input2Stream) {
    input2Stream.getTracks().forEach(t => t.stop());
    input2Stream = null;
  }
  input2Analyser = null;
  input2FreqData = null;
}

/* ── Canvas management ────────────────────────────────────────────── */

function resizeCanvases() {
  for (const canvas of [specCanvas, envCanvas, pitchCanvas]) {
    if (!canvas) continue;
    const parent = canvas.parentElement;
    if (!parent) continue;
    const rect = parent.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0);
  }
}

/* ── Animation loop ───────────────────────────────────────────────── */

// Data loop always runs when audio is active (cosmic-comet consumes the data)
let dataRafId = null;

function startDataLoop() {
  if (dataRafId) return;
  dataRafId = requestAnimationFrame(dataTick);
}

function stopDataLoop() {
  if (dataRafId) { cancelAnimationFrame(dataRafId); dataRafId = null; }
}

function dataTick() {
  dataRafId = requestAnimationFrame(dataTick);
  if (envelopeAnalyser) updateEnvelope();
  if (spectrumAnalyser) detectPitch();
}

function startLoop() {
  if (rafId) return;
  rafId = requestAnimationFrame(tick);
}

function stopLoop() {
  if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
  frameCount = 0;
}

function tick() {
  rafId = requestAnimationFrame(tick);
  frameCount++;

  // Data is computed by dataTick; only draw visuals here
  if (spectrumAnalyser && specCtx) drawSpectrum();
  if (envelopeAnalyser && envCtx) drawEnvelope();
  if (pitchCtx) drawPitchChart();
}

/* ── Spectrum Analyzer ────────────────────────────────────────────── */

function drawSpectrum() {
  spectrumAnalyser.getByteFrequencyData(freqData);

  const dpr = window.devicePixelRatio || 1;
  const w = specCanvas.width / dpr;
  const h = specCanvas.height / dpr;
  if (w === 0 || h === 0) { resizeCanvases(); return; }

  specCtx.fillStyle = '#08080c';
  specCtx.fillRect(0, 0, w, h);

  const sampleRate = audioCtx.sampleRate;
  const binCount = spectrumAnalyser.frequencyBinCount;
  const hzPerBin = sampleRate / spectrumAnalyser.fftSize;

  const minFreq = 30, maxFreq = 20000;
  const logMin = Math.log10(minFreq), logMax = Math.log10(maxFreq);
  const numBars = Math.min(Math.floor(w), SPECTRUM_BAR_CAP);

  let peakFreq = 0, peakVal = 0;

  const hasInput2 = input2Analyser && input2FreqData;
  if (hasInput2) input2Analyser.getByteFrequencyData(input2FreqData);

  const in2HzPerBin = hasInput2 ? input2Ctx.sampleRate / input2Analyser.fftSize : 0;
  const in2BinCount = hasInput2 ? input2Analyser.frequencyBinCount : 0;

  const dualMode = hasInput2;
  const fullBarW = w / numBars;
  const barW = dualMode ? fullBarW / 2 : fullBarW;
  const gap = 1;

  // Grid lines
  specCtx.strokeStyle = 'rgba(255,255,255,0.03)';
  specCtx.lineWidth = 0.5;
  for (let i = 1; i < 4; i++) {
    const y = (h / 4) * i;
    specCtx.beginPath(); specCtx.moveTo(0, y); specCtx.lineTo(w, y); specCtx.stroke();
  }

  for (let i = 0; i < numBars; i++) {
    const logF0 = logMin + (i / numBars) * (logMax - logMin);
    const logF1 = logMin + ((i + 1) / numBars) * (logMax - logMin);
    const f0 = Math.pow(10, logF0);
    const f1 = Math.pow(10, logF1);
    const bin0 = Math.max(0, Math.floor(f0 / hzPerBin));
    const bin1 = Math.min(binCount - 1, Math.ceil(f1 / hzPerBin));

    let sum = 0, count = 0;
    for (let b = bin0; b <= bin1; b++) { sum += freqData[b]; count++; }
    const avg = count > 0 ? sum / count : 0;
    const barH = (avg / 255) * h;

    if (avg > peakVal) { peakVal = avg; peakFreq = (f0 + f1) / 2; }

    const intensity = avg / 255;
    const x1 = i * fullBarW;
    specCtx.fillStyle = `rgba(0, 240, 255, ${0.2 + 0.8 * intensity})`;
    specCtx.fillRect(x1, h - barH, barW - gap, barH);

    if (dualMode) {
      const iBin0 = Math.max(0, Math.floor(f0 / in2HzPerBin));
      const iBin1 = Math.min(in2BinCount - 1, Math.ceil(f1 / in2HzPerBin));
      let sum2 = 0, count2 = 0;
      for (let b = iBin0; b <= iBin1; b++) { sum2 += input2FreqData[b]; count2++; }
      const avg2 = count2 > 0 ? sum2 / count2 : 0;
      const barH2 = (avg2 / 255) * h;
      const intensity2 = avg2 / 255;
      const x2 = x1 + barW;
      specCtx.fillStyle = `rgba(255, 45, 85, ${0.2 + 0.8 * intensity2})`;
      specCtx.fillRect(x2, h - barH2, barW - gap, barH2);
    }
  }

  // Frequency labels
  specCtx.fillStyle = 'rgba(255,255,255,0.2)';
  specCtx.font = '9px JetBrains Mono, monospace';
  specCtx.textAlign = 'center';
  for (const f of LABEL_FREQS) {
    const xPos = ((Math.log10(f) - logMin) / (logMax - logMin)) * w;
    const label = f >= 1000 ? `${f / 1000}k` : `${f}`;
    specCtx.fillText(label, xPos, h - 2);
    specCtx.strokeStyle = 'rgba(255,255,255,0.04)';
    specCtx.beginPath(); specCtx.moveTo(xPos, 0); specCtx.lineTo(xPos, h - 12); specCtx.stroke();
  }

  const peakEl = document.getElementById('ccm-peak-freq');
  if (peakEl) {
    peakEl.textContent = peakVal > 10
      ? (peakFreq >= 1000 ? `${(peakFreq / 1000).toFixed(1)}kHz` : `${Math.round(peakFreq)}Hz`)
      : '--';
  }
}

/* ── Pitch Detector ───────────────────────────────────────────────── */

function detectPitch() {
  spectrumAnalyser.getFloatTimeDomainData(timeDomainFloat);

  const hzEl = document.getElementById('ccm-pitch-hz');
  const noteEl = document.getElementById('ccm-pitch-note');
  const centsEl = document.getElementById('ccm-pitch-cents');

  // RMS gate
  let rms = 0;
  for (let i = 0; i < timeDomainFloat.length; i++) {
    rms += timeDomainFloat[i] * timeDomainFloat[i];
  }
  rms = Math.sqrt(rms / timeDomainFloat.length);

  if (rms < PITCH_RMS_GATE) {
    if (noteEl) noteEl.textContent = '--';
    if (hzEl) hzEl.textContent = '';
    if (centsEl) centsEl.textContent = 'No signal';
    smoothedHz = 0;
    pitchHistory.push(null);
    if (pitchHistory.length > PITCH_HISTORY_LEN) pitchHistory.shift();
    return;
  }

  const sampleRate = audioCtx.sampleRate;
  const bufLen = timeDomainFloat.length;
  const minPeriod = Math.floor(sampleRate / 4186);
  const maxPeriod = Math.min(Math.floor(sampleRate / 32.7), Math.floor(bufLen / 2));

  let bestCorr = 0, bestPeriod = 0;

  for (let period = minPeriod; period <= maxPeriod; period++) {
    let corr = 0, norm1 = 0, norm2 = 0;
    const len = bufLen - period;
    for (let i = 0; i < len; i++) {
      corr += timeDomainFloat[i] * timeDomainFloat[i + period];
      norm1 += timeDomainFloat[i] * timeDomainFloat[i];
      norm2 += timeDomainFloat[i + period] * timeDomainFloat[i + period];
    }
    const normFactor = Math.sqrt(norm1 * norm2);
    if (normFactor > 0) corr /= normFactor;

    if (corr > bestCorr) {
      bestCorr = corr;
      bestPeriod = period;
    }
  }

  if (bestCorr < PITCH_CONFIDENCE_MIN || bestPeriod === 0) {
    if (noteEl) noteEl.textContent = '--';
    if (hzEl) hzEl.textContent = '';
    if (centsEl) centsEl.textContent = 'No stable pitch';
    pitchHistory.push(null);
    if (pitchHistory.length > PITCH_HISTORY_LEN) pitchHistory.shift();
    return;
  }

  // Parabolic interpolation
  let refinedPeriod = bestPeriod;
  if (bestPeriod > minPeriod && bestPeriod < maxPeriod) {
    const corrAt = (p) => {
      let c = 0, n1 = 0, n2 = 0;
      const l = bufLen - p;
      for (let i = 0; i < l; i++) {
        c += timeDomainFloat[i] * timeDomainFloat[i + p];
        n1 += timeDomainFloat[i] * timeDomainFloat[i];
        n2 += timeDomainFloat[i + p] * timeDomainFloat[i + p];
      }
      const nf = Math.sqrt(n1 * n2);
      return nf > 0 ? c / nf : 0;
    };
    const y0 = corrAt(bestPeriod - 1);
    const y1 = bestCorr;
    const y2 = corrAt(bestPeriod + 1);
    const shift = (y0 - y2) / (2 * (y0 - 2 * y1 + y2));
    if (isFinite(shift) && Math.abs(shift) < 1) {
      refinedPeriod = bestPeriod + shift;
    }
  }

  const hz = sampleRate / refinedPeriod;

  if (smoothedHz === 0) smoothedHz = hz;
  else smoothedHz = PITCH_SMOOTH * smoothedHz + (1 - PITCH_SMOOTH) * hz;

  const midiNote = 12 * Math.log2(smoothedHz / 440) + 69;
  const roundedNote = Math.round(midiNote);
  const cents = Math.round((midiNote - roundedNote) * 100);
  const octave = Math.floor(roundedNote / 12) - 1;
  const noteName = NOTE_NAMES[((roundedNote % 12) + 12) % 12];

  if (noteEl) noteEl.textContent = `${noteName}${octave}`;
  if (hzEl) hzEl.textContent = `${smoothedHz.toFixed(1)} Hz`;
  if (centsEl) {
    if (Math.abs(cents) <= 2) centsEl.textContent = 'in tune';
    else centsEl.textContent = `${cents > 0 ? '+' : ''}${cents}¢`;
  }

  // Add to pitch history for chart
  pitchHistory.push({ midiNote, confidence: bestCorr });
  if (pitchHistory.length > PITCH_HISTORY_LEN) pitchHistory.shift();
}

/* ── Pitch History Chart ─────────────────────────────────────────── */

function drawPitchChart() {
  const dpr = window.devicePixelRatio || 1;
  const w = pitchCanvas.width / dpr;
  const h = pitchCanvas.height / dpr;
  if (w === 0 || h === 0) { resizeCanvases(); return; }

  const ctx = pitchCtx;
  ctx.fillStyle = '#08080c';
  ctx.fillRect(0, 0, w, h);

  const leftMargin = 28;
  const plotW = w - leftMargin;

  const viewMin = PITCH_NOTE_MIN;
  const viewMax = PITCH_NOTE_MAX;
  const noteRange = viewMax - viewMin;

  // Y-axis grid lines at every C note within range
  ctx.font = '8px JetBrains Mono, monospace';
  ctx.textAlign = 'right';
  for (let midi = Math.ceil(viewMin / 12) * 12; midi <= viewMax; midi += 12) {
    const y = h - ((midi - viewMin) / noteRange) * h;
    if (y < 2 || y > h - 2) continue;

    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 0.5;
    ctx.beginPath(); ctx.moveTo(leftMargin, y); ctx.lineTo(w, y); ctx.stroke();

    const oct = Math.floor(midi / 12) - 1;
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillText(`C${oct}`, leftMargin - 3, y + 3);
  }

  // Faint lines for natural notes
  ctx.strokeStyle = 'rgba(255,255,255,0.02)';
  ctx.lineWidth = 0.5;
  for (let midi = viewMin; midi <= viewMax; midi++) {
    if (midi % 12 === 0) continue; // skip C notes (drawn above)
    const noteIdx = midi % 12;
    if ([2, 4, 5, 7, 9, 11].includes(noteIdx)) {
      const y = h - ((midi - viewMin) / noteRange) * h;
      ctx.beginPath(); ctx.moveTo(leftMargin, y); ctx.lineTo(w, y); ctx.stroke();
    }
  }

  if (pitchHistory.length < 2) return;

  // Plot pitch line
  ctx.beginPath();
  let started = false;
  for (let i = 0; i < pitchHistory.length; i++) {
    const entry = pitchHistory[i];
    if (!entry) { started = false; continue; }

    const x = leftMargin + (i / PITCH_HISTORY_LEN) * plotW;
    const y = h - ((entry.midiNote - viewMin) / noteRange) * h;
    const clampedY = Math.max(0, Math.min(h, y));

    if (!started) {
      ctx.moveTo(x, clampedY);
      started = true;
    } else {
      ctx.lineTo(x, clampedY);
    }
  }

  ctx.strokeStyle = '#00f0ff';
  ctx.lineWidth = 1.5;
  ctx.shadowColor = 'rgba(0, 240, 255, 0.4)';
  ctx.shadowBlur = 4;
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Dots every few frames
  for (let i = 0; i < pitchHistory.length; i++) {
    const entry = pitchHistory[i];
    if (!entry || i % 4 !== 0) continue;

    const x = leftMargin + (i / PITCH_HISTORY_LEN) * plotW;
    const y = h - ((entry.midiNote - viewMin) / noteRange) * h;
    const clampedY = Math.max(0, Math.min(h, y));

    ctx.fillStyle = `rgba(0, 240, 255, ${0.3 + 0.7 * entry.confidence})`;
    ctx.beginPath();
    ctx.arc(x, clampedY, 1.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

/* ── Envelope / Transient Detector ────────────────────────────────── */

function updateEnvelope() {
  envelopeAnalyser.getByteTimeDomainData(envTimeDomain);

  let sum = 0;
  for (let i = 0; i < envTimeDomain.length; i++) {
    const v = (envTimeDomain[i] - 128) / 128;
    sum += v * v;
  }
  const rms = Math.sqrt(sum / envTimeDomain.length);

  rmsHistory.push(rms);
  if (rmsHistory.length > RMS_HISTORY_LEN) rmsHistory.shift();

  const prev = rmsHistory.length >= 2 ? rmsHistory[rmsHistory.length - 2] : 0;
  const delta = rms - prev;
  if (delta > TRANSIENT_THRESHOLD) {
    transients.push({ index: rmsHistory.length - 1, opacity: 1.0 });
  }

  for (let i = transients.length - 1; i >= 0; i--) {
    transients[i].opacity -= TRANSIENT_FADE;
    if (transients[i].opacity <= 0) transients.splice(i, 1);
  }
}

function drawEnvelope() {
  const dpr = window.devicePixelRatio || 1;
  const w = envCanvas.width / dpr;
  const h = envCanvas.height / dpr;
  if (w === 0 || h === 0) { resizeCanvases(); return; }

  envCtx.fillStyle = '#08080c';
  envCtx.fillRect(0, 0, w, h);

  envCtx.strokeStyle = 'rgba(255,255,255,0.03)';
  envCtx.lineWidth = 0.5;
  for (let i = 1; i < 4; i++) {
    const y = (h / 4) * i;
    envCtx.beginPath(); envCtx.moveTo(0, y); envCtx.lineTo(w, y); envCtx.stroke();
  }

  const rms = rmsHistory.length > 0 ? rmsHistory[rmsHistory.length - 1] : 0;
  const len = rmsHistory.length;
  envCtx.beginPath();
  envCtx.moveTo(0, h);
  for (let i = 0; i < len; i++) {
    const x = (i / RMS_HISTORY_LEN) * w;
    const y = h - Math.min(rmsHistory[i] * 3, 1) * h;
    envCtx.lineTo(x, y);
  }
  envCtx.lineTo(((len - 1) / RMS_HISTORY_LEN) * w, h);
  envCtx.closePath();
  envCtx.fillStyle = 'rgba(0, 240, 255, 0.1)';
  envCtx.fill();

  envCtx.beginPath();
  for (let i = 0; i < len; i++) {
    const x = (i / RMS_HISTORY_LEN) * w;
    const y = h - Math.min(rmsHistory[i] * 3, 1) * h;
    if (i === 0) envCtx.moveTo(x, y);
    else envCtx.lineTo(x, y);
  }
  envCtx.strokeStyle = '#00f0ff';
  envCtx.lineWidth = 1.5;
  envCtx.shadowColor = 'rgba(0, 240, 255, 0.3)';
  envCtx.shadowBlur = 3;
  envCtx.stroke();
  envCtx.shadowBlur = 0;

  for (const t of transients) {
    const x = (t.index / RMS_HISTORY_LEN) * w;
    envCtx.strokeStyle = `rgba(255, 45, 85, ${t.opacity})`;
    envCtx.lineWidth = 1.5;
    envCtx.beginPath(); envCtx.moveTo(x, 0); envCtx.lineTo(x, h); envCtx.stroke();
  }

  const rmsEl = document.getElementById('ccm-rms-val');
  if (rmsEl) rmsEl.textContent = `${(rms * 100).toFixed(1)}%`;
}

/* ── Tab visibility ───────────────────────────────────────────────── */

function onTabChanged(tabId) {
  if (tabId === 'ccmonitor' && !collapsed && spectrumAnalyser) {
    resizeCanvases();
    startLoop();
  }
}

/* ── Public getters (consumed by cosmic-comet.js) ────────────────── */
export function getPitchHistory() { return pitchHistory; }
export function getRmsHistory() { return rmsHistory; }
export function getTransients() { return transients; }
export function getFreqData() { return freqData; }
export function getSmoothedHz() { return smoothedHz; }

/* ── Init ─────────────────────────────────────────────────────────── */
export function init() {
  bus.on('audio:started', onAudioStarted);
  bus.on('audio:stopped', onAudioStopped);
  bus.on('tab:changed', onTabChanged);

  requestAnimationFrame(() => {
    if (!panelBuilt) buildPanel();
  });
}
