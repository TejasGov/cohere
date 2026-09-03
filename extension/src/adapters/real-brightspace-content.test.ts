import { beforeEach, describe, expect, it } from 'vitest';
import announcementsFixture from './fixtures/real-brightspace-announcements.html?raw';
import assignmentsFixture from './fixtures/real-brightspace-assignments.html?raw';
import { adapterRegistry } from './registry';

const courseUrl = new URL('https://ublearns.buffalo.edu/d2l/home/55001');
const assignmentsUrl = new URL('https://ublearns.buffalo.edu/d2l/lms/dropbox/user/folders_list.d2l?ou=55001');

function load(html: string): void {
  document.body.innerHTML = html;
}

describe('real Brightspace course content', () => {
  beforeEach(() => load(''));

  it('normalizes a visible announcement with course context', () => {
    load(announcementsFixture);
    const state = adapterRegistry.extract(document, courseUrl);
    expect(state.courses).toHaveLength(1);
    expect(state.announcements[0]).toMatchObject({
      sourcePlatform: 'ub-brightspace', sourceId: '71001', courseCode: 'ENG 210LEC A',
      courseTitle: 'Technical Writing', title: 'Project kickoff details',
      description: 'Bring a fictional project topic to class.'
    });
    expect(state.announcements[0]?.courseId).toBe(state.courses[0]?.id);
  });

  it('normalizes multiple announcements and leaves a missing description undefined', () => {
    load(announcementsFixture);
    const state = adapterRegistry.extract(document, courseUrl);
    expect(state.announcements).toHaveLength(2);
    expect(state.announcements[1]).toMatchObject({ title: 'Office hours update' });
    expect(state.announcements[1]?.description).toBeUndefined();
  });

  it('normalizes visible assignments and only retains safe URL identifiers', () => {
    load(assignmentsFixture);
    const state = adapterRegistry.extract(document, assignmentsUrl);
    expect(state.courses).toHaveLength(1);
    expect(state.assignments[0]).toMatchObject({
      sourcePlatform: 'ub-brightspace', sourceId: '81001', courseCode: 'ENG 210LEC A',
      courseTitle: 'Technical Writing', title: 'Research outline',
      description: 'Submit a one-page fictional outline.', dueAt: '2026-10-04T21:00:00',
      pointsPossible: 50, status: 'active'
    });
    expect(state.assignments[0]?.courseId).toBe(state.courses[0]?.id);
    expect(state.assignments[0]?.sourceUrl).toBe(
      'https://ublearns.buffalo.edu/d2l/lms/dropbox/user/folder_submit_files.d2l?db=81001&ou=55001'
    );
  });

  it('leaves an absent assignment due date undefined', () => {
    load(assignmentsFixture);
    const assignment = adapterRegistry.extract(document, assignmentsUrl).assignments
      .find((item) => item.sourceId === '81002');
    expect(assignment?.title).toBe('Peer review');
    expect(assignment?.dueAt).toBeUndefined();
    expect(assignment?.status).toBeUndefined();
  });

  it('deduplicates assignments by stable source identity', () => {
    load(assignmentsFixture);
    const state = adapterRegistry.extract(document, assignmentsUrl);
    expect(state.assignments.filter((item) => item.sourceId === '81001')).toHaveLength(1);
    const repeat = adapterRegistry.extract(document, assignmentsUrl);
    expect(state.assignments[0]?.id).toBe(repeat.assignments[0]?.id);
  });

  it('ignores unrelated content', () => {
    load('<nav><a href="/d2l/home/55001">ENG 210LEC A: Technical Writing</a></nav><main><h2>Resources</h2><a href="/d2l/le/content/55001/viewContent/999">Reading</a></main>');
    const state = adapterRegistry.extract(document, courseUrl);
    expect(state.assignments).toEqual([]);
    expect(state.announcements).toEqual([]);
  });

  it('does not crash or invent a date from malformed visible text', () => {
    load(assignmentsFixture);
    const assignment = adapterRegistry.extract(document, assignmentsUrl).assignments
      .find((item) => item.sourceId === '81003');
    expect(assignment?.title).toBe('Malformed date exercise');
    expect(assignment?.dueAt).toBeUndefined();
  });

  it('reports safe zero-result diagnostics for both content types', () => {
    load('<nav><a href="/d2l/home/55001">ENG 210LEC A: Technical Writing</a></nav>');
    const state = adapterRegistry.extract(document, assignmentsUrl);
    expect(state.diagnostics).toMatchObject({
      adapterSelected: 'ub-brightspace', pathname: '/d2l/lms/dropbox/user/folders_list.d2l',
      candidateAnnouncementContainers: 0, candidateAnnouncementTitles: 0,
      assignmentPageDetected: true, candidateAssignmentLinks: 0, candidateAssignmentContainers: 0
    });
  });
});
