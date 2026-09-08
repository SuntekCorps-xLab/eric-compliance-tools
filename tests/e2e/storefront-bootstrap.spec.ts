import { expect, test } from '@playwright/test';

const harness = '/tests/fixtures/shopify-storefront-harness.html';

for (const surface of ['homepage', 'workspace']) {
  test(`keeps theme content visible when ${surface} configuration is invalid`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`${harness}?surface=${surface}&invalid=1`);
    await expect(page.getByRole('alert')).toContainText('ERiC configuration unavailable');
    await expect(page.locator('header.fixture-theme-chrome')).toBeVisible();
    await expect(page.locator('html')).not.toHaveClass(/eric-.*-active/);
    expect(errors).toEqual([]);
  });
}

test('contains a malformed first block and still renders its valid sibling', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`${harness}?sibling=1`);
  await expect(page.getByRole('alert')).toContainText('ERiC configuration unavailable');
  await expect(page.locator('.landing-page')).toBeVisible();
  await expect(page.locator('header.fixture-theme-chrome')).toBeVisible();
  await expect(page.getByRole('alert')).not.toContainText('password');
  expect(errors).toEqual([]);
});

for (const guest of [false, true]) {
  test(`shows a bounded connecting state and retry for a stalled ${guest ? 'guest' : 'customer'} exchange`, async ({
    page,
  }) => {
    let calls = 0;
    let stalled = true;
    if (guest)
      await page.addInitScript(() => {
        localStorage.setItem(
          'eric-shopify-guest-v1',
          JSON.stringify({
            deviceId: 'synthetic-device-123456789',
            resumeToken: 'synthetic-resume-token-long-enough-123',
            expiresAt: '2099-01-01T00:00:00Z',
          }),
        );
      });
    await page.clock.install();
    await page.route('**/apps/eric/*session', async (route) => {
      calls += 1;
      if (stalled) return;
      await route.fulfill({
        json: {
          code: 200,
          token: 'synthetic-session',
          data: {
            user: { id: 42, last_login_tenant: 5164 },
            ...(guest
              ? {
                  demo: {
                    is_demo: true,
                    resume_token: 'synthetic-resume-token-long-enough-123',
                    expires_at: '2099-01-01T00:00:00Z',
                  },
                }
              : {}),
          },
        },
      });
    });
    await page.route('https://tenant-api.example.com/**', async (route) => {
      await route.fulfill({
        json: {
          code: 200,
          data: { id: 5164, point_total: 500, point_margin: 500, permissions: [] },
        },
      });
    });
    await page.goto(`${harness}?authenticated=${guest ? 0 : 1}`);
    await expect(page.getByRole('status')).toContainText('Connecting to ERiC');
    await expect(page.locator('.landing-page')).toHaveCount(0);
    await expect.poll(() => calls).toBe(1);
    await page.clock.fastForward(15_001);
    await expect(page.getByRole('alert')).toContainText('connection timed out');
    await expect(page.locator('.landing-page')).toHaveCount(0);
    stalled = false;
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(page.locator('.landing-page')).toBeVisible();
    expect(calls).toBe(2);
  });
}

test('uses real configured public links and omits unset placeholders', async ({ page }) => {
  await page.goto(harness);
  const footer = page.getByRole('navigation', { name: 'Footer', exact: true });
  await expect(footer.getByRole('link', { name: /^(Terms|Privacy|Contact)$/ })).toHaveCount(0);
  await page.addInitScript(() => {
    document.addEventListener('DOMContentLoaded', () => {
      const root = document.querySelector<HTMLElement>('[data-eric-root]');
      if (!root) return;
      root.dataset.termsUrl = 'https://shop.example.com/pages/terms';
      root.dataset.privacyUrl = 'https://shop.example.com/pages/privacy';
      root.dataset.supportEmail = 'support@shop.example.com';
    });
  });
  await page.reload();
  await expect(footer.getByRole('link', { name: 'Terms', exact: true })).toHaveAttribute(
    'href',
    'https://shop.example.com/pages/terms',
  );
  await expect(footer.getByRole('link', { name: 'Privacy', exact: true })).toHaveAttribute(
    'href',
    'https://shop.example.com/pages/privacy',
  );
  await expect(footer.getByRole('link', { name: 'Contact', exact: true })).toHaveAttribute(
    'href',
    'mailto:support@shop.example.com',
  );
});

test('exposes homepage selectors as keyboard-operable pressed buttons', async ({
  page,
  isMobile,
}) => {
  await page.goto(harness);
  for (const name of ['Compliance checks', 'How ERiC works', 'ERiC resources']) {
    const group = page.getByRole('group', { name, exact: true });
    const buttons = group.getByRole('button');
    if (isMobile) {
      // iOS sequential keyboard navigation depends on the user's Full Keyboard Access setting.
      await buttons.nth(1).focus();
    } else {
      await buttons.nth(0).focus();
      await page.keyboard.press('Tab');
      await expect(buttons.nth(1)).toBeFocused();
    }
    await page.keyboard.press('Space');
    await expect(buttons.nth(1)).toHaveAttribute('aria-pressed', 'true');
    await expect(buttons.nth(0)).toHaveAttribute('aria-pressed', 'false');
  }
});
