import './styles.css';
import { initialState, updateDemoState, type DemoEvent, type DemoState } from './state';

type LegacyPage = 'brightspace' | 'blackboard' | 'portal';

type DashboardStatus = {
  peers: Array<{
    studentId: string;
    displayName: string;
    connected: boolean;
    capacity?: string;
    availableHours: number;
    allocatedHours: number;
    overloaded: boolean;
  }>;
  project: {
    id: string;
    title: string;
    totalEstimatedHours: number;
  };
  feasibility: {
    classification?: string;
    totalEstimatedProjectHours?: number;
    totalSafeCapacityHours?: number;
    capacityBufferHours?: number;
    [key: string]: unknown;
  };
  currentPlan?: {
    version?: number;
    status?: string;
    allocations?: Array<{
      taskId: string;
      taskTitle?: string;
      studentId: string;
      studentName?: string;
      estimatedHours: number;
      score?: number;
      [key: string]: unknown;
    }>;
    [key: string]: unknown;
  };
  planHistory: Array<{
    version?: number;
    status?: string;
    createdAt?: string;
    allocations?: unknown[];
    [key: string]: unknown;
  }>;
  currentReplan?: {
    status?: string;
    changedTaskIds?: string[];
    proposedPlan?: {
      version?: number;
      status?: string;
    };
    [key: string]: unknown;
  };
  taskBids: Record<string, Array<{
    studentId?: string;
    willing?: boolean;
    overallFit?: number;
    estimatedHours?: number;
    reason?: string;
    [key: string]: unknown;
  }>>;
  eventLog: Array<{
    at: string;
    message: string;
  }>;
};

const app = document.querySelector<HTMLDivElement>('#app') ?? (() => {
  throw new Error('Application root is missing');
})();

let state: DemoState = { ...initialState };
let dashboardTimer: number | undefined;
const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://127.0.0.1:9200';

const escapeHtml = (value: unknown): string =>
  String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

