// ── AV Sync API client ────────────────────────────────────────────

const BASE = '/api/avsync';

async function post(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `Request failed: ${res.status}`);
  }
  return res.json();
}

export async function checkHealth() {
  try {
    const res = await fetch(`${BASE}/health`);
    return await res.json();
  } catch {
    return { status: 'error', ffmpeg: false };
  }
}

export async function probeFile(path) {
  return post('/probe', { path });
}

export async function analyzeSync(videoPath, audioPath) {
  return post('/analyze', { video_path: videoPath, audio_path: audioPath });
}

export async function startRender(videoPath, audioPath, offsetMs, outputPath) {
  return post('/render', {
    video_path: videoPath,
    audio_path: audioPath,
    offset_ms: offsetMs,
    output_path: outputPath,
  });
}

/**
 * Connect to an SSE progress stream.
 * @param {string} jobId
 * @param {'analyze'|'render'} type
 * @param {function} onProgress  - called with { percent, stage, message }
 * @param {function} onComplete  - called with final result data
 * @param {function} onError     - called with error string
 * @returns {EventSource} - caller can close() to cancel
 */
export function connectProgress(jobId, type, onProgress, onComplete, onError) {
  const url = `${BASE}/${type}/${jobId}/progress`;
  const source = new EventSource(url);

  source.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data);
      if (data.error) {
        onError(data.error);
        source.close();
      } else if (data.complete) {
        onComplete(data);
        source.close();
      } else {
        onProgress(data);
      }
    } catch {
      onError('Failed to parse progress data');
      source.close();
    }
  };

  source.onerror = () => {
    onError('Connection to backend lost');
    source.close();
  };

  return source;
}
