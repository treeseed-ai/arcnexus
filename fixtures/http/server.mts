import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
class HttpFixture {
  private server = createServer((request, response) => this.respond(request, response));
  start(): void {
    this.server.on('error', (error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
    this.server.listen(
      Number(process.env.ARCNEXUS_PORT ?? 0),
      process.env.ARCNEXUS_HOST ?? '127.0.0.1',
      () => this.announce(),
    );
    process.on('SIGTERM', () => this.server.close());
  }
  private respond(request: IncomingMessage, response: ServerResponse): void {
    response.setHeader('content-type', 'application/json');
    response.statusCode = request.url === '/health' ? 200 : 404;
    response.end(JSON.stringify({ status: request.url === '/health' ? 'ready' : 'missing' }));
  }
  private announce(): void {
    const address = this.server.address();
    if (!address || typeof address === 'string') throw new Error('Expected TCP listener');
    console.log(JSON.stringify({ arcnexusEndpoint: { host: '127.0.0.1', port: address.port } }));
  }
}
new HttpFixture().start();
