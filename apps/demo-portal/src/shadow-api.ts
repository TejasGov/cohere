export const DEFAULT_SHADOW_API_BASE = 'http://127.0.0.1:9200';

export function resolveShadowApiBase(configured?: string): string {
  const value = configured?.trim() || DEFAULT_SHADOW_API_BASE;
  return value.replace(/\/+$/, '');
}

export function buildShadowApiUrl(path: string, base = SHADOW_API_BASE): string {
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

export function publicApiLabel(base = SHADOW_API_BASE): string {
  try {
    const url = new URL(base);
    url.username = '';
    url.password = '';
    url.search = '';
    url.hash = '';
    return url.toString().replace(/\/$/, '');
  } catch {
    return 'Invalid API URL';
  }
}

export const SHADOW_API_BASE = resolveShadowApiBase(import.meta.env.VITE_SHADOW_API_BASE);

export async function shadowApiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(buildShadowApiUrl(path), init);
  if (!response.ok) {
    const details = (await response.text()).trim();
    throw new Error(`${response.status} ${response.statusText}${details ? `: ${details}` : ''}`);
  }
  return response.json() as Promise<T>;
}
