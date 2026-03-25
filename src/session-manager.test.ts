import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SessionManager } from './session-manager.js';
import type { PtyBackend, PtyHandle } from './types.js';

// ── Mock PTY ────────────────────────────────────────────

function createMockHandle(): PtyHandle & {
  _dataCallbacks: Array<(data: string) => void>;
  _exitCallbacks: Array<(e: { exitCode: number; signal?: number }) => void>;
  simulateData: (data: string) => void;
  simulateExit: (code: number, signal?: number) => void;
} {
  const _dataCallbacks: Array<(data: string) => void> = [];
  const _exitCallbacks: Array<(e: { exitCode: number; signal?: number }) => void> = [];

  return {
    pid: 12345,
    process: 'mock-shell',
    write: vi.fn(),
    resize: vi.fn(),
    kill: vi.fn(),
    onData: (cb) => {
      _dataCallbacks.push(cb);
      return {
        dispose: () => {
          const i = _dataCallbacks.indexOf(cb);
          if (i >= 0) _dataCallbacks.splice(i, 1);
        },
      };
    },
    onExit: (cb) => {
      _exitCallbacks.push(cb);
      return {
        dispose: () => {
          const i = _exitCallbacks.indexOf(cb);
          if (i >= 0) _exitCallbacks.splice(i, 1);
        },
      };
    },
    _dataCallbacks,
    _exitCallbacks,
    simulateData: (data: string) => {
      for (const cb of _dataCallbacks) cb(data);
    },
    simulateExit: (code: number, signal?: number) => {
      for (const cb of _exitCallbacks) cb({ exitCode: code, signal });
    },
  };
}

let _lastHandle: ReturnType<typeof createMockHandle>;

function mockBackend(): PtyBackend {
  return {
    spawn: vi.fn(() => {
      _lastHandle = createMockHandle();
      return _lastHandle;
    }),
  };
}

function lastHandle() {
  return _lastHandle;
}

// ── Tests ───────────────────────────────────────────────

