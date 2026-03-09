# ── Chat service – Claude API with tool use ──────────────────────────
import os
import json
import subprocess
from pathlib import Path
import httpx
from dotenv import load_dotenv

# Load .env from the backend directory
load_dotenv(Path(__file__).parent.parent / ".env")

ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
API_URL = "https://api.anthropic.com/v1/messages"
MODEL = "claude-sonnet-4-20250514"

PROJECT_ROOT = str(Path(__file__).parent.parent.parent)

SYSTEM_PROMPT = (
    "You are Studio — a terse, action-oriented assistant embedded in Studio Tools "
    "(a web app for MIDI routing, AV sync, and Launchpad pad mapping).\n\n"
    "The project lives at: " + PROJECT_ROOT + "\n"
    "Key paths:\n"
    "- Frontend: index.html, js/*.js, css/*.css\n"
    "- Backend: backend/server.py, backend/services/*.py\n"
    "- Launchpad mappings: backend/launchpad_mappings.json\n\n"
    "Rules:\n"
    "- Be extremely brief. 1-2 sentences max unless the user asks for detail.\n"
    "- When the user requests a feature or change: just do it using your tools. "
    "Say 'On it' then use the tools. Don't ask permission, just act.\n"
    "- If you need one clarifying detail, ask it in one line.\n"
    "- After making changes, briefly say what you did.\n"
    "- Never repeat back what the user said. Never over-explain.\n"
    "- Use read_file before editing to understand existing code.\n"
    "- Use write_file for new files, edit_file for surgical changes to existing files.\n"
    "- Warm but minimal. Think text message, not email."
)

TOOLS = [
    {
        "name": "run_command",
        "description": "Run a shell command and return its output. Use for git, npm, listing files, etc. Commands run from the project root.",
        "input_schema": {
            "type": "object",
            "properties": {
                "command": {"type": "string", "description": "The shell command to execute"}
            },
            "required": ["command"]
        }
    },
    {
        "name": "read_file",
        "description": "Read the contents of a file. Path is relative to project root.",
        "input_schema": {
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "File path relative to project root"}
            },
            "required": ["path"]
        }
    },
    {
        "name": "write_file",
        "description": "Write content to a file (creates or overwrites). Path is relative to project root.",
        "input_schema": {
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "File path relative to project root"},
                "content": {"type": "string", "description": "The full file content to write"}
            },
            "required": ["path", "content"]
        }
    },
    {
        "name": "edit_file",
        "description": "Replace a specific string in a file. Use for surgical edits to existing files. The old_string must match exactly (including whitespace).",
        "input_schema": {
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "File path relative to project root"},
                "old_string": {"type": "string", "description": "Exact string to find and replace"},
                "new_string": {"type": "string", "description": "Replacement string"}
            },
            "required": ["path", "old_string", "new_string"]
        }
    },
    {
        "name": "list_files",
        "description": "List files in a directory. Path is relative to project root.",
        "input_schema": {
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "Directory path relative to project root", "default": "."},
                "pattern": {"type": "string", "description": "Glob pattern to filter files", "default": "*"}
            },
            "required": []
        }
    },
]


def _execute_tool(name: str, input: dict) -> str:
    """Execute a tool and return the result as a string."""
    try:
        if name == "run_command":
            result = subprocess.run(
                input["command"], shell=True, capture_output=True, text=True,
                timeout=30, cwd=PROJECT_ROOT,
            )
            output = result.stdout
            if result.stderr:
                output += "\n" + result.stderr
            if result.returncode != 0:
                output += f"\n[exit code {result.returncode}]"
            return output.strip() or "(no output)"

        elif name == "read_file":
            filepath = Path(PROJECT_ROOT) / input["path"]
            if not filepath.exists():
                return f"Error: file not found: {input['path']}"
            content = filepath.read_text()
            if len(content) > 50000:
                return content[:50000] + f"\n... (truncated, {len(content)} chars total)"
            return content

        elif name == "write_file":
            filepath = Path(PROJECT_ROOT) / input["path"]
            filepath.parent.mkdir(parents=True, exist_ok=True)
            filepath.write_text(input["content"])
            return f"Written {len(input['content'])} chars to {input['path']}"

        elif name == "edit_file":
            filepath = Path(PROJECT_ROOT) / input["path"]
            if not filepath.exists():
                return f"Error: file not found: {input['path']}"
            content = filepath.read_text()
            old = input["old_string"]
            if old not in content:
                return f"Error: old_string not found in {input['path']}"
            count = content.count(old)
            content = content.replace(old, input["new_string"], 1)
            filepath.write_text(content)
            return f"Replaced in {input['path']} ({count} occurrence{'s' if count > 1 else ''} found, replaced first)"

        elif name == "list_files":
            dirpath = Path(PROJECT_ROOT) / input.get("path", ".")
            pattern = input.get("pattern", "*")
            if not dirpath.exists():
                return f"Error: directory not found: {input.get('path', '.')}"
            files = sorted(str(f.relative_to(PROJECT_ROOT)) for f in dirpath.glob(pattern)
                          if not any(p.startswith('.') for p in f.relative_to(PROJECT_ROOT).parts)
                          and '__pycache__' not in str(f))
            return "\n".join(files[:100]) or "(empty)"

        else:
            return f"Unknown tool: {name}"
    except Exception as e:
        return f"Error: {e}"


async def stream_chat(messages: list[dict], on_chunk, on_tool_use=None):
    """Stream a chat completion with tool use loop.

    on_chunk(text) — called for each text delta
    on_tool_use(name, input, result) — called when a tool is used (optional)
    """
    if not ANTHROPIC_API_KEY:
        await on_chunk("**API key not set.** Add your key to `backend/.env`")
        return

    headers = {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
    }

    # Build conversation with tool use loop
    conv_messages = list(messages)
    max_rounds = 10  # safety limit on tool use loops

    async with httpx.AsyncClient(timeout=120.0) as client:
        for _ in range(max_rounds):
            body = {
                "model": MODEL,
                "max_tokens": 4096,
                "system": SYSTEM_PROMPT,
                "messages": conv_messages,
                "tools": TOOLS,
            }

            # Non-streaming call to handle tool use properly
            resp = await client.post(API_URL, headers=headers, json=body)

            if resp.status_code != 200:
                await on_chunk(f"**API error ({resp.status_code}):** {resp.text}")
                return

            result = resp.json()
            stop_reason = result.get("stop_reason", "")

            # Process content blocks
            tool_uses = []
            for block in result.get("content", []):
                if block["type"] == "text" and block.get("text"):
                    await on_chunk(block["text"])
                elif block["type"] == "tool_use":
                    tool_uses.append(block)

            # If no tool use, we're done
            if stop_reason != "tool_use" or not tool_uses:
                return

            # Execute tools and continue conversation
            # Add assistant message with all content blocks
            conv_messages.append({"role": "assistant", "content": result["content"]})

            # Build tool results
            tool_results = []
            for tool_use in tool_uses:
                tool_name = tool_use["name"]
                tool_input = tool_use["input"]

                # Notify frontend about tool use
                if on_tool_use:
                    await on_tool_use(tool_name, tool_input)

                # Execute the tool
                tool_result = _execute_tool(tool_name, tool_input)

                tool_results.append({
                    "type": "tool_result",
                    "tool_use_id": tool_use["id"],
                    "content": tool_result,
                })

            conv_messages.append({"role": "user", "content": tool_results})
