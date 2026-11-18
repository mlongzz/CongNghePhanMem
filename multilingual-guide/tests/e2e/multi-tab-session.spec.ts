import { test, expect, type Page, type Route } from '@playwright/test';
import { ACCESS_KEY, API, ORIGIN, REFRESH_KEY, loginApi, registerApi, storageStateFor } from './auth';

const PASSWORD = 'TestPassword123!';
const unique = (label: string) => `${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
const stored = (page: Page, key: string) => page.evaluate(name => localStorage.getItem(name), key);

test('two tabs recovering an expired access token at the same time both stay signed in, and signing out in one signs out the other', async ({ browser, request }) => {
  const email = unique('tabs');
  expect((await registerApi(request, 'Tabs User', email, PASSWORD)).status()).toBe(201);
  const tokens = await loginApi(request, email, PASSWORD);
  const context = await browser.newContext({ storageState: storageStateFor(tokens) });
  try {
    const pages = [await context.newPage(), await context.newPage()];
    const held: Route[] = [];
    let releaseAll: () => void = () => {};
    const bothHeld = new Promise<void>(resolve => { releaseAll = resolve; });
    for (const page of pages) {
      let expired = false;
      await page.route(url => url.origin === API && url.pathname === '/settings', async route => {
        if (expired) return route.continue();
        expired = true;
        held.push(route);
        if (held.length === 2) releaseAll();
        await bothHeld;
        await route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ detail: 'Could not validate credentials' }) });
      });
    }
    const refreshes: number[] = [];
    context.on('response', response => { if (new URL(response.url()).pathname === '/auth/refresh') refreshes.push(response.status()); });
    await Promise.all(pages.map(page => page.goto(`${ORIGIN}/`)));
    await bothHeld;
    await expect.poll(() => refreshes.length, { timeout: 15_000 }).toBeGreaterThan(0);
    await pages[0].waitForTimeout(1500);
    expect(refreshes.every(status => status === 200)).toBe(true);
    for (const page of pages) {
      await expect(page).toHaveURL(`${ORIGIN}/`);
      await expect(page.getByRole('tab', { name: /Khám phá/ })).toBeVisible();
    }
    const access = await stored(pages[0], ACCESS_KEY);
    expect(access).not.toBe(tokens.access_token);
    expect(await stored(pages[1], ACCESS_KEY)).toBe(access);
    expect(await stored(pages[0], REFRESH_KEY)).toBeTruthy();
    expect((await request.get(`${API}/users/me`, { headers: { Authorization: `Bearer ${access}` } })).status()).toBe(200);

    await pages[0].goto(`${ORIGIN}/profile`);
    await pages[0].getByText('Đăng xuất', { exact: true }).click();
    await expect(pages[0]).toHaveURL(`${ORIGIN}/login`);
    await expect(pages[1]).toHaveURL(`${ORIGIN}/login`);
    await expect(pages[1].getByLabel('Địa chỉ email', { exact: true })).toBeVisible();
  } finally {
    await context.close();
  }
});
