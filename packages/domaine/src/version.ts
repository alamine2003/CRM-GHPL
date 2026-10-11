/**
 * Convention de version d'INNOV CRM (ADR-018) : 0.0.1 … 0.0.9, 0.1.1 … 0.9.9, puis 1.0.0.
 * Chaque cycle 0.y compte 9 versions ; la feuille de route est dans prd.md §23.
 */

/** Codes des cycles de la feuille de route, dans l'ordre (libellés dans @innov/i18n). */
export const CYCLES = [
  'fondations',
  'referentiel',
  'planning',
  'validationPlannings',
  'visites',
  'rapports',
  'validationRapports',
  'pilotage',
  'mobilite',
  'production',
] as const;
export type Cycle = (typeof CYCLES)[number];

export interface Avancement {
  version: string;
  /** Vrai à partir de la première version stable 1.0.0. */
  stable: boolean;
  /** Index du cycle en cours (0 à 9) ; nul une fois la 1.0.0 atteinte. */
  cycle: number | null;
  codeCycle: Cycle | null;
  /** Étape dans le cycle (1 à 9). */
  etape: number | null;
  /** Versions livrées sur les 90 du chemin vers la 1.0.0. */
  livrees: number;
  total: number;
}

const TOTAL = CYCLES.length * 9;

export function avancement(version: string): Avancement {
  const correspondance = /^(\d+)\.(\d)\.(\d)$/.exec(version.trim());
  if (!correspondance) throw new Error(`Version invalide : ${version}`);
  const [majeure, mineure, correctif] = correspondance.slice(1).map(Number) as [
    number,
    number,
    number,
  ];
  if (majeure >= 1) {
    return {
      version,
      stable: true,
      cycle: null,
      codeCycle: null,
      etape: null,
      livrees: TOTAL,
      total: TOTAL,
    };
  }
  if (correctif === 0) throw new Error(`Les versions 0.y.0 n'existent pas : ${version}`);
  return {
    version,
    stable: false,
    cycle: mineure,
    codeCycle: CYCLES[mineure]!,
    etape: correctif,
    livrees: mineure * 9 + correctif,
    total: TOTAL,
  };
}
