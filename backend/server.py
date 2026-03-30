# ── Studio Tools – FastAPI Backend ──────────────────────────────────
import asyncio
import uuid
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from typing import Optional
from pydantic import BaseModel

from services.file_handler import check_ffmpeg, probe_file, validate_audio, validate_video
from services.progress import create_job, get_job
from services.sync_analyzer import analyze_sync
from services.renderer import render
from services import launchpad_mappings, launchpad_midi, launchpad_actions
from services import lcxl_mappings, lcxl_midi
from services import streamdock_mappings, streamdock_connection, streamdock_actions
from services.chat import stream_chat
from services import sync as sync_service


# ── WebSocket manager for Launchpad ──────────────────────────────────
class LaunchpadWSManager:
    def __init__(self):
        self._clients: list[WebSocket] = []

    async def connect(self, ws: WebSocket):
        await ws.accept()
        self._clients.append(ws)

    def disconnect(self, ws: WebSocket):
        self._clients = [c for c in self._clients if c is not ws]

    def broadcast_sync(self, message: str):
        """Called from background thread — schedules async sends."""
        for ws in list(self._clients):
            try:
                asyncio.run_coroutine_threadsafe(ws.send_text(message), _loop)
            except Exception:
                pass


ws_manager = LaunchpadWSManager()


# ── WebSocket manager for LCXL ────────────────────────────────────
class LCXLWSManager:
    def __init__(self):
        self._clients: list[WebSocket] = []

    async def connect(self, ws: WebSocket):
        await ws.accept()
        self._clients.append(ws)

    def disconnect(self, ws: WebSocket):
        self._clients = [c for c in self._clients if c is not ws]

    def broadcast_sync(self, message: str):
        """Called from background thread — schedules async sends."""
        for ws in list(self._clients):
            try:
                asyncio.run_coroutine_threadsafe(ws.send_text(message), _loop)
            except Exception:
                pass


lcxl_ws_manager = LCXLWSManager()


# ── WebSocket manager for Stream Dock ────────���───────────────────
class StreamDockWSManager:
    def __init__(self):
        self._clients: list[WebSocket] = []

    async def connect(self, ws: WebSocket):
        await ws.accept()
        self._clients.append(ws)

    def disconnect(self, ws: WebSocket):
        self._clients = [c for c in self._clients if c is not ws]

    def broadcast_sync(self, message: str):
        """Called from background thread — schedules async sends."""
        for ws in list(self._clients):
            try:
                asyncio.run_coroutine_threadsafe(ws.send_text(message), _loop)
            except Exception:
                pass


streamdock_ws_manager = StreamDockWSManager()
_loop: asyncio.AbstractEventLoop = None


# ── Lifespan ──────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    global _loop
    _loop = asyncio.get_event_loop()
    try:
        launchpad_mappings.init()
        launchpad_midi.set_ws_broadcast(ws_manager.broadcast_sync)
        launchpad_midi.start()
    except Exception:
        pass  # No MIDI hardware available (e.g. running on Railway)
    try:
        lcxl_mappings.init()
        lcxl_midi.set_ws_broadcast(lcxl_ws_manager.broadcast_sync)
        lcxl_midi.start()
    except Exception:
        pass
    try:
        streamdock_mappings.init()
        streamdock_connection.set_ws_broadcast(streamdock_ws_manager.broadcast_sync)
        streamdock_connection.start()
    except Exception:
        pass
    yield
    try:
        launchpad_midi.stop()
    except Exception:
        pass
    try:
        lcxl_midi.stop()
    except Exception:
        pass
    try:
        streamdock_connection.stop()
    except Exception:
        pass


