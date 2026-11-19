const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { loadTs } = require('./helpers/load-ts.cjs');

const plain = value => JSON.parse(JSON.stringify(value));
const redirect = loadTs('src/services/authRedirect.ts');
const validation = loadTs('src/services/authValidation.ts');
const errors = loadTs('src/services/authErrors.ts');
const { translateUi } = loadTs('src/services/i18n.ts');
const { authCopy } = loadTs('src/services/authI18n.ts');

test('redirect accepts internal paths with query and keeps them intact', () => {
  for (const value of ['/', '/place/db-12', '/map?journey=1', '/place/db-1?x=1#top', '/account'])
    assert.equal(redirect.sanitizeRedirect(value), value);
  assert.equal(redirect.sanitizeRedirect(['/saved', '/x']), '/saved');
});

test('redirect rejects external, protocol-relative, scripted and auth targets', () => {
  const bad = ['', 'place/db-1', '//evil.com', '/\\evil.com', 'https://evil.com', '/redirect?u=http://evil.com', 'javascript:alert(1)',
    '/login', '/register', '/login?redirect=/x', '/register/', '/LOGIN', '%2F%2Fevil.com', '/a\nb', '/%0d%0a', '/%E0%A4%A', null, undefined, 42, {}];
  for (const value of bad) assert.equal(redirect.sanitizeRedirect(value), null, String(value));
});

test('login href carries the safe target and post-login picks redirect, admin or home', () => {
  assert.equal(redirect.loginHref('/place/db-12'), '/login?redirect=%2Fplace%2Fdb-12');
  assert.equal(redirect.loginHref('/map?journey=1'), '/login?redirect=%2Fmap%3Fjourney%3D1');
  assert.equal(redirect.loginHref('/'), '/login');
  assert.equal(redirect.loginHref('//evil.com'), '/login');
  assert.equal(redirect.postLoginTarget('/place/db-12', false), '/place/db-12');
  assert.equal(redirect.postLoginTarget('//evil.com', true), '/admin');
  assert.equal(redirect.postLoginTarget(undefined, false), '/');
  assert.equal(redirect.isAuthPath('/login'), true);
  assert.equal(redirect.isAuthPath('/register?x=1'), true);
  assert.equal(redirect.isAuthPath('/place/db-1'), false);
});

test('strong password rules match the backend', () => {
  const ok = ['Abcdef12', 'Passw0rd', 'A1' + 'b'.repeat(126), 'Mật khẩu Tốt1'];
  for (const value of ok) assert.deepEqual(plain(validation.passwordIssues(value)), [], value);
  assert.deepEqual(plain(validation.passwordIssues('Ab1')), ['length']);
  assert.deepEqual(plain(validation.passwordIssues('abcdefgh1')), ['upper']);
  assert.deepEqual(plain(validation.passwordIssues('ABCDEFGH1')), ['lower']);
  assert.deepEqual(plain(validation.passwordIssues('Abcdefgh')), ['digit']);
  assert.ok(validation.passwordIssues('A1' + 'b'.repeat(127)).includes('length'));
  assert.equal(validation.isStrongPassword('weak'), false);
});

test('register validation reports each field separately', () => {
  const run = over => validation.validateAuth({ register: true, name: 'An', email: 'an@example.com', password: 'Abcdef12', confirm: 'Abcdef12', ...over });
  assert.deepEqual(plain(run({})), {});
  assert.ok(run({ name: ' ' }).name);
  assert.ok(run({ email: 'an@' }).email);
  assert.equal(run({ password: 'abcdefgh', confirm: 'abcdefgh' }).password, validation.WEAK_PASSWORD_MESSAGE);
  assert.ok(run({ confirm: 'Abcdef13' }).confirm);
  assert.ok(run({ confirm: '' }).confirm);
  assert.deepEqual(plain(validation.validateAuth({ register: false, name: '', email: 'a@b.co', password: 'x', confirm: '' })), {});
});

