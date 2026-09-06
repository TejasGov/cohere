# Shadow Cohort

> Privacy-first, workload-aware multi-agent coordination for student group projects.

Shadow Cohort gives every teammate a personal agent that understands their normalized academic workload, explicitly declared skills, availability, and task preferences. The agents exchange privacy-safe task bids over the Strands Agent-to-Agent protocol. A separate Coordinator collects every bid, enforces hard capacity and fairness rules, and generates a proposed project plan for human approval.

The project evolved from **Academic Autopilot / Academic Bridge**, the existing Chrome extension and WebMCP compatibility layer in this repository. That infrastructure converts different LMS websites into one canonical `AcademicState`. Shadow Cohort uses the normalized state as local input without exposing private academic records to teammates or the Coordinator.

## The problem

Group-project plans are often based on incomplete information. One teammate may have the right technical skills but also have several exams and deadlines that week. Static plans can therefore overload the wrong person and become obsolete quickly.

Shadow Cohort separates three questions:

1. Does the student have the explicitly declared skills for this task?
2. Does the student currently have enough safe project capacity?
3. Can the team create a fair allocation without exposing private academic details?

A strong skill match does not override insufficient capacity.

## How it works

```text
Legacy LMS / university portal
              ↓
Existing platform adapters and document analysis
              ↓
Canonical AcademicState (private and local)
              ↓
Deterministic workload + capacity calculation
              ↓
Personal Student Agent
              ↓ privacy-safe A2A bid
┌──────────────────────────────────────────────┐
│ Student A peer                               │
│ Student B peer ── Strands A2A ─→ Coordinator│
│ Student C peer                               │
└──────────────────────────────────────────────┘
              ↓
Deterministic capacity and fairness allocation
              ↓
PROPOSED project plan
              ↓
Human approval or change request
```

## Current implementation

### Personal Student Agent

Each `StudentAgent` owns:

- one sanitized or locally hydrated `AcademicState`;
- skills explicitly entered by the student;
- explicitly declared weekly availability;
- preferred and avoided task types;
- deterministic workload, capacity, and task-fit calculations.

The agent never infers technical skill from grades, course names, assignments, or private academic performance.

Five local Strands tools are available:

| Tool | Purpose |
| --- | --- |
| `get_student_profile` | Read declared skills, availability, and preferences |
| `get_workload_summary` | Read deterministic workload pressure |
| `get_student_capacity` | Read safe project capacity |
| `evaluate_task` | Produce a deterministic `TaskBid` |
| `list_upcoming_academic_pressure` | Read normalized near-term pressure locally |

Numeric scores are calculated in `@shadow-cohort/core`. A language model may explain a result, but it cannot choose or alter the numeric bid.

### Real Strands A2A negotiation

The repository uses:

- `@strands-agents/sdk` 1.16.0;
- `A2AExpressServer` for independently addressable peer servers;
- `A2AAgent` for remote Coordinator-to-peer communication;
- official agent cards at `/.well-known/agent-card.json`;
- A2A JSON-RPC requests over localhost HTTP;
- a separate context-isolated Strands agent for each A2A conversation.

Default development peers:

| Peer | Endpoint |
| --- | --- |
| Student A | `http://127.0.0.1:9101` |
| Student B | `http://127.0.0.1:9102` |
| Student C | `http://127.0.0.1:9103` |

Every project task is sent to every available peer. The Coordinator waits for the complete bid round before allocating tasks. Offline, timed-out, malformed, or duplicate responses are isolated so partial planning can continue.

### Deterministic allocation

Only willing bids that fit within a student's remaining safe capacity are feasible.

The inspectable allocation score is:

```text
overallFit × 100
− current-utilization fairness penalty (up to 20 points)
+ remaining-capacity headroom bonus (up to 4 points)
```

After each assignment, remaining capacity and utilization are updated before the next task. If no willing student can safely accept a task, it remains `UNALLOCATED`. The Coordinator never forces an unsafe assignment just to fill the board.

Plans begin with status `proposed`. They become `approved` only through `approvePlan()`. `requestChanges()` preserves optional human feedback without silently renegotiating.

## Demo

Install dependencies:

```powershell
cd "C:\Users\atsha\OneDrive\Documents\Desktop\Web_MCP"
npx pnpm install
```

Run the Phase 1 deterministic single-agent demo:

```powershell
npx pnpm demo:shadow-cohort
```

Run the real A2A multi-agent demo:

```powershell
npx pnpm demo:shadow-cohort:a2a
```

The A2A demo automatically:

1. starts three independent peer processes;
2. waits for all agent cards;
3. starts the Coordinator;
4. broadcasts six fictional Campus Marketplace tasks;
5. receives 18 real networked bids;
6. applies capacity and fairness constraints;
7. prints an A2A event log, proposed plan, fairness summary, and local board;
8. shuts down the peer processes.

Peers can also be started separately:

```powershell
npx pnpm shadow:peer:a
npx pnpm shadow:peer:b
npx pnpm shadow:peer:c
npx pnpm shadow:coordinator
```

### Verified demo behavior