const icon = (name: string) => {
  const paths: Record<string, string> = {
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    shield: '<path d="M12 3 5 6v5c0 4.5 2.9 7.8 7 10 4.1-2.2 7-5.5 7-10V6l-7-3Z"/><path d="m9.5 12 1.6 1.6 3.8-4"/>',
    spark: '<path d="m12 3 1.5 4.2L18 9l-4.5 1.8L12 15l-1.5-4.2L6 9l4.5-1.8L12 3Z"/><path d="m19 15 .8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15Z"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
    pulse: '<path d="M3 12h4l2.2-5 4.2 10 2.2-5H21"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    lock: '<rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
    refresh: '<path d="M20 6v5h-5"/><path d="M4 18v-5h5"/><path d="M18.5 9A7 7 0 0 0 6 6.5L4 11M5.5 15A7 7 0 0 0 18 17.5l2-4.5"/>',
    grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    bolt: '<path d="m13 2-8 12h7l-1 8 8-12h-7l1-8Z"/>',
    github: '<path d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.69c-2.78.6-3.37-1.18-3.37-1.18-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.61.07-.61 1 .07 1.53 1.03 1.53 1.03.9 1.53 2.35 1.09 2.92.83.09-.65.35-1.09.64-1.34-2.22-.25-4.56-1.11-4.56-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.02A9.57 9.57 0 0 1 12 7.01c.85 0 1.71.11 2.51.33 1.91-1.29 2.75-1.02 2.75-1.02.55 1.38.2 2.4.1 2.65.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.68-4.57 4.93.36.31.68.92.68 1.86v2.77c0 .27.18.58.69.48A10 10 0 0 0 12 2Z"/>'
  };
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[name] ?? ''}</svg>`;
};

const logo = () => `
  <a class="brand" href="/" aria-label="Cohere home">
    <img src="/cohere-logo-mark.png" alt="Cohere logo" class="brand-logo-img" />
    <span>Cohere</span>
  </a>`;

const landing = () => `
  <main class="landing">
    <div class="grain"></div>
    <header class="site-nav shell">
      ${logo()}
      <nav class="nav-links" aria-label="Primary navigation">
        <a href="#how">How it works</a>
        <a href="#privacy">Privacy</a>
        <a href="#architecture">Architecture</a>
        <a href="/brightspace">LMS Demos</a>
      </nav>
      <a class="button button-small button-dark" href="/dashboard">Open dashboard ${icon('arrow')}</a>
    </header>

    <section class="hero hero-orb shell">
      <div class="hero-copy">
        <div class="eyebrow">${icon('spark')} Multi-agent coordination for student teams</div>
        <h1>Group work that adapts <span>before</span> someone burns out.</h1>
        <p>
          Cohere gives every teammate a private workload-aware agent. Agents negotiate task ownership using safe capacity, declared skills, and fairness, without exposing academic records.
        </p>
        <div class="hero-actions">
          <a class="button button-primary" href="/dashboard">Launch live demo ${icon('arrow')}</a>
          <a class="button button-ghost" href="https://github.com/atshalahmedkhan/Hackathon_UD" target="_blank" rel="noreferrer">${icon('github')} View source</a>
        </div>
        <div class="hero-proof">
          <div><strong>3</strong><span>independent peers</span></div>
          <div><strong>18</strong><span>networked bids</span></div>
          <div><strong>0</strong><span>raw records shared</span></div>
        </div>
      </div>

      <div class="hero-orb-wrap" aria-label="Live agent negotiation orb" id="live-orb-root">
        <div class="orb-ring orb-ring-1"></div>
        <div class="orb-ring orb-ring-2"></div>
        <div class="orb-ring orb-ring-3"></div>
        <div class="live-orb" id="live-orb">
          <div class="orb-body"></div>
          <div class="orb-eyes">
            <span class="orb-eye"></span>
            <span class="orb-eye"></span>
          </div>
          <div class="orb-glow"></div>
        </div>
        <div class="orb-label orb-label-tl">${icon('shield')}<span>Privacy safe</span></div>
        <div class="orb-label orb-label-tr">${icon('users')}<span>3 peers active</span></div>
        <div class="orb-label orb-label-bl">${icon('bolt')}<span>18 live bids</span></div>
        <div class="orb-label orb-label-br">${icon('pulse')}<span>Replan ready</span></div>
        <div class="orb-center-text"><span>NEGOTIATING</span></div>
      </div>
    </section>

    <section class="signal-bar">
      <div class="shell signal-inner">
        <span>Built on</span>
        <strong>Strands Agents</strong>
        <i></i>
        <strong>A2A protocol</strong>
        <i></i>
        <strong>Deterministic allocation</strong>
        <i></i>
        <strong>Human approval</strong>
      </div>
    </section>

    <section class="plan-preview shell">
      <div class="plan-preview-copy">
        <span class="section-kicker">LIVE COORDINATOR OUTPUT</span>
        <h2>An inspectable plan, proposed in real time.</h2>
        <p>After every peer submits a privacy-safe bid, the coordinator assembles a capacity-checked allocation and surfaces it for human review. Nothing is assigned automatically — the team approves, or asks for changes.</p>
        <ul class="plan-preview-bullets">
          <li>${icon('check')} Capacity enforced before any assignment is made</li>
          <li>${icon('check')} Fairness penalty prevents one person from carrying the load</li>
          <li>${icon('check')} Human approval required to activate any plan version</li>
        </ul>
        <a class="button button-dark" href="/dashboard">Open the live dashboard ${icon('arrow')}</a>
      </div>
      <div class="plan-preview-visual" aria-label="Cohere plan preview">
        <div class="shader-orb orb-one"></div>
        <div class="shader-orb orb-two"></div>
        <div class="visual-card visual-main">
          <div class="visual-head">
            <div>
              <span class="micro-label">CAMPUS MARKETPLACE</span>
              <h3>Plan v2</h3>
            </div>
            <span class="status-pill proposed"><i></i> Proposed</span>
          </div>
          <div class="task-row">
            <span class="task-icon">UI</span>
            <div><strong>Frontend build</strong><small>Student B</small></div>
            <span>8h</span>
          </div>
          <div class="task-row">
            <span class="task-icon">DB</span>
            <div><strong>Data model</strong><small>Student A</small></div>
            <span>6h</span>
          </div>
          <div class="task-row moved">
            <span class="task-icon">PX</span>
            <div><strong>Presentation</strong><small>Moved to Student A</small></div>
            <span>4h</span>
          </div>
          <div class="capacity-strip">
            <span>Safe capacity</span>
            <div><i style="width: 79%"></i></div>
            <strong>79%</strong>
          </div>
        </div>
        <div class="visual-card visual-float float-top">
          ${icon('shield')}
          <div><strong>Privacy safe</strong><small>Only normalized capacity leaves a peer.</small></div>
        </div>
        <div class="visual-card visual-float float-bottom">
          ${icon('pulse')}
          <div><strong>Replan triggered</strong><small>Academic workload increased.</small></div>
        </div>
      </div>
    </section>

    <section id="how" class="section shell">
      <div class="section-heading">
        <div>
          <span class="section-kicker">THE SYSTEM</span>
          <h2>Private agents. Shared plan.</h2>
        </div>
        <p>The intelligence stays distributed. The coordinator gets only what it needs to make a fair, inspectable proposal.</p>
      </div>

      <div class="bento">
        <article class="bento-card bento-wide soft-lilac">
          <div class="dither-overlay"></div>
          <div class="card-number">01</div>
          <div class="card-icon">${icon('users')}</div>
          <h3>Every student gets a personal agent.</h3>
          <p>Skills, preferences, availability, and normalized academic pressure stay local to the student.</p>
          <div class="mini-agents">
            <span><i class="avatar a">A</i><b>Student A</b><small>12.0h safe</small></span>
            <span><i class="avatar b">B</i><b>Student B</b><small>16.0h safe</small></span>
            <span><i class="avatar c">C</i><b>Student C</b><small>9.6h safe</small></span>
          </div>
        </article>

        <article class="bento-card soft-mint">
          <div class="dither-overlay"></div>
          <div class="card-number">02</div>
          <div class="card-icon">${icon('bolt')}</div>
          <h3>Agents bid, not people.</h3>
          <p>Every task gets a deterministic fit score and willingness decision.</p>
          <div class="score-chip"><span>overallFit</span><strong>0.91</strong></div>
        </article>

        <article class="bento-card soft-peach">
          <div class="dither-overlay"></div>
          <div class="card-number">03</div>
          <div class="card-icon">${icon('grid')}</div>
          <h3>Fairness is a constraint.</h3>
          <p>Capacity limits cannot be overridden by a strong skill match.</p>
          <div class="bar-stack">
            <div><span>A</span><i><b style="width: 74%"></b></i></div>
            <div><span>B</span><i><b style="width: 63%"></b></i></div>
            <div><span>C</span><i><b style="width: 92%"></b></i></div>
          </div>
        </article>

        <article id="privacy" class="bento-card bento-wide bento-dark">
          <div class="dither-overlay dither-dark"></div>
          <div class="privacy-copy">
            <div class="card-number light">04</div>
            <div class="card-icon light">${icon('lock')}</div>
            <h3>Your grades are not team data.</h3>
            <p>The coordinator sees safe project capacity, coarse workload state, and task bids. It never receives course names, grades, assignments, or raw academic records.</p>
          </div>
          <div class="privacy-terminal">
            <div class="terminal-top"><span></span><span></span><span></span></div>
            <code>
              <span class="muted">peer → coordinator</span><br><br>
              {<br>
              &nbsp;&nbsp;"studentId": <em>"student-c"</em>,<br>
              &nbsp;&nbsp;"availableHours": <em>6</em>,<br>
              &nbsp;&nbsp;"capacity": <em>"constrained"</em>,<br>
              &nbsp;&nbsp;"reason": <em>"academic workload increased"</em><br>
              }
            </code>
          </div>
        </article>
      </div>
    </section>

    <section id="architecture" class="section architecture">
      <div class="shell">
        <div class="section-heading">
          <div>
            <span class="section-kicker">EVENT DRIVEN</span>
            <h2>Plans change when reality changes.</h2>
          </div>
          <p>Replanning targets only affected unfinished work and prefers the smallest safe assignment change.</p>
        </div>
        <div class="flow">
          <div class="flow-node"><span>01</span><strong>Academic state</strong><small>Private + local</small></div>
          <div class="flow-arrow"></div>
          <div class="flow-node"><span>02</span><strong>Capacity change</strong><small>Privacy safe notice</small></div>
          <div class="flow-arrow"></div>
          <div class="flow-node active"><span>03</span><strong>Targeted rebid</strong><small>Affected tasks only</small></div>
          <div class="flow-arrow"></div>
          <div class="flow-node"><span>04</span><strong>Human approval</strong><small>Nothing auto ships</small></div>
        </div>
      </div>
    </section>

    <section class="cta shell">
      <div class="cta-inner">
        <div>
          <span class="section-kicker">READY TO NEGOTIATE?</span>
          <h2>See the agents build a plan.</h2>
        </div>
        <a class="button button-primary" href="/dashboard">Open dashboard ${icon('arrow')}</a>
      </div>
    </section>

    <footer class="footer shell">
      ${logo()}
      <p>Privacy-first coordination for student teams.</p>
      <a href="https://github.com/atshalahmedkhan/Hackathon_UD" target="_blank" rel="noreferrer">GitHub ${icon('arrow')}</a>
    </footer>
  </main>`;

const formatHours = (value: unknown): string => {
  const n = Number(value);
  return Number.isFinite(n) ? `${n.toFixed(n % 1 === 0 ? 0 : 1)}h` : '0h';
};

const capacityPercent = (allocated: number, available: number) =>
  available <= 0 ? 0 : Math.min(100, Math.round((allocated / available) * 100));

const statusLabel = (status?: string) => (status ?? 'not started').replaceAll('_', ' ');

const dashboardShell = () => `
  <main class="dashboard-page">
    <aside class="dashboard-sidebar">
      ${logo()}
      <nav class="side-nav">
        <a class="active" href="/dashboard">${icon('grid')} Overview</a>
        <a href="#team">${icon('users')} Team capacity</a>
        <a href="#plan">${icon('check')} Allocation</a>
        <a href="#events">${icon('pulse')} Event log</a>
      </nav>
      <div class="sidebar-note">
        ${icon('shield')}
        <strong>Privacy boundary</strong>
        <p>No raw academic state is exposed to this dashboard.</p>
      </div>
      <a class="back-link" href="/">← Back to landing</a>
    </aside>

    <section class="dashboard-content">
      <header class="dashboard-topbar">
        <div>
          <span class="micro-label">COHERE / LIVE COORDINATOR</span>
          <h1 id="project-title">Campus Marketplace</h1>
        </div>
        <div class="topbar-actions">
          <span id="connection-badge" class="connection-badge"><i></i> Connecting</span>
          <button class="icon-button" id="refresh-button" aria-label="Refresh dashboard">${icon('refresh')}</button>
        </div>
      </header>
      <div id="dashboard-root">
        <div class="dashboard-loading">
          <div class="loading-orb"></div>
          <h2>Connecting to coordinator...</h2>
          <p>Start <code>pnpm shadow:dashboard-api</code> on port 9200.</p>
        </div>
      </div>
    </section>
  </main>`;

const dashboardOffline = () => `
  <div class="offline-card">
    <div class="offline-icon">${icon('pulse')}</div>
    <span class="section-kicker">COORDINATOR OFFLINE</span>
    <h2>The interface is ready. The local API is not.</h2>
    <p>Run the three peer agents and dashboard API, then refresh this page.</p>
    <code>pnpm shadow:peer:a<br>pnpm shadow:peer:b<br>pnpm shadow:peer:c<br>pnpm shadow:dashboard-api</code>
    <button class="button button-dark" id="retry-button">${icon('refresh')} Retry connection</button>
  </div>`;

const renderDashboardStatus = (data: DashboardStatus): string => {
  const plan = data.currentPlan;
  const allocations = plan?.allocations ?? [];
  const totalCapacity = data.peers.reduce((sum, peer) => sum + (peer.availableHours || 0), 0);
  const totalAllocated = data.peers.reduce((sum, peer) => sum + (peer.allocatedHours || 0), 0);
  const connected = data.peers.filter((peer) => peer.connected).length;
  const feasibility = String(data.feasibility?.classification ?? 'unknown').toLowerCase();

  const peerCards = data.peers.map((peer, index) => {
    const pct = capacityPercent(peer.allocatedHours, peer.availableHours);
    const initials = peer.displayName.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase();
    return `
      <article class="peer-card ${peer.overloaded ? 'danger' : ''}">
        <div class="peer-head">
          <span class="avatar avatar-${index + 1}">${escapeHtml(initials)}</span>
          <div><strong>${escapeHtml(peer.displayName)}</strong><small>${peer.connected ? 'Peer online' : 'Peer offline'}</small></div>
          <span class="dot ${peer.connected ? 'online' : ''}"></span>
        </div>
        <div class="peer-capacity-row"><span>Allocated</span><b>${formatHours(peer.allocatedHours)} / ${formatHours(peer.availableHours)}</b></div>
        <div class="capacity-meter ${pct > 90 ? 'high' : ''}"><i style="width:${pct}%"></i></div>
        <div class="peer-foot"><span>${escapeHtml(peer.capacity ?? 'capacity pending')}</span><strong>${pct}%</strong></div>
      </article>`;
  }).join('');

  const allocationRows = allocations.length ? allocations.map((allocation) => {
    const peer = data.peers.find((candidate) => candidate.studentId === allocation.studentId);
    return `
      <tr>
        <td><span class="task-bullet"></span><strong>${escapeHtml(allocation.taskTitle ?? allocation.taskId)}</strong></td>
        <td>${escapeHtml(peer?.displayName ?? allocation.studentName ?? allocation.studentId)}</td>
        <td>${formatHours(allocation.estimatedHours)}</td>
        <td><span class="fit-badge">${allocation.score != null ? Number(allocation.score).toFixed(1) : 'safe'}</span></td>
      </tr>`;
  }).join('') : `<tr><td colspan="4" class="empty-cell">No allocation yet. Run negotiation to create Plan v1.</td></tr>`;

  const events = data.eventLog.slice(-8).reverse().map((event) => `
    <li>
      <i></i>
      <div><strong>${escapeHtml(event.message)}</strong><small>${new Date(event.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small></div>
    </li>`).join('') || `<li class="event-empty">No coordinator events yet.</li>`;

  const needsInitialPlan = !plan;
  const proposed = plan?.status === 'proposed';
  const approved = plan?.status === 'approved';
  const hasReplan = Boolean(data.currentReplan?.proposedPlan);

  let primaryAction = '';
  if (needsInitialPlan) {
    primaryAction = `<button class="button button-primary" data-api-action="/api/shadow/negotiate">Run negotiation ${icon('arrow')}</button>`;
  } else if (proposed && hasReplan) {
    primaryAction = `<button class="button button-primary" data-api-action="/api/shadow/replan/approve">Approve Plan v${escapeHtml(plan?.version)}</button>`;
  } else if (proposed) {
    primaryAction = `<button class="button button-primary" data-api-action="/api/shadow/plan/approve">Approve Plan v${escapeHtml(plan?.version ?? 1)}</button>`;
  } else if (approved && !data.currentReplan) {
    primaryAction = `<button class="button button-primary" data-api-action="/api/shadow/demo/student-c-overload">Simulate workload change ${icon('pulse')}</button>`;
  } else {
    primaryAction = `<button class="button button-dark" data-api-action="/api/shadow/negotiate">Renegotiate ${icon('refresh')}</button>`;
  }

  return `
    <div class="dashboard-grid">
      <section class="dash-hero">
        <div>
          <div class="eyebrow compact">${icon('spark')} Deterministic, privacy-safe coordination</div>
          <h2>${plan ? `Plan v${escapeHtml(plan.version ?? 1)}` : 'Ready to negotiate'}</h2>
          <p>${plan ? `Current plan is ${escapeHtml(statusLabel(plan.status))}. Every assignment is capacity checked and remains subject to human approval.` : 'All peers can bid independently. The coordinator will enforce capacity and fairness before proposing assignments.'}</p>
        </div>
        <div class="dash-actions">
          ${primaryAction}
          ${hasReplan ? `<button class="button button-ghost" data-api-action="/api/shadow/replan/reject">Request changes</button>` : ''}
        </div>
        <div class="shader-orb dash-orb"></div>
      </section>

      <section class="metric-card">
        <span class="metric-label">Team capacity</span>
        <strong>${formatHours(totalCapacity)}</strong>
        <small>${formatHours(totalAllocated)} currently allocated</small>
        <div class="tiny-meter"><i style="width:${capacityPercent(totalAllocated, totalCapacity)}%"></i></div>
      </section>

      <section class="metric-card">
        <span class="metric-label">Feasibility</span>
        <strong class="capitalize">${escapeHtml(feasibility)}</strong>
        <small>${formatHours(data.project.totalEstimatedHours)} project estimate</small>
        <span class="status-pill ${feasibility === 'comfortable' ? 'approved' : 'proposed'}"><i></i>${escapeHtml(feasibility)}</span>
      </section>

      <section class="metric-card">
        <span class="metric-label">Peers online</span>
        <strong>${connected}/${data.peers.length}</strong>
        <small>A2A endpoints connected</small>
        <div class="peer-dots">${data.peers.map((peer) => `<i class="${peer.connected ? 'online' : ''}"></i>`).join('')}</div>
      </section>

      <section id="team" class="dash-section team-section">
        <div class="dash-section-head">
          <div><span class="section-kicker">TEAM CAPACITY</span><h3>Workload without surveillance.</h3></div>
          <span class="privacy-chip">${icon('lock')} Local academic state stays private</span>
        </div>
        <div class="peer-grid">${peerCards}</div>
      </section>

      <section id="plan" class="dash-section allocation-section">
        <div class="dash-section-head">
          <div><span class="section-kicker">CURRENT ALLOCATION</span><h3>Inspectable by design.</h3></div>
          ${plan ? `<span class="status-pill ${plan.status === 'approved' ? 'approved' : 'proposed'}"><i></i>${escapeHtml(statusLabel(plan.status))}</span>` : ''}
        </div>
        <div class="table-wrap">
          <table class="allocation-table">
            <thead><tr><th>Task</th><th>Owner</th><th>Estimate</th><th>Fit</th></tr></thead>
            <tbody>${allocationRows}</tbody>
          </table>
        </div>
      </section>

      <section id="events" class="dash-section events-section">
        <div class="dash-section-head">
          <div><span class="section-kicker">SAFE EVENT LOG</span><h3>What changed, not what was private.</h3></div>
        </div>
        <ul class="event-list">${events}</ul>
      </section>

      <section class="dash-section bids-section">
        <div class="dash-section-head">
          <div><span class="section-kicker">NEGOTIATION</span><h3>Bid coverage.</h3></div>
        </div>
        <div class="bid-stat">
          <strong>${Object.values(data.taskBids).reduce((sum, bids) => sum + bids.length, 0)}</strong>
          <span>privacy-safe bids received across ${Object.keys(data.taskBids).length} tasks</span>
        </div>
        <div class="bid-grid">
          ${Object.entries(data.taskBids).slice(0, 6).map(([taskId, bids]) => `
            <div class="bid-item">
              <span>${escapeHtml(taskId)}</span>
              <div>${bids.map((bid, i) => `<i class="${bid.willing === false ? 'no' : ''}" style="--i:${i}"></i>`).join('')}</div>
              <strong>${bids.length}</strong>
            </div>`).join('') || '<p class="muted-copy">No bid round yet.</p>'}
        </div>
      </section>
    </div>`;
};

async function postAction(path: string): Promise<void> {
  const button = document.querySelector<HTMLButtonElement>(`[data-api-action="${path}"]`);
  if (button) {
    button.disabled = true;
    button.dataset.originalText = button.innerHTML;
    button.textContent = 'Working...';
  }

  try {
    await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: path.endsWith('/reject') ? { 'content-type': 'application/json' } : undefined,
      body: path.endsWith('/reject') ? JSON.stringify({ feedback: 'Please review the proposed reassignment together.' }) : undefined
    }).then(async (response) => {
      if (!response.ok) throw new Error(await response.text());
    });
    await loadDashboard();
  } catch (error) {
    console.error(error);
    window.alert(error instanceof Error ? error.message : 'Coordinator action failed.');
  } finally {
    if (button && button.dataset.originalText) {
      button.disabled = false;
      button.innerHTML = button.dataset.originalText;
    }
  }
}

function wireDashboardActions(): void {
  document.querySelectorAll<HTMLButtonElement>('[data-api-action]').forEach((button) => {
    button.addEventListener('click', () => void postAction(button.dataset.apiAction ?? ''));
  });
  document.querySelector<HTMLButtonElement>('#retry-button')?.addEventListener('click', () => void loadDashboard());
}

async function loadDashboard(): Promise<void> {
  const root = document.querySelector<HTMLDivElement>('#dashboard-root');
  const badge = document.querySelector<HTMLSpanElement>('#connection-badge');
  if (!root || !badge) return;

  try {
    const response = await fetch(`${API_BASE}/api/shadow/status`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Status ${response.status}`);
    const data = await response.json() as DashboardStatus;
    root.innerHTML = renderDashboardStatus(data);
    const title = document.querySelector<HTMLElement>('#project-title');
    if (title) title.textContent = data.project.title;
    badge.className = 'connection-badge online';
    badge.innerHTML = '<i></i> Coordinator online';
    wireDashboardActions();
  } catch {
    root.innerHTML = dashboardOffline();
    badge.className = 'connection-badge';
    badge.innerHTML = '<i></i> Coordinator offline';
    wireDashboardActions();
  }
}

