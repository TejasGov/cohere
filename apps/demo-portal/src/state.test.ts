import { describe, expect, it } from 'vitest';
import { initialState, updateDemoState } from './state';

describe('demo controls', () => {
  it('toggles a simulated change without retaining history', () => {
    const changed = updateDemoState(initialState, 'deadline');
    expect(changed.deadlineChanged).toBe(true);
    expect(updateDemoState(changed, 'deadline').deadlineChanged).toBe(false);
  });
});
