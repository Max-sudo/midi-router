# ── Waveform cross-correlation sync analysis ───────────────────────
import os
import numpy as np
import librosa
from scipy.signal import fftconvolve

from .audio_extract import extract_audio
from .progress import ProgressTracker

ANALYSIS_SR = 22050  # Sample rate for analysis


def analyze_sync(
    video_path: str,
    audio_path: str,
    progress: ProgressTracker,
) -> dict:
    """Compute sync offset between video's scratch audio and a reference audio file.

    Returns:
        { "offset_ms": float, "confidence": float (0-100) }
    """
    # Step 1: Extract scratch audio from video
    progress.update(5, "extracting", "Extracting audio from video...")
    try:
        scratch_wav = extract_audio(video_path)
    except Exception as e:
        progress.fail(f"Audio extraction failed: {e}")
        return {}

    try:
        # Step 2: Load both audio files
        progress.update(20, "loading", "Loading video audio...")
        scratch, _ = librosa.load(scratch_wav, sr=ANALYSIS_SR, mono=True)

        progress.update(35, "loading", "Loading reference audio...")
        reference, _ = librosa.load(audio_path, sr=ANALYSIS_SR, mono=True)

        if len(scratch) == 0 or len(reference) == 0:
            progress.fail("One of the audio files is empty")
            return {}

        # Step 3: Normalize
        progress.update(50, "analyzing", "Normalizing waveforms...")
        scratch = scratch / (np.max(np.abs(scratch)) + 1e-10)
        reference = reference / (np.max(np.abs(reference)) + 1e-10)

        # Step 4: Cross-correlate
        progress.update(60, "analyzing", "Computing cross-correlation...")
        correlation = fftconvolve(scratch, reference[::-1], mode="full")

        # Step 5: Find peak
        progress.update(80, "analyzing", "Finding sync point...")
        peak_idx = np.argmax(np.abs(correlation))

        # Offset in samples: positive means reference leads (needs delay)
        offset_samples = peak_idx - (len(reference) - 1)
        offset_ms = (offset_samples / ANALYSIS_SR) * 1000.0

        # Step 6: Compute confidence (peak-to-noise ratio)
        progress.update(90, "confidence", "Computing confidence score...")
        peak_val = np.abs(correlation[peak_idx])
        # Use median of absolute correlation as noise floor
        noise_floor = np.median(np.abs(correlation))
        if noise_floor > 0:
            snr = peak_val / noise_floor
            # Map SNR to 0-100 confidence (SNR of ~10+ is very confident)
            confidence = min(100.0, (snr / 10.0) * 100.0)
        else:
            confidence = 100.0 if peak_val > 0 else 0.0

        result = {
            "offset_ms": round(offset_ms, 1),
            "confidence": round(confidence, 1),
        }

        progress.complete(result)
        return result

    finally:
        # Clean up temp file
        try:
            os.unlink(scratch_wav)
        except OSError:
            pass