function dashboard(): void {
  app.innerHTML = dashboardShell();
  document.title = 'Cohere Dashboard';
  document.querySelector<HTMLButtonElement>('#refresh-button')?.addEventListener('click', () => void loadDashboard());
  void loadDashboard();
  dashboardTimer = window.setInterval(() => void loadDashboard(), 5000);
}

const pathToLegacyPage = (): LegacyPage => {
  if (location.pathname.startsWith('/blackboard')) return 'blackboard';
  if (location.pathname.startsWith('/portal')) return 'portal';
  return 'brightspace';
};

const legacyNav = (page: LegacyPage) => `
  <nav class="switcher" aria-label="Demo sites">
    <strong>Legacy Campus Lab</strong>
    <a class="${page === 'brightspace' ? 'active' : ''}" href="/brightspace">Brightspace mock</a>
    <a class="${page === 'blackboard' ? 'active' : ''}" href="/blackboard">Blackboard mock</a>
    <a class="${page === 'portal' ? 'active' : ''}" href="/portal">Student portal</a>
    <a href="/">Cohere</a>
  </nav>`;

const controls = () => `
  <aside class="demo-controls" aria-label="Demo controls">
    <h2>Scenario controls</h2><p>Current DOM only. No history is stored.</p>
    <div>
      <button data-event="deadline" class="${state.deadlineChanged ? 'on' : ''}">Deadline changed</button>
      <button data-event="cancel" class="${state.classCancelled ? 'on' : ''}">Class cancelled</button>
      <button data-event="room" class="${state.roomChanged ? 'on' : ''}">Room changed</button>
      <button data-event="assignment" class="${state.assignmentAdded ? 'on' : ''}">New assignment</button>
    </div>
  </aside>`;

