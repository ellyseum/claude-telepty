<h1 align="center">claude-telepty</h1>

<p align="center">
  <a href="https://github.com/ellyseum/claude-telepty"><img src="https://img.shields.io/badge/Claude_Code-Plugin-blueviolet" alt="Claude Code Plugin"></a>
  <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/license-MIT-green" alt="License"></a>
</p>

Interactive PTY terminal sessions for Claude Code. Gives Claude a real TTY for interactive prompts, TUIs, and shell sessions.

## Why This Exists

Claude Code's Bash tool runs commands and returns output, but it can't handle interactive programs — anything that expects a real terminal. Try running `vim`, `htop`, `python` REPL, `docker exec -it`, an installer with y/n prompts, or anything that checks `isatty()`. It either hangs or crashes.

This plugin fixes that. It spawns real pseudo-terminals via `node-pty`, renders them with `@xterm/headless`, and exposes them as MCP tools.

## Quick Start

```bash
# Install from the Ellyseum plugin marketplace
/plugin marketplace add ellyseum/claude-plugins
/plugin install claude-telepty
```

### Alternative: Local Install

```bash
git clone https://github.com/ellyseum/claude-telepty.git
cd claude-telepty && pnpm install && pnpm build

# Then start Claude Code with:
claude --plugin-dir /path/to/claude-telepty
```

## Usage

Once installed, Claude automatically has access to the PTY tools. You can ask Claude directly:

> "Open a python REPL and test if numpy is installed"
> "Run htop and tell me what's using the most memory"
> "Start a psql session and run EXPLAIN on this query"

Or use the `/pty` skill for the full reference:

```
/pty
```

### Example: Python REPL

Claude spawns a real Python session, sends commands, and reads the terminal output:

```
You: Can you check what python version is installed and test a quick calculation?

Claude: [spawns python3 PTY session]
        [sends: import sys; print(sys.version)]
        → 3.13.12 (main, Feb 5 2026)
        [sends: 2 ** 128]
        → 340282366920938463463374607431768211456
        [closes session]
        Python 3.13.12 is installed. Arithmetic works fine.
```

### Example: Interactive Installer

```
You: Install that package, it has an interactive setup wizard

Claude: [spawns PTY session]
        [runs: npx create-next-app]
        [reads: "What is your project named?"]
        [sends: my-app\n]
        [reads: "Would you like to use TypeScript?"]
        [sends: y\n]
        ... continues through all prompts
```

### Example: TUI Programs

```
You: Check what's running on port 3000

Claude: [spawns PTY with: lsof -i :3000]
        — or for a more interactive approach —
        [spawns htop PTY, reads process list, closes]
```

## MCP Tools

| Tool | Description |
|------|-------------|
| `pty_spawn` | Start a new PTY session (shell, command, custom env) |
| `pty_send` | Send input to a session (keystrokes, commands) |
| `pty_read` | Read the current screen buffer |
| `pty_resize` | Resize the terminal |
| `pty_close` | Kill a session and clean up |

### Tool Details

**`pty_spawn`** — Creates a session and returns its ID + initial screen state.

```json
{ "command": "python3", "cols": 80, "rows": 24, "cwd": "/home/user/project" }
```

**`pty_send`** — Sends keystrokes and waits for output to settle before returning.

```json
{ "session_id": "abc-123", "input": "print('hello')\n", "wait_ms": 200 }
```

The `wait_ms` parameter (default 200ms) controls how long to wait after the last output before returning. For slow commands, `max_wait_ms` (default 10s) caps the total wait.

**`pty_read`** — Returns the current screen buffer without sending any input. Useful for checking if a long-running command has finished.

```json
{ "session_id": "abc-123", "scrollback": 100 }
```

**`pty_close`** — Kills the process and returns final screen state + exit code.

## When to Use PTY vs Bash

| Scenario | Use |
|----------|-----|
| `ls`, `git status`, `npm test` | **Bash** — simple command, predictable output |
| Python/Node REPL | **PTY** — interactive, needs real TTY |
| `vim`, `htop`, `less` | **PTY** — TUI, requires terminal |
| Installer with prompts | **PTY** — interactive y/n questions |
| `docker exec -it` | **PTY** — interactive container shell |
| Long build with progress bars | **PTY** — ANSI progress rendering |

## Project Structure

```
claude-telepty/
├── .claude-plugin/           # Plugin metadata + MCP server registration
├── skills/
│   └── pty/                  # /pty skill reference
├── src/
│   ├── mcp-server.ts         # MCP stdio server (in-process PTY)
│   ├── session-manager.ts    # PTY session lifecycle + xterm rendering
│   ├── backend.ts            # node-pty spawn wrapper
│   └── types.ts              # Type definitions
└── README.md
```

## Prerequisites

- Node.js 18+
- `node-pty` native addon (auto-compiles on install)

## License

MIT
