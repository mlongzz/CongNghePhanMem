import { test, expect, type Page } from '@playwright/test';
import { ACCESS_KEY, GUEST_STATE, REFRESH_KEY, VIEWER_EMAIL, VIEWER_PASSWORD, registerApi } from './auth';

test.use({ storageState: GUEST_STATE });

const STRONG = 'TestPassword123!';
const unique = (label: string) => `${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;

async function fillLogin(page: Page, email: string, password: string) {
  await page.getByLabel('Địa chỉ email', { exact: true }).fill(email);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(password);
}

async function signIn(page: Page, email: string, password: string) {
  await fillLogin(page, email, password);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
}

test('opening the app signed out goes to the login screen and shows no app content', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByLabel('Địa chỉ email', { exact: true })).toBeVisible();
  await expect(page.getByRole('tab', { name: /Khám phá/ })).toHaveCount(0);
  await expect(page.getByText('Quay lại khám phá')).toHaveCount(0);
});

test('every protected route redirects to login and keeps the target', async ({ page }) => {
  for (const route of ['/map', '/saved', '/profile', '/journeys', '/history', '/account', '/admin', '/place/db-1']) {
    await page.goto(route);
    await expect(page).toHaveURL(new RegExp(`/login\\?redirect=${encodeURIComponent(route).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`));
  }
});

test('a deep link returns to the same screen after signing in', async ({ page }) => {
  await page.goto('/place/db-1');
  await expect(page).toHaveURL(/\/login\?redirect=%2Fplace%2Fdb-1$/);
  await signIn(page, VIEWER_EMAIL, VIEWER_PASSWORD);
  await expect(page).toHaveURL(/\/place\/db-1$/);
  await expect(page.getByText('Browser Test Museum', { exact: true }).first()).toBeVisible();
});

test('a deep link keeps its query string through sign-in', async ({ page }) => {
  await page.goto('/map?journey=1');
  await expect(page).toHaveURL(/\/login\?redirect=%2Fmap%3Fjourney%3D1$/);
  await signIn(page, VIEWER_EMAIL, VIEWER_PASSWORD);
  await expect(page).toHaveURL(/\/map\?journey=1$/);
});

test('an external redirect target is ignored after sign-in', async ({ page }) => {
  await page.goto('/login?redirect=https%3A%2F%2Fevil.example.com%2F');
  await signIn(page, VIEWER_EMAIL, VIEWER_PASSWORD);
  await expect(page).toHaveURL(/127\.0\.0\.1:8099\/$/);
});

test('a signed-in user opening login or register is moved on', async ({ page, request }) => {
  const email = unique('moved');
  expect((await registerApi(request, 'Moved User', email, STRONG)).status()).toBe(201);
  await page.goto('/login');
  await signIn(page, email, STRONG);
  await expect(page).toHaveURL(/\/$/);
  await page.goto('/register');
  await expect(page).toHaveURL(/\/$/);
  await page.goto('/login?redirect=%2Fsaved');
  await expect(page).toHaveURL(/\/saved$/);
});

test('registration shows an error under each invalid field', async ({ page }) => {
  await page.goto('/register');
  await page.getByRole('button', { name: 'Tạo tài khoản', exact: true }).click();
  const alerts = page.getByRole('alert');
  await expect(alerts.filter({ hasText: 'Vui lòng nhập họ và tên.' })).toBeVisible();
  await expect(alerts.filter({ hasText: 'Vui lòng nhập email.' })).toBeVisible();
  await expect(alerts.filter({ hasText: 'Vui lòng nhập mật khẩu.' })).toBeVisible();
  await expect(alerts.filter({ hasText: 'Vui lòng nhập lại mật khẩu.' })).toBeVisible();
  await page.getByLabel('Họ và tên', { exact: true }).fill('An Nguyen');
  await page.getByLabel('Địa chỉ email', { exact: true }).fill('khong-hop-le');
  await page.getByLabel('Mật khẩu', { exact: true }).fill('abcdefgh');
  await page.getByLabel('Xác nhận mật khẩu', { exact: true }).fill('abcdefg');
  await page.getByRole('button', { name: 'Tạo tài khoản', exact: true }).click();
  await expect(alerts.filter({ hasText: 'Email không hợp lệ.' })).toBeVisible();
  await expect(alerts.filter({ hasText: 'Mật khẩu cần 8–128 ký tự, có chữ thường, chữ hoa và chữ số.' })).toBeVisible();
  await expect(alerts.filter({ hasText: 'Mật khẩu xác nhận chưa khớp.' })).toBeVisible();
  await expect(page).toHaveURL(/\/register$/);
});

test('registration requires lowercase, uppercase and a digit', async ({ page }) => {
  await page.goto('/register');
  await page.getByLabel('Họ và tên', { exact: true }).fill('An Nguyen');
  await page.getByLabel('Địa chỉ email', { exact: true }).fill(unique('weak'));
  for (const weak of ['abcdefgh1', 'ABCDEFGH1', 'Abcdefgh']) {
    await page.getByLabel('Mật khẩu', { exact: true }).fill(weak);
    await page.getByLabel('Xác nhận mật khẩu', { exact: true }).fill(weak);
    await page.getByRole('button', { name: 'Tạo tài khoản', exact: true }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Mật khẩu cần 8–128 ký tự, có chữ thường, chữ hoa và chữ số.' })).toBeVisible();
    await expect(page).toHaveURL(/\/register$/);
  }
});

test('both password fields can be shown and hidden', async ({ page }) => {
  await page.goto('/register');
  await expect(page.getByRole('button', { name: 'Hiện mật khẩu' })).toHaveCount(2);
  const first = page.getByLabel('Mật khẩu', { exact: true });
  await first.fill(STRONG);
  await expect(first).toHaveAttribute('type', 'password');
  await page.getByRole('button', { name: 'Hiện mật khẩu' }).first().click();
  await expect(first).not.toHaveAttribute('type', 'password');
  await page.getByRole('button', { name: 'Ẩn mật khẩu' }).click();
  await expect(first).toHaveAttribute('type', 'password');
});

test('a server 422 on a field is shown under that field', async ({ page }) => {
  await page.route('**/users', route => route.request().method() === 'POST'
    ? route.fulfill({ status: 422, contentType: 'application/json', body: JSON.stringify({ detail: [{ loc: ['body', 'email'], msg: 'value is not a valid email address' }] }) })
    : route.fallback());
  await page.goto('/register');
  await page.getByLabel('Họ và tên', { exact: true }).fill('An Nguyen');
  await page.getByLabel('Địa chỉ email', { exact: true }).fill('an@example.com');
  await page.getByLabel('Mật khẩu', { exact: true }).fill(STRONG);
  await page.getByLabel('Xác nhận mật khẩu', { exact: true }).fill(STRONG);
  await page.getByRole('button', { name: 'Tạo tài khoản', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Địa chỉ email không hợp lệ. Hãy kiểm tra lại' })).toBeVisible();
  await expect(page).toHaveURL(/\/register$/);
});

test('an already registered email is reported under the email field', async ({ page }) => {
  await page.goto('/register');
  await page.getByLabel('Họ và tên', { exact: true }).fill('An Nguyen');
  await page.getByLabel('Địa chỉ email', { exact: true }).fill(VIEWER_EMAIL);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(STRONG);
  await page.getByLabel('Xác nhận mật khẩu', { exact: true }).fill(STRONG);
  await page.getByRole('button', { name: 'Tạo tài khoản', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Email này đã được đăng ký.' })).toBeVisible();
});

test('a wrong password and an unknown email give the same message', async ({ page }) => {
  await page.goto('/login');
  await signIn(page, VIEWER_EMAIL, 'WrongPassword999');
  const alert = page.getByRole('alert').filter({ hasText: 'Email hoặc mật khẩu không đúng.' });
  await expect(alert).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
  await signIn(page, unique('nobody'), 'WrongPassword999');
  await expect(alert).toBeVisible();
  await expect(page.getByText(/không tồn tại|chưa đăng ký/i)).toHaveCount(0);
});

test('a locked account shows a countdown and disables sign-in until it ends', async ({ page }) => {
  await page.route('**/auth/login', route => route.fulfill({
    status: 429, contentType: 'application/json', headers: { 'Retry-After': '4' },
    body: JSON.stringify({ detail: 'Account temporarily locked after too many failed attempts.', code: 'login_locked', retry_after: 4 }),
  }));
  await page.goto('/login');
  await signIn(page, VIEWER_EMAIL, VIEWER_PASSWORD);
  await expect(page.getByRole('alert').filter({ hasText: /Tài khoản tạm khóa do nhập sai nhiều lần\. Thử lại sau 00:0[1-4]/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Đăng nhập', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Đăng nhập', exact: true })).toBeEnabled({ timeout: 10_000 });
  await expect(page.getByText(/Tài khoản tạm khóa/)).toHaveCount(0);
});

test('too many attempts from one address is reported separately', async ({ page }) => {
  await page.route('**/auth/login', route => route.fulfill({
    status: 429, contentType: 'application/json',
    body: JSON.stringify({ detail: 'Too many login attempts. Try again later.', code: 'login_rate_limited', retry_after: 30 }),
  }));
  await page.goto('/login');
  await signIn(page, VIEWER_EMAIL, VIEWER_PASSWORD);
  await expect(page.getByRole('alert').filter({ hasText: 'Bạn đã thử đăng nhập quá nhiều lần.' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Đăng nhập', exact: true })).toBeDisabled();
});

test('losing the network during sign-in shows an actionable message and allows a retry', async ({ page }) => {
  await page.route('**/auth/login', route => route.abort('failed'));
  await page.goto('/login');
  await signIn(page, VIEWER_EMAIL, VIEWER_PASSWORD);
  await expect(page.getByRole('alert').filter({ hasText: 'Không thể kết nối máy chủ. Vui lòng kiểm tra mạng và thử lại.' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Đăng nhập', exact: true })).toBeEnabled();
  await page.unroute('**/auth/login');
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
});

test('a server error during sign-in is reported', async ({ page }) => {
  await page.route('**/auth/login', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ detail: 'down' }) }));
  await page.goto('/login');
  await signIn(page, VIEWER_EMAIL, VIEWER_PASSWORD);
  await expect(page.getByRole('alert').filter({ hasText: 'Dịch vụ đang gặp sự cố. Vui lòng thử lại sau.' })).toBeVisible();
});

test('signing out blocks the app again and a new tab keeps the session before that', async ({ page, context, request }) => {
  const email = unique('session');
  expect((await registerApi(request, 'Session User', email, STRONG)).status()).toBe(201);
  await page.goto('/login');
  await signIn(page, email, STRONG);
  await expect(page).toHaveURL(/\/$/);
  expect(await page.evaluate(key => localStorage.getItem(key), ACCESS_KEY)).toBeTruthy();
  expect(await page.evaluate(key => sessionStorage.getItem(key), ACCESS_KEY)).toBeNull();
  const second = await context.newPage();
  await second.goto('/');
  await expect(second).toHaveURL(/\/$/);
  await expect(second.getByRole('tab', { name: /Khám phá/ })).toBeVisible();
  await second.close();
  await page.goto('/profile');
  await page.getByText('Đăng xuất', { exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  expect(await page.evaluate(key => localStorage.getItem(key), REFRESH_KEY)).toBeNull();
  await page.goto('/');
  await expect(page).toHaveURL(/\/login$/);
  await page.goto('/place/db-1');
  await expect(page).toHaveURL(/\/login\?redirect=%2Fplace%2Fdb-1$/);
});

test('a stored session left in the old sessionStorage is migrated and still signs in', async ({ page, request }) => {
  const email = unique('legacy');
  expect((await registerApi(request, 'Legacy User', email, STRONG)).status()).toBe(201);
  const tokens = await (await request.post('http://127.0.0.1:8765/auth/login', { data: { email, password: STRONG } })).json();
  await page.addInitScript(({ access, refresh, accessKey, refreshKey }) => {
    if (!sessionStorage.getItem('migrated-once') && !localStorage.getItem(accessKey)) {
      sessionStorage.setItem('migrated-once', '1');
      sessionStorage.setItem(accessKey, access);
      sessionStorage.setItem(refreshKey, refresh);
    }
  }, { access: tokens.access_token, refresh: tokens.refresh_token, accessKey: ACCESS_KEY, refreshKey: REFRESH_KEY });
  await page.goto('/saved');
  await expect(page.getByText('Địa điểm yêu thích', { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/saved$/);
  expect(await page.evaluate(key => localStorage.getItem(key), ACCESS_KEY)).toBeTruthy();
  expect(await page.evaluate(key => sessionStorage.getItem(key), ACCESS_KEY)).toBeNull();
});

test('an expired session returns to login with the target and an explanation', async ({ page }) => {
  await page.goto('/login');
  await page.evaluate(({ accessKey, refreshKey }) => {
    localStorage.setItem(accessKey, 'expired.access.token');
    localStorage.setItem(refreshKey, 'expired-refresh-token');
  }, { accessKey: ACCESS_KEY, refreshKey: REFRESH_KEY });
  await page.goto('/place/db-1');
  await expect(page).toHaveURL(/\/login\?redirect=%2Fplace%2Fdb-1$/);
  await expect(page.getByRole('alert').filter({ hasText: 'Phiên đăng nhập đã hết hạn' })).toBeVisible();
  expect(await page.evaluate(key => localStorage.getItem(key), ACCESS_KEY)).toBeNull();
});

test('a network failure while checking the session keeps the user on the screen with a retry', async ({ page }) => {
  await page.addInitScript(({ accessKey, refreshKey }) => {
    localStorage.setItem(accessKey, 'some.access.token');
    localStorage.setItem(refreshKey, 'some-refresh-token');
  }, { accessKey: ACCESS_KEY, refreshKey: REFRESH_KEY });
  await page.route('**/users/me', route => route.abort('failed'));
  await page.goto('/saved');
  await expect(page.getByText('Chưa xác minh được phiên đăng nhập do lỗi kết nối.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Thử lại', exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/saved$/);
});
