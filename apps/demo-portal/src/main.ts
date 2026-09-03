import './styles.css';
import { initialState, updateDemoState, type DemoEvent, type DemoState } from './state';

type Page = 'brightspace' | 'blackboard' | 'portal';

const app = document.querySelector<HTMLDivElement>('#app') ?? (() => {
  throw new Error('Demo application root is missing');
})();

const pathToPage = (): Page => {
  if (location.pathname.startsWith('/blackboard')) return 'blackboard';
  if (location.pathname.startsWith('/portal')) return 'portal';
  return 'brightspace';
};

let state: DemoState = { ...initialState };

const nav = (page: Page) => `
  <nav class="switcher" aria-label="Demo sites">
    <strong>Legacy Campus Lab</strong>
    <a class="${page === 'brightspace' ? 'active' : ''}" href="/brightspace">Brightspace mock</a>
    <a class="${page === 'blackboard' ? 'active' : ''}" href="/blackboard">Blackboard mock</a>
    <a class="${page === 'portal' ? 'active' : ''}" href="/portal">Student portal</a>
  </nav>`;

const controls = () => `
  <aside class="demo-controls" aria-label="Demo controls">
    <h2>Scenario controls</h2><p>Current DOM only — no history is stored.</p>
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
    <header class="bb-top"><span>Blackboard Learn</span> / <b data-bb-course="MTH 309">MTH 309 — Linear Algebra</b></header>
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
        <tr data-enrollment-row><td><span class="subject">CSE</span> <span class="catalog">331</span></td><td class="${state.classCancelled ? 'cancelled' : ''}">Mon/Wed 10:00–11:20${state.classCancelled ? ' — CANCELLED' : ''}</td><td class="room">${state.roomChanged ? 'Engineering 215' : 'Engineering 104'}</td><td>Dr. Maya Chen</td></tr>
        <tr data-enrollment-row><td><span class="subject">MTH</span> <span class="catalog">309</span></td><td>Tue/Thu 14:00–15:20</td><td class="room">Science Hall 220</td><td>Professor Elias Ward</td></tr>
      </tbody></table>
      ${state.assignmentAdded ? '<p class="registrar-alert">Notice: New assignment information is available in your LMS.</p>' : ''}
    </main>
  </section>`;

function render(): void {
  const page = pathToPage();
  const content = page === 'blackboard' ? blackboard() : page === 'portal' ? portal() : brightspace();
  app.innerHTML = `${nav(page)}${content}${controls()}`;
  document.title = `${page === 'portal' ? 'Student Portal' : page[0]?.toUpperCase()}${page.slice(1)} Demo`;
  app.querySelectorAll<HTMLButtonElement>('[data-event]').forEach((button) => {
    button.addEventListener('click', () => {
      state = updateDemoState(state, button.dataset.event as DemoEvent);
      render();
    });
  });
}

render();
