import { beforeEach, describe, expect, it } from 'vitest';
import fixture from './fixtures/real-brightspace-assessments.html?raw';
import { adapterRegistry } from './registry';

const url = new URL('https://ublearns.buffalo.edu/d2l/lms/quizzing/user/quizzes_list.d2l?ou=55001');

describe('real Brightspace explicit assessments', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('normalizes an explicit quiz route as a canonical Exam', () => {
    document.body.innerHTML = fixture;
    const state = adapterRegistry.extract(document, url);
    expect(state.exams).toHaveLength(1);
    expect(state.exams[0]).toMatchObject({
      sourceId: '91001', courseCode: 'ENG 210LEC A', courseTitle: 'Technical Writing',
      title: 'Midterm practice quiz', startsAt: '2026-09-20T08:00:00',
      endsAt: '2026-09-20T09:00:00', pointsPossible: 30, status: 'active'
    });
  });

  it('does not classify generic homework text as an exam', () => {
    document.body.innerHTML = '<a href="/d2l/home/55001">ENG 210: Writing</a><article><h3>Homework review</h3></article>';
    expect(adapterRegistry.extract(document, url).exams).toEqual([]);
  });
});
