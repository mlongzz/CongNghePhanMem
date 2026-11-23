import { test, expect, type Page } from '@playwright/test';
import { GUEST_STATE } from './auth';

test.use({ storageState: GUEST_STATE });
const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQAAAABJRU5ErkJggg==', 'base64');
const stops = [
  { id: 81001, name: 'Điểm bắt đầu', latitude: 10.7764, longitude: 106.6993 },
  { id: 81002, name: 'Điểm giữa', latitude: 10.7804, longitude: 106.7003 },
  { id: 81003, name: 'Điểm cuối', latitude: 10.7854, longitude: 106.7013 },
].map(stop => ({ ...stop, category: 'Văn hóa', publication_status: 'published' }));
const journeys = [
  { id: 98765, name: 'Hành trình kiểm tra quãng đường', description: 'Ba điểm dừng theo thứ tự', stops },
  { id: 98766, name: 'Hành trình một điểm', stops: stops.slice(0, 1) },
  { id: 98767, name: 'Hành trình trống', stops: [] },
];

async function admin(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Địa chỉ email', { exact: true }).fill('admin@e2e.example.com');
  await page.getByLabel('Mật khẩu', { exact: true }).fill('TestPassword123!');
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

test.beforeEach(async ({ page }) => {
  await page.route('https://tile.openstreetmap.org/**', route => route.fulfill({ contentType: 'image/png', body: pixel }));
  await page.route('**/admin/overview?**', route => route.fulfill({ json: {
    kpis: { users: 9, places: 20, guides: 60, journeys: 6, plays: 0, completed: 0, visits: 0 },
    series: [], languages: [], popular: [],
  } }));
});

for (const width of [390, 1440]) {
  test(`Admin overview expands distances and map inside the Journeys KPI at ${width}px`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    let requests = 0;
    await page.setViewportSize({ width, height: 900 });
    await page.route('**/admin/journeys?**', route => {
      requests++;
      const pageNumber = Number(new URL(route.request().url()).searchParams.get('page'));
      return route.fulfill({ json: { items: pageNumber === 1 ? journeys : [{ id: 98768, name: 'Hành trình trang hai', stops }], total: 6, pages: 2 } });
    });
    await admin(page);
    const card = page.getByTestId('admin-journey-overview');
    await expect(card.getByText('6', { exact: true })).toBeVisible();
    expect(requests).toBe(0);
    await card.getByRole('button', { name: 'Mở rộng hành trình', exact: true }).click();
    const selected = card.getByTestId('admin-journey-selected');
    await expect(selected.getByTestId('route-total-distance')).toHaveText('≈ 1.3 km');
    await expect(selected.getByTestId('route-total-time')).toHaveText('~18 phút');
    await expect(selected.getByTestId('route-leg-distance')).toHaveCount(2);
    await expect(card.locator('.admin-journey-stop')).toHaveCount(3);
    await expect(card.locator('.admin-journey-weight')).toHaveCount(2);
    await card.getByTestId('admin-journey-map').scrollIntoViewIfNeeded();
    await expect(card.locator('.admin-journey-weight').first()).toBeVisible();
    const sum = await card.locator('[data-leg-km]').evaluateAll(nodes => nodes.reduce((value, node) => value + Number((node as HTMLElement).dataset.legKm), 0));
    expect(`≈ ${sum.toFixed(1)} km`).toBe(await selected.getByTestId('route-total-distance').innerText());
    expect(await card.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
    await page.screenshot({ path: `.test-artifacts/admin-journey-overview-${width}.png` });
    await card.getByRole('button', { name: 'Thu gọn hành trình', exact: true }).click();
    await expect(card.getByTestId('admin-journey-details')).toHaveCount(0);
    await expect(card.getByText('6', { exact: true })).toBeVisible();
    await expect(page).toHaveURL(/\/admin$/);
    await card.getByRole('button', { name: 'Mở rộng hành trình', exact: true }).click();
    await card.getByRole('button', { name: 'Xem hành trình Hành trình một điểm', exact: true }).click();
    await expect(selected.getByTestId('route-total-distance')).toHaveText('≈ 0 m');
    await expect(card.locator('.admin-journey-weight')).toHaveCount(0);
    await card.getByRole('button', { name: 'Xem hành trình Hành trình trống', exact: true }).click();
    await expect(selected.getByText('Hành trình chưa có điểm dừng.', { exact: true })).toBeVisible();
    await expect(card.getByTestId('admin-journey-map')).toHaveCount(0);
    await card.getByRole('button', { name: 'Trang hành trình sau', exact: true }).click();
    await expect(selected.getByRole('heading', { name: 'Hành trình trang hai', exact: true })).toBeVisible();
    await expect(card.getByText('6', { exact: true })).toBeVisible();
    expect(errors).toEqual([]);
  });
}

test('journey load errors can be retried inside the KPI without replacing the Dashboard', async ({ page }) => {
  let fail = true;
  await page.route('**/admin/journeys?**', route => fail ? route.fulfill({ status: 503 }) : route.fulfill({ json: { items: journeys, total: 3, pages: 1 } }));
  await admin(page);
  const card = page.getByTestId('admin-journey-overview');
  await card.getByRole('button', { name: 'Mở rộng hành trình', exact: true }).click();
  await expect(card.getByRole('alert')).toBeVisible();
  await expect(card.getByText('6', { exact: true })).toBeVisible();
  fail = false;
  await card.getByRole('button', { name: 'Thử lại', exact: true }).click();
  await expect(card.getByTestId('route-summary')).toBeVisible();
  await expect(card.getByRole('alert')).toHaveCount(0);
});
