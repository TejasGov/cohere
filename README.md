<div align="center">



  <img src="https://cohere-six-nu.vercel.app/cohere-logo-full.png" alt="Cohere Logo" width="380" />

  <h3>Group work that adapts <em>before</em> someone burns out.</h3>

  <p>
    <strong>Privacy-first, workload-aware multi-agent coordination protocol for student group projects.</strong>
  </p>

  <p>
    <a href="https://cohere-six-nu.vercel.app"><img src="https://img.shields.io/badge/🚀%20Live%20Demo-cohere--six--nu.vercel.app-7c3aed?style=for-the-badge&logo=vercel" alt="Live Demo" /></a>
    <a href="https://github.com/atshalahmedkhan/Hackathon_UD"><img src="https://img.shields.io/badge/Protocol-Strands%20A2A-a995ff?style=for-the-badge" alt="Strands A2A Protocol" /></a>
    <a href="https://github.com/atshalahmedkhan/Hackathon_UD"><img src="https://img.shields.io/badge/Privacy-100%25%20Zero--Knowledge-10b981?style=for-the-badge" alt="Zero Knowledge Privacy" /></a>
  </p>

  <p>
    <a href="#-key-features">Key Features</a> •
    <a href="#-architecture">Architecture</a> •
    <a href="#-live-demo--dashboard">Live Demo</a> •
    <a href="#-quickstart">Quickstart</a> •
    <a href="#-how-it-works">How It Works</a> •
    <a href="#-privacy-boundary">Privacy Guarantee</a>
  </p>

  ---

</div>

## 💡 The Problem

Group project allocations are usually static and blind to reality. A teammate might possess ideal technical skills for a task, but face three exams and two paper deadlines that week. Traditional assignment methods either:
1. **Overload overloaded teammates**, leading to missed deadlines and burnout.
2. **Force students to reveal private academic records** (grades, course lists, assignments) just to request help.

## 🛡️ The Cohere Solution

**Cohere** introduces workload-aware personal AI agents for every student. Rather than sharing raw schedules or grades, each student's agent locally evaluates academic pressure, calculates safe project capacity, and negotiates task ownership over the **Strands Agent-to-Agent (A2A)** protocol.

> **Key Rule**: A strong skill match *never* overrides insufficient safe project capacity.

---

## ✨ Key Features

- **🔒 Zero-Knowledge Academic Privacy**: Personal Student Agents run locally, deriving safe weekly project capacity without exposing grades, assignment names, or course lists to teammates or central servers.
- **🤝 Strands A2A Protocol Negotiation**: 3 independently addressable peer servers exchange deterministic task bids over JSON-RPC agent-to-agent protocol using `@strands-agents/sdk`.
- **🔄 Event-Driven Minimal-Diff Replanning**: When a student's academic workload surges, Cohere isolates affected tasks, re-bids *only* those items, and minimizes assignment churn.
- **⚖️ Inspectable Fairness Engine**: Allocation score combines skill fit, current utilization penalties, and headroom bonuses (`overallFit × 100 − utilizationPenalty + headroomBonus`).
- **🎨 Interactive WebGL Landing & Live Dashboard**: Modern landing page featuring cursor-tracking ghost orb, GPU ordered dithering shaders, animated data pipes, and real-time dashboard API.

---

## 🏗️ Architecture

```text
┌──────────────────────────────────────────────────────────────────┐
│              Legacy LMS (Brightspace / Blackboard / UB Learns)   │
└────────────────────────────────┬─────────────────────────────────┘
                                 │ Manifest V3 Extension & WebMCP
                                 ▼
┌──────────────────────────────────────────────────────────────────┐
│             Canonical AcademicState (Private & Local)            │
└────────────────────────────────┬─────────────────────────────────┘
                                 │ Workload & Safe Capacity Engine
                                 ▼
┌──────────────────────────────────────────────────────────────────┐
│                 Personal Student Agents (Local)                  │
└───────┬────────────────────────┬────────────────────────┬────────┘
        │ Student A              │ Student B              │ Student C
        ▼ (A2A Bid)              ▼ (A2A Bid)              ▼ (A2A Bid)
┌──────────────────────────────────────────────────────────────────┐
│              Coordinator Engine (Strands A2A Client)             │
│   • Hard Capacity Checks   • Fairness Penalty   • Rebid Engine   │
└────────────────────────────────┬─────────────────────────────────┘
                                 │ Proposed Plan
                                 ▼
┌──────────────────────────────────────────────────────────────────┐
│                    Human Approval / Dashboard                    │
└──────────────────────────────────────────────────────────────────┘
```

