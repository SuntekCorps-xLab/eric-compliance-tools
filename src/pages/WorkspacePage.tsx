import { useEffect, useRef, useState } from 'react';
import { Brand } from '../components/Brand';
import { GuestDemoButton } from '../components/GuestDemoButton';
import { detectionDefinitions, type DetectionCode } from '../domain/prototype';
import { AuthDialog, type AuthMode } from '../features/auth/AuthDialog';
import { Workspace } from '../features/checks/Workspace';
import { CreditDialog } from '../features/credits/CreditDialog';
import {
  authApi,
  isConnectedShopifyAuth,
  isPasswordDemoLoginEnabled,
  isShopifyStorefront,
} from '../services/auth';
import {
  clearPendingShopifyCheckout,
  latestShopifyPointPurchase,
  pendingShopifyCheckout,
} from '../services/credits';
import { useAppStore } from '../store/app-store';
import { storefrontHomeUrl, storefrontLogoutUrl } from '../storefront/context';

function homeUrl(): string {
  return isShopifyStorefront ? storefrontHomeUrl() : '/';
}

function preferredCheck(): DetectionCode | undefined {
  const code = new URLSearchParams(window.location.search).get('check');
  return code && Object.hasOwn(detectionDefinitions, code) ? (code as DetectionCode) : undefined;
}

export type WorkspaceSurface = 'workspace' | 'history' | 'policy-settings';

const policySettingsHash = '#policy-settings';

function workspaceSurfaceFromHash(): WorkspaceSurface {
  if (isConnectedShopifyAuth && window.location.hash === policySettingsHash) {
    return 'policy-settings';
  }
  if (window.location.hash === '#history') return 'history';
  return 'workspace';
}

function currentWorkspaceHash(): string {
  return window.location.hash === '#history' ? '#history' : '#new-check';
}

