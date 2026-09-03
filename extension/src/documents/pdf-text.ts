import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

GlobalWorkerOptions.workerSrc = workerUrl;
export interface PdfTextResult { status: 'complete' | 'unsupported_image_pdf' | 'failed'; text: string; pagesProcessed: number; totalPages: number; truncated: boolean; }

export async function extractPdfText(bytes: ArrayBuffer, maximumPages = 40): Promise<PdfTextResult> {
  try {
    const pdf = await getDocument({ data: new Uint8Array(bytes) }).promise;
    const pagesProcessed = Math.min(pdf.numPages, maximumPages);
    const pages: string[] = [];
    for (let number = 1; number <= pagesProcessed; number += 1) {
      const content = await (await pdf.getPage(number)).getTextContent();
      pages.push(content.items.map((item) => ('str' in item ? item.str + (('hasEOL' in item && item.hasEOL) ? '\n' : ' ') : '')).join(''));
    }
    const text = pages.join('\n').trim();
    return { status: text ? 'complete' : 'unsupported_image_pdf', text, pagesProcessed, totalPages: pdf.numPages, truncated: pdf.numPages > maximumPages };
  } catch {
    return { status: 'failed', text: '', pagesProcessed: 0, totalPages: 0, truncated: false };
  }
}


