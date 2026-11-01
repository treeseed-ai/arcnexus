import assert from 'node:assert/strict';
import { test } from 'node:test';
import { diagnosticExcerpt } from '../../../../dist/library/operations/diagnostics.js';
import { registerSuite } from '../../../../dist/library/testing/suite.js';

/** Checks byte bounds and retained context independently of the CLI scenarios. */
class DiagnosticTests {
  /** Small output remains unchanged, including Unicode diagnostic text. */
  small(): void {
    const text = 'Error: résumé unavailable\n';
    assert.deepEqual(diagnosticExcerpt(Buffer.from(text)), { output: text, truncated: false });
  }

  /** An interior failure survives both a long prefix and a long suffix. */
  interior(): void {
    const input = Buffer.from(
      'Error: expected fixture diagnostic\n' +
        'ok\n'.repeat(12000) +
        'not ok 77 - IMPORTANT_FAILURE\n' +
        'later\n'.repeat(12000) +
        'END_SUMMARY',
    );
    const result = diagnosticExcerpt(input);
    assert.match(result.output, /IMPORTANT_FAILURE/);
    assert.match(result.output, /END_SUMMARY/);
    assert.ok(Buffer.byteLength(result.output) <= 16384);
    assert.equal(result.truncated, true);
  }

  /** Invalid or multibyte output cannot expand beyond the model-facing byte limit. */
  bytes(): void {
    for (const input of [Buffer.alloc(16000, 255), Buffer.from('🧪'.repeat(20000))])
      assert.ok(Buffer.byteLength(diagnosticExcerpt(input).output) <= 16384);
  }
}

const suite = new DiagnosticTests();

test('diagnostics preserve small output', () => suite.small());

test('diagnostics retain interior failure and final summary', () => suite.interior());

test('diagnostics respect UTF-8 output bounds', () => suite.bytes());

registerSuite({ component: 'operations', level: 'unit', tags: ['deterministic', 'diagnostics'] });
