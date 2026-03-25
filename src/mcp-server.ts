import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { NodePtyBackend } from './backend.js';
import { SessionManager } from './session-manager.js';
import type { PtySpawnOptions } from './types.js';

const TOOLS = [
  {
    name: 'pty_spawn',
    description:
      'Create a new interactive PTY session. Returns session ID and initial screen state. ' +
      'Use for programs that need a real TTY (isatty()=true): ncurses apps, REPLs, interactive CLIs, ' +
      'programs that show progress bars or colored output only when connected to a terminal.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        command: { type: 'string', description: 'Command to run (default: user shell)' },
        args: { type: 'array', items: { type: 'string' }, description: 'Command arguments' },
        cols: { type: 'number', description: 'Terminal columns (default: 120)' },
        rows: { type: 'number', description: 'Terminal rows (default: 40)' },
        cwd: { type: 'string', description: 'Working directory (default: server cwd)' },
        env: {
          type: 'object',
          additionalProperties: { type: 'string' },
          description: 'Additional environment variables (merged with parent env)',
        },
      },
    },
  },
  {
    name: 'pty_send',
    description:
      'Send input to a PTY session and return screen state after output settles. ' +
      'Append \\n for Enter. Special keys: \\x03 Ctrl+C, \\x04 Ctrl+D (EOF), ' +
      '\\x1b Escape, \\t Tab, \\x1b[A/B/C/D arrow keys Up/Down/Right/Left.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        session_id: { type: 'string', description: 'Session ID from pty_spawn' },
        input: { type: 'string', description: 'Text/keystrokes to send' },
        wait_ms: {
          type: 'number',
          description: 'Quiescence delay ms — wait this long after last output before returning (default: 200)',
        },
        max_wait_ms: {
          type: 'number',
          description: 'Max total wait ms — returns whatever is on screen at timeout (default: 10000)',
        },
      },
      required: ['session_id', 'input'],
    },
  },
  {
    name: 'pty_read',
    description: 'Read current screen state of a PTY session without sending any input.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        session_id: { type: 'string', description: 'Session ID from pty_spawn' },
        scrollback: {
          type: 'number',
          description: 'Number of scrollback lines to include above viewport (default: 0)',
        },
      },
      required: ['session_id'],
    },
  },
  {
    name: 'pty_resize',
    description: 'Resize a PTY session terminal.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        session_id: { type: 'string', description: 'Session ID from pty_spawn' },
        cols: { type: 'number', description: 'New column count' },
        rows: { type: 'number', description: 'New row count' },
      },
      required: ['session_id', 'cols', 'rows'],
    },
  },
  {
    name: 'pty_close',
    description: 'Kill a PTY session and clean up. Returns final screen state and exit code.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        session_id: { type: 'string', description: 'Session ID from pty_spawn' },
      },
      required: ['session_id'],
    },
  },
];

export async function handleTool(
  name: string,
  args: Record<string, unknown>,
  manager: SessionManager,
): Promise<{ content: Array<{ type: 'text'; text: string }>; isError?: boolean }> {
  try {
    switch (name) {
      case 'pty_spawn': {
        const opts: PtySpawnOptions = {
          command: args.command as string | undefined,
          args: args.args as string[] | undefined,
          cols: args.cols as number | undefined,
          rows: args.rows as number | undefined,
          cwd: args.cwd as string | undefined,
          env: args.env as Record<string, string> | undefined,
        };
        const result = manager.spawn(opts);
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
      }

      case 'pty_send': {
        const state = await manager.send(
          args.session_id as string,
          args.input as string,
          (args.wait_ms as number) ?? 200,
          (args.max_wait_ms as number) ?? 10_000,
        );
        return { content: [{ type: 'text', text: JSON.stringify(state) }] };
      }

      case 'pty_read': {
        const state = manager.read(args.session_id as string, {
          scrollback: args.scrollback as number | undefined,
        });
        return { content: [{ type: 'text', text: JSON.stringify(state) }] };
      }

      case 'pty_resize': {
        manager.resize(args.session_id as string, args.cols as number, args.rows as number);
        return {
          content: [{ type: 'text', text: JSON.stringify({ ok: true, cols: args.cols, rows: args.rows }) }],
        };
      }

      case 'pty_close': {
        const result = manager.close(args.session_id as string);
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
      }

      default:
        return {
          content: [{ type: 'text', text: `Unknown tool: ${name}` }],
          isError: true,
        };
    }
  } catch (err) {
    return {
      content: [{ type: 'text', text: `PTY error: ${(err as Error).message}` }],
      isError: true,
    };
  }
}

export function createMcpServer(manager: SessionManager): Server {
  const server = new Server(
    { name: 'claude-telepty', version: '0.1.0' },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS,
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    return handleTool(request.params.name, request.params.arguments ?? {}, manager);
  });

  return server;
}

// ─── Main ─────────────────────────────────────────────────

const isMainModule =
  process.argv[1] &&
  (process.argv[1].endsWith('mcp-server.js') || process.argv[1].endsWith('mcp-server.ts'));

if (isMainModule) {
  (async () => {
    const maxSessions = parseInt(process.env.PTY_MAX_SESSIONS ?? '5', 10);
    const idleTimeout = parseInt(process.env.PTY_IDLE_TIMEOUT_MS ?? '600000', 10);

    const backend = new NodePtyBackend();
    const manager = new SessionManager(backend, { maxSessions, idleTimeout });

    const cleanup = () => {
      manager.destroyAll();
      process.exit(0);
    };
    process.on('SIGTERM', cleanup);
    process.on('SIGINT', cleanup);

    const server = createMcpServer(manager);
    const transport = new StdioServerTransport();
    await server.connect(transport);
  })().catch((err) => {
    console.error('PTY MCP server error:', err);
    process.exit(1);
  });
}
