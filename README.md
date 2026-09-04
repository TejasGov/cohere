# Academic Autopilot

> An autonomous academic agent that turns fragmented university systems into one continuously managed semester.

Academic Autopilot helps students stop manually checking LMS pages, syllabi, assignment PDFs, exam schedules, announcements, and calendars just to figure out what they need to do next.

The project combines a privacy-first browser extension, a canonical academic data layer, WebMCP, and a Strands Agents SDK agent layer to create one unified academic assistant.

Instead of forcing an AI agent to understand the unique HTML structure of every university platform, Academic Autopilot first converts academic information into one standardized `AcademicState`.

The agent can then reason over that state, identify upcoming work, detect conflicting deadlines, explain where information came from, build calendar plans, and surface only the situations where the student actually needs to make a decision.

---

## The Problem

Students constantly repeat the same academic workflow:

- Open the LMS
- Check every course
- Look for new assignments
- Check exams and quizzes
- Read announcements
- Open syllabi
- Inspect assignment PDFs
- Search course-policy documents
- Compare dates across multiple sources
- Manually update a calendar
- Repeat the entire process a few days later

The information already exists.

The problem is that it is scattered across multiple systems and formats.

A student should not have to inspect five courses, a dozen PDFs, multiple portals, and a calendar just to answer:

> **What actually needs my attention this week?**

Academic Autopilot turns those fragmented systems into one normalized semester that an AI agent can understand.

---

## How It Works

```text
University / LMS systems
        ↓
Browser extension
        ↓
Platform-specific adapters
        ↓
Semester collector
        ↓
Targeted document analysis
        ↓
Canonical AcademicState
        ↓
┌───────────────────────────────┐
│        Agent Interfaces       │
├───────────────────────────────┤
│ WebMCP → Browser Agents       │
│ Strands → Academic Autopilot  │
└───────────────────────────────┘
        ↓
Reasoning / priorities / conflicts
        ↓
Calendar plans + student decisions
```

The key idea is simple:

**The agent should never need to understand Brightspace, Blackboard, or another university portal directly.**

Each platform is translated into the same academic schema first.

That gives every agent a stable interface regardless of the LMS underneath.

---

## Who It Is For

Academic Autopilot is designed for students who repeatedly need to figure out:

- What assignments are due?
- What exams are coming up?
- Did any deadline change?
- What does my syllabus say?
- Are two academic sources contradicting each other?
- Where did this deadline come from?
- What should go on my calendar?
- What should I work on first?

The long-term experience is:

> **Install once. Let the agent manage the repetitive coordination work around your semester.**

---

## Why This Needs an Agent

A normal academic dashboard can show assignments.

Academic Autopilot is designed to do more.

```text
Observe semester state
        ↓
Understand upcoming work
        ↓
Detect conflicts and changes
        ↓
Determine whether action is routine
        ↓
Routine action → handle automatically
Ambiguous decision → ask the student
```

For example:

```text
Brightspace:
Homework 3 → September 18

Syllabus:
Homework 3 → September 20
```

Academic Autopilot does not silently pick one.

Instead, the agent can surface:

> I found conflicting deadlines for Homework 3.
>
> Brightspace says September 18.
>
> The syllabus says September 20.
>
> I have not scheduled it yet. Which date should I use?

That is the core product behavior:

**Automate repetitive work while keeping the student in control when judgment is required.**

---

# Current Implementation

The repository already contains the browser-side Academic Bridge infrastructure that powers Academic Autopilot.

---

## Real UB Learns Support

The extension can detect authenticated UB Learns / Brightspace pages and use the student's existing browser session to:

- Discover semester courses
- Scan courses sequentially
- Collect assignments
- Collect explicitly identifiable exams and quizzes
- Collect announcements
- Preserve stable academic identifiers
- Preserve source URLs
- Continue with partial results when one page fails

The extension does not request the student's UB username or password.

It does not directly read cookies or authentication tokens.

---

## Semester Collector

The semester collector can:

- Discover visible academic courses
- Deduplicate repeated course cards
- Scan courses one at a time
- Open authenticated course pages in temporary inactive tabs
- Restrict navigation to supported academic routes
- Limit crawling depth and page targets
- Merge results into one canonical academic state
- Isolate failures
- Continue scanning later courses if one course fails

Example:

