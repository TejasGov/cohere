import { emptyAcademicState, type AcademicAdapter, type AcademicState } from '@academic/core';
import { BlackboardAdapter } from './blackboard';
import { BrightspaceAdapter } from './brightspace';
import { UniversityPortalAdapter } from './university-portal';
import { RealBrightspaceAdapter } from './real-brightspace';

export class AdapterRegistry {
  constructor(private readonly adapters: readonly AcademicAdapter[]) {}

  detect(document: Document, url: URL): AcademicAdapter | undefined {
    return this.adapters.find((adapter) => {
      try {
        return adapter.canHandle(document, url);
      } catch {
        return false;
      }
    });
  }

  extract(document: Document, url: URL): AcademicState {
    const adapter = this.detect(document, url);
    if (!adapter) return emptyAcademicState('unknown', url);
    try {
      return adapter.extract(document, url);
    } catch {
      return emptyAcademicState(adapter.id, url);
    }
  }
}

export const adapterRegistry = new AdapterRegistry([
  new RealBrightspaceAdapter(),
  new BrightspaceAdapter(),
  new BlackboardAdapter(),
  new UniversityPortalAdapter()
]);
