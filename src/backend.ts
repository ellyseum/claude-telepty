import * as pty from 'node-pty';
import type { PtyBackend, PtyHandle } from './types.js';

export class NodePtyBackend implements PtyBackend {
  spawn(
    command: string,
    args: string[],
    options: { cols: number; rows: number; cwd: string; env: Record<string, string> },
  ): PtyHandle {
    const proc = pty.spawn(command, args, {
      name: 'xterm-256color',
      cols: options.cols,
      rows: options.rows,
      cwd: options.cwd,
      env: options.env,
    });

    return {
      get pid() { return proc.pid; },
      get process() { return proc.process; },
      write: (data: string) => proc.write(data),
      resize: (cols: number, rows: number) => proc.resize(cols, rows),
      kill: (signal?: string) => proc.kill(signal),
      onData: (cb: (data: string) => void) => proc.onData(cb),
      onExit: (cb: (e: { exitCode: number; signal?: number }) => void) => proc.onExit(cb),
    };
  }
}
