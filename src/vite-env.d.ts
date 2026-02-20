/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_ENDPOINT: string;
  readonly VITE_TURN_USERNAME?: string;
  readonly VITE_TURN_CREDENTIAL?: string;
  readonly VITE_TURN_URLS?: string;
  readonly VITE_NOSTR_RELAY_URLS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