const brightspace = () => `
  <section class="brightspace" data-demo-platform="brightspace">
    <header class="bs-header"><b>MyCourses</b><span>Student: Jordan Lee</span></header>
    <div class="bs-shell"><aside class="bs-nav"><ul><li>Course Home</li><li>Content</li><li>Grades</li></ul></aside>
      <main class="bs-main"><div class="bs-course" data-course-code="CSE 331">CSE 331</div>
        <h1 data-course-title>Algorithms and Data Structures</h1><p>Instructor: <span data-instructor>Dr. Maya Chen</span></p>
        <h2>Upcoming</h2>
        <article class="bs-card" data-academic-item="assignment"><h3>Assignment 2</h3><time>${state.deadlineChanged ? 'Due September 11, 2026 at 11:59 PM' : 'Due September 8, 2026 at 11:59 PM'}</time></article>
        <article class="bs-card" data-academic-item="assessment"><h3>Quiz 3</h3><time>Due September 10, 2026</time></article>
        ${state.assignmentAdded ? '<article class="bs-card" data-academic-item="assignment"><h3>Graph Lab</h3><time>Due September 15, 2026</time></article>' : ''}
        <section class="bs-card" data-academic-item="announcement"><h2>Announcement</h2><p>${state.classCancelled ? 'Wednesday class is cancelled.' : 'Welcome to the fall term. Office hours are posted.'}</p></section>
      </main></div>
  </section>`;

