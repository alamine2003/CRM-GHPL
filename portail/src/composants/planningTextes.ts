/** Textes et règles d'affichage d'une semaine de planning, partagés par ses vues. */
import type { ControlePlanning, Semaine } from '@innov/api-client';
import type { useTranslation } from 'react-i18next';

/** Ce que l'on fait glisser : un prospect de la liste cible, ou une visite déjà posée. */
export type Glisse = { type: 'prospect'; id: string } | { type: 'visite'; id: string };
export const FORMAT = 'application/x-innov-planning';

export type Traduire = ReturnType<typeof useTranslation>['t'];

export function nom(
  p: { civilite?: string | null; prenom?: string | null; nom: string } | null,
  t: Traduire,
) {
  if (!p) return t('visites.sansProspect');
  return [p.civilite ? t(`prospect.civilites.${p.civilite}`) : '', p.prenom, p.nom]
    .filter(Boolean)
    .join(' ');
}

/**
 * Absent toute la journée : une absence « journée », ou matin et après-midi. Un commando, un
 * déplacement ou un accompagnement garde ses visites (PLN-018).
 */
export function jourAbsent(s: Semaine, date: string) {
  const parts = s.activites
    .filter((a) => a.date === date && !a.avec_visites)
    .reduce((n, a) => n + ((a.periode ?? 'journee') === 'journee' ? 2 : 1), 0);
  return parts >= 2;
}

/** Texte d'un contrôle (PLN-004), le même que sur le téléphone. */
export function texteControle(
  c: ControlePlanning,
  t: Traduire,
  jourCourt: (iso: string) => string,
) {
  const jour = c.date ? jourCourt(c.date) : '';
  if (c.code === 'a_non_planifie') {
    const noms = (c.prospects ?? []).map((x) => x.nom);
    return t('controles.a_non_planifie', {
      count: noms.length,
      mois: c.mois ?? '',
      noms: noms.slice(0, 3).join(', '),
      suite: noms.length > 3 ? t('controles.etAutres', { count: noms.length - 3 }) : '',
    });
  }
  return t(`controles.${c.code}`, {
    jour,
    heure: c.heure,
    champs: (c.manquants ?? []).map((m) => t(`visites.champs.${m}`)).join(', '),
    fiche: c.fiche ? t(`controles.fiches.${c.fiche}`) : '',
    count: c.code === 'incomplete' ? 1 : c.visites.length,
    jours: jour,
  });
}

/** Une ligne par contrôle ; les seuils du jour tiennent sur une ligne par sens (comme au mobile). */
export function lignesControles(
  controles: NonNullable<Semaine['controles']>,
  t: Traduire,
  jourCourt: (iso: string) => string,
) {
  const lignes: { cle: string; gravite: string; texte: string }[] = controles.bloquants.map(
    (c, i) => ({ cle: `b${i}`, gravite: c.gravite, texte: texteControle(c, t, jourCourt) }),
  );
  for (const code of ['seuil_bas', 'seuil_haut'] as const) {
    const jours = controles.signalements.filter((c) => c.code === code && c.date);
    if (jours.length) {
      lignes.push({
        cle: code,
        gravite: 'signalement',
        texte: t(`controles.${code}`, {
          count: jours.length,
          jours: jours.map((c) => jourCourt(c.date!)).join(', '),
        }),
      });
    }
  }
  controles.signalements
    .filter((c) => c.code !== 'seuil_bas' && c.code !== 'seuil_haut')
    .forEach((c, i) =>
      lignes.push({ cle: `s${i}`, gravite: c.gravite, texte: texteControle(c, t, jourCourt) }),
    );
  return lignes;
}

/** « Version 2 · après révision » ou « Version 3 · modification après approbation » (PLN-015). */
export function libelleVersion(
  planning: { numero_version: number | null; motif_version: string | null } | null | undefined,
  t: Traduire,
) {
  const numero = planning?.numero_version ?? 1;
  if (numero <= 1) return '';
  return planning?.motif_version === 'modification'
    ? t('apresApprobation.version', { numero })
    : t('resoumission.version', { numero });
}

/** PLN-016 : « Escaladé : sans décision de Kossi GUEYE depuis le lundi 12 octobre à 17:00 ». */
export function texteEscalade(
  escalade: { le: string; responsables: { prenom: string; nom: string }[] },
  t: Traduire,
  langue: string,
  fuseau: string,
) {
  return t('escalade.ligne', {
    noms: escalade.responsables.map((r) => `${r.prenom} ${r.nom}`).join(', '),
    date: new Intl.DateTimeFormat(langue, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: fuseau,
    }).format(new Date(escalade.le)),
  });
}
