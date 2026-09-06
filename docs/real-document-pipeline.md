# Real UB document pipeline verification

The repair is covered by fictional regression fixtures. It has not been verified against an authenticated UB account in this run. No real student document contents are included in the fixtures or diagnostics.

## Reload and scan

1. Run `pnpm build` from the repository root.
2. Open `chrome://extensions`, enable Developer mode, and click Reload on Academic Bridge. For a first install, choose Load unpacked and select this repository's `extension/dist` directory.
3. Refresh the already-open UB Learns semester page after signing in normally. Do not enter credentials into the extension.
4. Open Academic Bridge and click **Scan academic semester**. Keep the popup open until the scan finishes.
5. Expand **Developer document pipeline**. Inspect `courseHomeVisited`, `contentEntryFound`, `contentEntryUrl`, module/topic visit counts, navigation steps, discovery candidates, and document processing records. Capture only these sanitized diagnostics when reporting a failure, not page HTML, document text, or session details.
6. Confirm syllabus, homework/project, exam information, and course policy targets appear where those resources are actually linked. Check assignments, exams, policies, office hours, and provenance against the documents yourself. Missing or yearless dates are not guessed.

## Find the first failing stage

| Observation | Interpretation / next check |
| --- | --- |
| `courseHomeVisited` is false | The course home itself could not be collected. Inspect its failed navigation step. |
| Course home visited, `contentEntryFound` is false | The rendered course navigation did not expose an eligible Content, Course Content, Modules, or Materials link. This is course navigation failure, not PDF parsing. |
| Content entry found, no modules/topics visited | The Content entry failed to load or exposed no relevant module/topic links. Inspect its navigation result and failure reason. |
| Content visited, no document links found | The visited pages did not expose recognized resource anchors. Check whether the resource is in a deeper module, a closed shadow root, or appears after delayed rendering. |
| Links found, no targets classified | Inspect candidate titles and classification results. Slides/readings are intentionally ignored. A new target title variation needs a sanitized regression fixture. |
| Targets classified, fetch failed | Inspect `failureReason`: HTTP errors, rejected redirects, authentication navigation, or network/processing failure. Rejected redirects are not followed, even when a browser could navigate through them. |
| Fetch succeeded, extraction did not | Inspect MIME and extraction status. PDF selection uses MIME or PDF signature, not filename alone. Image-only PDFs need OCR, which is not implemented. Unsupported MIME and parsing errors remain explicit. |
| Text extracted, fact count zero | Discovery and text extraction worked; the deterministic rules did not recognize supported facts. Compare a sanitized example against the supported date/policy patterns. This is not reported as a fetch failure. |
| Facts extracted, UI expectations differ | Inspect fact-type counts and source references. Confirm the relevant document has explicit dates and the expected course context. |

PDF and HTML success counters are separate; an HTML document should not increment the PDF counter. Candidate records can include Content navigation links as well as file links; `documentLinksFound` is a diagnostic discovery count, not a guarantee of downloadable files. Duplicate candidate URLs are deduplicated per course.

## Bounds and limitations

- At most eight Content pages per course, navigation depth two, ten selected documents per course, and forty PDF pages per document.
- Only observed, allowed same-origin UB links are used. No download endpoints are generated.
- A classified HTML topic can unwrap one observed embedded/download resource, not recursively crawl resources.
- Only open shadow roots are accessible. Asynchronous rendering and real-site route variations still need manual verification.
- Per-course scan diagnostics are available during the current popup session; canonical document processing metadata travels with document records. Keep the popup open for the diagnostic run.
- Diagnostics contain safe URLs, titles, counts, statuses, and failure categories, never raw extracted text, full HTML, PDF bytes, or credentials.

Automated verification commands: `pnpm test`, `pnpm lint`, `pnpm typecheck`, and `pnpm build`.
