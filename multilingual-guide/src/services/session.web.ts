// Web: persist the session in localStorage so it survives closing the tab.
// Values written by older builds into sessionStorage are moved over on first read.
const ACCESS_KEY = 'mg_access_token_v3';
const REFRESH_KEY = 'mg_refresh_token_v3';

function read(key: string): string | null {
  try {
    const stored = localStorage.getItem(key);
    if (stored) return stored;
  } catch { return null; }
  try {
    const legacy = sessionStorage.getItem(key);
    if (!legacy) return null;
    localStorage.setItem(key, legacy);
    sessionStorage.removeItem(key);
    return legacy;
  } catch { return null; }
}

function write(key: string, token: string | null): void {
  try {
    if (token) localStorage.setItem(key, token);
    else localStorage.removeItem(key);
  } catch { /* SSR or restricted context */ }
  try { sessionStorage.removeItem(key); } catch { /* SSR or restricted context */ }
}

export async function getSessionToken(): Promise<string | null> { return read(ACCESS_KEY); }
export async function writeSessionToken(token: string | null): Promise<void> { write(ACCESS_KEY, token); }
export async function getRefreshToken(): Promise<string | null> { return read(REFRESH_KEY); }
export async function writeRefreshToken(token: string | null): Promise<void> { write(REFRESH_KEY, token); }

type LockManager = { request: <T>(name: string, task: () => Promise<T>) => Promise<T> };

export function withRefreshLock<T>(task: () => Promise<T>): Promise<T> {
  const locks = typeof navigator !== 'undefined' ? (navigator as Navigator & { locks?: LockManager }).locks : undefined;
  return locks?.request ? locks.request('mg-refresh', task) : task();
}

export function subscribeSessionStorage(listener: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === ACCESS_KEY || event.key === REFRESH_KEY) listener();
  };
  window.addEventListener('storage', onStorage);
  return () => window.removeEventListener('storage', onStorage);
}
