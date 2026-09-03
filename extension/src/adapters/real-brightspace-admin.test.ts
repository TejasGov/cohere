import { beforeEach, describe, expect, it } from 'vitest';
import { adapterRegistry } from './registry';

const url = new URL('https://ublearns.buffalo.edu/d2l/home');

describe('real Brightspace nonacademic course-card handling', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('excludes a card explicitly identified as a non-course org unit', () => {
    document.body.innerHTML = `
      <d2l-enrollment-card data-org-unit-type="course"><a href="/d2l/home/100">BIO 200: Ecology</a></d2l-enrollment-card>
      <d2l-enrollment-card data-org-unit-type="organization"><a href="/d2l/home/999">Fictional Compliance Center</a></d2l-enrollment-card>`;
    const state = adapterRegistry.extract(document, url);
    expect(state.courses.map((course) => course.courseTitle)).toEqual(['Ecology']);
  });
});
