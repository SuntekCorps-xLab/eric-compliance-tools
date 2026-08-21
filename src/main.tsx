import '@fontsource-variable/archivo';
import '@fontsource-variable/manrope';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';
import { router } from './router';
import { configurePasswordLoginEncryption } from './services/auth';
import { encryptLoginPassword } from './services/password-encryption';
import './styles.css';

configurePasswordLoginEncryption(encryptLoginPassword);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