const blackboard = () => `
  <section class="blackboard" id="blackboard-app">
    <header class="bb-top"><span>Blackboard Learn</span> / <b data-bb-course="MTH 309">MTH 309 - Linear Algebra</b></header>
    <div class="bb-layout"><aside class="bb-menu">COURSE MENU<hr>Announcements<br><br>Assignments<br><br>Tests</aside>
      <main class="bb-content"><h1>Course Content</h1><p class="instructor-line">Faculty: <strong>Professor Elias Ward</strong></p>
        <div class="bb-row content-item assignment"><span class="bb-label">Work</span><div><h2>Homework 4</h2><p class="date-line">${state.deadlineChanged ? 'Available until September 12, 2026' : 'Due September 9, 2026'}</p></div></div>
        <div class="bb-row content-item exam"><span class="bb-label">Test</span><div><h2>Midterm</h2><p class="date-line">September 18, 2026</p></div></div>
        ${state.assignmentAdded ? '<div class="bb-row content-item assignment"><span class="bb-label">Work</span><div><h2>Matrix Worksheet</h2><p class="date-line">Due September 16, 2026</p></div></div>' : ''}
        <div class="bb-row content-item notice"><span class="bb-label">News</span><div><h2>Announcement</h2><p>${state.classCancelled ? 'Thursday lecture is cancelled.' : 'Review problems are now available.'}</p></div></div>
      </main></div>
  </section>`;

