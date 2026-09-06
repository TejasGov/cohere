import { beforeEach, describe, expect, it } from 'vitest';
import { discoverAcademicNavigation, discoverAcademicTargets } from './page-discovery';

const pageUrl = new URL('https://ublearns.buffalo.edu/d2l/home/55001');

describe('bounded academic target discovery', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('keeps assignment, assessment, and explicitly hinted category targets on the UB host', () => {
    document.body.innerHTML = `
      <a href="/d2l/lms/dropbox/user/folders_list.d2l?ou=55001&token=private">Assignments</a>
      <a href="/d2l/lms/quizzing/user/quizzes_list.d2l?ou=55001">Quizzes</a>
      <a href="/d2l/le/content/55001/Home">Content</a>
      <a href="/d2l/le/content/55001/Other">Weekly notes</a>
      <a href="https://example.test/d2l/lms/dropbox/x">External</a>`;
    expect(discoverAcademicTargets(document, pageUrl)).toEqual([
      'https://ublearns.buffalo.edu/d2l/lms/dropbox/user/folders_list.d2l?ou=55001',
      'https://ublearns.buffalo.edu/d2l/lms/quizzing/user/quizzes_list.d2l?ou=55001',
      'https://ublearns.buffalo.edu/d2l/le/content/55001/Home'
    ]);
  });

  it('preserves a validated Brightspace module identifier', () => {
    document.body.innerHTML = '<a href="/d2l/le/content/55001/Home?itemIdentifier=D2L.LE.Content.ContentObject.ModuleCO-9988&token=secret">Course Information</a>';
    const [target] = discoverAcademicNavigation(document, new URL('https://ublearns.buffalo.edu/d2l/le/content/55001/Home'));
    expect(target).toEqual({ url: 'https://ublearns.buffalo.edu/d2l/le/content/55001/Home?itemIdentifier=D2L.LE.Content.ContentObject.ModuleCO-9988', pageType: 'module', label: 'Course Information' });
  });
});
