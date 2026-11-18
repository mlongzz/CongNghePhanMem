import fs from 'node:fs';
import path from 'node:path';
import { API, VIEWER_DISTRICT1_STATE, VIEWER_EMAIL, VIEWER_PASSWORD, VIEWER_STATE, storageStateFor, type Tokens } from './auth';

async function post(pathname: string, body: unknown): Promise<Response> {
  return fetch(`${API}${pathname}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}

export default async function globalSetup() {
  await post('/users', { full_name: 'Browser Test Viewer', email: VIEWER_EMAIL, password: VIEWER_PASSWORD, language: 'vi' });
  const login = await post('/auth/login', { email: VIEWER_EMAIL, password: VIEWER_PASSWORD });
  if (!login.ok) throw new Error(`Viewer sign-in failed with HTTP ${login.status}`);
  const tokens = await login.json() as Tokens;
  for (const [file, filters] of [[VIEWER_STATE, true], [VIEWER_DISTRICT1_STATE, false]] as const) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(storageStateFor(tokens, { filters })));
  }
}
