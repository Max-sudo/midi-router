# ── Extract audio from video via ffmpeg ────────────────────────────
from __future__ import annotations
import subprocess
import tempfile
from pathlib import Path

from .progress import ProgressTracker


def extract_audio(video_path: str, progress: ProgressTracker | None = None) -> str:
    """Extract audio track from a video file to a temporary WAV file.
    Returns the path to the extracted WAV."""
    p = Path(video_path)
    if not p.exists():
        raise FileNotFoundError(f"Video not found: {video_path}")

    # Create temp WAV file
    tmp = tempfile.NamedTemporaryFile(suffix=".wav", delete=False, prefix="avsync_")
    out_path = tmp.name
    tmp.close()

    if progress:
        progress.update(0, "extracting", "Extracting audio from video...")

    try:
        result = subprocess.run(
            [
                "ffmpeg", "-y",
                "-i", str(p),
                "-vn",                    # no video
                "-acodec", "pcm_s16le",   # 16-bit WAV
                "-ar", "22050",           # downsample for analysis
                "-ac", "1",               # mono
                out_path,
            ],
            capture_output=True,
            text=True,
            timeout=120,
        )
    except FileNotFoundError:
        raise RuntimeError("ffmpeg not found. Please install ffmpeg.")
    except subprocess.TimeoutExpired:
        raise RuntimeError("Audio extraction timed out")

    if result.returncode != 0:
        raise RuntimeError(f"ffmpeg extraction failed: {result.stderr.strip()[-200:]}")

    if progress:
        progress.update(100, "extracting", "Audio extracted")

    return out_path
