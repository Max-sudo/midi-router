#!/bin/bash
# Start the MIDI Router FastAPI server

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
VENV_PYTHON="$SCRIPT_DIR/backend/.venv/bin/python3"
PYENV_PYTHON="$HOME/.pyenv/versions/3.11.8/bin/python3"

if [ -x "$VENV_PYTHON" ]; then
  PYTHON="$VENV_PYTHON"
elif [ -x "$PYENV_PYTHON" ]; then
  PYTHON="$PYENV_PYTHON"
else
  PYTHON="python3"
fi

echo "Using: $PYTHON ($($PYTHON --version 2>&1))"
cd "$SCRIPT_DIR/backend"
exec "$PYTHON" -m uvicorn server:app --host 0.0.0.0 --port 8000
