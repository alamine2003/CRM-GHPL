/**
 * Catalogues de traduction partagés par le portail et l'application mobile.
 * Aucun texte affiché n'est écrit en dur dans les écrans (USR-004, ADR-019).
 */
import en from './locales/en.json';
import fr from './locales/fr.json';

export const LANGUES = ['fr', 'en'] as const;
export type Langue = (typeof LANGUES)[number];
export const LANGUE_PAR_DEFAUT: Langue = 'fr';

export const ressources = {
  fr: { translation: fr },
  en: { translation: en },
} as const;

export function estLangue(valeur: string | null | undefined): valeur is Langue {
  return LANGUES.includes(valeur as Langue);
}

/** Choisit une langue prise en charge à partir d'une préférence (navigateur, téléphone). */
export function choisirLangue(preferences: readonly string[]): Langue {
  for (const preference of preferences) {
    const code = preference.toLowerCase().split(/[-_]/)[0];
    if (estLangue(code)) return code;
  }
  return LANGUE_PAR_DEFAUT;
}
