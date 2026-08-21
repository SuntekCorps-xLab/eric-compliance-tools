import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPrototypeState } from '../domain/prototype';
import {
  authApi,
  EricSessionError,
  type AuthSessionResult,
  type SessionAccount,
} from '../services/auth';
import { useAppStore } from './app-store';

function account(pointMargin = 500): SessionAccount {
  return {
    tenantId: 5164,
    tenantName: 'Northstar Commerce',
    pointTotal: 500,
    pointMargin,
    permissions: [],
    webApiEnabled: true,
    externalApiServiceEnabled: false,
    externalApiTokenEnabled: false,
    apiExpireTime: '',
  };
}

function authenticatedSession(pointMargin = 500): AuthSessionResult {
  return {
    user: {
      id: '42',
      email: 'owner@example.com',
      displayName: 'Alex Morgan',
      companyName: 'Northstar Commerce',
      provider: 'shopify',
      shopDomain: 'shop.example.com',
      tenantId: 5164,
    },
    account: account(pointMargin),
    balance: pointMargin,
    welcomeCreditsGranted: 500,
    welcomeCreditsExpireDays: 7,
    sessionToken: 'eric-jwt',
  };
}

describe('Shopify session state', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
    localStorage.clear();
    useAppStore.persist.clearStorage();
    useAppStore.setState({
      ...createPrototypeState(),
      user: null,
      account: null,
      welcomeCreditsGranted: 0,
      welcomeCreditsExpireDays: 0,
      sessionToken: null,
      sessionStatus: 'anonymous',
      sessionError: '',
      demoSession: null,
      report: null,
      liveWorkspace: null,
    });
  });

  it('persists the authenticated identity and token for a browser refresh', () => {
    useAppStore.getState().authenticate(authenticatedSession());

    const persisted = sessionStorage.getItem('eric-shopify-session-v1');
    expect(persisted).not.toBeNull();
    expect(JSON.parse(persisted ?? '{}')).toMatchObject({
      state: {
        user: { displayName: 'Alex Morgan', tenantId: 5164 },
        account: { pointMargin: 500 },
        balance: 500,
        sessionToken: 'eric-jwt',
        sessionStatus: 'ready',
      },
    });
  });

  it('refreshes the authoritative account balance with the existing JWT', async () => {
    useAppStore.getState().authenticate(authenticatedSession(0));
    const getAccount = vi.spyOn(authApi, 'getAccount').mockResolvedValue(account(500));

    await useAppStore.getState().refreshSession();

    expect(getAccount).toHaveBeenCalledWith('eric-jwt', 5164, '42');
    expect(useAppStore.getState()).toMatchObject({
      balance: 500,
      account: { pointMargin: 500 },
      sessionStatus: 'ready',
    });
  });

  it('persists a live workspace so refresh can resume without another submission', () => {
    useAppStore.getState().authenticate(authenticatedSession());
    useAppStore.getState().setLiveWorkspace({
      activity: {
        workspaceId: '9876',
        requestId: 'request-save',
        code: 'T001',
        status: 'RUNNING',
      },
      history: [
        {
          workspaceId: '9876',
          requestId: 'request-save',
          code: 'T001',
          status: 'RUNNING',
        },
      ],
      result: null,
      savedAt: '2026-08-10T00:00:00.000Z',
    });

    expect(JSON.parse(sessionStorage.getItem('eric-shopify-session-v1') ?? '{}')).toMatchObject({
      state: {
        liveWorkspace: {
          activity: { workspaceId: '9876', code: 'T001', status: 'RUNNING' },
        },
      },
    });
  });

  it('clears local state and revokes the gateway session on sign-out', async () => {
    useAppStore.getState().authenticate(authenticatedSession());
    const logout = vi.spyOn(authApi, 'logout').mockResolvedValue();

    await useAppStore.getState().signOut();

    expect(logout).toHaveBeenCalledWith('eric-jwt');
    expect(useAppStore.getState()).toMatchObject({
      user: null,
      account: null,
      balance: 25,
      sessionToken: null,
      sessionStatus: 'anonymous',
      liveWorkspace: null,
    });
    expect(sessionStorage.getItem('eric-shopify-session-v1')).toBeNull();
  });

  it('clears a persisted session when the gateway rejects its JWT', async () => {
    useAppStore.getState().authenticate(authenticatedSession());
    vi.spyOn(authApi, 'getAccount').mockRejectedValue(
      new EricSessionError('Session expired.', true),
    );

    await useAppStore.getState().refreshSession();

    expect(useAppStore.getState()).toMatchObject({
      user: null,
      account: null,
      sessionToken: null,
      sessionStatus: 'anonymous',
    });
    expect(sessionStorage.getItem('eric-shopify-session-v1')).toBeNull();
  });
});