test('login errors are classified by status and code', () => {
  const err = (status, code, retryAfter) => Object.assign(new Error('x'), { status, code, retryAfter });
  assert.equal(errors.classifyLoginError(err(401)).kind, 'invalid');
  assert.equal(errors.classifyLoginError(err(401)).message, errors.LOGIN_MESSAGES.invalid);
  const locked = errors.classifyLoginError(err(429, 'login_locked', 125));
  assert.equal(locked.kind, 'locked');
  assert.equal(locked.retryAfter, 125);
  assert.equal(errors.formatCountdown(locked.retryAfter), '02:05');
  assert.equal(errors.classifyLoginError(err(429, 'login_locked')).retryAfter, 60);
  assert.equal(errors.classifyLoginError(err(429, 'login_rate_limited', 30)).kind, 'ipLimited');
  assert.equal(errors.classifyLoginError(err(0, 'network')).kind, 'network');
  assert.equal(errors.classifyLoginError(new TypeError('Failed to fetch')).kind, 'network');
  assert.equal(errors.classifyLoginError(err(0, 'timeout')).kind, 'timeout');
  assert.equal(errors.classifyLoginError(err(503)).kind, 'server');
  assert.equal(errors.classifyLoginError(null).kind, 'unknown');
  assert.equal(errors.formatCountdown(0), '00:00');
  assert.equal(errors.formatCountdown(3599), '59:59');
});

function webSession({ local = {}, session = {} } = {}) {
  const make = initial => {
    const map = new Map(Object.entries(initial));
    return { getItem: k => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: k => map.delete(k) };
  };
  const localStorage = make(local);
  const sessionStorage = make(session);
  return { api: loadTs('src/services/session.web.ts', { globals: { localStorage, sessionStorage } }), localStorage, sessionStorage };
}

test('web session lives in localStorage and survives a new tab', async () => {
  const { api, localStorage, sessionStorage } = webSession();
  await api.writeSessionToken('a1');
  await api.writeRefreshToken('r1');
  assert.equal(localStorage.getItem('mg_access_token_v3'), 'a1');
  assert.equal(localStorage.getItem('mg_refresh_token_v3'), 'r1');
  assert.equal(sessionStorage.getItem('mg_access_token_v3'), null);
  assert.equal(await api.getSessionToken(), 'a1');
  await api.writeSessionToken(null);
  await api.writeRefreshToken(null);
  assert.equal(await api.getSessionToken(), null);
  assert.equal(await api.getRefreshToken(), null);
});

test('legacy sessionStorage tokens are moved to localStorage once', async () => {
  const { api, localStorage, sessionStorage } = webSession({ session: { mg_access_token_v3: 'old-a', mg_refresh_token_v3: 'old-r' } });
  assert.equal(await api.getSessionToken(), 'old-a');
  assert.equal(await api.getRefreshToken(), 'old-r');
  assert.equal(localStorage.getItem('mg_access_token_v3'), 'old-a');
  assert.equal(sessionStorage.getItem('mg_access_token_v3'), null);
  assert.equal(await api.getSessionToken(), 'old-a');
});

test('localStorage wins over stale sessionStorage and storage errors are tolerated', async () => {
  const { api } = webSession({ local: { mg_access_token_v3: 'new' }, session: { mg_access_token_v3: 'old' } });
  assert.equal(await api.getSessionToken(), 'new');
  const deny = () => { throw new Error('denied'); };
  const broken = { getItem: deny, setItem: deny, removeItem: deny };
  const blocked = loadTs('src/services/session.web.ts', { globals: { localStorage: broken, sessionStorage: broken } });
  assert.equal(await blocked.getSessionToken(), null);
  await blocked.writeSessionToken('x');
});

function api(fetchImpl) {
  return loadTs('src/services/api.ts', {
    globals: { process: { env: { EXPO_PUBLIC_API_URL: 'http://test.invalid' } }, AbortController, setTimeout, clearTimeout, fetch: fetchImpl },
  });
}
const reply = (status, body, headers = {}) => ({ ok: status < 400, status, headers: { get: k => headers[k] ?? null }, json: async () => body });

test('ApiError carries status, code and retry_after from the body', async () => {
  const service = api(async () => reply(429, { detail: 'Account temporarily locked after too many failed attempts.', code: 'login_locked', retry_after: 240 }, { 'Retry-After': '240' }));
  await assert.rejects(service.signIn('a@b.co', 'x'), e => e.status === 429 && e.code === 'login_locked' && e.retryAfter === 240 && /khóa/.test(e.message));
});

test('422 password and email errors are mapped to fields', async () => {
  const detail = [{ loc: ['body', 'password'], msg: 'Value error, weak' }, { loc: ['body', 'email'], msg: 'value is not a valid email address' }];
  const service = api(async () => reply(422, { detail }));
  await assert.rejects(service.registerUser('An', 'bad', 'weak'), e => e.status === 422 && !!e.fields.password && !!e.fields.email && !e.fields.full_name);
});

