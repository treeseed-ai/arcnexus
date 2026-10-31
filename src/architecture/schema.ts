import { Ajv2020 } from 'ajv/dist/2020.js';
import { readFileSync } from 'node:fs';

const ajv = new Ajv2020({ strict: true, allErrors: true });
const validators = new Map<string, ReturnType<typeof ajv.compile>>();
export function validateSchema<T>(name: string, value: unknown): T {
  let validate = validators.get(name);
  if (!validate) {
    validate = ajv.compile(JSON.parse(readFileSync(new URL(`../../schemas/${name}.json`, import.meta.url), 'utf8')));
    validators.set(name, validate);
  }
  if (!validate(value)) throw new Error(`Invalid ${name}: ${ajv.errorsText(validate.errors)}`);
  return value as T;
}
