/**
 * Variante web de la base locale : l'application mobile ne vise pas le navigateur, mais son
 * rendu web sert à l'inspection du design. Rien n'est écrit sur disque : la mémoire suffit.
 */
import type { Memorise } from './baseLocale';

const memoire = new Map<string, Memorise<unknown>>();

export async function lire<T>(cle: string): Promise<Memorise<T> | null> {
  return (memoire.get(cle) as Memorise<T> | undefined) ?? null;
}

export async function ecrire<T>(cle: string, valeur: T): Promise<void> {
  memoire.set(cle, { valeur, maj: new Date().toISOString() });
}

export async function oublier(cle: string): Promise<void> {
  memoire.delete(cle);
}

export async function effacer(): Promise<void> {
  memoire.clear();
}
