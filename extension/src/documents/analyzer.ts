import { emptyAcademicState, type AcademicState, type Course, type DocumentReference } from '@academic/core';
import { extractDocumentFacts } from './fact-extractor';
import { extractPdfText, type PdfTextResult } from './pdf-text';

export interface CacheEntry { signal: string; state: AcademicState; }
export interface DocumentCache {
  get(key: string): Promise<CacheEntry | undefined>;
  set(key: string, value: CacheEntry): Promise<void>;
}
export class ChromeDocumentCache implements DocumentCache {
  async get(key: string): Promise<CacheEntry | undefined> {
    return (await chrome.storage.local.get(key))[key] as CacheEntry | undefined;
  }
  async set(key: string, value: CacheEntry): Promise<void> { await chrome.storage.local.set({ [key]: value }); }
}
export interface DocumentFetchResult { bytes: ArrayBuffer; contentType: string; signal?: string; }
export type DocumentFetcher = (url: string) => Promise<DocumentFetchResult>;
export type PdfExtractor = (bytes: ArrayBuffer, maximumPages: number) => Promise<PdfTextResult>;

async function digest(bytes: ArrayBuffer): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(hash)].map((part) => part.toString(16).padStart(2, '0')).join('');
}
export const browserDocumentFetcher: DocumentFetcher = async (url) => {
  const parsed = new URL(url);
  if (parsed.hostname !== 'ublearns.buffalo.edu' || !(parsed.pathname.startsWith('/d2l/') || parsed.pathname.startsWith('/content/enforced/'))) throw new Error('Document URL is outside UB Learns');
  const response = await fetch(parsed.href, { credentials: 'include', redirect: 'follow' });
  if (!response.ok) throw new Error('Document request failed');
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength > 15 * 1024 * 1024) throw new Error('Document exceeds local processing limit');
  return {
    bytes, contentType: response.headers.get('content-type') ?? '',
    signal: response.headers.get('etag') ?? response.headers.get('last-modified') ?? undefined
  };
};

export class DocumentAnalyzer {
  constructor(
    private readonly cache: DocumentCache = new ChromeDocumentCache(),
    private readonly fetcher: DocumentFetcher = browserDocumentFetcher,
    private readonly pdfExtractor: PdfExtractor = extractPdfText,
    private readonly maximumPages = 40
  ) {}

  async analyze(document: DocumentReference, course: Course): Promise<AcademicState> {
    try {
      const fetched = await this.fetcher(document.sourceUrl);
      const signal = fetched.signal ?? await digest(fetched.bytes);
      const key = `academic-document:${document.id}`;
      const cached = await this.cache.get(key);
      if (cached?.signal === signal) {
        return { ...cached.state, documents: cached.state.documents.map((item) => ({ ...item, textExtractionStatus: 'cached' })) };
      }
      const isPdf = fetched.contentType.includes('pdf') || document.mimeType === 'application/pdf' || document.sourceUrl.toLowerCase().includes('.pdf');
      if (!isPdf) {
        if (fetched.contentType.includes('html')) {
          const parsed = new DOMParser().parseFromString(new TextDecoder().decode(fetched.bytes), 'text/html');
          parsed.querySelectorAll('script, style, noscript, input, textarea, select, [hidden], [aria-hidden="true"]').forEach((element) => element.remove());
          return extractDocumentFacts(parsed.body?.textContent ?? '', document, course);
        }
        const state = emptyAcademicState('ub-brightspace', new URL(document.sourceUrl), document.lastObservedAt);
        state.documents.push({ ...document, textExtractionStatus: 'unsupported' });
        return state;
      }
      const result = await this.pdfExtractor(fetched.bytes, this.maximumPages);
      if (result.status !== 'complete') {
        const state = emptyAcademicState('ub-brightspace', new URL(document.sourceUrl), document.lastObservedAt);
        state.documents.push({ ...document, textExtractionStatus: result.status });
        return state;
      }
      const state = extractDocumentFacts(result.text, document, course);
      await this.cache.set(key, { signal, state });
      return state;
    } catch {
      const state = emptyAcademicState('ub-brightspace', new URL(document.sourceUrl), document.lastObservedAt);
      state.documents.push({ ...document, textExtractionStatus: 'failed' });
      return state;
    }
  }
}

export interface ProcessedDocuments { state: AcademicState; partial: boolean; }
export async function processDocuments(
  documents: DocumentReference[], course: Course, analyzer: Pick<DocumentAnalyzer, 'analyze'>, maximumDocuments = 10
): Promise<ProcessedDocuments> {
  let state = emptyAcademicState('ub-brightspace', new URL(course.sourceUrl), course.lastObservedAt);
  const selected = documents.slice(0, maximumDocuments);
  for (const document of selected) {
    const result = await analyzer.analyze(document, course);
    state = {
      ...state, lastObservedAt: result.lastObservedAt,
      courses: [...state.courses, ...result.courses], assignments: [...state.assignments, ...result.assignments],
      exams: [...state.exams, ...result.exams], announcements: [...state.announcements, ...result.announcements],
      classMeetings: [...state.classMeetings, ...result.classMeetings], documents: [...state.documents, ...result.documents],
      policies: [...state.policies, ...result.policies], officeHours: [...state.officeHours, ...result.officeHours],
      conflicts: [...state.conflicts, ...result.conflicts]
    };
  }
  return { state, partial: documents.length > maximumDocuments };
}



