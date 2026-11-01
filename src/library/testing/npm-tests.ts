import { ComponentTesting } from './testing.js';

/** Delegates npm's already-built production artifact to the shared test service. */
async function main(): Promise<void> {
  const controller = new AbortController();
  const cancel = () => controller.abort(new Error('Cancelled'));
  process.on('SIGINT', cancel);
  process.on('SIGTERM', cancel);
  try {
    const service = new ComponentTesting();
    const selection = service.inspect(process.cwd(), { component: process.argv[2] });
    const result = await service.run(selection, controller.signal, true);
    console.log(JSON.stringify(result));
    process.exitCode = result.exitCode;
  } catch (error) {
    console.error(String(error));
    process.exitCode = controller.signal.aborted ? 130 : 2;
  } finally {
    process.off('SIGINT', cancel);
    process.off('SIGTERM', cancel);
  }
}

await main();
