import xtermHeadless from '@xterm/headless';
const { Terminal } = xtermHeadless;
import { randomUUID } from 'node:crypto';
import type {
  PtyBackend,
  PtyHandle,
  PtySpawnOptions,
  PtySessionInfo,
  PtySessionState,
  ScreenReadOptions,
} from './types.js';

/**
 * Convert escape notation in input strings to actual bytes.
 * Handles: \n \r \t \\ \xNN (hex)
 * Needed because MCP/HTTP tool arguments arrive as JSON strings where
 * backslash sequences are literal two-char pairs, not control characters.
 */
function unescapeInput(input: string): string {
  let result = '';
  let i = 0;
  while (i < input.length) {
    if (input[i] === '\\' && i + 1 < input.length) {
      const next = input[i + 1];
      switch (next) {
        case 'n': result += '\r'; i += 2; continue; // \n → CR (Enter key in terminals)
        case 'r': result += '\r'; i += 2; continue;
        case 't': result += '\t'; i += 2; continue;
        case '\\': result += '\\'; i += 2; continue;
        case 'x': {
          if (i + 3 < input.length) {
            const hex = input.slice(i + 2, i + 4);
            const code = parseInt(hex, 16);
            if (!isNaN(code)) {
              result += String.fromCharCode(code);
              i += 4;
              continue;
            }
          }
          break;
        }
      }
    }
    result += input[i];
    i++;
  }
  return result;
}

const DEFAULT_COLS = 120;
const DEFAULT_ROWS = 40;
const DEFAULT_IDLE_TIMEOUT = 10 * 60 * 1000;
const DEFAULT_MAX_SESSIONS = 5;

interface PtySession {
  id: string;
  handle: PtyHandle;
  terminal: InstanceType<typeof Terminal>;
  command: string;
  args: string[];
  cwd: string;
  createdAt: number;
  lastActivity: number;
  alive: boolean;
  exitCode?: number;
  exitSignal?: number;
  disposables: Array<{ dispose(): void }>;
}

export class SessionManager {
  private sessions = new Map<string, PtySession>();
  private idleTimer: ReturnType<typeof setInterval> | null = null;
  private maxSessions: number;
  private idleTimeout: number;

  constructor(
    private backend: PtyBackend,
    options?: { maxSessions?: number; idleTimeout?: number },
  ) {
    this.maxSessions = options?.maxSessions ?? DEFAULT_MAX_SESSIONS;
    this.idleTimeout = options?.idleTimeout ?? DEFAULT_IDLE_TIMEOUT;
    this.idleTimer = setInterval(() => this.cleanupIdle(), 60_000);
  }

  spawn(options: PtySpawnOptions = {}): { info: PtySessionInfo; state: PtySessionState } {
    if (this.sessions.size >= this.maxSessions) {
      throw new Error(
        `Maximum concurrent sessions (${this.maxSessions}) reached. Close a session first.`,
      );
    }

    const id = randomUUID();
    const command = options.command ?? process.env.SHELL ?? '/bin/bash';
    const args = options.args ?? [];
    const cols = options.cols ?? DEFAULT_COLS;
    const rows = options.rows ?? DEFAULT_ROWS;
    const cwd = options.cwd ?? process.cwd();
    const env = { ...process.env, ...options.env } as Record<string, string>;

    const terminal = new Terminal({ cols, rows, scrollback: 5000, allowProposedApi: true });
    const handle = this.backend.spawn(command, args, { cols, rows, cwd, env });
    const now = Date.now();

    const session: PtySession = {
      id,
      handle,
      terminal,
      command,
      args,
      cwd,
      createdAt: now,
      lastActivity: now,
      alive: true,
      disposables: [],
    };

    session.disposables.push(
      handle.onData((data: string) => {
        terminal.write(data);
        session.lastActivity = Date.now();
      }),
    );

    session.disposables.push(
      handle.onExit((e) => {
        session.alive = false;
        session.exitCode = e.exitCode;
        session.exitSignal = e.signal;
        session.lastActivity = Date.now();
      }),
    );

    this.sessions.set(id, session);

    return {
      info: this.getInfo(session),
      state: this.getState(session),
    };
  }

  async send(
    sessionId: string,
    input: string,
    waitMs: number = 200,
    maxWaitMs: number = 10_000,
  ): Promise<PtySessionState> {
    const session = this.requireSession(sessionId);

    if (!session.alive) {
      throw new Error(`Session ${sessionId} has exited (code=${session.exitCode})`);
    }

    session.handle.write(unescapeInput(input));
    session.lastActivity = Date.now();

    await this.waitForQuiescence(session, waitMs, maxWaitMs);

    return this.getState(session);
  }

