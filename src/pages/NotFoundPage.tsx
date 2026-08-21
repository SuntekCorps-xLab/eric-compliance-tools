import { Link } from 'react-router';
import { Brand } from '../components/Brand';

export function NotFoundPage() {
  return (
    <main className="auth-status-page">
      <Brand />
      <section className="auth-status-card" aria-labelledby="not-found-title">
        <span className="auth-status-icon">404</span>
        <p className="eyebrow">Page not found</p>
        <h1 id="not-found-title">This route is outside the workspace.</h1>
        <p>Return to ERiC Suite to start or review a product-compliance check.</p>
        <Link className="button button-primary" to="/">
          Return home
        </Link>
      </section>
    </main>
  );
}
