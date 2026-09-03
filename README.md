# Academic Bridge

> A privacy-first Chrome extension that turns legacy university and LMS pages into one standardized, agent-readable academic interface using WebMCP.

Academic Bridge is our submission for the WebMCP Challenge. It demonstrates a simple but important idea: a browser agent should not need to understand a different set of fragile CSS selectors for every university platform. The extension reads only academic information already visible to the logged-in student, converts it into a canonical schema, and exposes safe read-only tools through the browser's native WebMCP interface.

## The problem

Universities commonly use a mixture of Brightspace, Blackboard, registrar portals, and older custom systems. Each platform represents courses, deadlines, exams, announcements, schedules, and policies with unrelated HTML structures. Browser agents therefore have to repeatedly interpret presentation-oriented pages and can easily miss context or provenance.

Academic Bridge adds a compatibility layer:

```text
Legacy LMS or university portal
        ↓
Platform-specific adapter
        ↓
Canonical AcademicState
        ↓
Local semester and document analysis
        ↓
Validated WebMCP bridge
        ↓
Standardized read-only academic tools
        ↓
Browser agent
```

The same question—such as “What assignments are coming up?”—uses the same `academic_get_upcoming` tool whether the page is real UB Learns, the Brightspace demo, or the Blackboard demo.

## What works today

### Multiple intentionally different academic sites

The demo portal contains three fictional interfaces with deliberately incompatible DOM structures:

- Brightspace-style LMS
- Blackboard-style LMS
- University student portal

This proves that normalization happens inside independent adapters rather than one platform-specific parser disguised as a common interface.

### Real UB Learns collection

The extension can detect authenticated UB Learns pages and use the existing browser session to:

- discover semester courses;
- scan courses sequentially with bounded work;
- collect assignments, explicit exams/quizzes, and announcements;
- preserve stable identifiers and source URLs;
- continue with partial results when one page fails.

No usernames or passwords are requested, and cookies or tokens are never read directly.

### Targeted document analysis

The collector analyzes only documents whose visible titles strongly identify them as:

1. syllabi;
2. assignment or project instructions;
3. exam schedules;
4. course-policy documents.

It intentionally ignores generic lecture slides, readings, textbooks, research papers, recordings, and unrelated files. PDF text extraction happens locally and is bounded to 40 pages and 10 target documents per course. Image-only PDFs are marked unsupported instead of blocking a course scan.

Extracted facts can include:

- assignment and project deadlines;
- exam dates;
- grading and attendance policies;
- office hours;
- explicit class-meeting information.

Every document-derived fact carries provenance. Conflicting dates remain as separate observations and produce a canonical conflict record; the extension never silently decides which source is correct.

### Read-only WebMCP tools

The MAIN-world bundle registers seven standardized tools:

| Tool | Purpose |
| --- | --- |
| `academic_get_overview` | Return semester status and canonical entity counts |
| `academic_get_courses` | List courses or filter by course code |
| `academic_get_upcoming` | Return chronologically sorted assignments and exams, optionally within an ISO date range |
| `academic_get_announcements` | Return normalized course announcements |
| `academic_get_policies` | Return policies, office hours, or authoritative meeting information with provenance |
| `academic_get_conflicts` | Return facts where trusted academic sources disagree |
| `academic_get_sources` | Explain where a particular canonical fact came from |

WebMCP registration is a progressive enhancement. If `document.modelContext` is unavailable, the adapters, scanner, document analyzer, popup, and normalized JSON view continue to work.

## Security architecture

Chrome extension content scripts normally run in an isolated world, while `document.modelContext` belongs to the page's MAIN world. Academic Bridge keeps those responsibilities separate:

### Isolated extension world

- owns the adapters and canonical `AcademicState`;
- runs the bounded semester and document collectors;
- uses extension-local storage for scan results and normalized document-cache entries;
- validates tool names and input shapes;
- constructs sanitized academic responses.

### Page MAIN world

- feature-detects `document.modelContext.registerTool`;
- registers deterministic read-only tool definitions;
- forwards only approved academic operations through a request-ID bridge;
- contains no parsing, crawling, Chrome storage, or extension API logic.

The bridge has timeouts and rejects unknown operations. It does not expose generic capabilities such as DOM reading, JavaScript execution, arbitrary fetching, cookie access, storage access, or extension-function execution.

Everything remains local. There is no backend, analytics service, AI API, remote script, `eval()`, or dynamic `Function` construction. Tool responses never include raw HTML, raw PDFs, complete document text, cookies, credentials, or tokens.

## Repository structure

```text
apps/
  demo-portal/             Three fictional legacy academic interfaces
packages/
  academic-core/           Canonical schema, stable IDs, shared state utilities
extension/
  src/adapters/            Independent platform adapters
  src/documents/           Target classification, local extraction, cache, facts
  src/semester/            Bounded semester discovery and collection
  src/webmcp/              Tools, schemas, bridge, MAIN-world runtime
  src/content.ts           Isolated extension entry point
  src/popup.ts             Scan controls and diagnostics
  public/manifest.json     Manifest V3 configuration
  build.mjs                MV3-safe standalone bundle build
```

