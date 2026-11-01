import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { createHash } from 'node:crypto';
import { appendFileSync } from 'node:fs';

/** Inspects captured verification artifacts through the actual SDK-configured MCP boundary. */
export class ControlledEvidence {
  /** Retains a test-owned trace outside the editable candidate. */
  constructor(private readonly trace: string) {}

  /** Reads all advertised evidence pages without using native Git or arbitrary host paths. */
  async inspect(args: string[], forbidden: boolean): Promise<void> {
    const option = (key: string) =>
      JSON.parse(
        args
          .find((arg) => arg.startsWith('mcp_servers.arcnexus.' + key + '='))!
          .split('=')
          .slice(1)
          .join('='),
      );
    const client = new Client({ name: 'controlled-verifier', version: '1' }, { capabilities: {} });
    try {
      await client.connect(
        new StdioClientTransport({ command: option('command'), args: option('args') }),
      );
      if (forbidden) {
        await this.read(client, '../report.json');
        return;
      }
      const manifest = JSON.parse(await this.read(client, 'manifest'));
      const artifacts: Record<string, string> = {};
      for (const artifact of manifest.artifacts)
        artifacts[artifact.id] = await this.read(client, artifact.id);
      appendFileSync(this.trace + '.evidence', JSON.stringify({ manifest, artifacts }) + '\n');
    } finally {
      await client.close();
    }
  }

  /** Follows explicit page offsets until the host reports complete evidence, retaining all content. */
  private async read(client: Client, artifact: string): Promise<string> {
    let offset = 0;
    let text = '';
    while (true) {
      const reply: any = await client.callTool({
        name: 'verification.evidence',
        arguments: { artifact, offset, length: 64 },
      });
      if (reply.isError) throw new Error(reply.content[0].text);
      const page = JSON.parse(reply.content[0].text);
      if (page.offset !== offset || (page.nextOffset <= offset && !page.complete))
        throw new Error('Evidence paging lost progress');
      text += page.content;
      if (page.complete) {
        if (
          page.totalCharacters !== text.length ||
          createHash('sha256').update(text).digest('hex') !== page.sha256
        )
          throw new Error('Evidence content differs from pinned artifact');
        return text;
      }
      offset = page.nextOffset;
    }
  }
}
