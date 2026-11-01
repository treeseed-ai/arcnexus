import { targetEnvironment } from '../architecture/bindings.js';
import type { RecordData } from '../workspace/state.js';
export function operationEnvironment(record: RecordData): NodeJS.ProcessEnv {
  const target = targetEnvironment(record),
    env: NodeJS.ProcessEnv = {};
  for (const key of ['PATH', 'LANG', 'LC_ALL', 'TZ', 'TMPDIR', 'SSL_CERT_FILE', 'SSL_CERT_DIR'])
    if (target[key]) env[key] = target[key];
  return env;
}
