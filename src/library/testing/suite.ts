export interface SuiteMetadata {
  component: string;
  level: 'unit' | 'integration' | 'acceptance';
  tags?: string[];
}

/** Declares static suite identity without changing Node's test lifecycle. */
export function registerSuite(metadata: SuiteMetadata): Readonly<SuiteMetadata> {
  return Object.freeze({
    ...metadata,
    tags: Object.freeze([...(metadata.tags ?? [])]) as string[],
  });
}
