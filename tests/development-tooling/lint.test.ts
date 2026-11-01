import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
class LintTests {
  integratedLintPermitsExplicitAnyWithoutTypeAwareConfiguration_1() {
    const result = lint('export const value: any = 1;\n');
    assert.equal(result.status, 0, result.stdout + result.stderr);
  }
  scenario_2(input: any, rule: any) {
    const result = lint(input);
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.ok(
      JSON.parse(result.stdout)[0].messages.some((message: any) => message.ruleId === rule),
    );
  }
  inlineSuppressionCannotDisableArchitecturalSizeRules_3() {
    const result = lint('/* eslint-disable max-lines */\n' + '// line\n'.repeat(501));
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.ok(
      JSON.parse(result.stdout)[0].messages.some((message: any) => message.ruleId === 'max-lines'),
    );
  }
}
const suite = new LintTests();

function lint(input: any): any {
  return spawnSync(
    process.execPath,
    [
      'node_modules/eslint/bin/eslint.js',
      '--stdin',
      '--stdin-filename',
      'src/development-tooling/example.ts',
      '--format',
      'json',
    ],
    { input, encoding: 'utf8' },
  );
}

test('integrated lint permits explicit any without type-aware configuration', () =>
  suite.integratedLintPermitsExplicitAnyWithoutTypeAwareConfiguration_1());

for (const [name, input, rule] of [
  [
    'function',
    'export function example() {\n' + '// line\n'.repeat(30) + '}\n',
    'max-lines-per-function',
  ],
  [
    'constructor',
    'export class Example {\nconstructor() {\n' + '// line\n'.repeat(30) + '}\n}\n',
    'max-lines-per-function',
  ],
  [
    'callback',
    'export const example = () => {\n' + '// line\n'.repeat(30) + '};\n',
    'max-lines-per-function',
  ],
  ['file', '// line\n'.repeat(501), 'max-lines'],
])
  test('integrated lint rejects oversized ' + name, () => suite.scenario_2(input, rule));

test('inline suppression cannot disable architectural size rules', () =>
  suite.inlineSuppressionCannotDisableArchitecturalSizeRules_3());
