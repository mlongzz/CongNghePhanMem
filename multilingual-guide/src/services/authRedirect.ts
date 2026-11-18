const AUTH_PATHS = ['/login', '/register'];

export function pathOnly(value: string): string {
  const end = value.search(/[?#]/);
  return end === -1 ? value : value.slice(0, end);
}

function safeInternal(target: string): boolean {
  if (!target.startsWith('/') || target.startsWith('//')) return false;
  if (target.includes('://') || target.includes('\\') || /[\u0000-\u001f\u007f]/.test(target)) return false;
  const path = pathOnly(target).replace(/\/+$/, '') || '/';
  return !AUTH_PATHS.includes(path.toLowerCase());
}

export function sanitizeRedirect(value: unknown): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== 'string') return null;
  const target = raw.trim();
  let decoded: string;
  try { decoded = decodeURIComponent(target); } catch { return null; }
  return safeInternal(target) && safeInternal(decoded) ? target : null;
}

export function isAuthPath(pathname: string): boolean {
  return AUTH_PATHS.includes(pathOnly(pathname).replace(/\/+$/, '').toLowerCase());
}

export function loginHref(target: string | null | undefined): string {
  const safe = sanitizeRedirect(target ?? '');
  return safe && safe !== '/' ? `/login?redirect=${encodeURIComponent(safe)}` : '/login';
}

export function postLoginTarget(redirect: unknown, isAdmin: boolean): string {
  return sanitizeRedirect(redirect) ?? (isAdmin ? '/admin' : '/');
}