test('network failures and timeouts become coded errors', async () => {
  await assert.rejects(api(async () => { throw new TypeError('Failed to fetch'); }).signIn('a@b.co', 'x'), e => e.code === 'network' && e.status === 0);
  const aborting = api((url, init) => new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(Object.assign(new Error('a'), { name: 'AbortError' })))));
  await assert.rejects(aborting.apiFetch('/x', { timeoutMs: 1000 }), e => e.code === 'timeout');
});

test('account token is attached to data reads but not to auth endpoints or registration', async () => {
  const seen = [];
  const service = api(async (url, init) => {
    seen.push([url.replace('http://test.invalid', ''), init.headers.Authorization ?? null]);
    return reply(200, {});
  });
  service.setTokenProvider(() => 'tok');
  await service.apiFetch('/places');
  await service.apiFetch('/settings');
  await service.apiFetch('/places/1/images');
  await service.apiFetch('/auth/login', { method: 'POST', body: '{}' });
  await service.apiFetch('/users', { method: 'POST', body: '{}' });
  await service.apiFetch('/places', { token: 'explicit' });
  assert.deepEqual(seen, [['/places', 'Bearer tok'], ['/settings', 'Bearer tok'], ['/places/1/images', 'Bearer tok'], ['/auth/login', null], ['/users', null], ['/places', 'Bearer explicit']]);
  service.setTokenProvider(null);
  await service.apiFetch('/places');
  assert.equal(seen.at(-1)[1], null);
});

test('a 401 on a data read refreshes the session and retries with the new token', async () => {
  const calls = [];
  const service = api(async (url, init) => {
    calls.push(init.headers.Authorization);
    return init.headers.Authorization === 'Bearer old' ? reply(401, { detail: 'Token has expired' }) : reply(200, { ok: 1 });
  });
  service.setTokenProvider(() => 'old');
  service.setSessionRecovery(async failed => (failed === 'old' ? 'new' : null));
  assert.deepEqual(JSON.parse(JSON.stringify(await service.apiFetch('/places'))), { ok: 1 });
  assert.deepEqual(calls, ['Bearer old', 'Bearer new']);
});

test('every new or previously missing auth message has vi, en, fr and ja copy', () => {
  for (const [key, value] of Object.entries(authCopy)) {
    assert.equal(value.length, 3, key);
    value.forEach(text => assert.ok(typeof text === 'string' && text.trim().length > 0, key));
    for (const language of ['en', 'fr', 'ja']) assert.notEqual(translateUi(language, key), key, `${language}: ${key}`);
    assert.equal(translateUi('vi', key), key);
  }
  const required = [
    ...Object.values(errors.LOGIN_MESSAGES), validation.WEAK_PASSWORD_MESSAGE,
    'Vui lòng nhập mật khẩu.', 'Vui lòng nhập email.', 'Email không hợp lệ.', 'Mật khẩu xác nhận chưa khớp.', 'Email này đã được đăng ký.',
    'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.', 'Đang chuyển hướng…', 'Đang kiểm tra phiên đăng nhập…', 'Không lưu được hồ sơ.',
    'Nhập tên từ 1–100 ký tự và email hợp lệ.', 'Đã hủy yêu cầu.', 'Dịch vụ hiện chưa sẵn sàng. Vui lòng thử lại sau.',
  ];
  for (const key of required) for (const language of ['en', 'fr', 'ja']) assert.notEqual(translateUi(language, key), key, `${language}: ${key}`);
});

test('every Vietnamese message literal in the API layer is translated', () => {
  const source = fs.readFileSync('src/services/api.ts', 'utf8');
  const literals = [...source.matchAll(/"([^"\n]*)"|'([^'\n]*)'/g)].map(m => m[1] ?? m[2]).filter(s => /[À-ỹ]/.test(s) && !/^Nguồn ảnh trả HTTP/.test(s));
  assert.ok(literals.length > 10);
  const missing = literals.filter(s => ['en', 'fr', 'ja'].some(language => translateUi(language, s) === s));
  assert.deepEqual(missing, []);
});

