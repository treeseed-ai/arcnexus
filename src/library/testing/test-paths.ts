import { posix } from 'node:path';
import type { Component } from '../architecture/components.js';
import { relativePath } from '../architecture/config.js';

/** Maps a supported package test path to its captured Node profile output without caller path substitution. */
export function compiledTestPath(component: Component, source: string, outputRoot: string): string {
  relativePath(source);
  relativePath(outputRoot);
  const root =
    posix.join(component.schemaVersion === 5 ? component.repositoryRoot! : '.', 'tests') + '/';
  if (!source.startsWith(root) || !source.endsWith('.test.ts'))
    throw new Error(`Unsupported test source root or extension: ${source}`);
  return posix.join(outputRoot, source.slice(root.length).replace(/\.ts$/, '.js'));
}
