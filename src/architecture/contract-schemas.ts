import type { AnySchemaObject } from 'ajv';
import { Ajv2020 } from 'ajv/dist/2020.js';

/** Checks target schema contracts in an isolated registry with no network resolver. */
export function validateContractSchemas(schemas: unknown[]): void {
  const validator = new Ajv2020({ strict: true, allErrors: true });
  for (const schema of schemas) {
    if (
      !schema ||
      typeof schema !== 'object' ||
      !('$id' in schema) ||
      typeof schema.$id !== 'string'
    )
      throw new Error('Schema contracts require a stable $id');
    validator.addSchema(schema as AnySchemaObject);
  }
  for (const schema of schemas as Array<{ $id: string }>) validator.getSchema(schema.$id);
}
