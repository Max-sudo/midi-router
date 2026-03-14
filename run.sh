#!/bin/bash
# Start the MIDI Router FastAPI server

PYENV_PYTHON="$HOME/.pyenv/versions/3.11.8/bin/python3"

if [ -x "$PYENV_PYTHON" ]; then
  PYTHON="$PYENV_PYTHON"
else
  PYTHON="python3"
fi

echo "Using: $PYTHON"
cd "$(dirname "$0")/backend"
exec "$PYTHON" -m uvicorn server:app --host 0.0.0.0 --port 8000