```text
Semester Scan

Courses discovered: 5
Courses scanned: 5/5

CSE 341     ✓
STA 119     ✓
STA 301     ✓
ERT 102     ✓
...
```

The collector is intentionally bounded rather than acting as an unrestricted crawler.

---

## Targeted Academic Document Analysis

Academic Autopilot does **not** blindly crawl every course PDF.

It analyzes only documents that are likely to contain important academic information:

1. Syllabi
2. Assignment or project instructions
3. Exam schedules
4. Course-policy documents

It intentionally ignores generic:

- Lecture slides
- Readings
- Textbooks
- Research papers
- Recordings
- Unrelated files

PDF text extraction happens locally and uses bounded processing.

The document analyzer can extract:

- Assignment deadlines
- Project milestones
- Exam dates
- Grading policies
- Attendance policies
- Office hours
- Explicit class-meeting information

Every extracted fact keeps track of where it came from.

---

## Provenance

Academic Autopilot preserves the source of important academic information.

For example:

```text
Homework 3
Due: September 18

Source:
UB Learns Assignment Page
```

Or:

```text
Midterm 1
October 7 at 6:00 PM

Source:
CSE 341 Syllabus.pdf
```

This lets an agent answer:

> Where did you get that deadline?

instead of simply asking the student to trust an AI-generated answer.

---

## Conflict Detection

When two trusted sources disagree, Academic Autopilot preserves both observations.

Example:

```text
DUE_DATE_CONFLICT

Homework 3

Brightspace:
September 18

Course Syllabus:
September 20
```

The system does not silently overwrite one source with another.

Conflicts remain unresolved until the student or another authoritative source resolves them.

---

# Canonical AcademicState

Every supported platform is converted into one shared academic structure.

Conceptually:

```text
AcademicState
├── Course[]
├── Assignment[]
├── Exam[]
├── Announcement[]
├── ClassMeeting[]
├── AcademicPolicy[]
├── SourceReference[]
└── AcademicConflict[]
```

This means the rest of the application does not care whether the original information came from:

```text
Brightspace
Blackboard
University Portal
Another LMS
```

The downstream interface remains the same.

---

# WebMCP

The current project exposes seven standardized, read-only WebMCP tools.

| Tool | Purpose |
| --- | --- |
| `academic_get_overview` | Return semester status and academic counts |
| `academic_get_courses` | Return courses or filter by course code |
| `academic_get_upcoming` | Return upcoming assignments and exams |
| `academic_get_announcements` | Return normalized announcements |
| `academic_get_policies` | Return academic policies and office hours |
| `academic_get_conflicts` | Return conflicting academic facts |
| `academic_get_sources` | Explain where a fact came from |

The same agent-facing tool works across different LMS implementations.

```text
Real UB Learns
      ↓
academic_get_upcoming()

Mock Blackboard
      ↓
academic_get_upcoming()
```

Different website.

Same academic interface.

This is one of the core architectural ideas behind Academic Autopilot.

---

# Agents for Humans Architecture

For the **Agents for Humans Hackathon**, Academic Autopilot is adding a Strands Agents SDK orchestration layer on top of the existing academic infrastructure.

```text
AcademicState
      ↓
Strands Agents SDK
      ↓
Academic Autopilot
      ├── get_academic_overview
      ├── get_upcoming_work
      ├── get_exams
      ├── get_policies
      ├── get_conflicts
      ├── get_sources
      └── create_calendar_plan
      ↓
Reasoning + prioritization
      ↓
Routine work handled automatically
      ↓
Student contacted only when needed
```

The architecture is intentionally reusable:

```text
Academic Core
     │
     ├── WebMCP
     │      ↓
     │   Browser agents
     │
     └── Strands
            ↓
       Autonomous academic agent
```

WebMCP is therefore not being replaced.

Strands becomes another agent interface over the same normalized academic foundation.

---

# Planned Strands Agent Workflows

## "What do I need to worry about this week?"

The agent will:

1. Inspect upcoming assignments
2. Inspect upcoming exams
3. Check known conflicts
4. Identify overloaded days
5. Group work chronologically
6. Create a prioritized plan

Example:

```text
This week:

Monday
- STA 301 Problem Set

Wednesday
- CSE 341 Homework

Friday
- CSE 341 Quiz

Priority:
1. Prepare for Friday's quiz
2. Finish Homework before Wednesday
3. Complete STA 301 problem set
```

