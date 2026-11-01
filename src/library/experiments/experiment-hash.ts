import { createHash } from 'node:crypto';

export const hash = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex');
