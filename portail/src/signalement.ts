import { creerClientPortail } from './client';

/** Signalement des erreurs du portail au serveur (architecture §19), sans donnée saisie. */
const rapporteur = creerClientPortail();
const dejaSignales = new Set<string>();
const MAXIMUM_PAR_PAGE = 5;

export function signalerErreur(erreur: unknown, reference?: string): void {
  const message = erreur instanceof Error ? `${erreur.name}: ${erreur.message}` : String(erreur);
  if (dejaSignales.has(message) || dejaSignales.size >= MAXIMUM_PAR_PAGE) return;
  dejaSignales.add(message);
  void rapporteur.signalerErreur({
    message,
    version: __INNOV_VERSION__,
    pile: erreur instanceof Error ? erreur.stack : undefined,
    // Le chemin seulement : jamais les paramètres, qui peuvent contenir un jeton.
    ecran: window.location.pathname,
    reference,
  });
}

/** Erreurs qui échappent à React : scripts, promesses non tenues. */
export function surveillerErreursGlobales(): void {
  window.addEventListener('error', (evenement) =>
    signalerErreur(evenement.error ?? evenement.message),
  );
  window.addEventListener('unhandledrejection', (evenement) => signalerErreur(evenement.reason));
}
