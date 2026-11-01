import ts from 'typescript';
import type { SuiteMetadata } from './suite.js';
import { InputError } from '../architecture/config.js';

/** Reads literal registration data without importing or executing a test module. */
export class SuiteMetadataReader {
  /** Loads the requested content through this component boundary. */
  read(path: string, text: string): SuiteMetadata {
    const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
    const registrations = source.statements.filter(
      (statement) =>
        ts.isExpressionStatement(statement) &&
        ts.isCallExpression(statement.expression) &&
        statement.expression.expression.getText(source) === 'registerSuite',
    );
    if (registrations.length !== 1) throw new InputError(`${path}: expected one registerSuite`);
    const call = (registrations[0] as ts.ExpressionStatement).expression as ts.CallExpression;
    if (call.arguments.length !== 1)
      throw new InputError(`${path}: expected literal suite metadata`);
    const value = this.literal(call.arguments[0]!) as SuiteMetadata;
    if (
      !value ||
      typeof value.component !== 'string' ||
      !value.component ||
      !['unit', 'integration', 'acceptance'].includes(value.level) ||
      (value.tags !== undefined &&
        (!Array.isArray(value.tags) || value.tags.some((tag) => typeof tag !== 'string')))
    )
      throw new InputError(`${path}: invalid suite metadata`);
    return value;
  }

  /** Reads only supported literal metadata without evaluating the module. */
  private literal(node: ts.Node): unknown {
    if (ts.isStringLiteral(node)) return node.text;
    if (ts.isArrayLiteralExpression(node)) return node.elements.map((item) => this.literal(item));
    if (!ts.isObjectLiteralExpression(node)) throw new InputError('Suite metadata must be literal');
    const result: Record<string, unknown> = {};
    for (const property of node.properties) {
      if (
        !ts.isPropertyAssignment(property) ||
        (!ts.isIdentifier(property.name) && !ts.isStringLiteral(property.name))
      )
        throw new InputError('Suite metadata requires literal properties');
      const key = property.name.text;
      if (Object.hasOwn(result, key) || !['component', 'level', 'tags'].includes(key))
        throw new InputError(`Invalid suite metadata property: ${key}`);
      result[key] = this.literal(property.initializer);
    }
    return result;
  }
}
