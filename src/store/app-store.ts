import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import {
  createPrototypeState,
  getSampleReport,
  purchaseCredits,
  submitDemoJob,
  type CreditPackId,
  type DetectionSelection,
  type PrototypeJob,
  type PrototypeReport,
  type PrototypeState,
} from '../domain/prototype';
import type { LiveWorkspaceSnapshot } from '../domain/live-workspace';
import {
  authApi,
  clearShopifyGuestCredentials,
  EricSessionError,
  revokeShopifyGuestSession,
  type AuthenticatedUser,
  type AuthSessionResult,
  type GuestDemoSession,
  type SessionAccount,
} from '../services/auth';

type SessionStatus = 'anonymous' | 'ready' | 'refreshing' | 'error' | 'expired';
const sessionStorageKey = 'eric-shopify-session-v1';

type SessionOwner = Pick<
  AuthenticatedUser,
  'id' | 'tenantId' | 'provider' | 'shopId' | 'shopDomain'
>;
interface PendingSession {
  owner: SessionOwner;
  workspace: LiveWorkspaceSnapshot;
}

function sameOwner(a: SessionOwner | null | undefined, b: SessionOwner) {
  return (
    a?.id === b.id &&
    a.tenantId === b.tenantId &&
    a.provider === b.provider &&
    a.shopId === b.shopId &&
    a.shopDomain === b.shopDomain
  );
}

interface AppStore extends PrototypeState {
  user: AuthenticatedUser | null;
  account: SessionAccount | null;
  welcomeCreditsGranted: number;
  welcomeCreditsExpireDays: number;
  sessionToken: string | null;
  sessionStatus: SessionStatus;
  sessionError: string;
  demoSession: GuestDemoSession | null;
  report: PrototypeReport | null;
  liveWorkspace: LiveWorkspaceSnapshot | null;
  authenticate: (result: AuthSessionResult) => void;
  resetSession: () => void;
  expireSession: () => void;
  pendingSession: PendingSession | null;
  refreshSession: () => Promise<void>;
  signOut: () => Promise<void>;
  buyCredits: (packId: CreditPackId) => void;
  queueJob: (selection: DetectionSelection, idempotencyKey: string) => PrototypeJob | null;
  completeJob: (id: string) => PrototypeReport | null;
  setLiveWorkspace: (snapshot: LiveWorkspaceSnapshot | null) => void;
  updateDemoSession: (updates: Partial<GuestDemoSession>) => void;
}

function anonymousSession() {
  return {
    ...createPrototypeState(),
    user: null,
    account: null,
    welcomeCreditsGranted: 0,
    welcomeCreditsExpireDays: 0,
    sessionToken: null,
    sessionStatus: 'anonymous' as const,
    sessionError: '',
    pendingSession: null,
    demoSession: null,
    report: null,
    liveWorkspace: null,
  };
}

export const useAppStore = create<AppStore>()(
  persist(
    (set, get) => ({
      ...anonymousSession(),
      authenticate(result) {
        if (result.user.provider !== 'shopify-guest') clearShopifyGuestCredentials();
        set((state) => ({
          user: result.user,
          account: result.account,
          balance: result.balance,
          welcomeCreditsGranted: result.welcomeCreditsGranted,
          welcomeCreditsExpireDays: result.welcomeCreditsExpireDays,
          sessionToken: result.sessionToken ?? null,
          sessionStatus: 'ready',
          sessionError: '',
          demoSession: result.demoSession ?? null,
          liveWorkspace: sameOwner(state.user, result.user)
            ? state.liveWorkspace
            : sameOwner(state.pendingSession?.owner, result.user)
              ? state.pendingSession!.workspace
              : null,
          pendingSession: null,
        }));
      },
      resetSession() {
        set(anonymousSession());
        sessionStorage.removeItem(sessionStorageKey);
      },
      expireSession() {
        const { user, liveWorkspace, pendingSession } = get();
        const activity = liveWorkspace?.activity;
        const pending =
          user && liveWorkspace && activity?.status === 'RUNNING'
            ? {
                owner: {
                  id: user.id,
                  tenantId: user.tenantId,
                  provider: user.provider,
                  shopId: user.shopId,
                  shopDomain: user.shopDomain,
                },
                workspace: { activity, result: null, savedAt: liveWorkspace.savedAt },
              }
            : pendingSession;
        set({
          ...anonymousSession(),
          pendingSession: pending,
          sessionStatus: 'expired',
          sessionError: 'Your ERiC session expired. Reconnect to continue.',
        });
      },
      async refreshSession() {
        const { sessionToken, user } = get();
        if (!sessionToken || !user) return;
        set({ sessionStatus: 'refreshing', sessionError: '' });
        try {
          const account = await authApi.getAccount(sessionToken, user.tenantId, user.id);
          if (get().sessionToken !== sessionToken || get().user !== user) return;
          set({
            account,
            balance: account.pointMargin,
            user: { ...user, companyName: account.tenantName },
            sessionStatus: 'ready',
            sessionError: '',
          });
        } catch (error) {
          if (get().sessionToken !== sessionToken || get().user !== user) return;
          if (error instanceof EricSessionError && error.invalidSession) {
            get().expireSession();
            return;
          }
          set({
            sessionStatus: 'error',
            sessionError:
              error instanceof Error
                ? error.message
                : 'ERiC account data is temporarily unavailable.',
          });
        }
      },
      async signOut() {
        const { sessionToken: token, user } = get();
        clearShopifyGuestCredentials();
        set(anonymousSession());
        sessionStorage.removeItem(sessionStorageKey);
        if (!token) return;
        if (user?.provider === 'shopify-guest') {
          try {
            await revokeShopifyGuestSession(token, user);
          } catch (error) {
            console.warn('ERiC guest demo revocation failed.', error);
          }
        }
        try {
          await authApi.logout(token);
        } catch (error) {
          console.warn('ERiC remote session revocation failed.', error);
        }
      },
      buyCredits(packId) {
        const next = purchaseCredits(get(), packId);
        set({ balance: next.balance, insufficientCredits: false });
      },
      queueJob(selection, idempotencyKey) {
        const next = submitDemoJob(get(), selection, idempotencyKey);
        set({
          balance: next.balance,
          jobs: next.jobs,
          idempotencyKeys: next.idempotencyKeys,
          insufficientCredits: next.insufficientCredits,
        });
        return next.insufficientCredits ? null : (next.jobs[0] ?? null);
      },
      completeJob(id) {
        const job = get().jobs.find((candidate) => candidate.id === id);
        if (!job) return null;
        const completed = { ...job, status: 'SUCCEEDED' as const };
        const jobs = get().jobs.map((candidate) => (candidate.id === id ? completed : candidate));
        const report = getSampleReport(completed);
        set({ jobs, report });
        return report;
      },
      setLiveWorkspace(snapshot) {
        set({ liveWorkspace: snapshot });
      },
      updateDemoSession(updates) {
        set((state) => ({
          demoSession: state.demoSession ? { ...state.demoSession, ...updates } : null,
        }));
      },
    }),
    {
      name: sessionStorageKey,
      version: 1,
      storage: createJSONStorage(() => sessionStorage),
      partialize: (state) => ({
        user: state.user,
        account: state.account,
        balance: state.balance,
        sessionToken: state.sessionToken,
        sessionStatus: state.sessionStatus,
        demoSession: state.demoSession,
        pendingSession: state.pendingSession,
        liveWorkspace: state.liveWorkspace,
      }),
    },
  ),
);
