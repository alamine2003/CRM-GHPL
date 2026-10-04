/// <reference types="vite/client" />

declare const __INNOV_VERSION__: string;

interface ImportMetaEnv {
  /** Adresse du service central, par exemple https://api.exemple.org */
  readonly VITE_API_URL?: string;
}
