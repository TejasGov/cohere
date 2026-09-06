import { describe, expect, it, vi, afterEach } from 'vitest';
import { emptyAcademicState, type Course } from '@academic/core';
import fixture from './fixtures/brightspace-content.html?raw';
import topicFixture from '../semester/fixtures/syllabus-topic.html?raw';
import { discoverDocumentCandidates, discoverTargetDocuments, classifyDocumentTitle } from './classification';
import { DocumentAnalyzer, browserDocumentFetcher, processDocuments } from './analyzer';
import { SemesterCollector } from '../semester/collector';
import { discoverAcademicTargets } from '../semester/page-discovery';
import { extractDocumentFacts } from './fact-extractor';

const course: Course = { id: 'course-123', sourceId: '123', sourcePlatform: 'ub-brightspace', sourceUrl: 'https://ublearns.buffalo.edu/d2l/home/123', courseCode: 'CSE 341', lastObservedAt: '2026-09-05T10:00:00Z' };
const url = new URL('https://ublearns.buffalo.edu/d2l/le/content/123/Home');
const cache = { get: async () => undefined, set: async () => undefined };
function documents() { document.body.innerHTML = fixture; return discoverTargetDocuments(document, url, course); }
function firstDocument() { const first = documents()[0]; if (!first) throw new Error('Fixture missing target'); return first; }
afterEach(() => vi.unstubAllGlobals());