test('guest-only copy is gone from the screens while the legacy favourites merge stays', () => {
  const read = file => fs.readFileSync(file, 'utf8');
  assert.ok(!read('src/components/auth/AuthScreen.tsx').includes('Quay lại khám phá'));
  assert.ok(!read('app/(tabs)/profile.tsx').includes('Nhà khám phá'));
  assert.ok(!read('app/(tabs)/profile.tsx').includes('router.push("/login")'));
  assert.ok(!read('src/components/PlaceReviews.tsx').includes('Đăng nhập để viết đánh giá'));
  assert.ok(!read('app/(tabs)/saved.tsx').includes('khi chưa đăng nhập'));
  assert.ok(fs.existsSync('src/services/favoriteMerge.ts'));
  assert.ok(read('src/context/AppContext.tsx').includes('mergeGuestFavorites'));
});

test('the root layout wraps every screen in the single auth gate', () => {
  assert.match(fs.readFileSync('app/_layout.tsx', 'utf8'), /<AuthGate><Stack/);
});

test('redirect rejects encoded, double-encoded and dot-segment tricks', () => {
  for (const value of ['/%2F%2Fevil', '/%5Cevil', '/%252F%252Fevil', '/./login', '/../login', '/login/../admin/../login', '/%2e%2e/login', '/..//evil', '/a/../../login/', '/%2e/register'])
    assert.equal(redirect.sanitizeRedirect(value), null, value);
});

test('redirect resolves dot-segments to a normalized internal path', () => {
  const table = [['/login/../admin', '/admin'], ['/a/./b', '/a/b'], ['/a/b/../c?x=1#t', '/a/c?x=1#t'], ['/a/..', '/'], ['/a/b/.', '/a/b/']];
  for (const [input, expected] of table) assert.equal(redirect.sanitizeRedirect(input), expected, input);
});

const gateBase = { pathname: '/', target: '/', redirectParam: undefined, hasToken: false, authLoading: false, settled: true, sessionUnverified: false, isAdmin: false, signedOutByUser: false };

test('auth gate decision table', () => {
  const table = [
    ['first load waits', { authLoading: true, settled: false }, { kind: 'wait' }],
    ['reload after first settle does not blank the app', { authLoading: true, settled: true, hasToken: true }, { kind: 'stay' }],
    ['signed out on a protected page keeps the target', { pathname: '/place/db-1', target: '/place/db-1?x=1' }, { kind: 'redirect', to: '/login?redirect=%2Fplace%2Fdb-1%3Fx%3D1' }],
    ['signed out on home goes to plain login', {}, { kind: 'redirect', to: '/login' }],
    ['explicit sign-out drops the target', { pathname: '/saved', target: '/saved', signedOutByUser: true }, { kind: 'redirect', to: '/login' }],
    ['signed out on login stays', { pathname: '/login' }, { kind: 'stay' }],
    ['signed out on register stays', { pathname: '/register/' }, { kind: 'stay' }],
    ['unverified session on a protected page shows the retry screen', { pathname: '/map', target: '/map', sessionUnverified: true }, { kind: 'unverified' }],
    ['unverified session on login stays', { pathname: '/login', sessionUnverified: true }, { kind: 'stay' }],
    ['signed in on login returns to the redirect target', { pathname: '/login', hasToken: true, redirectParam: '/place/db-12' }, { kind: 'redirect', to: '/place/db-12' }],
    ['signed in on login ignores an unsafe redirect', { pathname: '/login', hasToken: true, redirectParam: '//evil.com' }, { kind: 'redirect', to: '/' }],
    ['signed in on login ignores a dot-segment loop', { pathname: '/login', hasToken: true, redirectParam: '/../login' }, { kind: 'redirect', to: '/' }],
    ['signed-in admin on login with no target goes to admin', { pathname: '/login', hasToken: true, isAdmin: true }, { kind: 'redirect', to: '/admin' }],
    ['signed in on register goes home', { pathname: '/register', hasToken: true }, { kind: 'redirect', to: '/' }],
    ['non-admin on admin is sent home', { pathname: '/admin/places', hasToken: true }, { kind: 'redirect', to: '/' }],
    ['admin on admin stays', { pathname: '/admin', hasToken: true, isAdmin: true }, { kind: 'stay' }],
    ['signed in on a normal page stays', { pathname: '/map', hasToken: true }, { kind: 'stay' }],
  ];
  for (const [name, patch, expected] of table) assert.deepEqual(plain(redirect.gateDecision({ ...gateBase, ...patch })), expected, name);
});
