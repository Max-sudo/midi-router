Studio Tools — How It All Fits Together
========================================

What It Is
----------
Studio Tools is a web app for MIDI routing, lead sheet management,
and more. It runs in any Chromium browser (Chrome, Brave, Edge) and
can talk to MIDI gear plugged into whatever computer is running the browser.


Where It Lives
--------------
1. CODE: GitHub (github.com/Max-sudo/midi-router)
   - All the source code lives here
   - When you push changes, Railway auto-deploys

2. HOSTING: Railway (railway.app)
   - Runs the backend server (Python/FastAPI)
   - Also serves the frontend (HTML/CSS/JS)
   - Gives you a public URL anyone can visit
   - Cost: $5/month (Hobby plan)

3. DOMAIN (optional): Porkbun or any registrar
   - If you want a custom URL (e.g. studiotools.com)
   - Point it at your Railway URL in DNS settings


Required Keys
-------------
- ANTHROPIC_API_KEY: Powers the Builder/Chat tab (Claude API)
  Set this in Railway → your service → Variables tab
  Get keys from: console.anthropic.com
  Cost: usage-based, pay per message


How Deployment Works
--------------------
1. You make changes locally on your Mac
2. Commit and push to GitHub
3. Railway detects the push and auto-deploys (~1-2 min)
4. The live site updates automatically


How Data Is Stored
------------------
- Set lists, tags, song notes, renames → saved to a JSON file on Railway
- MIDI presets → saved to a JSON file on Railway
- Everything also cached in your browser's localStorage as a backup
- If you clear browser data, the app pulls fresh data from Railway


MIDI Features
-------------
- MIDI routing, Helix Monitor, Take 5 panel all work in-browser
- They use Web MIDI API — no plugins or installs needed
- Works on any computer with MIDI gear and a Chromium browser
- No MIDI gear connected? Those tabs still load, just nothing to route


Local Development
-----------------
To work on changes locally before pushing:
  1. Open Terminal
  2. Run: python3 -m http.server 8000 --directory /path/to/midi-router --bind 0.0.0.0
  3. Open http://localhost:8000 in your browser
  4. For backend features (chat, data sync): cd backend && python3 server.py
  Note: MIDI features require localhost or HTTPS (not plain IP addresses)


Accounts Involved
-----------------
- GitHub: hosts the code, triggers deploys
- Railway: hosts the live site ($5/mo)
- Anthropic: Claude API key for Builder chat (usage-based)
