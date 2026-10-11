import type { ListeCible, ProspectCible } from '@innov/api-client';

/** Nom comparable : minuscules, sans accents ni titre ni ponctuation (comme le serveur). */
const TITRES = new Set(['dr', 'docteur', 'pr', 'professeur', 'm', 'mr', 'mme', 'mlle']);

export function normaliserNom(...parties: string[]): string {
  return parties
    .join(' ')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’`-]/g, '')
    .split(/[^a-z0-9]+/)
    .filter((m) => m && !TITRES.has(m))
    .join(' ');
}

/** Distance d'édition bornée : tolère une faute de frappe par mot (« Ndiay » / « Ndiaye »). */
function distance(a: string, b: string): number {
  const ligne = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let precedent = ligne[0]!;
    ligne[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const courant = ligne[j]!;
      ligne[j] = Math.min(
        ligne[j]! + 1,
        ligne[j - 1]! + 1,
        precedent + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      precedent = courant;
    }
  }
  return ligne[b.length]!;
}

/** Chaque mot saisi commence un mot du nom, ou en diffère d'une lettre au plus. */
export function ressemble(saisie: string, nom: string): boolean {
  const mots = saisie.split(' ').filter((m) => m.length >= 2);
  const noms = nom.split(' ');
  return (
    mots.length > 0 &&
    mots.every((m) =>
      noms.some(
        (n) => n.startsWith(m) || (m.length >= 4 && distance(m, n.slice(0, m.length + 1)) <= 1),
      ),
    )
  );
}

/**
 * PRP-007 CA2 : sans réseau, les suggestions viennent des fiches présentes sur le téléphone
 * (la liste cible gardée dans la base locale chiffrée).
 */
export function ressemblantesLocales(
  listes: ListeCible[],
  nom: string,
  prenom = '',
  maximum = 5,
): ProspectCible[] {
  const saisie = normaliserNom(prenom, nom);
  if (saisie.length < 2) return [];
  const vus = new Set<string>();
  const resultats: ProspectCible[] = [];
  for (const { cibles } of listes) {
    for (const { prospect } of cibles) {
      if (vus.has(prospect.id)) continue;
      vus.add(prospect.id);
      if (ressemble(saisie, normaliserNom(prospect.prenom ?? '', prospect.nom))) {
        resultats.push(prospect);
      }
    }
  }
  return resultats.slice(0, maximum);
}
