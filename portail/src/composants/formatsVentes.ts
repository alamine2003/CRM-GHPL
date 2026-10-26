/** Formats du suivi des ventes, dans la langue courante. */

export function nombre(valeur: number | string, langue: string): string {
  return new Intl.NumberFormat(langue, { maximumFractionDigits: 0 }).format(Number(valeur));
}

/** Un montant dans la devise du pays, sans décimales. */
export function montant(valeur: number | string, langue: string, devise: string): string {
  return new Intl.NumberFormat(langue, {
    style: 'currency',
    currency: devise,
    maximumFractionDigits: 0,
  }).format(Number(valeur));
}

/** Montant abrégé avec sa devise : « 2,3 Md F CFA ». */
export function montantCompact(valeur: number | string, langue: string, devise: string): string {
  return new Intl.NumberFormat(langue, {
    style: 'currency',
    currency: devise,
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(Number(valeur));
}

/** Montant abrégé pour un axe : « 1,2 M ». */
export function compact(valeur: number, langue: string): string {
  return new Intl.NumberFormat(langue, { notation: 'compact', maximumFractionDigits: 1 }).format(
    valeur,
  );
}

/** Évolution face à l'an passé : « +12,3 % » ; vide, « — ». Le signe dit le sens (jamais la
 * couleur seule). */
export function evolution(valeur: number | null, langue: string): string {
  if (valeur === null) return '—';
  const texte = new Intl.NumberFormat(langue, { maximumFractionDigits: 1 }).format(
    Math.abs(valeur),
  );
  return `${valeur > 0 ? '+' : valeur < 0 ? '−' : ''}${texte} %`;
}

/** « 2026-03 » → « mars » (court) ou « mars 2026 » (long). */
export function nomDuMois(aaaamm: string, langue: string, long = false): string {
  const [annee, mois] = aaaamm.split('-').map(Number);
  return new Intl.DateTimeFormat(langue, {
    month: long ? 'long' : 'short',
    ...(long ? { year: 'numeric' as const } : {}),
  }).format(new Date(annee ?? 2000, (mois ?? 1) - 1, 1));
}
