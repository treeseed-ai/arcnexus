/** Identifies a completed, scope-checked regression mismatch that permits specification correction. */
export class SpecificationValidationError extends Error {
  /** Retains the observed diagnostic separately from the stable progress failure identity. */
  constructor(
    readonly feedback: string,
    readonly identity: string,
  ) {
    super('Regression did not fail with the expected assertion');
    this.name = 'SpecificationValidationError';
  }
}
