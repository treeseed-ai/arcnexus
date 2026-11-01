import { readFileSync } from 'node:fs';

const limit = 16384;

/** Selects bounded context around a potential diagnostic while preserving the raw log separately. */
export function diagnosticExcerpt(content: Buffer): { output: string; truncated: boolean } {
  const text = content.toString('utf8');
  const truncated = Buffer.byteLength(text) > limit;
  const selected = truncated ? diagnosticWindows(content, text) : text;
  // Leave room for UTF-8 replacement when a byte window ends inside a code point.
  const output =
    Buffer.byteLength(selected) <= limit
      ? selected
      : Buffer.from(selected)
          .subarray(0, limit - 3)
          .toString('utf8');
  return { output, truncated };
}

/** Reads retained command evidence without changing its original bytes. */
export function readDiagnosticExcerpt(path: string): { output: string; truncated: boolean } {
  return diagnosticExcerpt(readFileSync(path));
}

/** Keeps startup context, a diagnostic window and the final summary for long output. */
function diagnosticWindows(content: Buffer, text: string): string {
  const marker =
    /^not ok\b/m.exec(text) ??
    /^(?:.*\berror TS\d+|(?:Assertion)?Error:|\[error\]|\[warn\])/m.exec(text);
  const offset = marker ? Buffer.byteLength(text.slice(0, marker.index)) : content.length - 8192;
  const start = Math.max(0, offset - 256);
  return [
    content.subarray(0, 2048).toString('utf8'),
    '\n[... output omitted; diagnostic window follows ...]\n',
    content.subarray(start, start + 8192).toString('utf8'),
    '\n[... trailing output; full log retained separately ...]\n',
    content.subarray(-4096).toString('utf8'),
  ].join('');
}