# ── App ────────────────────────────────────────────────────────────
app = FastAPI(title="Studio Tools Backend", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Schemas ────────────────────────────────────────────────────────

class ProbeRequest(BaseModel):
    path: str

class AnalyzeRequest(BaseModel):
    video_path: str
    audio_path: str

class RenderRequest(BaseModel):
    video_path: str
    audio_path: str
    offset_ms: float
    output_path: str


# ── AV Sync endpoints ─────────────────────────────────────────────

@app.get("/api/avsync/health")
def avsync_health():
    return {
        "status": "ok",
        "ffmpeg": check_ffmpeg(),
    }


@app.post("/api/avsync/probe")
def avsync_probe(req: ProbeRequest):
    try:
        info = probe_file(req.path)
        return info
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except (ValueError, RuntimeError) as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/avsync/analyze")
async def avsync_analyze(req: AnalyzeRequest):
    # Validate files exist and are correct types
    try:
        validate_video(req.video_path)
        validate_audio(req.audio_path)
    except (FileNotFoundError, ValueError) as e:
        raise HTTPException(status_code=400, detail=str(e))

    job_id = str(uuid.uuid4())[:8]
    tracker = create_job(job_id)

    # Run analysis in background thread
    asyncio.get_event_loop().run_in_executor(
        None, analyze_sync, req.video_path, req.audio_path, tracker
    )

    return {"job_id": job_id}


@app.get("/api/avsync/analyze/{job_id}/progress")
async def avsync_analyze_progress(job_id: str):
    tracker = get_job(job_id)
    if not tracker:
        raise HTTPException(status_code=404, detail="Job not found")

    return StreamingResponse(
        tracker.stream_sse(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@app.post("/api/avsync/render")
async def avsync_render(req: RenderRequest):
    # Validate inputs
    try:
        validate_video(req.video_path)
        validate_audio(req.audio_path)
    except (FileNotFoundError, ValueError) as e:
        raise HTTPException(status_code=400, detail=str(e))

    # Validate output directory is writable
    out_dir = Path(req.output_path).parent
    if not out_dir.exists():
        raise HTTPException(status_code=400, detail=f"Output directory does not exist: {out_dir}")

    job_id = str(uuid.uuid4())[:8]
    tracker = create_job(job_id)

    # Run render in background thread
    asyncio.get_event_loop().run_in_executor(
        None, render, req.video_path, req.audio_path, req.offset_ms, req.output_path, tracker
    )

    return {"job_id": job_id}


@app.get("/api/avsync/render/{job_id}/progress")
async def avsync_render_progress(job_id: str):
    tracker = get_job(job_id)
    if not tracker:
        raise HTTPException(status_code=404, detail="Job not found")

    return StreamingResponse(
        tracker.stream_sse(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


# ── Launchpad endpoints ──────────────────────────────────────────────

class MappingRequest(BaseModel):
    action_type: str
    params: dict = {}
    label: str = ""
    color: str = ""


@app.get("/api/launchpad/apps")
def launchpad_list_apps():
    return {"apps": launchpad_actions.list_apps()}


@app.get("/api/launchpad/apps/{app_name}/icon")
def launchpad_app_icon(app_name: str):
    icon_path = launchpad_actions.get_app_icon(app_name)
    if not icon_path:
        raise HTTPException(status_code=404, detail="Icon not found")
    return FileResponse(icon_path, media_type="image/png",
                        headers={"Cache-Control": "public, max-age=86400"})


@app.delete("/api/tabs/{tab_id}")
def delete_tab(tab_id: str):
    """Permanently remove a tab from index.html and its associated files."""
    import re

    # Core tabs cannot be deleted
    core_tabs = {"home", "midi", "avsync", "launchpad", "lcxl"}
    if tab_id in core_tabs:
        raise HTTPException(status_code=400, detail="Cannot delete core tab")

    project_root = Path(__file__).parent.parent
    index_path = project_root / "index.html"

    if not index_path.exists():
        raise HTTPException(status_code=404, detail="index.html not found")

    html = index_path.read_text()
    original = html

    # Remove tab button: <button class="tab-btn..." data-tab="tab_id">...</button>
    html = re.sub(
        rf'\s*<button\s+class="tab-btn[^"]*"\s+data-tab="{re.escape(tab_id)}"[^>]*>[^<]*</button>',
        '', html
    )

    # Remove tab controls div: <div ... data-tab="tab_id" ...>...</div>
    # Use non-greedy match for single-line controls
    html = re.sub(
        rf'\s*<div\s+[^>]*data-tab="{re.escape(tab_id)}"[^>]*>.*?</div>',
        '', html, flags=re.DOTALL
    )

    # Remove tab content panel: <div class="tab-content" id="tab-{tab_id}" ...>...</div>
    # These can be multi-line with nested content
    html = re.sub(
        rf'\s*<div\s+class="tab-content"\s+id="tab-{re.escape(tab_id)}"[^>]*>.*?</div>\s*(?=<div\s+class="tab-content"|</main>)',
        '', html, flags=re.DOTALL
    )

    # Remove associated script tag if it exists
    html = re.sub(
        rf'\s*<script[^>]*src="[^"]*{re.escape(tab_id)}[^"]*"[^>]*></script>',
        '', html
    )

    # Remove associated CSS link if it exists
    html = re.sub(
        rf'\s*<link[^>]*href="[^"]*{re.escape(tab_id)}[^"]*\.css"[^>]*>',
        '', html
    )

    if html != original:
        index_path.write_text(html)

    # Remove JS and CSS files if they exist
    removed_files = []
    for pattern in [f"js/{tab_id}.js", f"css/{tab_id}.css"]:
        f = project_root / pattern
        if f.exists():
            f.unlink()
            removed_files.append(pattern)

    return {"success": True, "removed_files": removed_files}


# ── Presets endpoints ─────────────────────────────────────────────
PRESETS_FILE = Path(__file__).parent / "presets.json"

import json

def _read_presets():
    try:
        return json.loads(PRESETS_FILE.read_text())
    except Exception:
        return {"version": 1, "lastUsed": None, "presets": {}}

def _write_presets(data):
    PRESETS_FILE.write_text(json.dumps(data, indent=2))


class PresetSaveRequest(BaseModel):
    name: str
    data: dict


class PresetLastUsedRequest(BaseModel):
    lastUsed: Optional[str]


@app.get("/api/presets")
def get_presets():
    return _read_presets()


@app.put("/api/presets/{name}")
def save_preset(name: str, req: PresetSaveRequest):
    store = _read_presets()
    store["presets"][name] = req.data
    store["lastUsed"] = name
    _write_presets(store)
    return {"ok": True}


@app.delete("/api/presets/{name}")
def delete_preset(name: str):
    store = _read_presets()
    if name in store["presets"]:
        del store["presets"][name]
        if store["lastUsed"] == name:
            store["lastUsed"] = None
        _write_presets(store)
    return {"ok": True}


@app.put("/api/presets-last-used")
def set_last_used(req: PresetLastUsedRequest):
    store = _read_presets()
    store["lastUsed"] = req.lastUsed
    _write_presets(store)
    return {"ok": True}


@app.get("/api/leadsheets")
def list_leadsheets():
    """List all lead sheet images in assets/leadsheets/."""
    folder = Path(__file__).parent.parent / "assets" / "leadsheets"
    if not folder.is_dir():
        return []
    sheets = []
    for f in sorted(folder.iterdir(), key=lambda e: e.stem.lower()):
        if f.suffix.lower() == ".png":
            title = f.stem.replace("-", " ").replace("_", " ")
            sheets.append({"title": title, "file": f.name, "url": f"/assets/leadsheets/{f.name}"})
    return sheets


# ── Lead sheet data (set lists, tags, renames) ────────────────────
LEADSHEET_DATA_FILE = Path(__file__).parent / "leadsheet_data.json"

def _read_ls_data():
    try:
        return json.loads(LEADSHEET_DATA_FILE.read_text())
    except Exception:
        return {"setlists": [], "tags": {}, "renames": {}}

def _write_ls_data(data):
    LEADSHEET_DATA_FILE.write_text(json.dumps(data, indent=2))


@app.get("/api/leadsheet-data")
def get_leadsheet_data():
    return _read_ls_data()


class LeadsheetDataRequest(BaseModel):
    setlists: list = []
    tags: dict = {}
    renames: dict = {}


@app.put("/api/leadsheet-data")
def save_leadsheet_data(req: LeadsheetDataRequest):
    _write_ls_data(req.model_dump())
    return {"ok": True}


# ── Sync schemas ──────────────────────────────────────────────────

class SyncSetlist(BaseModel):
    id: str
    name: str
    songs: list = []

class SyncRequest(BaseModel):
    setlists: list[SyncSetlist] = []
    tags: dict[str, list[str]] = {}
    notes: dict[str, list[str]] = {}
    renames: dict[str, str] = {}


# ── Sync endpoints ───────────────────────────────────────────────

@app.get("/api/sync")
def sync_get():
    """Return all synced data."""
    return sync_service.load_data()


@app.post("/api/sync")
def sync_post(req: SyncRequest):
    """Receive local data, merge additively with server, return merged result."""
    server = sync_service.load_data()
    local = req.model_dump()

    merged = {
        "setlists": sync_service.merge_setlists(local["setlists"], server["setlists"]),
        "tags": sync_service.merge_tags(local["tags"], server["tags"]),
        "notes": sync_service.merge_notes(local["notes"], server["notes"]),
        "renames": sync_service.merge_renames(local["renames"], server["renames"]),
        "recently_deleted": server.get("recently_deleted", []),
    }
    sync_service.save_data(merged)
    return merged


@app.delete("/api/sync/setlist/{setlist_id}")
def sync_delete_setlist(setlist_id: str):
    """Soft-delete a set list (move to recently deleted)."""
    data = sync_service.delete_setlist(setlist_id)
    return {"ok": True, "recently_deleted": data["recently_deleted"]}


@app.post("/api/sync/setlist/{setlist_id}/restore")
def sync_restore_setlist(setlist_id: str):
    """Restore a set list from recently deleted."""
    data = sync_service.restore_setlist(setlist_id)
    return {"ok": True, "setlists": data["setlists"]}


@app.get("/api/sync/deleted")
def sync_list_deleted():
    """List recently deleted set lists."""
    data = sync_service.load_data()
    return {"recently_deleted": data["recently_deleted"]}


@app.get("/api/browse")
def browse_directory(path: str = "~"):
    """List directories for the folder picker."""
    from pathlib import Path as P
    target = P(path).expanduser().resolve()
    if not target.is_dir():
        raise HTTPException(status_code=400, detail="Not a directory")
    items = []
    try:
        for entry in sorted(target.iterdir(), key=lambda e: e.name.lower()):
            if entry.name.startswith("."):
                continue
            if entry.is_dir():
                items.append({"name": entry.name, "path": str(entry)})
    except PermissionError:
        pass
    return {"path": str(target), "parent": str(target.parent), "items": items}


@app.get("/api/launchpad/status")
def launchpad_status():
    return launchpad_midi.get_status()


@app.get("/api/launchpad/mappings")
def launchpad_get_mappings():
    return {
        "profile": launchpad_mappings.get_active_profile_name(),
        "mappings": launchpad_mappings.get_all_mappings(),
    }


@app.put("/api/launchpad/mappings/{pad_note}")
def launchpad_set_mapping(pad_note: int, req: MappingRequest):
    launchpad_mappings.set_mapping(pad_note, req.model_dump())
    launchpad_midi.update_all_pad_colors()
    return {"ok": True}


@app.delete("/api/launchpad/mappings/{pad_note}")
def launchpad_delete_mapping(pad_note: int):
    launchpad_mappings.delete_mapping(pad_note)
    launchpad_midi.update_all_pad_colors()
    return {"ok": True}


@app.get("/api/launchpad/profiles")
def launchpad_list_profiles():
    return {
        "profiles": launchpad_mappings.list_profiles(),
        "active": launchpad_mappings.get_active_profile_name(),
    }


@app.post("/api/launchpad/profiles/{name}")
def launchpad_save_profile(name: str):
    launchpad_mappings.save_profile(name)
    return {"ok": True}


@app.put("/api/launchpad/profiles/{name}/apply")
def launchpad_apply_profile(name: str):
    if not launchpad_mappings.apply_profile(name):
        raise HTTPException(status_code=404, detail="Profile not found")
    launchpad_midi.update_all_pad_colors()
    return {"ok": True, "mappings": launchpad_mappings.get_all_mappings()}


@app.delete("/api/launchpad/profiles/{name}")
def launchpad_delete_profile(name: str):
    if not launchpad_mappings.delete_profile(name):
        raise HTTPException(status_code=400, detail="Cannot delete active or nonexistent profile")
    return {"ok": True}


@app.websocket("/api/launchpad/ws")
async def launchpad_ws(websocket: WebSocket):
    await ws_manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()  # keep alive
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)


# ── LCXL endpoints ────────────────────────────────────────────────

class LCXLMappingRequest(BaseModel):
    label: str = ""
    target_channel: Optional[int] = None
    target_cc: Optional[int] = None
    mode: str = "continuous"


@app.get("/api/lcxl/status")
def lcxl_status():
    return lcxl_midi.get_status()


@app.get("/api/lcxl/layout")
def lcxl_layout():
    return {"layout": lcxl_mappings.get_layout()}


@app.get("/api/lcxl/mappings")
def lcxl_get_mappings():
    return {
        "profile": lcxl_mappings.get_active_profile_name(),
        "mappings": lcxl_mappings.get_all_mappings(),
    }


@app.put("/api/lcxl/mappings/{control_id}")
def lcxl_set_mapping(control_id: str, req: LCXLMappingRequest):
    lcxl_mappings.set_mapping(control_id, req.model_dump())
    return {"ok": True}


@app.delete("/api/lcxl/mappings/{control_id}")
def lcxl_delete_mapping(control_id: str):
    lcxl_mappings.delete_mapping(control_id)
    return {"ok": True}


@app.get("/api/lcxl/profiles")
def lcxl_list_profiles():
    return {
        "profiles": lcxl_mappings.list_profiles(),
        "active": lcxl_mappings.get_active_profile_name(),
    }


@app.post("/api/lcxl/profiles/{name}")
def lcxl_save_profile(name: str):
    lcxl_mappings.save_profile(name)
    return {"ok": True}


@app.put("/api/lcxl/profiles/{name}/apply")
def lcxl_apply_profile(name: str):
    if not lcxl_mappings.apply_profile(name):
        raise HTTPException(status_code=404, detail="Profile not found")
    return {"ok": True, "mappings": lcxl_mappings.get_all_mappings()}


@app.delete("/api/lcxl/profiles/{name}")
def lcxl_delete_profile(name: str):
    if not lcxl_mappings.delete_profile(name):
        raise HTTPException(status_code=400, detail="Cannot delete active or nonexistent profile")
    return {"ok": True}


@app.websocket("/api/lcxl/ws")
async def lcxl_ws(websocket: WebSocket):
    await lcxl_ws_manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()  # keep alive
    except WebSocketDisconnect:
        lcxl_ws_manager.disconnect(websocket)


# ── Stream Dock endpoints ────────────────────────────────────────

class StreamDockMappingRequest(BaseModel):
    action_type: str
    params: dict = {}
    label: str = ""
    icon: str = ""


@app.get("/api/streamdock/status")
def streamdock_status():
    return streamdock_connection.get_status()


@app.get("/api/streamdock/apps")
def streamdock_list_apps():
    return {"apps": launchpad_actions.list_apps()}


@app.get("/api/streamdock/apps/{app_name}/icon")
def streamdock_app_icon(app_name: str):
    icon_path = launchpad_actions.get_app_icon(app_name)
    if not icon_path:
        raise HTTPException(status_code=404, detail="Icon not found")
    return FileResponse(icon_path, media_type="image/png",
                        headers={"Cache-Control": "public, max-age=86400"})


@app.get("/api/streamdock/mappings")
def streamdock_get_mappings():
    return {
        "profile": streamdock_mappings.get_active_profile_name(),
        "mappings": streamdock_mappings.get_all_mappings(),
    }


@app.put("/api/streamdock/mappings/{button_index}")
def streamdock_set_mapping(button_index: int, req: StreamDockMappingRequest):
    streamdock_mappings.set_mapping(button_index, req.model_dump())
    return {"ok": True}


@app.delete("/api/streamdock/mappings/{button_index}")
def streamdock_delete_mapping(button_index: int):
    streamdock_mappings.delete_mapping(button_index)
    return {"ok": True}


@app.get("/api/streamdock/profiles")
def streamdock_list_profiles():
    return {
        "profiles": streamdock_mappings.list_profiles(),
        "active": streamdock_mappings.get_active_profile_name(),
    }


@app.post("/api/streamdock/profiles/{name}")
def streamdock_save_profile(name: str):
    streamdock_mappings.save_profile(name)
    return {"ok": True}


@app.put("/api/streamdock/profiles/{name}/apply")
def streamdock_apply_profile(name: str):
    if not streamdock_mappings.apply_profile(name):
        raise HTTPException(status_code=404, detail="Profile not found")
    return {"ok": True, "mappings": streamdock_mappings.get_all_mappings()}


@app.delete("/api/streamdock/profiles/{name}")
def streamdock_delete_profile(name: str):
    if not streamdock_mappings.delete_profile(name):
        raise HTTPException(status_code=400, detail="Cannot delete active or nonexistent profile")
    return {"ok": True}


@app.post("/api/streamdock/test/{button_index}")
def streamdock_test_action(button_index: int):
    """Test-fire an action without pressing the physical button."""
    action = streamdock_mappings.get_mapping(button_index)
    if not action:
        raise HTTPException(status_code=404, detail="No mapping for this button")
    result = streamdock_actions.execute(action)
    return result


@app.websocket("/api/streamdock/ws")
async def streamdock_ws(websocket: WebSocket):
    await streamdock_ws_manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()  # keep alive
    except WebSocketDisconnect:
        streamdock_ws_manager.disconnect(websocket)


# ── Chat endpoint ────────────────────────────────────────────────
@app.websocket("/api/chat/ws")
async def chat_ws(websocket: WebSocket):
    await websocket.accept()
    try:
        while True:
            data = await websocket.receive_json()
            messages = data.get("messages", [])

            async def send_chunk(text: str):
                await websocket.send_json({"type": "delta", "text": text})

            async def send_tool_use(name: str, tool_input: dict):
                await websocket.send_json({
                    "type": "tool_use",
                    "name": name,
                    "input": tool_input,
                })

            async def send_event(data: str):
                await websocket.send_text(data)

            # Let the chat service send events (like create_tab) to this WebSocket
            from services.chat import set_ws_event_callback
            set_ws_event_callback(send_event)

            await stream_chat(messages, send_chunk, on_tool_use=send_tool_use)
            await websocket.send_json({"type": "done"})
    except WebSocketDisconnect:
        pass
    except Exception as e:
        try:
            await websocket.send_json({"type": "error", "text": str(e)})
        except Exception:
            pass


# ── Static files (serve the frontend) ─────────────────────────────
# Mount LAST so API routes take priority
static_dir = Path(__file__).parent.parent
app.mount("/", StaticFiles(directory=str(static_dir), html=True), name="static")
