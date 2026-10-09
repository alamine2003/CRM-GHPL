/// <reference types="vite/client" />

declare const __INNOV_VERSION__: string;

interface ImportMetaEnv {
  /** Adresse du service central, par exemple https://api.exemple.org */
  readonly VITE_API_URL?: string;
  /** Adresse de contact pour les données personnelles, affichée par la politique de confidentialité. */
  readonly VITE_CONTACT_DONNEES?: string;
}
