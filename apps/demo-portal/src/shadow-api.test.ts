import { describe, expect, it } from 'vitest';
import { buildShadowApiUrl, publicApiLabel, resolveShadowApiBase } from './shadow-api';

describe('Shadow Cohort dashboard API configuration', () => {
  it('uses the local Coordinator API when no Vite value is configured', () => {
    expect(resolveShadowApiBase()).toBe('http://127.0.0.1:9200');
  });

  it('normalizes a public HTTPS backend and builds endpoint URLs', () => {
    const base = resolveShadowApiBase(' https://shadow-api.example.com/ ');
    expect(base).toBe('https://shadow-api.example.com');
    expect(buildShadowApiUrl('/api/shadow/status', base)).toBe('https://shadow-api.example.com/api/shadow/status');
  });

  it('does not display URL credentials or query values', () => {
    expect(publicApiLabel('https://user:secret@shadow-api.example.com/base?token=private')).toBe('https://shadow-api.example.com/base');
  });
});
