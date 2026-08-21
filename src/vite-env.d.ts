/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_MODE?: 'mock' | 'live' | 'storefront';
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_GATEWAY_BASE_URL?: string;
  readonly VITE_SHOPIFY_AUTHORIZE_PATH?: string;
  readonly VITE_SHOPIFY_EXCHANGE_PATH?: string;
  readonly VITE_ERIC_LOGIN_PATH?: string;
  readonly VITE_LOGIN_RSA_PUBLIC_KEY?: string;
  readonly VITE_PASSWORD_DEMO_LOGIN?: string;
  readonly VITE_ACCOUNT_PATH?: string;
  readonly VITE_LOGOUT_PATH?: string;
  readonly VITE_DETECTION_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
