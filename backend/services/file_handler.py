# ── File validation and metadata extraction via ffprobe ────────────
import json
import subprocess
from pathlib import Path

VIDEO_EXTENSIONS = {".mp4", ".mov", ".mts", ".m2ts", ".avi", ".mkv", ".mxf"}
AUDIO_EXTENSIONS = {".wav", ".aif", ".aiff", ".mp3", ".m4a", ".flac", ".ogg"}


def validate_path(path: str) -> Path:
    """Validate that a file path exists and is a file."""
    p = Path(path).expanduser().resolve()
    if not p.exists():
        raise FileNotFoundError(f"File not found: {path}")
    if not p.is_file():
        raise ValueError(f"Not a file: {path}")
    return p


def validate_video(path: str) -> Path:
    p = validate_path(path)
    if p.suffix.lower() not in VIDEO_EXTENSIONS:
        raise ValueError(f"Unsupported video format: {p.suffix}")
    return p


def validate_audio(path: str) -> Path:
    p = validate_path(path)
    if p.suffix.lower() not in AUDIO_EXTENSIONS:
        raise ValueError(f"Unsupported audio format: {p.suffix}")
    return p


def probe_file(path: str) -> dict:
    """Run ffprobe and return file metadata."""
    p = validate_path(path)

    try:
        result = subprocess.run(
            [
                "ffprobe",
                "-v", "quiet",
                "-print_format", "json",
                "-show_format",
                "-show_streams",
                str(p),
            ],
            capture_output=True,
            text=True,
            timeout=15,
        )
    except FileNotFoundError:
        raise RuntimeError("ffprobe not found. Please install ffmpeg.")
    except subprocess.TimeoutExpired:
        raise RuntimeError("ffprobe timed out")

    if result.returncode != 0:
        raise RuntimeError(f"ffprobe failed: {result.stderr.strip()}")

    data = json.loads(result.stdout)
    fmt = data.get("format", {})
    streams = data.get("streams", [])

    # Find video and audio streams
    video_stream = next((s for s in streams if s["codec_type"] == "video"), None)
    audio_stream = next((s for s in streams if s["codec_type"] == "audio"), None)

    duration = float(fmt.get("duration", 0))
    codec = ""
    sample_rate = None

    if video_stream:
        codec = video_stream.get("codec_name", "unknown")
    elif audio_stream:
        codec = audio_stream.get("codec_name", "unknown")

    if audio_stream:
        sample_rate = int(audio_stream.get("sample_rate", 0)) or None

    return {
        "path": str(p),
        "filename": p.name,
        "duration_s": round(duration, 2),
        "codec": codec,
        "sample_rate": sample_rate,
        "has_audio": audio_stream is not None,
        "has_video": video_stream is not None,
        "valid": True,
    }


def check_ffmpeg() -> bool:
    """Check if ffmpeg and ffprobe are available."""
    for cmd in ("ffmpeg", "ffprobe"):
        try:
            subprocess.run([cmd, "-version"], capture_output=True, timeout=5)
        except (FileNotFoundError, subprocess.TimeoutExpired):
            return False
    return True
