import type { Component } from '../architecture/components.js';

export interface RetrievedOwner {
  id: string;
  score: number;
  reasons: string[];
}

const words = (text: string) => [...new Set(text.toLowerCase().match(/[a-z0-9]+/g) ?? [])];

/** Lexical retrieval proposes context, never execution authority. */
export class OwnerRetrieval {
  /** Retains the component catalog for lexical selection and relationship expansion. */
  constructor(private readonly catalog: Component[]) {}

  /** Returns a lexical shortlist with related and ancestor context for model assessment. */
  select(request: string): RetrievedOwner[] {
    const tokens = words(request);
    const scores = this.catalog
      .filter((c) => ['gateway', 'library', 'foundation', 'release'].includes(c.type))
      .map((c) => this.score(c, tokens))
      .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
    const selected = scores.filter((c) => c.score > 0).slice(0, 12);
    for (const match of [...selected]) this.expand(match, selected);
    return selected;
  }

  /** Ranks an owner using request terms and declared architectural metadata. */
  private score(component: Component, tokens: string[]): RetrievedOwner {
    const text = words(
      JSON.stringify([
        component.id,
        component.purpose,
        component.interfaces,
        component.allowedWritePaths,
        component.relatedIds,
      ]),
    );
    const matches = tokens.filter((token) => text.includes(token));
    return {
      id: component.id,
      score: matches.length,
      reasons: matches.map((token) => 'Lexical match: ' + token),
    };
  }

  /** Adds declared hierarchy and relationship context to the retrieved shortlist. */
  private expand(match: RetrievedOwner, selected: RetrievedOwner[]): void {
    const component = this.catalog.find((c) => c.id === match.id)!;
    for (const id of [
      ...(component.relatedIds ?? []),
      ...(component.parentId ? [component.parentId] : []),
    ]) {
      if (selected.some((c) => c.id === id)) continue;
      selected.push({ id, score: 0, reasons: ['Declared relationship from ' + component.id] });
    }
  }
}
