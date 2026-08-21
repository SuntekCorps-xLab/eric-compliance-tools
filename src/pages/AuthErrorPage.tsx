import { Link, useSearchParams } from 'react-router';
import { Brand } from '../components/Brand';

export function AuthErrorPage() {
  const [searchParams] = useSearchParams();
  const message =
    searchParams.get('message') ?? 'Shopify authorization was cancelled or could not be verified.';

  return (
    <main className="auth-status-page">
      <Brand />
      <section className="auth-status-card error-state" aria-labelledby="auth-error-title">
        <span className="auth-status-icon">!</span>
        <p className="eyebrow">Authorization not completed</p>
        <h1 id="auth-error-title">Your ERiC account is unchanged</h1>
        <p>{message}</p>
        <div className="status-actions">
          <Link className="button button-primary" to="/">
            Try again
          </Link>
          <a className="button button-quiet" href="mailto:hello@example.com">
            Contact support
          </a>
        </div>
        <small>No credits were granted and no ERiC session was created.</small>
      </section>
    </main>
  );
}
