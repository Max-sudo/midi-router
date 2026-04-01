#!/bin/bash
# Close all application windows (doesn't quit apps, just closes windows)
osascript -e '
tell application "System Events"
    set appList to name of every application process whose visible is true
    repeat with appName in appList
        try
            tell application process appName
                repeat with w in windows
                    try
                        click button 1 of w -- red close button
                    end try
                end repeat
            end tell
        end try
    end repeat
end tell
'
