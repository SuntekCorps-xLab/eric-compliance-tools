import { useCallback, useEffect, useRef, useState } from 'react';
import { LandingPage } from '../pages/LandingPage';
import { WorkspacePage } from '../pages/WorkspacePage';
import {
  createShopifyGuestSession,
  createShopifyStorefrontSession,
  EricSessionError,
} from '../services/auth';
import { useAppStore } from '../store/app-store';
import type { ShopifyStorefrontContext } from './context';

type BootstrapStatus = 'loading' | 'ready' | 'error';

export function StorefrontApp({ context }: { context: ShopifyStorefrontContext }) {
  const authenticate = useAppStore((state) => state.authenticate);
  const resetSession = useAppStore((state) => state.resetSession);
  const user = useAppStore((state) => state.user);
  const [status, setStatus] = useState<BootstrapStatus>('loading');
  const [error, setError] = useState('');
  const guestRenewedAt = useRef(0);
  const passwordGateBlocked = error.includes('storefront password');

  const bootstrapRequest = useRef<AbortController | null>(null);
  const sessionStatus = useAppStore((state) => state.sessionStatus);
  const expireSession = useAppStore((state) => state.expireSession);
  const sessionExpired = sessionStatus === 'expired';

  const bootstrap = useCallback(async () => {
    bootstrapRequest.current?.abort();
    const controller = new AbortController();
    bootstrapRequest.current = controller;
    setStatus('loading');
    setError('');
    try {
      const result = context.customerLoggedIn
        ? await createShopifyStorefrontSession(context, controller.signal)
        : await createShopifyGuestSession(context, false, controller.signal);
      if (controller.signal.aborted) return;
      if (result) {
        authenticate({
          ...result,
          user: {
            ...result.user,
            displayName: context.customerDisplayName || result.user.displayName,
          },
        });
        if (!context.customerLoggedIn) guestRenewedAt.current = Date.now();
      } else {
        resetSession();
      }
      setStatus('ready');
    } catch (bootstrapError) {
      if (controller.signal.aborted) return;
      expireSession();
      setError(
        bootstrapError instanceof Error
          ? bootstrapError.message
          : 'ERiC could not connect this session.',
      );
      setStatus('error');
    }
  }, [authenticate, context, expireSession, resetSession]);

  useEffect(() => {
    const bootstrapTimer = window.setTimeout(() => void bootstrap(), 0);
    return () => {
      window.clearTimeout(bootstrapTimer);
      bootstrapRequest.current?.abort();
    };
  }, [bootstrap]);

  useEffect(() => {
    if (context.customerLoggedIn || user?.provider !== 'shopify-guest') return;
    if (guestRenewedAt.current === 0) guestRenewedAt.current = Date.now();

    let active = true;
    let renewing = false;
    const renewalController = new AbortController();
    const renew = async () => {
      if (!active || renewing || Date.now() - guestRenewedAt.current < 15 * 60 * 1000) return;
      const priorUser = useAppStore.getState().user;
      renewing = true;
      try {
        const renewed = await createShopifyGuestSession(context, false, renewalController.signal);
        if (!active || !renewed || useAppStore.getState().user !== priorUser) return;
        authenticate(renewed);
        guestRenewedAt.current = Date.now();
      } catch (renewError) {
        if (
          active &&
          useAppStore.getState().user === priorUser &&
          renewError instanceof EricSessionError &&
          renewError.invalidSession
        ) {
          expireSession();
        }
      } finally {
        renewing = false;
      }
    };
    const timer = window.setInterval(() => void renew(), 12 * 60 * 60 * 1000);
    const renewWhenVisible = () => {
      if (document.visibilityState === 'visible') void renew();
    };
    document.addEventListener('visibilitychange', renewWhenVisible);
    return () => {
      active = false;
      renewalController.abort();
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', renewWhenVisible);
    };
  }, [authenticate, context, expireSession, user?.provider]);

  return (
    <div className="eric-storefront-app">
      {status === 'error' || (sessionExpired && status !== 'loading') ? (
        <div className="storefront-session-notice error" role="alert">
          <span aria-hidden="true" />
          <p>
            <strong>ERiC session unavailable</strong>
            <small>
              {error || 'Your ERiC session expired. Reconnect to continue your existing task.'}
            </small>
          </p>
          <div className="storefront-session-actions">
            {passwordGateBlocked ? <a href="/password">Unlock storefront</a> : null}
            <button type="button" onClick={() => void bootstrap()}>
              Try again
            </button>
          </div>
        </div>
      ) : null}
      {status === 'loading' ? (
        <div className="storefront-session-notice" role="status">
          <p>
            <strong>Connecting to ERiC…</strong>
            <small>Please wait while we verify your session.</small>
          </p>
        </div>
      ) : status !== 'ready' || sessionExpired ? null : context.surface === 'workspace' ? (
        <WorkspacePage />
      ) : (
        <LandingPage />
      )}
    </div>
  );
}
