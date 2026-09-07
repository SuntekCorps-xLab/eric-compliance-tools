import { expect, test, type Page } from '@playwright/test';

const harness = '/tests/fixtures/shopify-storefront-harness.html?surface=workspace&authenticated=1';

async function setupTask(page: Page, initialStatus = 1) {
  const task = { status: initialStatus, submissions: 0, polls: 0, results: 0 };
  // Accelerate only the polling delay; run the real 45-attempt loop and storefront bundle.
  await page.addInitScript(() => {
    const schedule = window.setTimeout.bind(window);
    window.setTimeout = (handler, timeout, ...args: unknown[]) =>
      schedule(handler, timeout === 2000 ? 0 : timeout, ...args);
  });
  await page.route('**/apps/eric/session', async (route) => {
    await route.fulfill({
      json: {
        code: 200,
        token: 'synthetic-session',
        data: {
          user: { id: 42, account: 'synthetic-user', last_login_tenant: 5164 },
          shopify: { display_name: 'Synthetic customer', is_first_register: false },
        },
      },
    });
  });
  await page.route('https://tenant-api.example.com/**', async (route) => {
    expect(new URL(route.request().url()).pathname).toBe('/account/account');
    await route.fulfill({
      json: {
        code: 200,
        data: {
          id: 5164,
          company_name: 'Synthetic tenant',
          point_total: 500,
          point_margin: 500,
          permissions: [],
        },
      },
    });
  });
  await page.route('https://compliance-api.example.com/Eric/**', async (route) => {
    const url = new URL(route.request().url());
    let data: unknown;
    switch (url.pathname) {
      case '/Eric/v3/policy-compliance/sites':
        data = [];
        break;
      case '/Eric/v5/policy-compliance/feature-word-list':
        data = { current_page: 1, per_page: 100, total: 0, data: [] };
        break;
      case '/Eric/v5/save-check':
        task.submissions += 1;
        data = { id: '9876' };
        break;
      case '/Eric/v5/get-check-status':
        expect(url.searchParams.get('work_space_id')).toBe('9876');
        task.polls += 1;
        data = { trademark: task.status };
        break;
      case '/Eric/v4/trademark/detail':
        expect(route.request().postDataJSON()).toEqual({ work_space_id: 9876 });
        task.results += 1;
        data = {};
        break;
      default:
        throw new Error(`Unexpected synthetic API request: ${url.pathname}`);
    }
    await route.fulfill({ json: { code: 200, data, request_id: 'synthetic-request' } });
  });
  await page.goto(harness);
  await expect(page.getByRole('heading', { name: 'Compliance workspace' })).toBeVisible();
  await page.locator('#product-title').fill('Synthetic desk lamp');
  return task;
}

async function savedActivity(page: Page) {
  return page.evaluate(() => {
    const saved = JSON.parse(sessionStorage.getItem('eric-shopify-session-v1') ?? '{}') as {
      state?: { liveWorkspace?: { activity?: { workspaceId: string; status: string } } };
    };
    return saved.state?.liveWorkspace?.activity ?? null;
  });
}

test('retains a timed-out task across reload and resumes it without another submission', async ({
  page,
}) => {
  const task = await setupTask(page);
  await page.getByRole('button', { name: 'Run live check →' }).click();
  const resume = page.getByRole('button', { name: 'Check existing task again →' });
  await expect(resume).toBeEnabled();
  await expect(page.getByText(/^RUNNING · The ERiC task is still running/)).toBeVisible();
  expect(task).toMatchObject({ submissions: 1, polls: 45, results: 0 });
  expect(await savedActivity(page)).toMatchObject({ workspaceId: '9876', status: 'RUNNING' });

  await page.reload();
  await expect(resume).toBeEnabled();
  await expect(page.getByText(/^RUNNING · The ERiC task is still running/)).toBeVisible();
  expect(task).toMatchObject({ submissions: 1, polls: 90, results: 0 });
  expect(await savedActivity(page)).toMatchObject({ workspaceId: '9876', status: 'RUNNING' });

  // Resuming an existing task must not require re-entering the original form input.
  await page.locator('#product-title').fill('');
  task.status = 3;
  await resume.click();
  await expect(
    page.getByRole('heading', { name: 'Detection completed', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Run live check →' })).toBeEnabled();
  expect(task).toMatchObject({ submissions: 1, polls: 91, results: 1 });
  expect(await savedActivity(page)).toBeNull();
});

test('keeps server-reported failure distinct from polling exhaustion', async ({ page }) => {
  const task = await setupTask(page, 2);
  await page.getByRole('button', { name: 'Run live check →' }).click();
  await expect(page.getByRole('heading', { name: 'Detection failed', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Run live check →' })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Check existing task again →' })).toHaveCount(0);
  expect(task).toMatchObject({ submissions: 1, polls: 1, results: 0 });
  expect(await savedActivity(page)).toBeNull();
});