- Student A → Backend API: skill `0.85`, capacity `0.64`, overall `0.81`, willing.
- Student B → Frontend UI: skill `0.93`, capacity `1.00`, overall `0.96`, willing.
- Student C → Recommendation Model: skill `0.93`, capacity `0.42`, overall `0.79`, not willing.

The current safe plan assigns Frontend UI to Student B. Backend API remains unallocated because Student A has 6 safe hours for an 8-hour task. The recommendation model remains unallocated because Student C has strong ML skills but insufficient current capacity. This is intentional behavior.

## Privacy and security

A peer may share only:

- student ID and optional pseudonym;
- explicitly declared strong skills;
- coarse capacity and available project hours;
- high-level constraints;
- validated `TaskBid` fields.

A peer must not share:

- raw `AcademicState`;
- course, assignment, or exam names;
- grades or raw schedules;
- LMS URLs, HTML, or PDF text;
- student messages;
- cookies, tokens, passwords, or authentication data.

Outbound responses are constructed from explicit allowlists and runtime-validated. The Coordinator has no dependency on, import of, or access to another student's academic state. A2A exposes only `get_peer_capacity_summary` and `evaluate_project_task`; arbitrary remote tool execution is not supported.

## Academic Bridge foundation

The preserved Chrome extension supports:

- Manifest V3;
- independent Brightspace, Blackboard, and university-portal adapters;
- real UB Learns / Brightspace page detection;
- canonical courses, assignments, exams, announcements, and class meetings;
- bounded content/module and targeted-document discovery;
- local PDF text extraction for selected academic documents;
- provenance and conflict detection;
- current-course/manual hydration;
- seven read-only WebMCP tools;
- developer diagnostics and normalized JSON inspection.

The automatic UB homepage course-card discovery remains sensitive to Brightspace's dynamically rendered shadow DOM. Shadow Cohort does not depend on that path: students can hydrate state by visiting supported individual course pages.

### WebMCP tools

| Tool | Purpose |
| --- | --- |
| `academic_get_overview` | Canonical academic counts and semester status |
| `academic_get_courses` | Normalized courses |
| `academic_get_upcoming` | Chronological assignments and exams |
| `academic_get_announcements` | Normalized announcements |
| `academic_get_policies` | Policies and office hours with provenance |
| `academic_get_conflicts` | Conflicting trusted observations |
| `academic_get_sources` | Source explanation for canonical facts |

All extraction and WebMCP behavior remains local. The extension does not request LMS credentials, transmit page contents to a backend, or load unsafe remote scripts.

## Demo portal and Chrome extension

Start the fictional portal:

```powershell
npx pnpm dev
```

Routes:

- `http://127.0.0.1:5173/brightspace`
- `http://127.0.0.1:5173/blackboard`
- `http://127.0.0.1:5173/portal`

Build and load the extension:

```powershell
npx pnpm build:extension
```

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Select **Load unpacked**.
4. Choose `extension/dist` from this repository.
5. Refresh supported pages that were already open.

## Repository structure

```text
apps/
  demo-portal/                 Fictional legacy academic sites
  shadow-cohort-agent/         Personal StudentAgent, tools, fixtures, demo
  shadow-cohort-peer/          Strands A2A server, agent card, safe handlers
  shadow-cohort-coordinator/   A2A client, coordinator, allocator demo, board

packages/
  academic-core/               Canonical AcademicState and shared utilities
  shadow-cohort-core/          Profile, workload, capacity, bid, and plan logic

extension/
  src/adapters/                LMS-specific adapters
  src/documents/               Classification, extraction, facts, provenance
  src/semester/                Bounded discovery and state collection
  src/webmcp/                  Read-only WebMCP interface

scripts/
  demo-shadow-a2a.mjs          Reproducible three-peer A2A demo runner
```

## Commands

| Command | Purpose |
| --- | --- |
| `npx pnpm dev` | Start the fictional academic portal |
| `npx pnpm demo:shadow-cohort` | Run one deterministic Student Agent |
| `npx pnpm demo:shadow-cohort:a2a` | Run three real A2A peers and Coordinator |
| `npx pnpm test` | Run all unit and real localhost integration tests |
| `npx pnpm lint` | Run ESLint |
| `npx pnpm typecheck` | Run strict TypeScript checks |
| `npx pnpm build` | Build every workspace package and the extension |
| `npx pnpm build:extension` | Build the Manifest V3 extension |
| `npx pnpm build:demo` | Build the fictional demo portal |

## Verified status

```text
Test files: 21 passed
Tests:      147 passed
ESLint:     PASS
TypeScript: PASS
Build:      PASS
A2A peers:  3/3 connected
A2A bids:   18/18 received
Plan:       GENERATED — PROPOSED
Privacy:    PASS
```

## Intentionally not implemented

- dynamic replanning;
- deadline-change events;
- Jira integration;
- calendar integration;
- additional LMS crawling;
- automatic approval;
- Phase 3 behavior.

The next phase should begin only after explicit approval. The current milestone ends with three independently addressable Student Agents negotiating over real A2A and producing a fair, privacy-safe proposed project plan for human review.