---

## "Build my semester calendar."

The agent will:

1. Gather assignments and exams with confirmed dates
2. Merge duplicate observations
3. Detect unresolved conflicts
4. Prepare a calendar plan
5. Ask the student before ambiguous entries are added

The system should never invent a date simply to create a calendar event.

---

## "Did anything important change?"

The agent will compare semester snapshots and detect:

- New assignments
- Changed deadlines
- New exams
- Important announcements
- New conflicts

If nothing meaningful changed, the student does not need to be interrupted.

Example:

```text
No meaningful academic changes detected.
```

If something changed:

```text
CSE 341 Homework 4 changed:

Old deadline:
September 18

New deadline:
September 16

You now have two major deadlines on September 16.
```

---

## "Where did that deadline come from?"

The agent will retrieve the canonical `SourceReference` and explain the provenance rather than inventing an answer.

Example:

```text
Homework 4
Due September 16

Source:
UB Learns Assignments page

Also referenced in:
CSE 341 Syllabus.pdf
```

---

# Human-in-the-Loop Design

Academic Autopilot follows one rule:

> **Routine work can be automated. Ambiguous academic decisions require student approval.**

Examples that should require student input:

- Conflicting due dates
- Ambiguous exam dates
- Uncertain policy interpretation
- Calendar writes involving unresolved dates

Examples that can happen automatically:

- Sorting deadlines
- Grouping assignments
- Identifying upcoming exams
- Generating calendar previews
- Detecting deadline changes
- Identifying academic conflicts
- Summarizing upcoming work

---

# Calendar Workflow

Calendar integration is built on top of the canonical academic state.

```text
AcademicState
      ↓
Calendar Planner
      ↓
Assignments
Exams
Projects
Explicit class meetings
      ↓
Conflict check
      ↓
Student review
      ↓
Calendar
```

Academic Autopilot should never invent a date simply to fill the calendar.

Undated items remain visible but are not scheduled.

Conflicting items remain blocked until resolved.

The initial implementation can generate a local calendar plan or `.ics` export before adding direct Google Calendar integration.

---

# Privacy and Security

Academic Autopilot is designed around a narrow privacy model.

The current browser collector:

- Operates inside the user's existing authenticated browser session
- Does not request LMS passwords
- Does not directly read cookies
- Does not directly read authentication tokens
- Limits collection to supported academic information
- Does not expose raw page HTML through WebMCP
- Does not expose arbitrary JavaScript execution
- Does not expose generic browser automation
- Does not expose complete raw PDFs through agent tools

Targeted document processing is bounded and local in the existing Academic Bridge implementation.

The Strands integration should preserve the same principle:

> **Only structured academic context required for agent reasoning should leave the browser-side collection layer.**

---

# Repository Structure

```text
apps/
  demo-portal/
    fictional Brightspace / Blackboard / portal environments

packages/
  academic-core/
    canonical schemas
    stable IDs
    shared academic utilities

extension/
  src/adapters/
    LMS-specific adapters

  src/documents/
    document classification
    PDF extraction
    fact extraction
    provenance
    cache

  src/semester/
    course discovery
    bounded semester scanning
    academic-state merging

  src/webmcp/
    WebMCP definitions
    tool business logic
    request/response bridge
    MAIN-world runtime

  src/content.ts
  src/popup.ts
  public/manifest.json

agent/
  strands/
    Academic Autopilot agent
    academic tools
    planning logic
    decision logic
```

---

# Technology

## Current Foundation

- TypeScript
- Chrome Extension Manifest V3
- WebMCP
- Vite
- pnpm
- Vitest
- ESLint
- Mozilla PDF.js

## Agents for Humans Integration

- Strands Agents SDK
- AWS model/runtime integration
- Amazon Bedrock
- Optional Amazon Bedrock AgentCore deployment

---

# Current Status

