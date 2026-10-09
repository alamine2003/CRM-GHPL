/**
 * OFF-004 (0.8.4) : un conflit n'est jamais résolu en silence (RG-053). Le délégué voit, champ
 * par champ, ce qui est sur le téléphone et ce qui est sur le serveur, et choisit. Une décision
 * du superviseur (rapport soumis, validé) l'emporte toujours : seule sa propre version peut être
 * abandonnée, après l'avoir lue (RG-050).
 */
import type { Rapport, Visite } from '@innov/api-client';
import { ErreurApi } from '@innov/api-client';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import type { SaisieLocale } from './BrouillonRapport';
import { Alerte, Bouton, Carte, Texte, usePalette } from './composants';
import { police } from './polices';

/** Ce que le serveur dit d'un conflit sur une visite : les champs, et sa valeur de chacun. */
export type ConflitVisite = { champs: string[]; serveur: Record<string, string | null> };

/** Le conflit d'une modification de visite, s'il en est un. */
export function conflitDe(erreur: unknown): ConflitVisite | null {
  if (!(erreur instanceof ErreurApi) || erreur.code !== 'conflit_version') return null;
  const { champs, serveur } = erreur.details as Partial<ConflitVisite>;
  return Array.isArray(champs) ? { champs, serveur: serveur ?? {} } : null;
}

/** Le serveur a refusé une écriture parce que l'objet a changé (RG-052) ou qu'une décision
 * a été prise (RG-050) : on relit, et le délégué choisit. */
export function estConflit(erreur: unknown) {
  return (
    erreur instanceof ErreurApi &&
    (erreur.code === 'conflit_version' || erreur.code === 'rapport_non_modifiable')
  );
}

/** RG-052 : la visite telle que le téléphone la connaît, envoyée avec la modification. */
export function avantDe(visite: Visite) {
  return {
    date: visite.date,
    heure: visite.heure ?? null,
    prospect: visite.prospect?.id ?? null,
    etablissement: visite.etablissement?.id ?? null,
    reseau: visite.reseau?.id ?? null,
    objectif: visite.objectif,
    note: visite.note,
  };
}

export type Difference = { libelle: string; telephone: string; serveur: string };

const heureCourte = (v: string | null | undefined) => (v ? v.slice(0, 5) : '');

/** Les champs d'une visite en conflit, lisibles : heure, date, objectif, note. */
export function differencesVisite(
  conflit: ConflitVisite,
  saisie: Record<string, unknown>,
  t: TFunction,
): Difference[] {
  return conflit.champs.map((champ) => {
    const telephone = saisie[champ];
    const serveur = conflit.serveur[champ];
    const lisible = (v: unknown) =>
      champ === 'heure'
        ? heureCourte(v as string | null)
        : ['prospect', 'etablissement', 'reseau'].includes(champ)
          ? t('conflits.autre')
          : String(v ?? '');
    return {
      libelle: t(`conflits.champs.${champ}`),
      telephone: lisible(telephone) || t('conflits.vide'),
      serveur: lisible(serveur) || t('conflits.vide'),
    };
  });
}

function libelle(liste: { id: string; libelle: string }[] | undefined, id: string | null) {
  return (id && liste?.find((x) => x.id === id)?.libelle) || '';
}

