import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { registerSuite } from '../../../dist/library/testing/suite.js';

/** Exercises readability rules through the same ESLint program used by stewards. */
class ReadabilityTests {
  /** Returns diagnostics without changing the supplied source. */
  lint(input: string): any[] {
    const result = spawnSync(
      process.execPath,
      [
        'node_modules/eslint/bin/eslint.js',
        '--stdin',
        '--stdin-filename',
        'src/library/example/example.ts',
        '--format',
        'json',
      ],
      { input, encoding: 'utf8' },
    );
    assert.ok(result.status === 0 || result.status === 1, result.stderr);
    return JSON.parse(result.stdout)[0].messages;
  }

  /** Missing headers remain findings even when inline suppression is attempted. */
  headers(): void {
    const input =
      '/* eslint-disable arcnexus/documentation */\nexport class Example {\nrun() {}\n}\n';
    assert.equal(this.lint(input).filter((m) => m.ruleId === 'arcnexus/documentation').length, 2);
  }

  /** Separates imports, top-level declarations and neighboring methods. */
  spacing(): void {
    const input =
      "import 'node:fs';\n/** Coordinates work. */\nexport class Example {\n/** First action. */\nfirst() {}\n/** Second action. */\nsecond() {}\n}\nexport const value = 1;\n";
    assert.equal(this.lint(input).filter((m) => m.ruleId === 'arcnexus/spacing').length, 3);
  }

  /** Readable dynamic code is accepted without type-aware lint requirements. */
  readable(): void {
    const input =
      "import 'node:fs';\n\n/** Retains a dynamic adapter result. */\nexport class Example {\n/** Captures the supplied result without conversion. */\nconstructor(readonly value: any) {}\n\n/** Returns the captured result unchanged. */\nread() { return this.value; }\n}\n";
    assert.deepEqual(this.lint(input), []);
  }
}

const suite = new ReadabilityTests();

test('readability requires unsuppressible class and method headers', () => suite.headers());

test('readability separates declarations and methods', () => suite.spacing());

test('readability accepts documented constructors and explicit any', () => suite.readable());

registerSuite({
  component: 'foundation',
  level: 'acceptance',
  tags: ['deterministic', 'readability'],
});