| Capability | Status |
| --- | --- |
| Canonical academic schema | ✅ Complete |
| Brightspace demo adapter | ✅ Complete |
| Blackboard demo adapter | ✅ Complete |
| University portal demo adapter | ✅ Complete |
| Real UB Learns detection | ✅ Implemented |
| Multi-course semester collector | ✅ Implemented |
| Assignment normalization | ✅ Implemented |
| Exam / quiz normalization | ✅ Implemented |
| Announcement normalization | ✅ Implemented |
| Targeted academic PDF analysis | ✅ Implemented |
| Provenance | ✅ Implemented |
| Conflict detection | ✅ Implemented |
| Seven WebMCP tools | ✅ Implemented |
| WebMCP automated verification | ✅ Complete |
| Live authenticated UB verification | ⚠️ Manual |
| Strands Agents SDK integration | 🚧 Next phase |
| Calendar planner | 🚧 Planned |
| Autonomous decision loop | 🚧 Planned |
| Change monitoring | 🚧 Planned |
| AgentCore deployment | 🚧 Optional |

---

# Automated Verification

Current Academic Bridge baseline:

```text
13 test files
72 tests passing
ESLint passing
Strict TypeScript passing
Full workspace build passing
```

The Chrome extension build contains separate isolated-world and MAIN-world bundles.

---

# Local Development

## Requirements

- Node.js 20.19+ or 22.12+
- pnpm 10+
- Google Chrome

Install dependencies:

```bash
pnpm install
```

Run the fictional demo portal:

```bash
pnpm dev
```

Demo routes:

```text
http://127.0.0.1:5173/brightspace
http://127.0.0.1:5173/blackboard
http://127.0.0.1:5173/portal
```

---

# Build the Chrome Extension

```bash
pnpm build:extension
```

Then:

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select `extension/dist`
5. Refresh a supported academic page

After changing extension source:

1. Rebuild the extension
2. Click **Reload** in `chrome://extensions`
3. Refresh the target academic page

---

# WebMCP Testing

Open:

```text
chrome://flags/#enable-webmcp-testing
```

Enable:

```text
WebMCP for testing
```

Then relaunch Chrome.

On a supported page the popup should report:

```text
WebMCP

Supported: Yes
Bridge: Active
Registered Tools: 7
```

When available, the registered tools can be inspected with:

```javascript
await document.modelContext.getTools()
```

Expected tools:

```text
academic_get_overview
academic_get_courses
academic_get_upcoming
academic_get_announcements
academic_get_policies
academic_get_conflicts
academic_get_sources
```

---

# Real UB Learns Demo

1. Sign into UB Learns normally
2. Open the semester/home page
3. Open Academic Autopilot
4. Click **Scan academic semester**
5. Allow the bounded semester scan to finish
6. Inspect:
   - Courses
   - Assignments
   - Exams
   - Announcements
   - Document-derived facts
   - Sources
   - Conflicts
7. Confirm WebMCP reports:
   - Supported
   - Bridge Active
   - Seven registered tools

Example browser-agent questions:

```text
What do I have due soon?

What exams are coming up?

What does CSE 341 say about attendance?

Do any of my course sources disagree?

Where did this deadline come from?
```

---

# Cross-Platform Proof

Academic Autopilot is designed so the same agent-facing interface works across different academic systems.

For example:

```text
Real UB Learns / Brightspace
        ↓
academic_get_upcoming()
```

And:

```text
Mock Blackboard
        ↓
academic_get_upcoming()
```

The website structure changes.

The agent-facing academic contract does not.

---

# Agents for Humans Target Demo

The final hackathon experience is:

```text
Student installs extension
        ↓
Scans semester
        ↓
Academic Autopilot understands the semester
        ↓
Strands agent analyzes upcoming work
        ↓
Agent finds deadlines and exams
        ↓
Agent detects conflicts
        ↓
Agent builds a proposed plan
        ↓
Routine coordination happens automatically
        ↓
Student is contacted only when a decision is needed
```

Example:

> **Academic Autopilot**
>
> I found 14 assignments, 4 exams, and 2 project milestones.
>
> Three items need attention this week.
>
> I also found one conflicting deadline for CSE 341 Homework 3:
>
> **Brightspace:** September 18  
> **Syllabus:** September 20
>
> I have not scheduled that assignment yet.
>
> **Which date should I use?**

---

# Example End-to-End Workflow

```text
1. Student installs Academic Autopilot

2. Student signs into their LMS normally

3. Student clicks:
   Scan academic semester

4. Academic Autopilot discovers:
   - courses
   - assignments
   - exams
   - announcements
   - syllabi
   - important academic documents

5. Academic Autopilot normalizes everything into AcademicState

6. Strands agent analyzes the semester

7. Agent determines:
   - what is upcoming
   - what is urgent
   - what conflicts
   - what changed
   - what should be scheduled

8. Routine information is handled automatically

9. Ambiguous information is surfaced to the student

10. Approved academic events are added to the student's plan/calendar
```

