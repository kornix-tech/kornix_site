/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_AUTH_MODE?: 'mock' | 'bff';
  readonly VITE_ENABLE_MOCK_API?: string;
  readonly VITE_ALLOW_PRIVATE_MOCK_RUNTIME?: string;
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_OIDC_ISSUER_URL?: string;
  readonly VITE_OIDC_CLIENT_ID?: string;
  readonly VITE_OIDC_REDIRECT_URI?: string;
  readonly VITE_OIDC_POST_LOGOUT_REDIRECT_URI?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
