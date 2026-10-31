import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { connect } from 'node:net';
import type { BridgeTool } from './bridge.js';
const socket = connect(process.argv[2]!);
let sequence = 0,
  input = '';
const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
const request = (method: string, name?: string, args?: unknown) =>
  new Promise<unknown>((resolve, reject) => {
    const id = ++sequence;
    pending.set(id, { resolve, reject });
    socket.write(JSON.stringify({ id, method, name, args }) + '\n');
  });
socket.on('data', (data) => {
  input += data.toString();
  if (Buffer.byteLength(input) > 256 * 1024) {
    socket.destroy();
    return;
  }
  let end: number;
  while ((end = input.indexOf('\n')) >= 0) {
    const line = input.slice(0, end);
    input = input.slice(end + 1);
    try {
      const message = JSON.parse(line);
      const waiting = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) waiting?.reject(new Error(message.error));
      else waiting?.resolve(message.result);
    } catch {
      socket.destroy();
    }
  }
});
socket.on('error', () => {});
socket.on('close', () => {
  for (const p of pending.values()) p.reject(new Error('ArcNexus host disconnected'));
  process.exitCode = 1;
  void server.close();
  process.stdin.destroy();
});
const server = new Server({ name: 'arcnexus', version: '0.1.0' }, { capabilities: { tools: {} } });
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: (await request('list')) as BridgeTool[],
}));
server.setRequestHandler(CallToolRequestSchema, async (req) => {
  try {
    const result = await request('call', req.params.name, req.params.arguments);
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  } catch (error) {
    return { isError: true, content: [{ type: 'text', text: String(error) }] };
  }
});
const transport = new StdioServerTransport();
await server.connect(transport);
process.stdin.on('end', () => {
  socket.end();
  void server.close();
});