/** Les différences entre la saisie restée sur le téléphone et le rapport du serveur. */
export function differencesRapport(
  telephone: SaisieLocale,
  rapport: Rapport,
  t: TFunction,
): Difference[] {
  const produits = (s: Pick<Rapport, 'presentations'>) =>
    s.presentations
      .map((p) => libelle(rapport.produits_proposes, p.produit ?? null) || p.libelle || '')
      .filter(Boolean)
      .join(', ');
  const lignes: Difference[] = [];
  const ajouter = (cle: string, a: string, b: string) => {
    if (a.trim() !== b.trim())
      lignes.push({
        libelle: t(`conflits.champs.${cle}`),
        telephone: a.trim() || t('conflits.vide'),
        serveur: b.trim() || t('conflits.vide'),
      });
  };
  ajouter('produits', produits(telephone), produits(rapport));
  ajouter(
    'resultat',
    libelle(rapport.resultats_proposes, telephone.resultat),
    libelle(rapport.resultats_proposes, rapport.resultat),
  );
  ajouter('resultat_obtenu', telephone.resultat_obtenu, rapport.resultat_obtenu);
  ajouter('resume', telephone.resume, rapport.resume);
  ajouter(
    'prochaine_action_type',
    libelle(rapport.types_action_proposes, telephone.prochaine_action_type),
    libelle(rapport.types_action_proposes, rapport.prochaine_action_type),
  );
  ajouter('prochaine_action', telephone.prochaine_action, rapport.prochaine_action);
  ajouter(
    'prochaine_action_echeance',
    telephone.prochaine_action_echeance ?? '',
    rapport.prochaine_action_echeance ?? '',
  );
  const champs = rapport.champs as Record<string, unknown>;
  for (const d of rapport.definitions) {
    const a = telephone.champs[d.code];
    const b = champs[d.code];
    if (JSON.stringify(a ?? null) !== JSON.stringify(b ?? null))
      lignes.push({
        libelle: d.libelle,
        telephone: a == null || a === '' ? t('conflits.vide') : String(a),
        serveur: b == null || b === '' ? t('conflits.vide') : String(b),
      });
  }
  return lignes;
}

/** Champ par champ : sur ce téléphone, puis sur le serveur. */
export function TableauDifferences({ lignes }: { lignes: Difference[] }) {
  const { t } = useTranslation();
  const p = usePalette();
  if (!lignes.length) return <Texte variante="discret">{t('conflits.aucuneDifference')}</Texte>;
  return (
    <View style={{ gap: 10 }}>
      {lignes.map((l) => (
        <View key={l.libelle} style={[styles.ligne, { borderTopColor: p.ligne }]}>
          <Text style={[styles.libelle, { color: p.texte }]}>{l.libelle}</Text>
          <Text style={[styles.valeur, { color: p.texte }]}>
            <Text style={[styles.ou, { color: p.texteSecondaire }]}>
              {t('conflits.telephone')} :{' '}
            </Text>
            {l.telephone}
          </Text>
          <Text style={[styles.valeur, { color: p.texte }]}>
            <Text style={[styles.ou, { color: p.texteSecondaire }]}>
              {t('conflits.serveur')} :{' '}
            </Text>
            {l.serveur}
          </Text>
        </View>
      ))}
    </View>
  );
}

/**
 * Le rapport a changé ailleurs pendant que le téléphone gardait une saisie (RG-053), ou le
 * superviseur a décidé entre-temps (RG-050) : les deux versions, et le choix.
 */
export function ConflitRapport({
  rapport,
  telephone,
  surGarderTelephone,
  surGarderServeur,
}: {
  rapport: Rapport;
  telephone: SaisieLocale;
  surGarderTelephone: () => void;
  surGarderServeur: () => void;
}) {
  const { t } = useTranslation();
  const p = usePalette();
  const decision = !['brouillon', 'a_corriger', 'rouvert'].includes(rapport.statut);
  return (
    <Carte style={{ gap: 12, borderLeftWidth: 3, borderLeftColor: p.attention }}>
      <Texte variante="sousTitre">{t('conflits.rapportTitre')}</Texte>
      {decision ? (
        <Alerte type="attention">
          {t('conflits.decision', { statut: t(`conflits.statuts.${rapport.statut}`) })}
        </Alerte>
      ) : (
        <Texte>{t('conflits.rapportAide')}</Texte>
      )}
      <TableauDifferences lignes={differencesRapport(telephone, rapport, t)} />
      {!decision && <Bouton libelle={t('conflits.garderTelephone')} onPress={surGarderTelephone} />}
      <Bouton
        secondaire
        libelle={t(decision ? 'conflits.abandonnerTelephone' : 'conflits.garderServeur')}
        onPress={surGarderServeur}
      />
    </Carte>
  );
}

const styles = StyleSheet.create({
  ligne: { gap: 2, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth },
  libelle: { fontFamily: police.texteFort, fontSize: 14 },
  valeur: { fontFamily: police.texte, fontSize: 14, lineHeight: 20 },
  ou: { fontFamily: police.texte, fontSize: 13 },
});