describe('SessionManager', () => {
  let manager: SessionManager;

  beforeEach(() => {
    manager = new SessionManager(mockBackend(), { maxSessions: 3, idleTimeout: 60_000 });
  });

  afterEach(() => {
    manager.destroyAll();
  });

  describe('spawn', () => {
    it('creates a session and returns info + state', () => {
      const result = manager.spawn({ command: '/bin/bash' });
      expect(result.info.id).toBeTruthy();
      expect(result.info.command).toBe('/bin/bash');
      expect(result.info.alive).toBe(true);
      expect(result.info.pid).toBe(12345);
      expect(result.state.cols).toBe(120);
      expect(result.state.rows).toBe(40);
    });

    it('uses custom cols/rows', () => {
      const result = manager.spawn({ cols: 80, rows: 24 });
      expect(result.state.cols).toBe(80);
      expect(result.state.rows).toBe(24);
    });

    it('enforces max sessions limit', () => {
      manager.spawn();
      manager.spawn();
      manager.spawn();
      expect(() => manager.spawn()).toThrow(/Maximum concurrent sessions/);
    });

    it('assigns UUID session IDs', () => {
      const a = manager.spawn();
      const b = manager.spawn();
      expect(a.info.id).not.toBe(b.info.id);
      expect(a.info.id).toMatch(/^[0-9a-f-]{36}$/);
    });
  });

  describe('send', () => {
    it('writes input to the PTY handle', async () => {
      const { info } = manager.spawn();
      await manager.send(info.id, 'ls\n', 50, 200);
      expect(lastHandle().write).toHaveBeenCalledWith('ls\n');
    });

    it('unescapes \\n to CR (Enter key)', async () => {
      const { info } = manager.spawn();
      await manager.send(info.id, 'hello\\n', 50, 200);
      expect(lastHandle().write).toHaveBeenCalledWith('hello\r');
    });

    it('unescapes \\r to CR', async () => {
      const { info } = manager.spawn();
      await manager.send(info.id, '\\r', 50, 200);
      expect(lastHandle().write).toHaveBeenCalledWith('\r');
    });

    it('unescapes \\t to tab', async () => {
      const { info } = manager.spawn();
      await manager.send(info.id, 'file\\t', 50, 200);
      expect(lastHandle().write).toHaveBeenCalledWith('file\t');
    });

    it('unescapes \\xNN hex sequences', async () => {
      const { info } = manager.spawn();
      await manager.send(info.id, '\\x03', 50, 200);
      expect(lastHandle().write).toHaveBeenCalledWith('\x03');
    });

    it('unescapes \\x1b to ESC for arrow keys', async () => {
      const { info } = manager.spawn();
      await manager.send(info.id, '\\x1b[A', 50, 200);
      expect(lastHandle().write).toHaveBeenCalledWith('\x1b[A');
    });

    it('unescapes \\\\ to literal backslash', async () => {
      const { info } = manager.spawn();
      await manager.send(info.id, 'path\\\\to\\\\file', 50, 200);
      expect(lastHandle().write).toHaveBeenCalledWith('path\\to\\file');
    });

    it('passes through plain text unchanged', async () => {
      const { info } = manager.spawn();
      await manager.send(info.id, 'hello world', 50, 200);
      expect(lastHandle().write).toHaveBeenCalledWith('hello world');
    });

    it('returns screen state after quiescence', async () => {
      const { info } = manager.spawn();

      setTimeout(() => {
        lastHandle().simulateData('hello world\r\n');
      }, 10);

      const state = await manager.send(info.id, 'echo hello\n', 100, 2000);
      expect(state.screen).toContain('hello world');
    });

    it('throws for dead sessions', async () => {
      const { info } = manager.spawn();
      lastHandle().simulateExit(0);
      await expect(manager.send(info.id, 'test\n')).rejects.toThrow(/has exited/);
    });

    it('respects max wait timeout', async () => {
      const { info } = manager.spawn();
      const start = Date.now();

      const interval = setInterval(() => {
        lastHandle().simulateData('data\r\n');
      }, 50);

      await manager.send(info.id, 'flood\n', 200, 500);
      clearInterval(interval);

      const elapsed = Date.now() - start;
      expect(elapsed).toBeLessThan(1500);
    });
  });

  describe('read', () => {
    it('returns current screen state', async () => {
      const { info } = manager.spawn();
      lastHandle().simulateData('prompt$ ');
      await new Promise((r) => setTimeout(r, 10));
      const state = manager.read(info.id);
      expect(state.screen).toContain('prompt$');
    });

    it('throws for unknown session ID', () => {
      expect(() => manager.read('nonexistent')).toThrow(/Session not found/);
    });
  });

  describe('resize', () => {
    it('resizes both handle and terminal', () => {
      const { info } = manager.spawn({ cols: 80, rows: 24 });
      manager.resize(info.id, 120, 40);
      expect(lastHandle().resize).toHaveBeenCalledWith(120, 40);
      const state = manager.read(info.id);
      expect(state.cols).toBe(120);
      expect(state.rows).toBe(40);
    });

    it('throws for dead sessions', () => {
      const { info } = manager.spawn();
      lastHandle().simulateExit(1);
      expect(() => manager.resize(info.id, 80, 24)).toThrow(/has exited/);
    });
  });

  describe('close', () => {
    it('kills the process and returns final state', async () => {
      const { info } = manager.spawn();
      lastHandle().simulateData('bye\r\n');
      await new Promise((r) => setTimeout(r, 10));
      const result = manager.close(info.id);
      expect(lastHandle().kill).toHaveBeenCalled();
      expect(result.screen).toContain('bye');
    });

    it('returns exit code for already-exited sessions', () => {
      const { info } = manager.spawn();
      lastHandle().simulateExit(42);
      const result = manager.close(info.id);
      expect(result.exitCode).toBe(42);
    });

    it('removes session from manager', () => {
      const { info } = manager.spawn();
      manager.close(info.id);
      expect(() => manager.read(info.id)).toThrow(/Session not found/);
    });
  });

  describe('list', () => {
    it('lists all active sessions', () => {
      manager.spawn({ command: 'bash' });
      manager.spawn({ command: 'python' });
      const list = manager.list();
      expect(list).toHaveLength(2);
      expect(list.map((s) => s.command)).toContain('bash');
      expect(list.map((s) => s.command)).toContain('python');
    });
  });

  describe('exit tracking', () => {
    it('marks session as dead on exit', () => {
      manager.spawn();
      expect(manager.list()[0].alive).toBe(true);
      lastHandle().simulateExit(0);
      expect(manager.list()[0].alive).toBe(false);
      expect(manager.list()[0].exitCode).toBe(0);
    });
  });

  describe('destroyAll', () => {
    it('cleans up all sessions', () => {
      manager.spawn();
      manager.spawn();
      expect(manager.list()).toHaveLength(2);
      manager.destroyAll();
      expect(manager.list()).toHaveLength(0);
    });
  });
});
