import { emptyAcademicState, type AcademicState, type Course, type DocumentReference } from '@academic/core';
import { extractDocumentFacts } from './fact-extractor';
import { extractPdfText, type PdfTextResult } from './pdf-text';
import { safeDocumentUrl } from './classification';

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
  if (parsed.username || parsed.password || parsed.protocol !== 'https:' || parsed.hostname !== 'ublearns.buffalo.edu' || !(parsed.pathname.startsWith('/d2l/') || parsed.pathname.startsWith('/content/enforced/'))) throw new Error('outside_authorized_scope');
  const response = await fetch(parsed.href, { credentials: 'include', redirect: 'manual', signal: AbortSignal.timeout(20000) });
  if (response.type === 'opaqueredirect' || (response.status >= 300 && response.status < 400)) throw new Error('redirect_rejected');
  if (!response.ok) throw new Error('http_' + response.status);
  const bytes = await response.arrayBuffer();
  if (!bytes.byteLength) throw new Error('empty_response');
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
    const processing = { classificationResult: document.documentType, fetchStatus: 'pending' as 'pending' | 'success' | 'failed', extractionStatus: 'pending', textCharacterCount: 0, factCount: 0, ...document.processing };
    const observed = { ...document, processing };
    const finish = (state: AcademicState, extractionStatus: string, textLength = 0): AcademicState => {
      Object.assign(processing, {
        extractionStatus, textCharacterCount: textLength,
        assignmentsFound: state.assignments.length, examsFound: state.exams.length,
        gradingPoliciesFound: state.policies.filter((item) => item.policyType === 'grading').length,
        attendancePoliciesFound: state.policies.filter((item) => item.policyType === 'attendance').length,
        officeHoursFound: state.officeHours.length, classMeetingsFound: state.classMeetings.length,
        factCount: state.assignments.length + state.exams.length + state.policies.length + state.officeHours.length + state.classMeetings.length
      });
      state.documents = state.documents.map((item) => ({ ...item, processing: { ...processing } }));
      return state;
    };
    try {
      let fetched = await this.fetcher(document.sourceUrl);
      // Follow at most one explicitly embedded/downloadable resource from a classified topic.
      // This uses the actual document attribute; it never synthesizes Brightspace endpoints.
      if (fetched.contentType.toLowerCase().includes('html')) {
        const wrapper = new DOMParser().parseFromString(new TextDecoder().decode(fetched.bytes), 'text/html');
        if (wrapper.querySelector('input[type="password"]')) throw new Error('authentication_navigation_failure');
        const resource = wrapper.querySelector('embed[src], object[data], iframe[src], a[download][href]');
        const href = resource?.getAttribute('src') ?? resource?.getAttribute('data') ?? resource?.getAttribute('href');
        const resolved = href ? safeDocumentUrl(href, new URL(document.sourceUrl)) : undefined;
        if (resolved && resolved.href !== document.sourceUrl) {
          processing.resolvedSourceUrl = resolved.href;
          fetched = await this.fetcher(resolved.href);
        }
      }
      processing.fetchStatus = 'success';
      processing.mimeType = fetched.contentType.split(';')[0]?.toLowerCase();
      const signal = fetched.signal ?? await digest(fetched.bytes);
      const key = `academic-document:v2:${document.id}`;
      const cached = await this.cache.get(key);
      if (cached?.signal === signal) {
        return { ...cached.state, documents: cached.state.documents.map((item) => ({ ...item, textExtractionStatus: 'cached' })) };
      }
      const signature = new TextDecoder().decode(fetched.bytes.slice(0, 5));
      const isPdf = fetched.contentType.toLowerCase().includes('application/pdf') || signature === '%PDF-';
      if (!isPdf) {
        if (fetched.contentType.includes('html')) {
          const parsed = new DOMParser().parseFromString(new TextDecoder().decode(fetched.bytes), 'text/html');
          if (parsed.querySelector('input[type="password"]')) throw new Error('authentication_navigation_failure');
          parsed.querySelectorAll('script, style, noscript, input, textarea, select, nav, header, footer, [hidden], [aria-hidden="true"]').forEach((element) => element.remove());
          parsed.querySelectorAll('p, div, li, tr, h1, h2, h3, br').forEach((element) => element.append('\n'));
          const text = parsed.body?.textContent ?? '';
          const state = finish(extractDocumentFacts(text, observed, course), 'html_success', text.length);
          await this.cache.set(key, { signal, state });
          return state;
        }
        const state = emptyAcademicState('ub-brightspace', new URL(document.sourceUrl), document.lastObservedAt);
        processing.failureReason = 'unsupported_mime_type';
        state.documents.push({ ...observed, textExtractionStatus: 'unsupported' });
        finish(state, 'unsupported_mime_type');
        return state;
      }
      const result = await this.pdfExtractor(fetched.bytes, this.maximumPages);
      processing.pageCount = result.totalPages;
      processing.truncated = result.truncated;
      if (result.status !== 'complete') {
        const state = emptyAcademicState('ub-brightspace', new URL(document.sourceUrl), document.lastObservedAt);
        state.documents.push({ ...observed, textExtractionStatus: result.status });
        finish(state, result.status === 'unsupported_image_pdf' ? 'unsupported_image_pdf' : 'parse_error', result.text.length);
        return state;
      }
      const state = finish(extractDocumentFacts(result.text, observed, course), 'pdf_success', result.text.length);
      await this.cache.set(key, { signal, state });
      return state;
    } catch (error) {
      const reason = error instanceof Error ? error.message : '';
      processing.failureReason = /^(http_\d{3}|redirect_rejected|empty_response|authentication_navigation_failure|outside_authorized_scope)$/.test(reason) ? reason : 'network_or_processing_error';
      if (processing.fetchStatus !== 'success') processing.fetchStatus = 'failed';
      processing.extractionStatus = processing.fetchStatus === 'failed' ? 'fetch_error' : 'parse_error';
      const state = emptyAcademicState('ub-brightspace', new URL(document.sourceUrl), document.lastObservedAt);
      state.documents.push({ ...observed, textExtractionStatus: 'failed' });
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
  return { state, partial: documents.length > maximumDocuments || state.documents.some((item) => item.processing?.truncated || item.textExtractionStatus === 'failed') };
}



