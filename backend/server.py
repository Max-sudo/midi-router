# ── Studio Tools – FastAPI Backend ──────────────────────────────────
import asyncio
import uuid
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from services.file_handler import check_ffmpeg, probe_file, validate_audio, validate_video
from services.progress import create_job, get_job
from services.sync_analyzer import analyze_sync
from services.renderer import render
from services import launchpad_mappings, launchpad_midi, launchpad_actions


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
_loop: asyncio.AbstractEventLoop = None


# ── Lifespan ──────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    global _loop
    _loop = asyncio.get_event_loop()
    launchpad_mappings.init()
    launchpad_midi.set_ws_broadcast(ws_manager.broadcast_sync)
    launchpad_midi.start()
    yield
    launchpad_midi.stop()


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


# ── Static files (serve the frontend) ─────────────────────────────
# Mount LAST so API routes take priority
static_dir = Path(__file__).parent.parent
app.mount("/", StaticFiles(directory=str(static_dir), html=True), name="static")
