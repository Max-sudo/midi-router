#!/bin/bash
# Open VS Code or bring it to front if already running
if pgrep -x "Electron" > /dev/null 2>&1 || pgrep -f "Visual Studio Code" > /dev/null 2>&1; then
    osascript -e 'tell application "Visual Studio Code" to activate'
else
    open -a "Visual Studio Code"
fi
