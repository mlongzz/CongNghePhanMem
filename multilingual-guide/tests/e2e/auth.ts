import type { APIRequestContext, BrowserContext } from '@playwright/test';

export const API = 'http://127.0.0.1:8765';
export const ORIGIN = 'http://127.0.0.1:8099';
export const VIEWER_EMAIL = 'viewer@e2e.example.com';
export const VIEWER_PASSWORD = 'TestPassword123!';
export const ADMIN_EMAIL = 'admin@e2e.example.com';
export const VIEWER_STATE = '.test-artifacts/viewer-state.json';
export const VIEWER_DISTRICT1_STATE = '.test-artifacts/viewer-district1-state.json';
export const ACCESS_KEY = 'mg_access_token_v3';
export const REFRESH_KEY = 'mg_refresh_token_v3';

const FILTERS_OFF = { name: 'mg.placeFilters', value: '{"touristOnly":false,"withImageOnly":false,"district1Only":false}' };

export type Tokens = { access_token: string; refresh_token: string };

export const GUEST_STATE = { cookies: [], origins: [{ origin: ORIGIN, localStorage: [FILTERS_OFF] }] };
export const GUEST_DISTRICT1_STATE = { cookies: [], origins: [] };

export function storageStateFor(tokens: Tokens, options: { filters?: boolean } = {}) {
  const session = [{ name: ACCESS_KEY, value: tokens.access_token }, { name: REFRESH_KEY, value: tokens.refresh_token }];
  return { cookies: [], origins: [{ origin: ORIGIN, localStorage: [...(options.filters === false ? [] : [FILTERS_OFF]), ...session] }] };
}

export async function loginApi(request: APIRequestContext, email: string, password: string): Promise<Tokens> {
  const response = await request.post(`${API}/auth/login`, { data: { email, password } });
  if (!response.ok()) throw new Error(`Test sign-in failed with HTTP ${response.status()}`);
  return await response.json() as Tokens;
}

export async function seedTokens(context: BrowserContext, tokens: Tokens) {
  await context.addInitScript(({ access, refresh, accessKey, refreshKey }) => {
    if (!localStorage.getItem(accessKey)) {
      localStorage.setItem(accessKey, access);
      localStorage.setItem(refreshKey, refresh);
    }
  }, { access: tokens.access_token, refresh: tokens.refresh_token, accessKey: ACCESS_KEY, refreshKey: REFRESH_KEY });
}

export async function registerApi(request: APIRequestContext, fullName: string, email: string, password: string) {
  return request.post(`${API}/users`, { data: { full_name: fullName, email, password, language: 'vi' } });
}
