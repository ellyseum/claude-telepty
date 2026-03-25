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

Once installed, Claude has access to real interactive terminals. Just ask it to do things that would normally require you to be at the keyboard:

> "Run `create-next-app` and set it up with TypeScript and Tailwind"
> "Open a psql shell and check the schema for the users table"
> "Debug this interactively in the Python REPL"

### The Problem

Without this plugin, Claude can only run non-interactive commands via Bash. Anything that prompts for input fails:

```
You: Set up a new Next.js project

Claude: [runs: npx create-next-app]
        ❌ Hangs forever — the installer asks "What is your project named?"
           but Claude can't see the prompt or type a response
```

```
You: Check the database

Claude: [runs: psql -U postgres]
        ❌ Hangs — psql is waiting for interactive commands at the postgres=# prompt
```

```
You: Run the Python debugger on this script

Claude: [runs: python3 -m pdb script.py]
        ❌ Hangs — pdb needs real TTY input for step/next/continue
```

### With Telepty

The same requests work because Claude gets a real terminal it can type into and read from:

```
You: Set up a new Next.js project with TypeScript

Claude: [spawns PTY: npx create-next-app]
        [reads: "What is your project named?" ] → sends: my-app
        [reads: "Would you like to use TypeScript?"] → sends: Yes
        [reads: "Would you like to use Tailwind CSS?"] → sends: Yes
        [reads: "Would you like to use App Router?"] → sends: Yes
        ✅ Project created at ./my-app
```

```
You: Check what tables are in the database

Claude: [spawns PTY: psql -U postgres mydb]
        [sends: \dt]
        [reads the table listing]
        [sends: \d users]
        [reads the schema]
        [sends: \q]
        ✅ Found 12 tables. The users table has columns: id, email, name, created_at...
```

### Other Use Cases

- **Package managers** with interactive config (`pnpm init`, `npm init`, `cargo init`)
- **Docker** interactive containers (`docker exec -it container bash`)
- **REPLs** for any language (python, node, irb, ghci, lua)
- **TUI tools** (htop, btop, lazygit, tig)
- **Debuggers** (pdb, gdb, lldb)
- **SSH sessions** into remote machines
- **Config wizards** that use arrow keys, checkboxes, or menus

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
