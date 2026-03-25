<h1 align="center">claude-telepty</h1>

<p align="center">
  <a href="https://github.com/ellyseum/claude-telepty"><img src="https://img.shields.io/badge/Claude_Code-Plugin-blueviolet" alt="Claude Code Plugin"></a>
  <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/license-MIT-green" alt="License"></a>
</p>

Interactive PTY terminal sessions for Claude Code. Gives Claude a real TTY for interactive prompts, TUIs, and shell sessions.

## Why This Exists

Claude Code's Bash tool runs commands and returns output, but it can't handle interactive programs — anything that expects a real terminal. Try running `vim`, `htop`, `python` REPL, `docker exec -it`, an installer with y/n prompts, or anything that checks `isatty()`. It either hangs or crashes.

This plugin fixes that. It spawns real pseudo-terminals via `node-pty`, renders them with `@xterm/headless`, and exposes them as MCP tools.

## What's Included

| Skill | Description |
|-------|-------------|
| `/pty` | Manage interactive PTY terminal sessions |

### MCP Tools

| Tool | Description |
|------|-------------|
| `pty_spawn` | Start a new PTY session (shell, command, custom env) |
| `pty_send` | Send input to a session (keystrokes, commands) |
| `pty_read` | Read the current screen buffer |
| `pty_resize` | Resize the terminal |
| `pty_close` | Close a session |

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

## Control Sequences

Send special keys as escape sequences in the `input` field:

| Key | Sequence |
|-----|----------|
| Enter | `\n` or `\r` |
| Ctrl+C | `\x03` |
| Ctrl+D | `\x04` |
| Ctrl+Z | `\x1a` |
| Tab | `\t` |
| Escape | `\x1b` |
| Arrow Up | `\x1b[A` |
| Arrow Down | `\x1b[B` |
| Arrow Right | `\x1b[C` |
| Arrow Left | `\x1b[D` |

## Project Structure

```
claude-telepty/
├── .claude-plugin/           # Plugin metadata
├── .mcp.json                 # MCP server registration
├── skills/
│   └── pty/                  # /pty skill
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
