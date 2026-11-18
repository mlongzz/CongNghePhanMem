const AUTH_PATHS = ['/login', '/register'];

export function pathOnly(value: string): string {
  const end = value.search(/[?#]/);
  return end === -1 ? value : value.slice(0, end);
}

function isInternal(target: string): boolean {
  if (!target.startsWith('/') || target.startsWith('//')) return false;
  return !(target.includes('://') || target.includes('\\') || /[\u0000-\u001f\u007f]/.test(target));
}

function resolveDots(path: string): string {
  const parts = path.split('/').slice(1);
  const out: string[] = [];
  parts.forEach((part, index) => {
    const last = index === parts.length - 1;
    if (part === '.') { if (last) out.push(''); }
    else if (part === '..') { out.pop(); if (last) out.push(''); }
    else out.push(part);
  });
  return `/${out.join('/')}`;
}

function normalizeTarget(target: string): string {
  const path = pathOnly(target);
  return `${resolveDots(path)}${target.slice(path.length)}`;
}

function safeVariant(variant: string): boolean {
  if (!isInternal(variant)) return false;
  const normalized = normalizeTarget(variant);
  return isInternal(normalized) && !isAuthPath(normalized);
}

export function sanitizeRedirect(value: unknown): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== 'string') return null;
  const target = raw.trim();
  let variant = target;
  for (let depth = 0; depth < 4; depth++) {
    if (!safeVariant(variant)) return null;
    let decoded: string;
    try { decoded = decodeURIComponent(variant); } catch { return null; }
    if (decoded === variant) return normalizeTarget(target);
    variant = decoded;
  }
  return null;
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

export interface GateInput {
  pathname: string;
  target: string;
  redirectParam?: unknown;
  hasToken: boolean;
  authLoading: boolean;
  settled: boolean;
  sessionUnverified: boolean;
  isAdmin: boolean;
  signedOutByUser: boolean;
}

export type GateDecision =
  | { kind: 'wait' }
  | { kind: 'unverified' }
  | { kind: 'redirect'; to: string }
  | { kind: 'stay' };

export function gateDecision(input: GateInput): GateDecision {
  if (input.authLoading && !input.settled) return { kind: 'wait' };
  const onAuthPage = isAuthPath(input.pathname);
  if (!input.hasToken) {
    if (onAuthPage) return { kind: 'stay' };
    if (input.sessionUnverified) return { kind: 'unverified' };
    return { kind: 'redirect', to: input.signedOutByUser ? '/login' : loginHref(input.target) };
  }
  if (onAuthPage) return { kind: 'redirect', to: postLoginTarget(input.redirectParam, input.isAdmin) };
  if (pathOnly(input.pathname).startsWith('/admin') && !input.isAdmin) return { kind: 'redirect', to: '/' };
  return { kind: 'stay' };
}
