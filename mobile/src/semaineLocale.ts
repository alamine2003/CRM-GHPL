/**
 * Copie de la semaine gardée sur le téléphone (PLN-007), dans la base locale chiffrée : la
 * semaine, la journée et le détail d'une visite restent lisibles sans réseau.
 */
import type { Semaine } from '@innov/api-client';
import { ecrire, lire } from './baseLocale';

export const jourIso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Clé de la semaine gardée : son lundi, ou « courante » pour la semaine du jour. */
export const cleSemaine = (jour?: string) => {
  if (!jour) return 'semaine.courante';
  const d = new Date(`${jour}T12:00:00`);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return `semaine.${jourIso(d)}`;
};

/** Garde la semaine lue, sous la clé demandée et sous son lundi. */
export function garderSemaine(semaine: Semaine, demande?: string) {
  void ecrire(cleSemaine(demande), semaine).catch(() => undefined);
  void ecrire(cleSemaine(semaine.semaine), semaine).catch(() => undefined);
}

/** La dernière semaine gardée qui contient ce jour, avec l'heure de sa mise à jour. */
export async function semaineGardee(jour?: string) {
  return lire<Semaine>(cleSemaine(jour)).catch(() => null);
}
