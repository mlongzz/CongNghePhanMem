export type RestoreOutcome = 'expired' | 'unverified';

export const SESSION_UNVERIFIED_NOTICE = 'Chưa xác minh được phiên đăng nhập do lỗi kết nối. Hãy kiểm tra mạng và thử lại.';

export function restoreOutcome(error: unknown): RestoreOutcome {
  return typeof error === 'object' && error !== null && (error as { status?: unknown }).status === 401 ? 'expired' : 'unverified';
}

export interface RotatedTokens { access_token: string; refresh_token: string }

export interface RotationDeps {
  refreshTokens: (refresh: string) => Promise<RotatedTokens>;
  writeSessionToken: (token: string | null) => Promise<void>;
  writeRefreshToken: (token: string | null) => Promise<void>;
}

export async function refreshAndPersist(refresh: string, deps: RotationDeps): Promise<RotatedTokens> {
  const result = await deps.refreshTokens(refresh);
  await Promise.all([deps.writeSessionToken(result.access_token), deps.writeRefreshToken(result.refresh_token)]);
  return result;
}

export function tokenSubject(token: string | null | undefined): string | null {
  const part = token?.split('.')[1];
  if (!part) return null;
  try {
    const base64 = part.replace(/-/g, '+').replace(/_/g, '/');
    const json = decodeURIComponent(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')).split('').map(c => `%${c.charCodeAt(0).toString(16).padStart(2, '0')}`).join(''));
    const sub = (JSON.parse(json) as { sub?: unknown }).sub;
    return typeof sub === 'string' || typeof sub === 'number' ? String(sub) : null;
  } catch { return null; }
}

export type StorageChange =
  | { kind: 'ignore' }
  | { kind: 'signed-out' }
  | { kind: 'rotated'; access: string; refresh: string }
  | { kind: 'switched' };

export function classifyStorageChange(current: string | null, storedAccess: string | null, storedRefresh: string | null): StorageChange {
  if (!storedAccess) return current ? { kind: 'signed-out' } : { kind: 'ignore' };
  if (!current) return { kind: 'switched' };
  if (storedAccess === current) return { kind: 'ignore' };
  const mine = tokenSubject(current);
  const theirs = tokenSubject(storedAccess);
  return mine && theirs && mine === theirs ? { kind: 'rotated', access: storedAccess, refresh: storedRefresh ?? '' } : { kind: 'switched' };
}