## Technology

- TypeScript with strict checking
- Chrome Extension Manifest V3
- Vite
- pnpm workspace
- Vitest with sanitized fictional fixtures
- ESLint
- Mozilla PDF.js for local PDF text extraction

## Install and run

### Requirements

- Node.js 20.19+ or 22.12+
- pnpm 10+
- Google Chrome

```bash
pnpm install
pnpm dev
```

The fictional demo routes are:

- `http://127.0.0.1:5173/brightspace`
- `http://127.0.0.1:5173/blackboard`
- `http://127.0.0.1:5173/portal`

## Build and load the extension

```bash
pnpm build:extension
```

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select this repository's `extension/dist` directory.
5. Refresh any supported page that was already open.
6. Open the extension popup to inspect the detected platform, normalized counts, semester scan, sources, conflicts, and WebMCP diagnostics.

After changing extension source, rebuild it, click **Reload** on `chrome://extensions`, and refresh the target page.

## Enable WebMCP for local testing

1. Open `chrome://flags/#enable-webmcp-testing`.
2. Set **WebMCP for testing** to **Enabled**.
3. Relaunch Chrome.
4. Open a supported top-level page.
5. Run `await document.modelContext.getTools()` in that page's DevTools Console when the inspection method is available.

The popup reports the real runtime state:

- WebMCP supported: Yes/No
- Bridge: Active/Inactive
- successfully registered tool count
- per-tool registration status and errors

The existing **Scan academic semester** button remains the scan entry point. `academic_scan_semester` is intentionally not registered because moving the popup-owned tab lifecycle into the page bridge would require a destabilizing refactor. Read access to the collected state is the hackathon-critical feature.

## Commands

| Command | Purpose |
| --- | --- |
| `pnpm dev` | Start the fictional demo portal |
| `pnpm build:demo` | Type-check and build the demo portal |
| `pnpm build:extension` | Build the popup and standalone isolated/MAIN-world bundles |
| `pnpm build` | Build every workspace package |
| `pnpm lint` | Run ESLint |
| `pnpm test` | Run all Vitest tests |
| `pnpm typecheck` | Run strict TypeScript checks |

Current automated baseline: **13 test files and 72 tests passing**, plus clean lint, typecheck, and workspace builds.

## Demo script

### Real UB Learns

1. Sign into UB Learns normally.
2. Open the semester page.
3. Click **Scan academic semester** in Academic Bridge.
4. Confirm canonical courses, assignments, exams, announcements, sources, and conflicts in the popup.
5. Confirm WebMCP reports **Supported**, **Bridge Active**, and seven registered tools.
6. Ask a WebMCP-capable browser agent:
   - “What do I have due soon?”
   - “What exams are coming up?”
   - “Do any of my course sources disagree?”
   - “Where did the CSE 341 deadline come from?”

A live UB test requires the student's existing authenticated browser session and is therefore intentionally a manual verification step.

### Cross-platform Blackboard proof

1. Open `http://127.0.0.1:5173/blackboard`.
2. Ask: “What assignments are coming up?”
3. Confirm that the agent calls the same `academic_get_upcoming` tool used on UB Learns.

The website structure changes; the agent-facing contract does not.

## Project status

| Phase | Status |
| --- | --- |
| Phase 1 — workspace, extension skeleton, and three demo environments | Complete |
| Phase 1 verification and repair | Complete |
| Phase 2 — canonical schema and independent adapters | Complete |
| Real UB Learns course and semester collection | Automated verification complete; live account test manual |
| Targeted local document analysis, provenance, and conflicts | Complete |
| Phase 3 — standardized WebMCP read interface | Automated verification complete; live WebMCP test manual |

## What we plan to do next

The next work is validation and submission polish, not broader data collection:

1. Run the end-to-end flow against an authenticated UB Learns semester in a WebMCP-enabled Chrome build.
2. Exercise all seven tools with the browser's Model Context Tool Inspector and Lighthouse registered-tools audit.
3. Capture a short demo showing the same natural-language question on real Brightspace and mock Blackboard.
4. Add sanitized regression fixtures for any real-site DOM variations discovered during manual validation.
5. Improve empty, partial, unsupported, and conflict states without changing the underlying architecture.
6. Prepare the WebMCP Challenge write-up, screenshots, architecture graphic, privacy explanation, and demo video.

Possible post-challenge work—only with explicit user consent—includes additional university adapters, optional calendar export, and historical change notifications. These are not part of the current implementation.

## Intentionally not implemented

- Google Calendar or OAuth
- grades, messages, classlists, or submission actions
- continuous background monitoring
- remote backend or analytics
- generic full-course file crawling
- arbitrary browser automation
- AI API calls

## License

No license has been selected yet. Add an explicit license before accepting external contributions.
