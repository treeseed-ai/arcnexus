import { formatIdentity } from '../identity/index.mjs';
export function displayIdentity(id: string): string {
  return formatIdentity(id).id;
}
