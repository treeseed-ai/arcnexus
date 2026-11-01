import { chmodSync, mkdtempSync, rmSync } from 'node:fs';
import { createServer, type Socket } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface BridgeTool {
  name: string;
  description: string;
  inputSchema: { type: 'object'; [key: string]: unknown };
}
type ToolCall = (name: string, args: unknown) => Promise<unknown>;
interface Request {
  id: number;
  method: string;
  name?: string;
  args?: unknown;
}

export async function openBridge(
  tools: BridgeTool[],
  call: ToolCall,
  disconnect: () => void = () => {},
) {
  const bridge = new HostBridge(tools, call, disconnect);
  await bridge.listen();
  return { config: bridge.configuration(), close: () => bridge.close() };
}

class HostBridge {
  private readonly directory = mkdtempSync(join(tmpdir(), 'arcnexus-ipc-'));
  private readonly path = join(this.directory, 'host.sock');
  private readonly sockets = new Set<Socket>();
  private closing = false;
  private readonly server = createServer((socket) => this.connect(socket));

  constructor(
    private readonly tools: BridgeTool[],
    private readonly call: ToolCall,
    private readonly disconnect: () => void,
  ) {
    chmodSync(this.directory, 0o700);
  }

  async listen(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.server.once('error', reject);
      this.server.listen(this.path, resolve);
    });
    chmodSync(this.path, 0o600);
  }

  private connect(socket: Socket): void {
    this.sockets.add(socket);
    socket.on('close', () => {
      this.sockets.delete(socket);
      if (!this.closing) this.disconnect();
    });
    new BridgeConnection(socket, this.tools, this.call).listen();
  }

  configuration(): Record<string, unknown> {
    return {
      mcp_servers: {
        arcnexus: {
          default_tools_approval_mode: 'approve',
          command: process.execPath,
          args: [fileURLToPath(new URL('./bridge-client.js', import.meta.url)), this.path],
          startup_timeout_sec: 10,
          tool_timeout_sec: 125,
        },
      },
    };
  }

  async close(): Promise<void> {
    this.closing = true;
    for (const socket of this.sockets) socket.destroy();
    await new Promise<void>((resolve) => this.server.close(() => resolve()));
    rmSync(this.directory, { recursive: true, force: true });
  }
}

class BridgeConnection {
  private input = '';
  private busy = false;

  constructor(
    private readonly socket: Socket,
    private readonly tools: BridgeTool[],
    private readonly call: ToolCall,
  ) {}

  listen(): void {
    this.socket.on('error', () => {});
    this.socket.on('data', (data) => this.receive(data));
  }

  private receive(data: Buffer): void {
    this.input += data.toString();
    if (Buffer.byteLength(this.input) > 128 * 1024) {
      this.socket.destroy();
      return;
    }
    let boundary: number;
    while ((boundary = this.input.indexOf('\n')) >= 0) {
      const line = this.input.slice(0, boundary);
      this.input = this.input.slice(boundary + 1);
      void this.request(line);
    }
  }

  private async request(line: string): Promise<void> {
    let acquired = false;
    let request: Request | undefined;
    try {
      request = JSON.parse(line);
      if (!request || !Number.isSafeInteger(request.id)) throw new Error('Invalid bridge request');
      if (this.busy) throw new Error('Concurrent bridge request denied');
      this.busy = true;
      acquired = true;
      const dispatched = this.dispatch(request);
      const result = dispatched instanceof Promise ? await dispatched : dispatched;
      this.socket.write(JSON.stringify({ id: request.id, result }) + '\n');
    } catch (error) {
      this.socket.write(JSON.stringify({ id: request?.id, error: String(error) }) + '\n');
    } finally {
      if (acquired) this.busy = false;
    }
  }

  private dispatch(request: Request): Promise<unknown> | BridgeTool[] {
    if (request.method === 'list') return this.tools;
    if (request.method === 'call' && this.tools.some((tool) => tool.name === request.name))
      return this.call(request.name!, request.args);
    throw new Error('Unknown bridge request');
  }
}
