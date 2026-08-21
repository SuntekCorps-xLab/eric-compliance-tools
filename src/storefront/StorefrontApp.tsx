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

  const bootstrap = useCallback(async () => {
    setStatus('loading');
    setError('');

    if (!context.customerLoggedIn) {
      resetSession();
      try {
        const resumed = await createShopifyGuestSession(context);
        if (resumed) {
          authenticate(resumed);
          guestRenewedAt.current = Date.now();
        }
      } catch (resumeError) {
        console.warn('ERiC guest demo could not be resumed.', resumeError);
      }
      setStatus('ready');
      return;
    }

    try {
      const result = await createShopifyStorefrontSession(context);
      authenticate({
        ...result,
        user: {
          ...result.user,
          displayName: context.customerDisplayName || result.user.displayName,
        },
      });
      setStatus('ready');
    } catch (bootstrapError) {
      resetSession();
      setError(
        bootstrapError instanceof Error
          ? bootstrapError.message
          : 'ERiC could not connect this Shopify customer.',
      );
      setStatus('error');
    }
  }, [authenticate, context, resetSession]);

  useEffect(() => {
    const bootstrapTimer = window.setTimeout(() => void bootstrap(), 0);
    return () => window.clearTimeout(bootstrapTimer);
  }, [bootstrap]);

  useEffect(() => {
    if (context.customerLoggedIn || user?.provider !== 'shopify-guest') return;
    if (guestRenewedAt.current === 0) guestRenewedAt.current = Date.now();

    let active = true;
    const renew = async () => {
      if (!active || Date.now() - guestRenewedAt.current < 15 * 60 * 1000) return;
      try {
        const renewed = await createShopifyGuestSession(context);
        if (!active || !renewed) return;
        authenticate(renewed);
        guestRenewedAt.current = Date.now();
      } catch (renewError) {
        if (renewError instanceof EricSessionError && renewError.invalidSession) {
          resetSession();
        }
      }
    };
    const timer = window.setInterval(() => void renew(), 12 * 60 * 60 * 1000);
    const renewWhenVisible = () => {
      if (document.visibilityState === 'visible') void renew();
    };
    document.addEventListener('visibilitychange', renewWhenVisible);
    return () => {
      active = false;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', renewWhenVisible);
    };
  }, [authenticate, context, resetSession, user?.provider]);

  return (
    <div className="eric-storefront-app">
      {status === 'error' ? (
        <div className="storefront-session-notice error" role="alert">
          <span aria-hidden="true" />
          <p>
            <strong>ERiC session unavailable</strong>
            <small>{error}</small>
          </p>
          <div className="storefront-session-actions">
            {passwordGateBlocked ? <a href="/password">Unlock storefront</a> : null}
            <button type="button" onClick={() => void bootstrap()}>
              Try again
            </button>
          </div>
        </div>
      ) : null}
      {status === 'loading' ? null : context.surface === 'workspace' ? (
        <WorkspacePage />
      ) : (
        <LandingPage />
      )}
    </div>
  );
}
