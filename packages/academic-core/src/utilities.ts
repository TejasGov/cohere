import type { AcademicState, SourcePlatform } from './schema';

export function cleanText(value: string | null | undefined): string | undefined {
  const cleaned = value?.replace(/\s+/g, ' ').trim();
  return cleaned ? cleaned : undefined;
}

export function stableId(...parts: Array<string | null | undefined>): string {
  const input = parts.map((part) => cleanText(part)?.toLocaleLowerCase() ?? '').join('|');
  let hash = 2166136261;
  for (const character of input) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `academic-${(hash >>> 0).toString(36)}`;
}

export function emptyAcademicState(platform: SourcePlatform, url: URL, observedAt = new Date().toISOString()): AcademicState {
  return {
    sourcePlatform: platform,
    sourceUrl: url.href,
    lastObservedAt: observedAt,
    courses: [],
    assignments: [],
    exams: [],
    announcements: [],
    classMeetings: [],
    documents: [],
    policies: [],
    officeHours: [],
    conflicts: []
  };
}

export function deduplicateById<T extends { id: string }>(values: T[]): T[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    if (seen.has(value.id)) return false;
    seen.add(value.id);
    return true;
  });
}



