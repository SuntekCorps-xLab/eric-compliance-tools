import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { Brand } from '../components/Brand';
import { ShopifyMark } from '../components/ShopifyMark';
import { authApi } from '../services/auth';
import { useAppStore } from '../store/app-store';

export function AuthCallbackPage() {
  const authenticate = useAppStore((state) => state.authenticate);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const started = useRef(false);
  const [status, setStatus] = useState('Confirming your Shopify authorization…');

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    void authApi
      .resolveShopifyCallback(searchParams.toString())
      .then((result) => {
        authenticate(result);
        setStatus(
          result.welcomeCreditsGranted > 0
            ? `${result.welcomeCreditsGranted} test credits added. Opening your ERiC workspace…`
            : 'Authorization confirmed. Opening your ERiC workspace…',
        );
        window.setTimeout(() => void navigate('/workspace', { replace: true }), 650);
      })
      .catch((error: unknown) => {
        const message =
          error instanceof Error ? error.message : 'Authorization could not be completed.';
        void navigate(`/auth/error?message=${encodeURIComponent(message)}`, { replace: true });
      });
  }, [authenticate, navigate, searchParams]);

  return (
    <main className="auth-status-page">
      <Brand />
      <section className="auth-status-card" aria-labelledby="callback-title">
        <span className="auth-status-icon processing">
          <ShopifyMark />
        </span>
        <p className="eyebrow">Secure return to ERiC</p>
        <h1 id="callback-title">Connecting your store</h1>
        <p role="status" aria-live="polite">
          {status}
        </p>
        <div className="authorization-path" aria-label="Authorization steps">
          <span className="complete">Shopify</span>
          <i />
          <span className="active">ERiC identity</span>
          <i />
          <span>Workspace</span>
        </div>
        <small>
          Shopify credentials remain on the ERiC backend. This browser receives only the ERiC
          session.
        </small>
      </section>
    </main>
  );
}
