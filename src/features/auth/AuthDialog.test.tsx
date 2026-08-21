import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { authApi, type AuthSessionResult } from '../../services/auth';
import { AuthDialog } from './AuthDialog';

function livePasswordSession(): AuthSessionResult {
  return {
    user: {
      id: '42',
      email: 'owner@example.com',
      displayName: 'Alex Morgan',
      provider: 'eric-password',
      tenantId: 5164,
    },
    account: {
      tenantId: 5164,
      tenantName: 'Shopify merchant',
      pointTotal: 500,
      pointMargin: 500,
      permissions: [],
      webApiEnabled: true,
      externalApiServiceEnabled: false,
      externalApiTokenEnabled: false,
      apiExpireTime: '',
    },
    balance: 500,
    welcomeCreditsGranted: 0,
    welcomeCreditsExpireDays: 0,
    sessionToken: 'real-eric-jwt',
  };
}

describe('AuthDialog', () => {
  afterEach(() => vi.restoreAllMocks());

  it('presents Shopify as the primary registration path', () => {
    render(
      <AuthDialog
        open
        initialMode="register"
        onClose={() => undefined}
        onAuthenticated={() => undefined}
      />,
    );
    expect(screen.getByRole('button', { name: 'Create account with Shopify' })).toBeVisible();
    expect(screen.getByText(/200 welcome credits/i)).toBeVisible();
    expect(screen.getByText(/never asks for your Shopify password/i)).toBeVisible();
  });

  it('keeps the working prototype email sign-in journey', async () => {
    const user = userEvent.setup();
    const onAuthenticated = vi.fn<(result: AuthSessionResult) => void>();
    render(
      <AuthDialog
        open
        initialMode="sign-in"
        onClose={() => undefined}
        onAuthenticated={onAuthenticated}
      />,
    );

    await user.type(screen.getByLabelText('Work email'), 'seller@example.com');
    await user.click(screen.getByRole('button', { name: /Continue with demo email/i }));
    await user.type(screen.getByLabelText('6-digit verification code'), '123456');
    await user.click(screen.getByRole('button', { name: /Verify and open workspace/i }));

    expect(onAuthenticated).toHaveBeenCalledOnce();
    const result = onAuthenticated.mock.calls[0]?.[0];
    expect(result?.balance).toBe(25);
    expect(result?.user).toMatchObject({
      provider: 'prototype-email',
      email: 'seller@example.com',
    });
  });

  it('uses the real password session flow when standalone demo access is enabled', async () => {
    const user = userEvent.setup();
    const session = livePasswordSession();
    const loginWithPassword = vi.spyOn(authApi, 'loginWithPassword').mockResolvedValue(session);
    const onAuthenticated = vi.fn<(result: AuthSessionResult) => void>();

    render(
      <AuthDialog
        open
        initialMode="sign-in"
        demoPasswordLoginEnabled
        onClose={() => undefined}
        onAuthenticated={onAuthenticated}
      />,
    );

    expect(screen.getByText('Standalone demonstration access')).toBeVisible();
    expect(screen.queryByText(/prototype email alternative/i)).not.toBeInTheDocument();
    await user.type(screen.getByLabelText('ERiC account'), 'owner@example.com');
    await user.type(screen.getByLabelText('Password'), 'temporary-password');
    await user.click(screen.getByRole('button', { name: /Open live workspace/i }));

    expect(loginWithPassword).toHaveBeenCalledWith('owner@example.com', 'temporary-password');
    expect(onAuthenticated).toHaveBeenCalledWith(session);
  });

  it('shows the real tenant error and does not create a mock session', async () => {
    const user = userEvent.setup();
    vi.spyOn(authApi, 'loginWithPassword').mockRejectedValue(new Error('Incorrect password'));
    const onAuthenticated = vi.fn<(result: AuthSessionResult) => void>();

    render(
      <AuthDialog
        open
        initialMode="sign-in"
        demoPasswordLoginEnabled
        onClose={() => undefined}
        onAuthenticated={onAuthenticated}
      />,
    );

    await user.type(screen.getByLabelText('ERiC account'), 'owner@example.com');
    await user.type(screen.getByLabelText('Password'), 'wrong-password');
    await user.click(screen.getByRole('button', { name: /Open live workspace/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Incorrect password');
    expect(onAuthenticated).not.toHaveBeenCalled();
  });
});
