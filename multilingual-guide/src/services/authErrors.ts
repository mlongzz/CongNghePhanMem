export type LoginFailure =
  | { kind: 'invalid'; message: string }
  | { kind: 'locked'; message: string; retryAfter: number }
  | { kind: 'ipLimited'; message: string; retryAfter: number }
  | { kind: 'network'; message: string }
  | { kind: 'timeout'; message: string }
  | { kind: 'server'; message: string }
  | { kind: 'unknown'; message: string };

export const LOGIN_MESSAGES = {
  invalid: 'Email hoặc mật khẩu không đúng.',
  locked: 'Tài khoản tạm khóa do nhập sai nhiều lần. Thử lại sau',
  ipLimited: 'Bạn đã thử đăng nhập quá nhiều lần. Vui lòng chờ vài phút rồi thử lại.',
  network: 'Không thể kết nối máy chủ. Vui lòng kiểm tra mạng và thử lại.',
  timeout: 'Máy chủ phản hồi quá thời gian chờ và có thể đang khởi động. Vui lòng thử lại.',
  server: 'Dịch vụ đang gặp sự cố. Vui lòng thử lại sau.',
  unknown: 'Không thể đăng nhập. Vui lòng thử lại.',
} as const;

interface ErrorShape { status?: unknown; code?: unknown; retryAfter?: unknown }

function wait(value: unknown): number {
  const seconds = typeof value === 'number' && Number.isFinite(value) ? Math.ceil(value) : 60;
  return Math.max(1, Math.min(86_400, seconds));
}

export function classifyLoginError(error: unknown): LoginFailure {
  const e: ErrorShape = typeof error === 'object' && error !== null ? error : {};
  const status = typeof e.status === 'number' ? e.status : undefined;
  const code = typeof e.code === 'string' ? e.code : undefined;
  if (status === 429 && code === 'login_locked') return { kind: 'locked', message: LOGIN_MESSAGES.locked, retryAfter: wait(e.retryAfter) };
  if (status === 429) return { kind: 'ipLimited', message: LOGIN_MESSAGES.ipLimited, retryAfter: wait(e.retryAfter) };
  if (status === 401 || status === 400) return { kind: 'invalid', message: LOGIN_MESSAGES.invalid };
  if (status !== undefined && status >= 500) return { kind: 'server', message: LOGIN_MESSAGES.server };
  if (code === 'network' || error instanceof TypeError) return { kind: 'network', message: LOGIN_MESSAGES.network };
  if (code === 'timeout') return { kind: 'timeout', message: LOGIN_MESSAGES.timeout };
  return { kind: 'unknown', message: LOGIN_MESSAGES.unknown };
}

export function formatCountdown(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}
