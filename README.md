# Cohere

> Privacy-first, workload-aware multi-agent coordination for student group projects.

Cohere gives every teammate a personal agent that understands their normalized academic workload, explicitly declared skills, availability, and task preferences. The agents exchange privacy-safe task bids over the Strands Agent-to-Agent protocol. A separate Coordinator collects every bid, enforces hard capacity and fairness rules, and generates a proposed project plan for human approval.

The project evolved from **Academic Autopilot / Academic Bridge**, the existing Chrome extension and WebMCP compatibility layer in this repository. That infrastructure converts different LMS websites into one canonical `AcademicState`. Cohere uses the normalized state as local input without exposing private academic records to teammates or the Coordinator.

## The problem

Group-project plans are often based on incomplete information. One teammate may have the right technical skills but also have several exams and deadlines that week. Static plans can therefore overload the wrong person and become obsolete quickly.

Cohere separates three questions:

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

### Phase 1 — personal workload-aware agents

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

### Phase 2 — real Strands A2A negotiation

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

### Phase 3 — event-driven minimal-diff replanning

The Coordinator now keeps an auditable `ProjectRuntimeState` with task statuses, safe capacity snapshots, plan versions, and plan history. It accepts a validated project-event vocabulary covering academic load, declared availability, student unavailability, estimates, blocked/completed tasks, earlier deadlines, and new tasks.

The main demo follows this path:

```text
Initial project
  → real A2A bids from all three private peers
  → proposed Plan v1
  → explicit approval
  → Student C's private sanitized workload changes
  → capacity recalculated by the existing deterministic model
  → privacy-safe capacity-change notice
  → affected unfinished tasks identified
  → fresh real A2A bids only for those tasks
  → minimum-disruption Plan v2
  → human approval required
```

The numeric replanning objective is deterministic. Completed work is immovable, in-progress work has a high movement penalty, existing ownership is preferred, and the engine searches for the fewest safe assignment changes. It never asks an LLM to select owners or alter scores. If no safe reallocation exists, the result is `needs_team_decision`; work is never forced onto an overloaded teammate.

The Student C demo mutation changes private `AcademicState` input, not a capacity constant. Safe capacity falls from 9.6 hours to 6 hours. The Coordinator receives only the student identifier, old/new safe hours, coarse capacity level, and `academic workload increased`—never the underlying course or assignment.

### Dashboard integration contract

The Coordinator exposes a small local JSON API for a separately built dashboard. Start the three peers in separate terminals, then start the API:

```powershell
npx pnpm shadow:peer:a
npx pnpm shadow:peer:b
npx pnpm shadow:peer:c
npx pnpm shadow:dashboard-api
```

The default API is `http://127.0.0.1:9200`. It supports polling and deliberately contains no raw academic state:

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/api/shadow/status` | Peers, capacities, allocations, feasibility, bids, plan history, changes, and safe event log |
| `POST` | `/api/shadow/negotiate` | Run initial real A2A negotiation |
| `POST` | `/api/shadow/plan/approve` | Approve the current initial plan |
| `POST` | `/api/shadow/demo/student-c-overload` | Mutate Student C's private fixture, recalculate capacity, and run targeted rebidding |
| `POST` | `/api/shadow/replan/approve` | Approve the proposed revised plan |
| `POST` | `/api/shadow/replan/reject` | Mark changes requested and preserve optional JSON `feedback` |

## Demo

Install dependencies:

```powershell
npx pnpm install
```

Run the Phase 1 deterministic single-agent demo:

```powershell
npx pnpm demo:shadow-cohort
```

Run the happy-path real A2A multi-agent demo:

```powershell
npx pnpm demo:shadow-cohort:a2a
```

Run the defining dynamic replanning demo:

```powershell
npx pnpm demo:shadow-cohort:replan
```

Run the original strict capacity-failure scenario:

```powershell
npx pnpm demo:shadow-cohort:overloaded
```

Each A2A demo automatically:

1. starts three independent peer processes;
2. waits for all agent cards;
3. starts the Coordinator;
4. broadcasts six fictional Campus Marketplace tasks;
5. receives 18 real networked bids;
6. applies capacity and fairness constraints;
7. prints an A2A event log, proposed plan, feasibility/fairness summary, and local board;
8. shuts down the peer processes.

The replan demo additionally marks its Plan v1 approval as `DEMO AUTO-APPROVAL`, applies the private Student C workload fixture, receives six fresh network bids for Student C's two affected tasks, and proposes Plan v2 with only Presentation moved. Application code never auto-approves Plan v1 or Plan v2.

Peers can also be started separately:

```powershell
npx pnpm shadow:peer:a
npx pnpm shadow:peer:b
npx pnpm shadow:peer:c
npx pnpm shadow:coordinator
```

### Demo scenarios

`happyPathTeamScenario` uses fictional profiles and empty initial academic pressure. The existing deterministic capacity model derives 12 safe hours for Student A, 16 for Student B, and 9.6 for Student C: 37.6 hours against 34 hours of work, classified `tight`. All six tasks receive all three real A2A bids and can be allocated without exceeding any safe capacity.

`overloadedTeamScenario` preserves the original fictional academic pressure and strict behavior: roughly 6, 12.8, and 4.2 safe hours respectively. Its insufficient-capacity plan intentionally leaves work unallocated, demonstrating that the allocator refuses impossible plans.

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

The automatic UB homepage course-card discovery remains sensitive to Brightspace's dynamically rendered shadow DOM. Cohere does not depend on that path: students can hydrate state by visiting supported individual course pages.

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
  demo-portal/                 Fictional legacy academic sites and Cohere landing page / live dashboard
  shadow-cohort-agent/         Personal StudentAgent, tools, fixtures, demo
  shadow-cohort-peer/          Strands A2A server, agent card, safe handlers
  shadow-cohort-coordinator/   A2A client, coordinator, allocator demo, board

packages/
  academic-core/               Canonical AcademicState and shared utilities
  shadow-cohort-core/          Profile, workload, capacity, events, bids, plans, and replanning logic

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
| `npx pnpm demo:shadow-cohort:replan` | Run workload change and minimal-diff real A2A replanning |
| `npx pnpm demo:shadow-cohort:overloaded` | Run the original insufficient-capacity safety scenario |
| `npx pnpm shadow:dashboard-api` | Start the local dashboard JSON API after starting all peers |
| `npx pnpm test` | Run all unit and real localhost integration tests |
| `npx pnpm lint` | Run ESLint |
| `npx pnpm typecheck` | Run strict TypeScript checks |
| `npx pnpm build` | Build every workspace package and the extension |
| `npx pnpm build:extension` | Build the Manifest V3 extension |
| `npx pnpm build:demo` | Build the fictional demo portal |

## Verification

The test suite covers workload and capacity, all project-event types, replan decisions, affected-task selection, movement penalties, real network rebidding, offline/timeout behavior, malformed outbound bids, exhausted capacity, version history, human decisions, dashboard endpoints, and privacy-safe serialization. The exact current counts and demo results are reported after running the commands rather than being maintained as stale prose here.
