import assert from 'node:assert/strict';

/** Checks the actual SDK response schema against the provider's closed-object requirements. */
export class StructuredOutputCheck {
  /** Recurses through definitions and alternatives; this is schema validation, not model-output validation. */
  inspect(value: any, path = '$'): void {
    if (Array.isArray(value)) {
      value.forEach((entry, index) => this.inspect(entry, path + '.' + index));
      return;
    }
    if (!value || typeof value !== 'object') return;
    if (value.properties || value.type === 'object') {
      assert.equal(value.additionalProperties, false, path + ' must be closed');
      assert.deepEqual(
        [...(value.required ?? [])].sort(),
        Object.keys(value.properties ?? {}).sort(),
        path + ' must require every declared property; optional content must be nullable',
      );
    }
    for (const [key, entry] of Object.entries(value)) this.inspect(entry, path + '.' + key);
  }
}
