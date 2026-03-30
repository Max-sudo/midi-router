// ── Stream Dock API client ────────────────────────────────────────

const BASE = '/api/streamdock';

async function get(path) {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `Request failed: ${res.status}`);
  }
  return res.json();
}

async function put(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `Request failed: ${res.status}`);
  }
  return res.json();
}

async function post(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `Request failed: ${res.status}`);
  }
  return res.json();
}

async function del(path) {
  const res = await fetch(`${BASE}${path}`, { method: 'DELETE' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `Request failed: ${res.status}`);
  }
  return res.json();
}

// ── Status ──────────────────────────────────────────────────────────

export async function getStatus() {
  try {
    return await get('/status');
  } catch {
    return { connected: false, device_name: '', listener_running: false };
  }
}

// ── Apps ────────────────────────────────────────────────────────────

export async function getApps() {
  return get('/apps');
}

// ── Mappings ────────────────────────────────────────────────────────

export async function getMappings() {
  return get('/mappings');
}

export async function setMapping(buttonIndex, action) {
  return put(`/mappings/${buttonIndex}`, action);
}

export async function deleteMapping(buttonIndex) {
  return del(`/mappings/${buttonIndex}`);
}

// ── Profiles ────────────────────────────────────────────────────────

export async function getProfiles() {
  return get('/profiles');
}

export async function saveProfile(name) {
  return post(`/profiles/${encodeURIComponent(name)}`);
}

export async function applyProfile(name) {
  return put(`/profiles/${encodeURIComponent(name)}/apply`);
}

export async function deleteProfile(name) {
  return del(`/profiles/${encodeURIComponent(name)}`);
}

// ── Test action ─────────────────────────────────────────────────────

export async function testAction(buttonIndex) {
  return post(`/test/${buttonIndex}`);
}

// ── WebSocket ───────────────────────────────────────────────────────

export function connectWS(onMessage) {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const ws = new WebSocket(`${protocol}//${location.host}${BASE}/ws`);

  ws.onopen = () => {
    console.log('[StreamDock WS] Connected');
  };

  ws.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data);
      onMessage(data);
    } catch (err) {
      console.warn('[StreamDock WS] Parse error:', err);
    }
  };

  ws.onerror = (e) => {
    console.error('[StreamDock WS] Error:', e);
  };

  ws.onclose = () => {
    console.log('[StreamDock WS] Disconnected, reconnecting in 3s...');
    setTimeout(() => {
      if (!ws._closed) {
        connectWS(onMessage);
      }
    }, 3000);
  };

  return {
    close() {
      ws._closed = true;
      ws.close();
    },
  };
}