const portal = () => `
  <section class="portal" data-system="student-information-system">
    <header class="portal-head"><small>Office of the Registrar</small><h1>Student Schedule</h1></header>
    <main class="portal-body"><p>Term: <b id="current-term">Fall 2026</b></p>
      <table id="registered-sections"><thead><tr><th>Section</th><th>Meeting Pattern</th><th>Location</th><th>Instructor</th></tr></thead><tbody>
        <tr data-enrollment-row><td><span class="subject">CSE</span> <span class="catalog">331</span></td><td class="${state.classCancelled ? 'cancelled' : ''}">Mon/Wed 10:00-11:20${state.classCancelled ? ' - CANCELLED' : ''}</td><td class="room">${state.roomChanged ? 'Engineering 215' : 'Engineering 104'}</td><td>Dr. Maya Chen</td></tr>
        <tr data-enrollment-row><td><span class="subject">MTH</span> <span class="catalog">309</span></td><td>Tue/Thu 14:00-15:20</td><td class="room">Science Hall 220</td><td>Professor Elias Ward</td></tr>
      </tbody></table>
      ${state.assignmentAdded ? '<p class="registrar-alert">Notice: New assignment information is available in your LMS.</p>' : ''}
    </main>
  </section>`;

function legacy(): void {
  const page = pathToLegacyPage();
  const content = page === 'blackboard' ? blackboard() : page === 'portal' ? portal() : brightspace();
  app.innerHTML = `${legacyNav(page)}${content}${controls()}`;
  document.title = `${page === 'portal' ? 'Student Portal' : page[0]?.toUpperCase()}${page.slice(1)} Demo`;
  app.querySelectorAll<HTMLButtonElement>('[data-event]').forEach((button) => {
    button.addEventListener('click', () => {
      state = updateDemoState(state, button.dataset.event as DemoEvent);
      legacy();
    });
  });
}

