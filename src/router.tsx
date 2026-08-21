import { createBrowserRouter } from 'react-router';
import { AuthCallbackPage } from './pages/AuthCallbackPage';
import { AuthErrorPage } from './pages/AuthErrorPage';
import { LandingPage } from './pages/LandingPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { WorkspacePage } from './pages/WorkspacePage';

export const router = createBrowserRouter([
  { path: '/', Component: LandingPage },
  { path: '/workspace', Component: WorkspacePage },
  { path: '/auth/callback', Component: AuthCallbackPage },
  { path: '/auth/error', Component: AuthErrorPage },
  { path: '*', Component: NotFoundPage },
]);
