import { Link, useSearchParams } from 'react-router';
import { storefrontPublicLinks } from '../storefront/context';
import { Brand } from '../components/Brand';

export function AuthErrorPage() {
  const { supportEmail } = storefrontPublicLinks();
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
          {supportEmail ? (
            <a className="button button-quiet" href={`mailto:${supportEmail}`}>
              Contact support
            </a>
          ) : null}
        </div>
        <small>No credits were granted and no ERiC session was created.</small>
      </section>
    </main>
  );
}