function render(): void {
  if (dashboardTimer) window.clearInterval(dashboardTimer);
  if (location.pathname === '/dashboard' || location.pathname.startsWith('/dashboard/')) {
    dashboard();
    return;
  }
  if (['/brightspace', '/blackboard', '/portal'].some((route) => location.pathname.startsWith(route))) {
    legacy();
    return;
  }
  app.innerHTML = landing();
  document.title = 'Cohere - Privacy-first team coordination';
}

window.addEventListener('popstate', () => {
  render();
});

document.addEventListener('click', (e) => {
  const target = (e.target as HTMLElement).closest<HTMLAnchorElement>('a');
  if (target) {
    const href = target.getAttribute('href');
    if (href && href.startsWith('/') && !href.startsWith('//')) {
      e.preventDefault();
      history.pushState(null, '', href);
      render();
    }
  }
});

function initLiveOrb(): void {
  const root = document.getElementById('live-orb-root');
  const orb = document.getElementById('live-orb');
  if (!root || !orb) return;

  const labels = root.querySelectorAll<HTMLElement>('.orb-label');
  const centerText = root.querySelector<HTMLElement>('.orb-center-text span');
  const eyes = orb.querySelector<HTMLElement>('.orb-eyes');
  const statuses = ['NEGOTIATING', 'BIDDING', 'PROPOSING', 'APPROVING'];
  let statusIndex = 0;

  // CSS transition for smooth eye return
  if (eyes) eyes.style.transition = 'transform .06s ease-out';

  // Cycle status text
  const statusTimer = window.setInterval(() => {
    statusIndex = (statusIndex + 1) % statuses.length;
    if (centerText) centerText.textContent = statuses[statusIndex] ?? 'NEGOTIATING';
  }, 2800);

  // Mouse parallax + eye tracking
  function onMove(e: MouseEvent): void {
    const rect = root!.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = (e.clientX - cx) / (rect.width / 2);
    const dy = (e.clientY - cy) / (rect.height / 2);

    // Whole orb follows cursor gently
    orb!.style.transform = `translate(${dx * 18}px, ${dy * 12}px)`;

    // Labels parallax at different depths
    labels.forEach((label, i) => {
      const depth = 0.5 + i * 0.12;
      (label as HTMLElement).style.transform = `translate(${dx * 10 * depth}px, ${dy * 8 * depth}px)`;
    });

    // Eyes track cursor — use cursor position relative to orb center
    if (eyes) {
      const orbRect = orb!.getBoundingClientRect();
      const ox = orbRect.left + orbRect.width / 2;
      const oy = orbRect.top + orbRect.height / 2;
      const ex = Math.max(-48, Math.min(48, (e.clientX - ox) * 0.58));
      const ey = Math.max(-42, Math.min(42, (e.clientY - oy) * 0.52));
      eyes.style.transform = `translate(calc(-50% + ${ex}px), calc(-50% + ${ey}px))`;
    }
  }

  function onLeave(): void {
    orb!.style.transform = '';
    labels.forEach((label) => { (label as HTMLElement).style.transform = ''; });
    if (eyes) eyes.style.transform = 'translate(-50%, -50%)';
  }

  root.addEventListener('mousemove', onMove);
  root.addEventListener('mouseleave', onLeave);

  // Store cleanup on root for next render
  (root as HTMLElement & { _orbCleanup?: () => void })._orbCleanup = () => {
    window.clearInterval(statusTimer);
    root.removeEventListener('mousemove', onMove);
    root.removeEventListener('mouseleave', onLeave);
  };
}

// ── WebGL Bento Dither ───────────────────────────────────────────────────────

const _DVERT = `attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}`;
const _DFRAG = `precision mediump float;
uniform vec2 uR;uniform float uT;uniform vec2 uM;uniform float uMr;
uniform vec3 uWc;uniform vec3 uBg;uniform float uCn;
uniform float uWa;uniform float uWf;uniform float uWs;
uniform sampler2D uBy;
void main(){
  vec2 uv=gl_FragCoord.xy/uR;uv.y=1.-uv.y;
  vec2 m=uM/uR;float mf=smoothstep(uMr,0.,length(uv-m))*.45;
  float t=uT*uWs;
  float w =sin(uv.x*uWf*6.2832+t     )*uWa;
        w+=sin(uv.y*uWf*8.1701+t*.7  )*uWa*.6;
        w+=sin((uv.x+uv.y)*uWf*4.933+t*1.2)*uWa*.4;
        w=clamp(w*.5+.5+mf,0.,1.);
  vec3 c=mix(uBg,uWc,w);
  float th=texture2D(uBy,mod(gl_FragCoord.xy,4.)/4.).r;
  c=floor(c*uCn+th)/uCn;
  gl_FragColor=vec4(c,1.);
}`;

// 4×4 Bayer matrix (normalised 0-255)
const _BAYER = new Uint8Array([0,128,32,160,192,64,224,96,48,176,16,144,240,112,208,80]);

interface _DC {
  wc: [number,number,number]; bg: [number,number,number];
  cn: number; wa: number; wf: number; ws: number; mr: number;
}

