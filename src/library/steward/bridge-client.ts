import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { connect } from 'node:net';
import type { BridgeTool } from './bridge.js';

/** Forwards constrained MCP requests to the private parent-owned operation connection. */
class BridgeClient {
  private readonly socket = connect(process.argv[2]!);

  private sequence = 0;

  private input = '';

  private readonly pending = new Map<
    number,
    { resolve: (v: unknown) => void; reject: (e: Error) => void }
  >();

  private readonly server = new Server(
    { name: 'arcnexus', version: '0.1.0' },
    { capabilities: { tools: {} } },
  );

  /** Executes this lifecycle through its configured collaborators and propagates failures. */
  async run(): Promise<void> {
    this.socket.on('data', (data) => this.receive(data));
    this.socket.on('error', () => {});
    this.socket.on('close', () => this.disconnected());
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: (await this.request('list')) as BridgeTool[],
    }));
    this.server.setRequestHandler(CallToolRequestSchema, async (req) =>
      this.call(req.params.name, req.params.arguments),
    );
    await this.server.connect(new StdioServerTransport());
    process.stdin.on('end', () => {
      this.socket.end();
      void this.server.close();
    });
  }

  /** Sends one correlated request over the private parent connection. */
  private request(method: string, name?: string, args?: unknown): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const id = ++this.sequence;
      this.pending.set(id, { resolve, reject });
      this.socket.write(JSON.stringify({ id, method, name, args }) + '\n');
    });
  }

  /** Buffers incoming bytes until complete response frames are available. */
  private receive(data: Buffer): void {
    this.input += data.toString();
    if (Buffer.byteLength(this.input) > 256 * 1024) {
      this.socket.destroy();
      return;
    }
    let end: number;
    while ((end = this.input.indexOf('\n')) >= 0) {
      const line = this.input.slice(0, end);
      this.input = this.input.slice(end + 1);
      this.message(line);
    }
  }

  /** Resolves the pending call associated with one received response. */
  private message(line: string): void {
    try {
      const message = JSON.parse(line);
      const waiting = this.pending.get(message.id);
      this.pending.delete(message.id);
      if (message.error) waiting?.reject(new Error(message.error));
      else waiting?.resolve(message.result);
    } catch {
      this.socket.destroy();
    }
  }

  /** Rejects pending requests when the parent connection is lost. */
  private disconnected(): void {
    for (const pending of this.pending.values())
      pending.reject(new Error('ArcNexus host disconnected'));
    process.exitCode = 1;
    void this.server.close();
    process.stdin.destroy();
  }

  /** Invokes the named host capability through the constrained bridge protocol. */
  private async call(name: string, args: unknown) {
    try {
      const result = await this.request('call', name, args);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
    } catch (error) {
      return { isError: true, content: [{ type: 'text' as const, text: String(error) }] };
    }
  }
}

await new BridgeClient().run();