describe('real document pipeline regressions', () => {
  it('finds four target categories and ignores slides/readings and duplicate resources', () => {
    const docs = documents();
    expect(docs.map((item) => item.documentType)).toEqual(['syllabus', 'exam-schedule', 'assignment', 'course-policy']);
    expect(docs[0]?.sourceUrl).not.toContain('.pdf');
    const candidates = discoverDocumentCandidates(document, url);
    expect(candidates).toHaveLength(6);
    expect(candidates.filter((item) => item.classificationResult === 'ignored_non_target')).toHaveLength(2);
  });
  it.each(['Project 1', 'Project Guidelines', 'Midterm Information', 'Policies and Procedures'])('recognizes %s', (title) => expect(classifyDocumentTitle(title)).toBeDefined());
  it('follows observed Content links without generating endpoints', () => {
    document.body.innerHTML = '<a href="/d2l/le/content/123/Home">Content</a><a href="/d2l/le/content/123/999/View">Lecture 1</a>';
    expect(discoverAcademicTargets(document, new URL(course.sourceUrl))).toEqual([url.href]);
  });
  it.each([
    ['Readable introductory text without dates or policy statements.', 0],
    ['Homework 1 due September 18, 2026', 1]
  ])('reports readable PDFs separately from recognized facts', async (text, facts) => {
    const source = firstDocument();
    const analyze = new DocumentAnalyzer(cache, async () => ({ bytes: new ArrayBuffer(1), contentType: 'application/pdf', signal: 'v1' }), async () => ({ status: 'complete', text, pagesProcessed: 2, totalPages: 2, truncated: false }));
    const result = await analyze.analyze(source, course);
    expect(result.documents[0]?.processing).toMatchObject({ fetchStatus: 'success', extractionStatus: 'pdf_success', textCharacterCount: text.length, pageCount: 2, factCount: facts });
  });
  it('handles empty PDF text without aborting processing', async () => {
    const analyzer = new DocumentAnalyzer(cache, async () => ({ bytes: new ArrayBuffer(1), contentType: 'application/pdf', signal: 'v1' }), async () => ({ status: 'unsupported_image_pdf', text: '', pagesProcessed: 1, totalPages: 1, truncated: false }));
    expect((await analyzer.analyze(firstDocument(), course)).documents[0]?.processing).toMatchObject({ extractionStatus: 'unsupported_image_pdf', textCharacterCount: 0 });
  });
  it('isolates HTTP failure and continues with the next document', async () => {
    let count = 0;
    const analyzer = new DocumentAnalyzer(cache, async () => { if (++count === 1) throw new Error('http_403'); return { bytes: new ArrayBuffer(1), contentType: 'application/pdf', signal: 'v1' }; }, async () => ({ status: 'complete', text: 'Homework 1 due September 18, 2026', pagesProcessed: 1, totalPages: 1, truncated: false }));
    const result = await processDocuments(documents().slice(0, 2), course, analyzer);
    expect(result.state.documents[0]?.processing?.failureReason).toBe('http_403');
    expect(result.state.documents[1]?.processing?.factCount).toBe(1);
    expect(result.partial).toBe(true);
  });
  it('rejects redirect responses without following them', async () => {
    const fetcher = vi.fn(async () => ({ type: 'opaqueredirect', status: 0 }));
    vi.stubGlobal('fetch', fetcher);
    await expect(browserDocumentFetcher(firstDocument().sourceUrl)).rejects.toThrow('redirect_rejected');
    expect(fetcher.mock.calls).toHaveLength(1);
  });
  it('keeps navigation at depth two and passes authoritative course context', async () => {
    const calls: string[] = [];
    const home = emptyAcademicState('ub-brightspace', new URL(course.sourceUrl));
    home.courses = [course];
    const scanner = new SemesterCollector({ collect: async (href, context) => {
      calls.push(href);
      expect(context?.id).toBe(course.id);
      return { state: emptyAcademicState('ub-brightspace', new URL(href)), targets: [url.href + '/' + calls.length] };
    } });
    const scan = await scanner.scan(home);
    expect(calls).toHaveLength(3);
    expect(scan.courses[0]?.status).toBe('partial');
    expect(scan.courses[0]?.documentDiagnostics?.contentPagesVisited).toBe(2);
  });
  it('unwraps a single observed same-origin resource and detects PDF by signature', async () => {
    const fetched: string[] = [];
    const source = firstDocument();
    const analyzer = new DocumentAnalyzer(cache, async (href) => {
      fetched.push(href);
      const text = fetched.length === 1 ? topicFixture.replaceAll('34101', '123') : '%PDF-1.7';
      return { bytes: new TextEncoder().encode(text).buffer, contentType: fetched.length === 1 ? 'text/html' : 'application/octet-stream', signal: 'v2' };
    }, async (_bytes, limit) => {
      expect(limit).toBe(40);
      return { status: 'complete', text: 'Homework 1 due September 18, 2026', pagesProcessed: 40, totalPages: 50, truncated: true };
    });
    const result = await processDocuments([source], course, analyzer);
    expect(fetched).toHaveLength(2);
    expect(result.state.documents[0]?.processing?.resolvedSourceUrl).toBe('https://ublearns.buffalo.edu/content/enforced/123/CSE341-Syllabus');
    expect(result.partial).toBe(true);
  });
  it('caps Content navigation to eight pages per course', async () => {
    const home = emptyAcademicState('ub-brightspace', new URL(course.sourceUrl));
    home.courses = [course];
    const calls: string[] = [];
    const result = await new SemesterCollector({ collect: async (href) => {
      calls.push(href);
      return { state: emptyAcademicState('ub-brightspace', new URL(href)), targets: Array.from({ length: 8 }, (_, i) => url.href + '/' + calls.length + '/' + i) };
    } }).scan(home);
    expect(calls).toHaveLength(9);
    expect(result.courses[0]?.documentDiagnostics?.contentPagesVisited).toBe(8);
    expect(result.status).toBe('partial');
  });
  it('extracts grading and attendance examples without turning final reports into exams', () => {
    const state = extractDocumentFacts('Midterms: 40%\nFinal: 30%\nMore than 3 unexcused absences lowers the final grade.\nFinal report due December 1, 2026', firstDocument(), course);
    expect(state.policies).toHaveLength(3);
    expect(state.assignments).toHaveLength(1);
    expect(state.exams).toHaveLength(0);
  });
});