function _mkDither(el: HTMLElement, cfg: _DC): (()=>void)|null {
  // Remove the static CSS dither on this card — WebGL takes over
  el.querySelector('.dither-overlay')?.remove();

  const cv = document.createElement('canvas');
  cv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:-1;display:block;';
  cv.setAttribute('aria-hidden','true');
  el.insertBefore(cv, el.firstChild);

  const gl = cv.getContext('webgl') as WebGLRenderingContext|null;
  if (!gl) { cv.remove(); return null; }

  const mkSh = (t: number, src: string) => {
    const s = gl.createShader(t)!;
    gl.shaderSource(s, src); gl.compileShader(s); return s;
  };
  const prog = gl.createProgram()!;
  gl.attachShader(prog, mkSh(gl.VERTEX_SHADER, _DVERT));
  gl.attachShader(prog, mkSh(gl.FRAGMENT_SHADER, _DFRAG));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { cv.remove(); return null; }
  gl.useProgram(prog);

  // Full-screen quad
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,1,1]), gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(prog, 'a');
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  // Bayer 4×4 texture (REPEAT so it tiles across the card)
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.LUMINANCE,4,4,0,gl.LUMINANCE,gl.UNSIGNED_BYTE,_BAYER);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.REPEAT);

  const uR=gl.getUniformLocation(prog,'uR'), uT=gl.getUniformLocation(prog,'uT'),
        uM=gl.getUniformLocation(prog,'uM'), uMr=gl.getUniformLocation(prog,'uMr'),
        uWc=gl.getUniformLocation(prog,'uWc'), uBg=gl.getUniformLocation(prog,'uBg'),
        uCn=gl.getUniformLocation(prog,'uCn'), uWa=gl.getUniformLocation(prog,'uWa'),
        uWf=gl.getUniformLocation(prog,'uWf'), uWs=gl.getUniformLocation(prog,'uWs'),
        uBy=gl.getUniformLocation(prog,'uBy');

  gl.uniform3fv(uWc, cfg.wc); gl.uniform3fv(uBg, cfg.bg);
  gl.uniform1f(uCn, cfg.cn); gl.uniform1f(uWa, cfg.wa);
  gl.uniform1f(uWf, cfg.wf); gl.uniform1f(uWs, cfg.ws);
  gl.uniform1f(uMr, cfg.mr); gl.uniform1i(uBy, 0);

  let mx = -9999, my = -9999, dpr = Math.min(devicePixelRatio, 2);
  const onMM = (e: MouseEvent) => {
    const r = cv.getBoundingClientRect();
    mx = (e.clientX - r.left) * dpr;
    my = (r.bottom - e.clientY) * dpr; // WebGL Y flipped
  };
  el.addEventListener('mousemove', onMM);

  let W = 0, H = 0;
  const resize = () => {
    dpr = Math.min(devicePixelRatio, 2);
    const r = el.getBoundingClientRect();
    const nw = Math.round(r.width * dpr), nh = Math.round(r.height * dpr);
    if (nw === W && nh === H) return;
    W = nw; H = nh;
    cv.width = W; cv.height = H;
    gl.viewport(0, 0, W, H);
    gl.uniform2f(uR, W, H);
  };
  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(el);

  let raf = 0;
  const t0 = performance.now();
  const draw = () => {
    resize();
    gl.uniform1f(uT, (performance.now() - t0) * 0.001);
    gl.uniform2f(uM, mx, my);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    raf = requestAnimationFrame(draw);
  };
  raf = requestAnimationFrame(draw);

  return () => {
    cancelAnimationFrame(raf);
    ro.disconnect();
    el.removeEventListener('mousemove', onMM);
    (gl.getExtension('WEBGL_lose_context') as WEBGL_lose_context|null)?.loseContext();
    cv.remove();
  };
}

// Per-card configs — card 01 (lilac) and card 03 (peach), slightly toned down
const _BCFGS: _DC[] = [
  { bg:[0.84,0.81,0.98], wc:[0.46,0.34,0.80], cn:5, wa:0.40, wf:0.70, ws:0.038, mr:0.30 },
  { bg:[0.98,0.84,0.70], wc:[0.84,0.42,0.17], cn:5, wa:0.38, wf:0.65, ws:0.036, mr:0.30 },
];

let _bdCleanup: (()=>void)|null = null;

function initBentoDither(): void {
  _bdCleanup?.();
  const cards = Array.from(document.querySelectorAll<HTMLElement>('article.bento-card'));
  const fns: Array<(()=>void)|null> = [];
  cards.forEach((c, i) => {
    if (i % 2 === 0) {
      fns.push(_mkDither(c, _BCFGS[Math.floor(i / 2) % _BCFGS.length]!));
    }
  });
  _bdCleanup = () => fns.forEach(f => f?.());
}

// ── Bootstrap ────────────────────────────────────────────────────────────────

render();

const _originalRender = render;
function renderAndInit(): void {
  const prev = document.getElementById('live-orb-root') as (HTMLElement & { _orbCleanup?: ()=>void })|null;
  if (prev?._orbCleanup) prev._orbCleanup();
  _bdCleanup?.();
  _originalRender();
  requestAnimationFrame(() => {
    initLiveOrb();
    initBentoDither();
  });
}

window.addEventListener('popstate', () => { renderAndInit(); });

initLiveOrb();
initBentoDither();
