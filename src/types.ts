// ── PTY Types ──────────────────────────────────────────

export interface PtySpawnOptions {
  command?: string;
  args?: string[];
  cols?: number;
  rows?: number;
  cwd?: string;
  env?: Record<string, string>;
}

export interface PtySessionInfo {
  id: string;
  command: string;
  args: string[];
  cols: number;
  rows: number;
  cwd: string;
  pid: number;
  createdAt: number;
  lastActivity: number;
  alive: boolean;
  exitCode?: number;
  exitSignal?: number;
}

export interface PtySessionState {
  screen: string;
  cursorX: number;
  cursorY: number;
  rows: number;
  cols: number;
  scrollback: number;
  title: string;
}

export interface ScreenReadOptions {
  scrollback?: number;
}

export interface PtyBackend {
  spawn(
    command: string,
    args: string[],
    options: { cols: number; rows: number; cwd: string; env: Record<string, string> },
  ): PtyHandle;
}

export interface PtyHandle {
  readonly pid: number;
  readonly process: string;
  write(data: string): void;
  resize(cols: number, rows: number): void;
  kill(signal?: string): void;
  onData(callback: (data: string) => void): { dispose(): void };
  onExit(callback: (e: { exitCode: number; signal?: number }) => void): { dispose(): void };
}

// ── Telepty Config ─────────────────────────────────────

export interface TeleptyConfig {
  port: number;
  maxSessions: number;
}