---

# Example Scenario

Imagine a student has:

```text
CSE 341

Homework 3
Brightspace → September 18

CSE 341 Syllabus
Homework 3 → September 20

STA 301
Midterm → September 18
```

Academic Autopilot can understand:

```text
Conflict 1:
CSE 341 Homework 3 has two different dates

Workload issue:
STA 301 Midterm may overlap with CSE 341 Homework 3
```

Instead of simply displaying three dates, the agent can surface:

> I found conflicting deadlines for CSE 341 Homework 3.
>
> Brightspace says September 18, while the syllabus says September 20.
>
> You also have your STA 301 midterm on September 18.
>
> I have not scheduled the conflicting homework deadline yet.
>
> Which date should I use?

This is the difference between a scraper and an academic agent.

---

# Why It Matters

The problem is not that universities lack academic information.

The problem is that students are responsible for continuously reconciling that information themselves.

Today:

```text
Student checks LMS
      ↓
Student finds assignments
      ↓
Student reads PDFs
      ↓
Student compares dates
      ↓
Student updates calendar
      ↓
Student checks everything again later
```

With Academic Autopilot:

```text
Agent understands semester state
      ↓
Agent handles repetitive coordination
      ↓
Agent detects important changes
      ↓
Student is interrupted only when judgment matters
```

That is the product.

---

# Hackathon

Academic Autopilot is being developed for the **Agents for Humans Hackathon** in the **Everyday Agents** track.

The hackathon version centers **Strands Agents SDK** as the autonomous reasoning and orchestration layer while preserving the existing privacy-first academic collection and normalization system.

The goal is:

> **Let the agent handle repetitive academic coordination quietly and involve the student only when a meaningful decision has to be made.**

---

# Roadmap

## Phase 1 — Strands Agent

- Integrate Strands Agents SDK
- Expose canonical academic tools to the agent
- Implement academic overview reasoning
- Implement upcoming-work reasoning
- Preserve conflict information
- Preserve source provenance

Expected flow:

```text
AcademicState
      ↓
Strands Agent
      ↓
Academic tools
      ↓
Useful academic decisions
```

---

## Phase 2 — Calendar Planner

- Convert assignments into proposed calendar events
- Convert exams into proposed calendar events
- Convert project milestones into proposed events
- Deduplicate agreeing sources
- Block unresolved conflicts
- Create a reviewable semester plan
- Add local `.ics` export

Expected flow:

```text
AcademicState
      ↓
Calendar plan
      ↓
Conflict check
      ↓
Student review
      ↓
Calendar export
```

---

## Phase 3 — Autonomous Decision Loop

- Prioritize upcoming academic work
- Detect overloaded days
- Detect conflicts
- Determine whether a situation can be handled automatically
- Ask the student only when necessary

Expected behavior:

```text
No meaningful change
→ stay quiet

Routine change
→ handle automatically

Ambiguous change
→ ask student
```

---

## Phase 4 — Change Detection

- Compare academic snapshots
- Detect new assignments
- Detect changed deadlines
- Detect new exams
- Identify important new announcements
- Detect newly created conflicts
- Surface only meaningful changes

Example:

```text
CSE 341 Homework 4

Previous:
September 20

Current:
September 18

Status:
Deadline moved earlier by 2 days
```

---

## Phase 5 — AWS Deployment and Submission

- Integrate AWS model infrastructure
- Evaluate Amazon Bedrock AgentCore
- Add production-ready Strands execution
- Create final architecture diagram
- Polish product experience
- Record hackathon demo
- Complete public setup documentation
- Prepare Devpost submission

---

# Final Product Vision

Academic Autopilot is not intended to become another dashboard students have to remember to open.

The desired experience is:

```text
Semester starts
      ↓
Student installs Academic Autopilot
      ↓
Academic systems are normalized
      ↓
Agent continuously understands the semester
      ↓
Routine academic coordination disappears
      ↓
Student is notified only when something deserves attention
```

The final goal is simple:

> **Students should spend their time doing the work, not repeatedly searching for what work exists.**

---

# License

Before final hackathon submission, this repository should include an explicit open-source license.

Recommended options:

- MIT
- Apache-2.0