  read(sessionId: string, options?: ScreenReadOptions): PtySessionState {
    const session = this.requireSession(sessionId);
    return this.getState(session, options);
  }

  resize(sessionId: string, cols: number, rows: number): void {
    const session = this.requireSession(sessionId);

    if (!session.alive) {
      throw new Error(`Session ${sessionId} has exited`);
    }

    session.handle.resize(cols, rows);
    session.terminal.resize(cols, rows);
    session.lastActivity = Date.now();
  }

  close(sessionId: string): { exitCode?: number; exitSignal?: number; screen: string } {
    const session = this.requireSession(sessionId);
    const screen = this.serializeScreen(session);

    if (session.alive) {
      session.handle.kill();
    }

    for (const d of session.disposables) d.dispose();
    session.terminal.dispose();
    this.sessions.delete(sessionId);

    return {
      exitCode: session.exitCode,
      exitSignal: session.exitSignal,
      screen,
    };
  }

  list(): PtySessionInfo[] {
    return Array.from(this.sessions.values()).map((s) => this.getInfo(s));
  }

  destroyAll(): void {
    if (this.idleTimer) {
      clearInterval(this.idleTimer);
      this.idleTimer = null;
    }
    for (const [id] of this.sessions) {
      try {
        this.close(id);
      } catch {
        // best effort
      }
    }
  }

  // ── Private ──────────────────────────────────────────────

  private requireSession(id: string): PtySession {
    const s = this.sessions.get(id);
    if (!s) throw new Error(`Session not found: ${id}`);
    return s;
  }

  private getInfo(session: PtySession): PtySessionInfo {
    return {
      id: session.id,
      command: session.command,
      args: session.args,
      cols: session.terminal.cols,
      rows: session.terminal.rows,
      cwd: session.cwd,
      pid: session.handle.pid,
      createdAt: session.createdAt,
      lastActivity: session.lastActivity,
      alive: session.alive,
      exitCode: session.exitCode,
      exitSignal: session.exitSignal,
    };
  }

  private getState(session: PtySession, options?: ScreenReadOptions): PtySessionState {
    const buf = session.terminal.buffer.active;
    return {
      screen: this.serializeScreen(session, options),
      cursorX: buf.cursorX,
      cursorY: buf.cursorY,
      rows: session.terminal.rows,
      cols: session.terminal.cols,
      scrollback: buf.length,
      title: session.handle.process,
    };
  }

  private serializeScreen(session: PtySession, options?: ScreenReadOptions): string {
    const buf = session.terminal.buffer.active;
    const lines: string[] = [];
    const scrollback = options?.scrollback ?? 0;

    const viewportStart = buf.baseY;
    const scrollbackStart = Math.max(0, viewportStart - scrollback);
    for (let i = scrollbackStart; i < viewportStart; i++) {
      const line = buf.getLine(i);
      if (line) lines.push(line.translateToString(true));
    }

    for (let i = viewportStart; i < viewportStart + session.terminal.rows; i++) {
      const line = buf.getLine(i);
      if (line) lines.push(line.translateToString(true));
    }

    while (lines.length > 0 && lines[lines.length - 1].trim() === '') {
      lines.pop();
    }

    return lines.join('\n');
  }

  private waitForQuiescence(
    session: PtySession,
    quiesceMs: number,
    maxMs: number,
  ): Promise<void> {
    return new Promise((resolve) => {
      const startTime = Date.now();
      let quiesceTimer: ReturnType<typeof setTimeout>;
      let maxTimer: ReturnType<typeof setTimeout>;
      let dataListener: { dispose(): void } | null = null;

      const done = () => {
        clearTimeout(quiesceTimer);
        clearTimeout(maxTimer);
        if (dataListener) {
          dataListener.dispose();
          dataListener = null;
        }
        resolve();
      };

      const resetQuiesce = () => {
        clearTimeout(quiesceTimer);
        if (Date.now() - startTime >= maxMs) {
          done();
          return;
        }
        quiesceTimer = setTimeout(done, quiesceMs);
      };

      dataListener = session.handle.onData(resetQuiesce);
      quiesceTimer = setTimeout(done, quiesceMs);
      maxTimer = setTimeout(done, maxMs);
    });
  }

  private cleanupIdle(): void {
    const now = Date.now();
    for (const [id, session] of this.sessions) {
      if (now - session.lastActivity > this.idleTimeout) {
        try {
          this.close(id);
        } catch {
          // best effort
        }
      }
    }
  }
}
