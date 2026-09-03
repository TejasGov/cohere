import type { AcademicState } from '@academic/core';
import { adapterRegistry } from './adapters/registry';

/** Detects one supported page and returns only values parsed from its visible DOM. */
export function extractAcademicState(documentRoot: Document, rawUrl: string): AcademicState {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    url = new URL('about:blank');
  }
  return adapterRegistry.extract(documentRoot, url);
}
