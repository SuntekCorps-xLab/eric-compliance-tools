import { expect, test } from '@playwright/test';

const harness = '/tests/fixtures/shopify-storefront-harness.html?surface=workspace';

test('opens an isolated storefront guest session and performs the one-use refill', async ({
  page,
}) => {
  let balance = 200;
  const calls = { session: 0, account: 0, refill: 0 };

  await page.route('**/apps/eric/demo-session**', async (route) => {
    calls.session += 1;
    const body = route.request().postDataJSON() as {
      device_id?: string;
      resume_token?: string;
    };
    expect(body.device_id).toMatch(/^[A-Za-z0-9._:-]{16,128}$/);
    if (calls.session === 1) {
      expect(body.resume_token).toBeUndefined();
    } else {
      expect(body.resume_token).toBe('opaque-resume-token-long-enough-for-browser-123');
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 200,
        token: 'guest-eric-jwt',
        data: {
          user: {
            id: 84,
            account: 'guest-user-84',
            last_login_tenant: 9002,
          },
          shopify: {
            shop_id: '123456789',
            storefront_domain: 'demo-shop.myshopify.com',
            display_name: 'Guest demo',
          },
          demo: {
            is_demo: true,
            session_id: 'demo-session-one',
            resume_token: 'opaque-resume-token-long-enough-for-browser-123',
            display_name: 'Guest demo',
            is_first_session: calls.session === 1,
            initial_points: 200,
            refill_points: 200,
            remaining_refills: 1,
            expires_at: '2099-08-26T12:00:00+08:00',
            idle_expires_at: '2099-08-20T12:00:00+08:00',
          },
        },
      }),
    });
  });

  await page.route('**/account/account?tenant_id=9002', async (route) => {
    calls.account += 1;
    expect(route.request().headers().authorization).toBe('Bearer guest-eric-jwt');
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 200,
        data: {
          id: 9002,
          company_name: 'ERiC private guest workspace',
          point_total: balance,
          point_margin: balance,
          permissions: [],
          is_api_service_enable: 0,
          is_api_token_enable: 0,
          api_expire_time: '',
        },
      }),
    });
  });

  await page.route('**/shopify/demo/refill', async (route) => {
    calls.refill += 1;
    expect(route.request().headers().authorization).toBe('Bearer guest-eric-jwt');
    balance = 400;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 200,
        data: {
          points: 200,
          remaining_refills: 0,
          expires_at: '2099-08-26T12:00:00+08:00',
        },
      }),
    });
  });

  await page.route('**/Eric/v3/policy-compliance/sites', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, code: 200, data: [] }),
    });
  });
  await page.route('**/Eric/v5/policy-compliance/feature-word-list', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        code: 200,
        data: { current_page: 1, per_page: 100, total: 0, data: [] },
      }),
    });
  });

  await page.goto(harness);
  await page.getByRole('button', { name: /Start guest demo/ }).click();
  await expect(page.getByRole('heading', { name: 'Compliance workspace' })).toBeVisible();
  await expect(page.getByTestId('balance-value')).toHaveText('200');
  await expect(page.locator('.account-name em')).toHaveText('Demo');

  await page.getByRole('button', { name: 'Refill demo' }).click();
  await page.getByRole('button', { name: /200 demo credits/ }).click({ force: true });
  await expect(page.getByTestId('balance-value')).toHaveText('400');
  await expect(page.getByText('200 demo credits added. Your balance is ready.')).toBeVisible();
  await expect(page.getByRole('button', { name: /Demo refill already used/ })).toBeDisabled();
  expect(calls.refill).toBe(1);
  expect(calls.session).toBeGreaterThanOrEqual(1);
  expect(calls.account).toBeGreaterThanOrEqual(2);

  const storedCredential = await page.evaluate(
    () => localStorage.getItem('eric-shopify-guest-v1') ?? '',
  );
  expect(storedCredential).toContain('opaque-resume-token');
  expect(storedCredential).not.toContain('guest-eric-jwt');
});
