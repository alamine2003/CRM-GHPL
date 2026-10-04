import { createContext, useContext } from 'react';

/** Préférences propres à ce navigateur (jamais de jeton ici : architecture-essentials §10). */
export type ModeApparence = 'systeme' | 'clair' | 'sombre';

const CLE_APPARENCE = 'innov.apparence';

function stockage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function lireApparence(): ModeApparence {
  try {
    const valeur = stockage()?.getItem(CLE_APPARENCE);
    return valeur === 'clair' || valeur === 'sombre' ? valeur : 'systeme';
  } catch {
    return 'systeme';
  }
}

export function ecrireApparence(mode: ModeApparence) {
  try {
    if (mode === 'systeme') stockage()?.removeItem(CLE_APPARENCE);
    else stockage()?.setItem(CLE_APPARENCE, mode);
  } catch {
    // Navigation privée ou stockage bloqué : le choix vaut pour cette visite seulement.
  }
}

export interface Apparence {
  mode: ModeApparence;
  sombre: boolean;
  changer(mode: ModeApparence): void;
}

export const ContexteApparence = createContext<Apparence>({
  mode: 'systeme',
  sombre: false,
  changer: () => undefined,
});

export function useApparence() {
  return useContext(ContexteApparence);
}
