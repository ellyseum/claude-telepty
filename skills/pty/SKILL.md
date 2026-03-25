---
name: pty
description: Manage interactive PTY terminal sessions with real TTY support and ACP telepathy
---

## Instructions

You have access to a PTY (pseudo-terminal) server that spawns real terminal sessions. Use this when you need to interact with programs that require a real TTY — interactive prompts, TUIs (htop, vim, less), REPLs, installers, or any program that detects `isatty()`.

### When to Use PTY vs Bash

- **Use Bash** for simple commands with predictable output (`ls`, `git status`, `npm test`)
- **Use PTY** when:
  - The program prompts for input (y/n, passwords, menus)
  - The program requires a real TTY (vim, htop, docker interactive)
  - You need to interact with a REPL (python, node, psql)
  - The program uses ANSI escape codes for UI rendering
  - You need to send Ctrl+C, Ctrl+D, or other control sequences

### HTTP API

The PTY server runs at `http://localhost:4000` (configurable via `TELEPTY_PORT`).

**Spawn a session:**
```bash
curl -X POST http://localhost:4000/pty/spawn \
  -H "Content-Type: application/json" \
  -d '{"command": "/bin/bash", "cols": 120, "rows": 40}'
```
Returns `{ info: { id, pid, ... }, state: { screen, cursorX, cursorY } }`

**Send input:**
```bash
curl -X POST http://localhost:4000/pty/{id}/send \
  -H "Content-Type: application/json" \
  -d '{"input": "ls -la\n", "waitMs": 200}'
```
Sends keystrokes and waits for output to settle. Returns updated screen state.

**Read screen:**
```bash
curl http://localhost:4000/pty/{id}
```
Returns current terminal screen buffer, cursor position, and title.

**Resize:**
```bash
curl -X POST http://localhost:4000/pty/{id}/resize \
  -H "Content-Type: application/json" \
  -d '{"cols": 80, "rows": 24}'
```

**Close session:**
```bash
curl -X DELETE http://localhost:4000/pty/{id}
```

**List sessions:**
```bash
curl http://localhost:4000/pty
```

### Control Sequences

Send special keys as escape sequences in the `input` field:
- Enter: `\n` or `\r`
- Ctrl+C: `\x03`
- Ctrl+D: `\x04`
- Ctrl+Z: `\x1a`
- Tab: `\t`
- Escape: `\x1b`
- Arrow keys: `\x1b[A` (up), `\x1b[B` (down), `\x1b[C` (right), `\x1b[D` (left)

### Tips

- Always close sessions when done — orphaned PTY processes consume resources
- Use `waitMs` to let commands complete before reading output (default 200ms)
- For long-running commands, use `maxWaitMs` (default 10s) to cap the wait
- The screen buffer is rendered by xterm.js headless — it handles ANSI codes, cursor movement, and scrollback
