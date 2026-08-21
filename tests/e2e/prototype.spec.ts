import { expect, test } from '@playwright/test';

test('renders the complete compliance proposition', async ({ page }) => {
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Check before you list. Sell with confidence.' }),
  ).toBeVisible();
  await expect(page.getByText(/P001 · P002 · P004-P007/)).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'From first click to review-ready result' }),
  ).toBeVisible();
  await expect(page.locator('.prototype-banner')).toHaveCount(0);
  await expect(
    page.getByRole('heading', { name: 'Compliance workspace', exact: true }),
  ).not.toBeVisible();
  await page
    .locator('.story-card')
    .nth(1)
    .getByRole('button', { name: /Explore the workflow/i })
    .click();
  await expect(page).toHaveURL(/\/workspace\?check=T001$/);
  await expect(
    page.getByRole('heading', { name: 'Open your compliance workspace.' }),
  ).toBeVisible();
});

test('authorizes a mock Shopify account and grants 200 test credits', async ({ page }) => {
  await page.goto('/');
  await page
    .getByRole('button', { name: /Create account/i })
    .first()
    .click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Create account with Shopify' }).click();
  await expect(page).toHaveURL(/\/auth\/callback/);
  await expect(page.getByText(/200 test credits added/i)).toBeVisible();
  await expect(page).toHaveURL(/\/workspace$/, { timeout: 5_000 });
  await expect(page.getByRole('heading', { name: 'Compliance workspace' })).toBeVisible();
  await expect(page.getByTestId('balance-value')).toHaveText('200');
  await expect(page.getByText('Shopify new-user credits added')).toBeVisible();
  const accountMenu = page.getByRole('button', { name: 'Account menu for Alex Morgan' });
  await expect(accountMenu).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBeLessThanOrEqual(1);

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Compliance workspace' })).toBeVisible();
  await expect(accountMenu).toBeVisible();
  await expect(page.getByTestId('balance-value')).toHaveText('200');
  await expect(page.getByText('Shopify new-user credits added')).not.toBeVisible();

  await accountMenu.click();
  await page.getByRole('menuitem', { name: /Sign out/i }).click();
  await expect(
    page.getByRole('heading', { name: 'Compliance workspace', exact: true }),
  ).not.toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Create account' })).toBeVisible();
  await expect(page.getByText('Alex Morgan', { exact: true })).not.toBeVisible();
});

test('keeps email sign-in, job, history, report, and credit purchase interactive', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Sign in' }).click();
  const dialog = page.locator('dialog[open]');
  await dialog.getByLabel('Work email').fill('seller@example.com');
  await dialog.getByRole('button', { name: /Continue with demo email/i }).click();
  await dialog.getByLabel('6-digit verification code').fill('123456');
  await dialog.getByRole('button', { name: /Verify and open workspace/i }).click();

  await expect(page).toHaveURL(/\/workspace$/);
  await expect(page.getByRole('heading', { name: 'Compliance workspace' })).toBeVisible();
  await expect(page.getByTestId('balance-value')).toHaveText('25');
  await page.getByRole('button', { name: 'Run prototype check →' }).click();
  const report = page.locator('#workspace-report');
  await expect(report.getByText('Review recommended', { exact: true })).toBeVisible({
    timeout: 4_000,
  });
  await expect(report).toContainText('DEMO-0001');
  await expect(page.getByTestId('balance-value')).toHaveText('15');

  await page.getByRole('button', { name: 'Collapse live result' }).click();
  await expect(page.getByRole('button', { name: 'Expand live result' })).toBeVisible();
  await page.getByRole('button', { name: 'Expand live result' }).click();
  await expect(page.getByRole('heading', { name: 'Live result' })).toBeVisible();

  await page.getByRole('link', { name: 'History', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Detection history', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Open result' }).click();
  await expect(page.getByRole('button', { name: '← Back to detection history' })).toBeVisible();
  await expect(page.locator('#workspace-report')).toContainText('DEMO-0001');
  await page.getByRole('button', { name: '← Back to detection history' }).click();
  await expect(page.getByRole('heading', { name: 'All detection records' })).toBeVisible();
  await page.getByRole('link', { name: 'Workspace', exact: true }).click();

  await page.getByRole('button', { name: 'Buy credits' }).click();
  await page.getByRole('button', { name: /Growth 120 prototype credits \$2/ }).click();
  await expect(page.getByTestId('balance-value')).toHaveText('135');
});

test('retains critical account actions on mobile without horizontal overflow', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Create account' })).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});
