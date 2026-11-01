export interface VerificationResult {
  status: 'completed' | 'blocked' | 'failed';
  summary: string;
  criteria: Array<{
    index: number;
    verdict: 'verified' | 'gap';
    evidence: string[];
    explanation: string;
  }>;
  deficiencies: string[];
}

/** Carries independent and host-detected deficiencies without authorizing weaker acceptance. */
export class VerificationIssue extends Error {
  /** Retains the indexed assessment so the same assignment can address the actual gaps. */
  constructor(readonly result: VerificationResult) {
    super('Independent verification needs attention: ' + JSON.stringify(result));
  }
}

/** Enforces explicit coverage of immutable owner criteria and the original external goal. */
export class VerificationAssessment {
  /** Builds indexed criteria from host-retained assignments rather than model-written completion claims. */
  criteria(objective: string, evidence: unknown, goal: boolean): string[] {
    if (goal) {
      const assignments = Array.isArray(evidence) ? evidence : [];
      return [objective, ...assignments.flatMap((assignment) => assignment.acceptance ?? [])];
    }
    const criteria = (evidence as { criteria?: string[] } | undefined)?.criteria;
    return criteria?.length ? criteria : [objective];
  }

  /** Rejects omitted, duplicate, unknown or unsupported criteria even when the model says completed. */
  validate(result: VerificationResult, criteria: string[]): void {
    const deficiencies = [...result.deficiencies];
    for (const [index, criterion] of criteria.entries()) {
      const matching = result.criteria.filter((item) => item.index === index);
      if (matching.length !== 1)
        deficiencies.push(`Criterion ${index} requires exactly one assessment: ${criterion}`);
      else if (matching[0]!.verdict !== 'verified' || !matching[0]!.evidence.length)
        deficiencies.push(`Criterion ${index} lacks supporting verified evidence: ${criterion}`);
    }
    if (result.criteria.some((item) => item.index < 0 || item.index >= criteria.length))
      deficiencies.push('Assessment references an unknown acceptance criterion');
    if (result.status !== 'completed' || deficiencies.length)
      throw new VerificationIssue({ ...result, deficiencies });
  }
}
