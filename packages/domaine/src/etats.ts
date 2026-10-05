/**
 * Machine à états du planning (prd.md §17.1), miroir de `backend/apps/planning/etats.py`
 * (ADR-011). La table vient du serveur : `etats.json` est régénéré par `make schema`, et un
 * test serveur échoue s'il n'est pas à jour. Les clients s'en servent pour n'offrir que les
 * actions possibles ; le serveur reste seul juge.
 */
import etats from './etats.json';

export type StatutPlanning =
  'brouillon' | 'soumis' | 'a_reviser' | 'approuve' | 'en_cours' | 'termine' | 'annule';

export const STATUTS_PLANNING = etats.planning.statuts as StatutPlanning[];

const TRANSITIONS = etats.planning.transitions as Record<StatutPlanning, StatutPlanning[]>;

export function transitionsPlanning(de: StatutPlanning): readonly StatutPlanning[] {
  return TRANSITIONS[de] ?? [];
}

export function peutPasser(de: StatutPlanning, vers: StatutPlanning): boolean {
  return transitionsPlanning(de).includes(vers);
}