export function WorkspacePage() {
  const user = useAppStore((state) => state.user);
  const authenticate = useAppStore((state) => state.authenticate);
  const sessionToken = useAppStore((state) => state.sessionToken);
  const refreshSession = useAppStore((state) => state.refreshSession);
  const signOut = useAppStore((state) => state.signOut);
  const buyCredits = useAppStore((state) => state.buyCredits);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>('sign-in');
  const [creditsOpen, setCreditsOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [surface, setSurface] = useState<WorkspaceSurface>(workspaceSurfaceFromHash);
  const [purchaseNotice, setPurchaseNotice] = useState<{
    tone: 'progress' | 'success' | 'attention';
    title: string;
    message: string;
  } | null>(null);
  const accountMenuRef = useRef<HTMLDivElement>(null);
  const workspaceReturnHash = useRef(currentWorkspaceHash());
  const userId = user?.id;

  useEffect(() => {
    if (!isShopifyStorefront && userId && sessionToken) void refreshSession();
  }, [refreshSession, sessionToken, userId]);

  useEffect(() => {
    if (!isShopifyStorefront || !user || !sessionToken || user.provider === 'shopify-guest') return;
    const pending = pendingShopifyCheckout();
    if (!pending) return;

    let active = true;
    let timer: number | undefined;
    let attempts = 0;
    const poll = async () => {
      ++attempts;
      try {
        const purchase = await latestShopifyPointPurchase({
          sessionToken,
          userId: user.id,
          tenantId: user.tenantId,
        });
        if (!active) return;
        if (!purchase || purchase.intentId !== pending.intentId) {
          setPurchaseNotice({
            tone: 'progress',
            title: 'Waiting for Shopify payment confirmation',
            message: 'No credits are added until Shopify confirms that this checkout was paid.',
          });
        } else if (purchase.status === 'granted') {
          clearPendingShopifyCheckout();
          setPurchaseNotice({
            tone: 'success',
            title: `${purchase.points.toLocaleString()} credits added`,
            message: `Shopify order ${purchase.orderId} was verified and recorded in the ERiC ledger.`,
          });
          void refreshSession();
          return;
        } else if (purchase.status === 'processing') {
          setPurchaseNotice({
            tone: 'progress',
            title: 'Payment received · adding credits',
            message: 'ERiC is creating the internal bill and synchronizing the credit ledger.',
          });
        } else {
          clearPendingShopifyCheckout();
          setPurchaseNotice({
            tone: 'attention',
            title: 'Credit purchase needs review',
            message:
              purchase.status === 'refund_pending'
                ? 'A Shopify refund was recorded. ERiC has held the purchase for review.'
                : 'The paid order was preserved, but automatic credit settlement was paused for review.',
          });
          return;
        }
      } catch (purchaseError) {
        if (!active) return;
        setPurchaseNotice({
          tone: 'attention',
          title: 'Payment status is temporarily unavailable',
          message:
            purchaseError instanceof Error
              ? purchaseError.message
              : 'Refresh this workspace to check again. Shopify payment is not repeated.',
        });
      }
      if (attempts < 30) {
        timer = window.setTimeout(() => void poll(), 2_000);
      } else {
        setPurchaseNotice({
          tone: 'attention',
          title: 'Shopify confirmation is taking longer than expected',
          message:
            'Your checkout will not be repeated. Refresh this workspace to continue checking the same payment.',
        });
      }
    };
    void poll();
    return () => {
      active = false;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [refreshSession, sessionToken, user]);

  useEffect(() => {
    const restoreSurface = () => {
      if (window.location.hash !== policySettingsHash) {
        workspaceReturnHash.current = currentWorkspaceHash();
      }
      setSurface(workspaceSurfaceFromHash());
      setAccountMenuOpen(false);
    };
    window.addEventListener('popstate', restoreSurface);
    window.addEventListener('hashchange', restoreSurface);
    return () => {
      window.removeEventListener('popstate', restoreSurface);
      window.removeEventListener('hashchange', restoreSurface);
    };
  }, []);

  useEffect(() => {
    if (!accountMenuOpen) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!accountMenuRef.current?.contains(event.target as Node)) setAccountMenuOpen(false);
    };
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') setAccountMenuOpen(false);
    };
    document.addEventListener('pointerdown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [accountMenuOpen]);

  function openAccount(mode: AuthMode) {
    if (user) return;
    if (isShopifyStorefront) {
      window.location.assign(
        authApi.getShopifyAuthorizationUrl(
          `${window.location.pathname}${window.location.search}${window.location.hash}`,
        ),
      );
      return;
    }
    setAuthMode(mode);
    setAuthOpen(true);
  }

  async function finishSignOut() {
    const wasGuest = user?.provider === 'shopify-guest';
    setAccountMenuOpen(false);
    await signOut();
    window.location.assign(isShopifyStorefront && !wasGuest ? storefrontLogoutUrl() : homeUrl());
  }

  function openPolicySettings() {
    if (!isConnectedShopifyAuth) return;
    if (surface === 'policy-settings') {
      setAccountMenuOpen(false);
      return;
    }
    workspaceReturnHash.current = currentWorkspaceHash();
    const url = new URL(window.location.href);
    url.hash = policySettingsHash;
    window.history.pushState(null, '', url);
    setSurface('policy-settings');
    setAccountMenuOpen(false);
  }

  function openWorkspaceSurface(nextSurface: 'workspace' | 'history') {
    const nextHash = nextSurface === 'history' ? '#history' : '#new-check';
    workspaceReturnHash.current = nextHash;
    const url = new URL(window.location.href);
    url.hash = nextHash;
    const method = surface === nextSurface ? 'replaceState' : 'pushState';
    window.history[method](null, '', url);
    setSurface(nextSurface);
    setAccountMenuOpen(false);
  }

  function closePolicySettings() {
    const url = new URL(window.location.href);
    const returnToHistory = workspaceReturnHash.current === '#history';
    url.hash = returnToHistory ? '#history' : '#new-check';
    window.history.replaceState(null, '', url);
    workspaceReturnHash.current = url.hash;
    setSurface(returnToHistory ? 'history' : 'workspace');
  }

  return (
    <>
      <a className="skip-link" href="#main">
        Skip to workspace
      </a>

      <header className="site-header workspace-site-header">
        <Brand />
        <nav className="workspace-nav" aria-label="Workspace navigation">
          <a href={homeUrl()}>← Storefront</a>
          <a
            href="#new-check"
            aria-current={surface === 'workspace' ? 'page' : undefined}
            onClick={(event) => {
              event.preventDefault();
              openWorkspaceSurface('workspace');
            }}
          >
            Workspace
          </a>
          <a
            href="#history"
            aria-current={surface === 'history' ? 'page' : undefined}
            onClick={(event) => {
              event.preventDefault();
              openWorkspaceSurface('history');
            }}
          >
            History
          </a>
          {surface === 'policy-settings' ? <span aria-current="page">User settings</span> : null}
        </nav>
        <div className="header-actions">
          {user ? (
            <div className="account-menu" ref={accountMenuRef}>
              <button
                className="account-button"
                type="button"
                aria-label={`Account menu for ${user.displayName}`}
                aria-haspopup="menu"
                aria-expanded={accountMenuOpen}
                onClick={() => setAccountMenuOpen((open) => !open)}
              >
                <span className="account-avatar" aria-hidden="true">
                  {user.displayName.charAt(0).toUpperCase()}
                </span>
                <span className="account-name">
                  <small>{user.displayName}</small>
                  {user.provider === 'shopify-guest' ? <em>Demo</em> : null}
                </span>
                <b aria-hidden="true">⌄</b>
              </button>
              {accountMenuOpen ? (
                <div className="account-popover" role="menu">
                  {isConnectedShopifyAuth ? (
                    <button type="button" role="menuitem" onClick={openPolicySettings}>
                      <span>Policy settings</span>
                      <small>Private P002 terms for this user</small>
                    </button>
                  ) : null}
                  <button type="button" role="menuitem" onClick={() => void finishSignOut()}>
                    <span>Sign out</span>
                    <small>End this ERiC session</small>
                  </button>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="workspace-entry-actions">
              {isShopifyStorefront ? (
                <GuestDemoButton
                  className="button button-primary button-header"
                  onAuthenticated={authenticate}
                />
              ) : null}
              <button
                className={
                  isShopifyStorefront
                    ? 'button button-quiet'
                    : 'button button-primary button-header'
                }
                type="button"
                onClick={() => openAccount('sign-in')}
              >
                {isPasswordDemoLoginEnabled ? 'Sign in to live demo' : 'Sign in with Shopify'}
              </button>
            </div>
          )}
        </div>
      </header>

      <main id="main" className="workspace-page-main">
        {purchaseNotice ? (
          <div className={`checkout-settlement-notice ${purchaseNotice.tone}`} role="status">
            <span aria-hidden="true" />
            <p>
              <strong>{purchaseNotice.title}</strong>
              <small>{purchaseNotice.message}</small>
            </p>
            {purchaseNotice.tone !== 'progress' ? (
              <button type="button" onClick={() => setPurchaseNotice(null)}>
                Dismiss
              </button>
            ) : null}
          </div>
        ) : null}
        {user ? (
          <Workspace
            onBuyCredits={() => setCreditsOpen(true)}
            onClosePolicySettings={closePolicySettings}
            onOpenPolicySettings={openPolicySettings}
            preferredCode={preferredCheck()}
            surface={surface}
          />
        ) : (
          <section className="workspace-access" aria-labelledby="workspace-access-title">
            <div>
              <p className="eyebrow">
                {isPasswordDemoLoginEnabled
                  ? 'Standalone demonstration access'
                  : 'Live guest or Shopify access'}
              </p>
              <h1 id="workspace-access-title">Open your compliance workspace.</h1>
              <p>
                {isPasswordDemoLoginEnabled
                  ? 'Sign in with an existing Shopify-linked ERiC account to load the real tenant, current credit balance, enabled checks, and live task history.'
                  : 'Start a private seven-day guest workspace with every live check, or sign in through Shopify to restore your own ERiC tenant.'}
              </p>
              <div className="workspace-access-actions">
                {isShopifyStorefront ? (
                  <GuestDemoButton
                    className="button button-primary"
                    label="Start guest demo"
                    onAuthenticated={authenticate}
                  />
                ) : (
                  <button
                    className="button button-primary"
                    type="button"
                    onClick={() => openAccount('sign-in')}
                  >
                    Sign in to live demo →
                  </button>
                )}
                {isShopifyStorefront ? (
                  <button
                    className="button button-outline"
                    type="button"
                    onClick={() => openAccount('sign-in')}
                  >
                    Continue with Shopify →
                  </button>
                ) : null}
                <a className="text-link" href={homeUrl()}>
                  Return to storefront
                </a>
              </div>
            </div>
            <aside aria-label="Workspace access boundaries">
              <span>01</span>
              <strong>
                {isPasswordDemoLoginEnabled ? 'ERiC verifies you' : 'Choose your entry'}
              </strong>
              <p>
                {isPasswordDemoLoginEnabled
                  ? 'Only this temporary demonstration sign-in uses the existing ERiC password route.'
                  : 'Guest access needs no account. Shopify sign-in remains on Shopify-owned customer pages.'}
              </p>
              <span>02</span>
              <strong>ERiC restores your controls</strong>
              <p>
                Guest history stays private to this browser. Permissions, credits, tasks, and
                evidence remain server-backed.
              </p>
            </aside>
          </section>
        )}
      </main>

      <footer className="workspace-footer">
        <Brand footer />
        <p>Screening evidence for informed listing decisions. Results are not legal advice.</p>
        <a href={homeUrl()}>Back to storefront ↑</a>
      </footer>

      {authOpen ? (
        <AuthDialog
          open
          initialMode={authMode}
          onClose={() => setAuthOpen(false)}
          onAuthenticated={(result) => {
            authenticate(result);
            setAuthOpen(false);
          }}
        />
      ) : null}
      <CreditDialog
        open={creditsOpen}
        live={isConnectedShopifyAuth}
        onClose={() => setCreditsOpen(false)}
        onPurchase={buyCredits}
      />
    </>
  );
}
