# ── Render final mp4 with synced audio ─────────────────────────────
import re
import subprocess
from pathlib import Path

from .progress import ProgressTracker


def get_video_duration(video_path: str) -> float:
    """Get video duration in seconds via ffprobe."""
    result = subprocess.run(
        [
            "ffprobe", "-v", "quiet",
            "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1",
            video_path,
        ],
        capture_output=True,
        text=True,
        timeout=10,
    )
    try:
        return float(result.stdout.strip())
    except ValueError:
        return 0.0


def render(
    video_path: str,
    audio_path: str,
    offset_ms: float,
    output_path: str,
    progress: ProgressTracker,
):
    """Combine video with offset-adjusted audio into final mp4.

    Args:
        video_path: Path to source video
        audio_path: Path to Logic Pro audio file
        offset_ms: Sync offset in milliseconds (positive = audio delayed)
        output_path: Where to write the output mp4
        progress: Progress tracker for SSE updates
    """
    progress.update(0, "preparing", "Preparing render...")

    # Validate paths
    if not Path(video_path).exists():
        progress.fail(f"Video not found: {video_path}")
        return
    if not Path(audio_path).exists():
        progress.fail(f"Audio not found: {audio_path}")
        return

    # Ensure output directory exists
    out_dir = Path(output_path).parent
    out_dir.mkdir(parents=True, exist_ok=True)

    # Convert offset to seconds
    offset_s = offset_ms / 1000.0

    # Get total duration for progress tracking
    duration = get_video_duration(video_path)

    # Build ffmpeg command
    # -itsoffset shifts the audio input by the sync offset
    cmd = [
        "ffmpeg", "-y",
        "-i", video_path,
        "-itsoffset", str(offset_s),
        "-i", audio_path,
        "-map", "0:v:0",       # video from first input
        "-map", "1:a:0",       # audio from second input (offset)
        "-c:v", "copy",        # copy video stream (no re-encode)
        "-c:a", "aac",         # encode audio as AAC
        "-b:a", "256k",        # audio bitrate
        "-shortest",           # stop at shortest stream
        "-movflags", "+faststart",
        "-progress", "pipe:1", # progress output to stdout
        output_path,
    ]

    progress.update(5, "rendering", "Starting ffmpeg render...")

    try:
        proc = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
    except FileNotFoundError:
        progress.fail("ffmpeg not found. Please install ffmpeg.")
        return

    # Parse ffmpeg progress output
    time_re = re.compile(r"out_time_us=(\d+)")
    try:
        for line in proc.stdout:
            match = time_re.search(line)
            if match and duration > 0:
                current_s = int(match.group(1)) / 1_000_000
                pct = min(95, (current_s / duration) * 95)
                progress.update(pct, "rendering", f"Rendering... {pct:.0f}%")
    except Exception:
        pass

    proc.wait()

    if proc.returncode != 0:
        stderr = proc.stderr.read() if proc.stderr else ""
        progress.fail(f"Render failed: {stderr.strip()[-200:]}")
        return

    if not Path(output_path).exists():
        progress.fail("Output file was not created")
        return

    progress.complete({"output_path": output_path})