---

## 🚀 Live Demo & Dashboard

Visit the deployed production web app: **[https://cohere-six-nu.vercel.app](https://cohere-six-nu.vercel.app)**

### Live Web Features:
- **Interactive Ghost Orb**: WebGL white clay blob with dynamic cursor-tracking eye gaze physics.
- **Ordered Dithering Shaders**: Alternating Bento grid cards powered by custom WebGL Bayer ordered-dithering fragment shaders.
- **Animated Data Pipelines**: Modern glowing energy shimmer flowing through architecture connection pipes.
- **Live Coordinator Dashboard**: Monitor peer statuses, safe hour allocations, fairness scores, and trigger real-time workload overload replanning scenarios.

---

## ⚡ Quickstart

### Prerequisites
- Node.js >= 18.0.0
- pnpm >= 9.0.0

```bash
# Clone the repository
git clone https://github.com/atshalahmedkhan/Hackathon_UD.git
cd Hackathon_UD

# Install dependencies
npx pnpm install
```

### 1. Run Demo Web Portal locally
```bash
npx pnpm dev
```
Navigate to `http://localhost:5173`.

### 2. Run Real Strands A2A Multi-Agent Negotiation
Starts 3 independent peer agent servers (`http://127.0.0.1:9101-9103`) and runs a full network negotiation:
```bash
npx pnpm demo:shadow-cohort:a2a
```

### 3. Run Dynamic Workload Surge & Replanning Simulation
Simulates Student C's workload increase, triggers targeted rebidding over A2A, and generates Plan v2 with minimal task movement:
```bash
npx pnpm demo:shadow-cohort:replan
```

### 4. Run Local Dashboard API
```bash
# Terminal 1, 2, 3: Start peers
npx pnpm shadow:peer:a
npx pnpm shadow:peer:b
npx pnpm shadow:peer:c

# Terminal 4: Start Dashboard JSON API (http://127.0.0.1:9200)
npx pnpm shadow:dashboard-api
```

---

## 🛡️ Privacy Guarantee

A peer agent may **only** share:
- Student ID / pseudonym
- Explicitly declared strong skills & preferences
- Coarse capacity & safe available project hours
- Validated `TaskBid` scores

A peer agent **never** exposes:
- Raw `AcademicState`
- Course titles, assignment details, or exam dates
- Grades or GPA
- LMS tokens, cookies, or credentials

---

## 🛠️ Tech Stack & Monorepo Structure

| Package / App | Purpose |
| --- | --- |
| `apps/demo-portal` | Production Vite / Vanilla TS landing page & live coordinator dashboard |
| `apps/shadow-cohort-agent` | Personal `StudentAgent`, deterministic tools & workload fixtures |
| `apps/shadow-cohort-peer` | Strands A2A Express server (`/.well-known/agent-card.json`) |
| `apps/shadow-cohort-coordinator` | Coordinator client, allocation engine & local JSON API |
| `packages/shadow-cohort-core` | Shared capacity, fairness, task bidding & replanning logic |
| `packages/academic-core` | Canonical `AcademicState` types & normalization adapters |
| `extension/` | Manifest V3 Chrome Extension with 7 read-only WebMCP tools |

---

## 🧪 Verification & Quality

```bash
# Run unit & localhost integration tests
npx pnpm test

# Run strict TypeScript checks
npx pnpm typecheck

# Build all packages & apps
npx pnpm build
```

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).

Copyright © 2026 Atshal Ahmed Khan & Tejas Govind.
<div align="center">
  <sub>Built for student teams. Powered by Strands Agent-to-Agent Protocol.</sub>
</div>
