/**
 * La semaine du délégué selon la maquette 1.4.3 : le statut du planning en tête, « Précédente ·
 * Cette semaine · Suivante » en segments ; sur le téléphone, les jours en pastilles (le jour
 * choisi souligné d'orange) puis les visites du jour ; sur la tablette, les jours en colonnes.
 * Une semaine fermée (0.3.9) se dit dans une carte à filet rouge, jours grisés.
 */
import type { Semaine, Visite } from '@innov/api-client';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import {
  Alerte,
  Bouton,
  Carte,
  MarquePotentiel,
  Segments,
  Statut,
  Texte,
  type TonStatut,
  usePalette,
} from './composants';
import { nomProspect } from './Fiches';
import { police } from './polices';
import { messageErreur, useSession } from './session';
import { RAYON } from './theme';

type Traduire = ReturnType<typeof useTranslation>['t'];

const majuscule = (texte: string) => texte.charAt(0).toUpperCase() + texte.slice(1);

function date(iso: string, langue: string, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat(langue, { ...options, timeZone: 'UTC' }).format(
    new Date(`${iso}T12:00:00Z`),
  );
}

function plusJours(iso: string, n: number) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** « Du 12 au 18 octobre » (ou « Semaine du … »), du lundi au dimanche. */
export function periodeDe(
  semaine: Pick<Semaine, 'semaine'>,
  t: Traduire,
  langue: string,
  longue = false,
) {
  const dimanche = plusJours(semaine.semaine, 6);
  const memeMois = semaine.semaine.slice(0, 7) === dimanche.slice(0, 7);
  return t(longue ? 'mobile.semaine.periodeLongue' : 'mobile.semaine.periode', {
    debut: date(
      semaine.semaine,
      langue,
      memeMois ? { day: 'numeric' } : { day: 'numeric', month: 'long' },
    ),
    fin: date(dimanche, langue, { day: 'numeric', month: 'long' }),
  });
}

/** « Lun », « 12 » : le jour d'une pastille ou d'une colonne. */
export function jourCourt(iso: string, langue: string) {
  return majuscule(date(iso, langue, { weekday: 'short' }).replace('.', ''));
}

export function jourLong(iso: string, langue: string) {
  return majuscule(date(iso, langue, { weekday: 'long', day: 'numeric', month: 'long' }));
}

export function tonPlanning(statut: string | undefined): TonStatut {
  if (statut === 'approuve' || statut === 'en_cours' || statut === 'termine') return 'ok';
  if (statut === 'a_reviser') return 'wa';
  if (statut === 'soumis') return 'in';
  return 'neutre';
}

/** Le statut du planning en tête : « Approuvé · version 2 », ou « Fermée ». */
export function StatutPlanning({ semaine, long }: { semaine: Semaine; long?: boolean }) {
  const { t } = useTranslation();
  const planning = semaine.planning;
  if (!planning)
    return semaine.fermee ? (
      <Statut ton="er">{t(long ? 'fermeture.titre' : 'mobile.semaine.fermee')}</Statut>
    ) : null;
  const statut = t(`semaine.statuts.${planning.statut}`);
  return (
    <Statut ton={tonPlanning(planning.statut)}>
      {planning.numero_version
        ? t('mobile.semaine.statutVersion', { statut, numero: planning.numero_version })
        : statut}
    </Statut>
  );
}

/** « Précédente · Cette semaine · Suivante » ; la semaine courante est le segment plein. */
export function NavigationSemaine({
  semaine,
  surSemaine,
  style,
}: {
  semaine: Semaine | null;
  /** Le lundi de la semaine à lire ; rien pour la semaine courante. */
  surSemaine: (lundi: string | undefined) => void;
  style?: ViewStyle;
}) {
  const { t } = useTranslation();
  return (
    <Segments
      libelle={t('mobile.semaine.titre')}
      options={[
        { cle: 'precedente', libelle: t('mobile.semaine.precedente'), lu: t('semaine.precedente') },
        { cle: 'courante', libelle: t('mobile.semaine.courante') },
        { cle: 'suivante', libelle: t('mobile.semaine.suivante'), lu: t('semaine.suivante') },
      ]}
      valeur={semaine?.courante ? 'courante' : null}
      surChoix={(cle) => {
        if (!semaine) return;
        if (cle === 'precedente') surSemaine(semaine.precedente);
        else if (cle === 'suivante') surSemaine(semaine.suivante);
        else surSemaine(undefined);
      }}
      style={style}
    />
  );
}

const visitesDu = (semaine: Semaine, jour: string) =>
  semaine.visites.filter((v) => v.date === jour);

/** Téléphone : les jours de la semaine en pastilles ; le jour choisi est plein, souligné d'orange. */
export function ChoixJours({
  semaine,
  choisi,
  surChoix,
  attenue,
}: {
  semaine: Semaine;
  choisi: string | null;
  surChoix: (jour: string) => void;
  /** Semaine fermée : les jours se lisent, grisés. */
  attenue?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const p = usePalette();
  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel={t('mobile.semaine.joursSemaine')}
      style={[styles.pastilles, attenue && { opacity: 0.6 }]}
    >
      {semaine.jours.map((j) => {
        const actif = j.date === choisi;
        const n = visitesDu(semaine, j.date).length;
        const detail = j.ferie
          ? t('mobile.semaine.ferieCourt')
          : t('mobile.semaine.visitesCourt', { count: n });
        const couleur = actif ? p.accentTexte : p.texte;
        return (
          <Pressable
            key={j.date}
            accessibilityRole="tab"
            accessibilityState={{ selected: actif }}
            accessibilityLabel={t('mobile.semaine.jourChoisi', {
              jour: jourLong(j.date, i18n.language),
              visites: j.ferie
                ? t('semaine.ferie', { libelle: j.ferie })
                : t('jour.nombre', { count: n }),
            })}
            onPress={() => surChoix(j.date)}
            style={({ pressed }) => [
              styles.pastille,
              actif
                ? { backgroundColor: p.accentPlein, borderColor: p.accentPlein }
                : { backgroundColor: p.surface, borderColor: p.ligne },
              pressed && !actif && { backgroundColor: p.surface2 },
            ]}
          >
            <Text style={[styles.pastilleJour, { color: couleur }]}>
              {jourCourt(j.date, i18n.language)}
            </Text>
            <Text style={[styles.pastilleNombre, { color: couleur }]}>
              {date(j.date, i18n.language, { day: 'numeric' })}
            </Text>
            <Text style={[styles.pastilleDetail, { color: couleur }]}>{detail}</Text>
            {actif && <View style={[styles.souligne, { backgroundColor: p.orange }]} />}
          </Pressable>
        );
      })}
    </View>
  );
}

/** Tablette : les jours en colonnes, chacun avec ses visites ; le jour choisi est encadré. */
export function GrilleSemaine({
  semaine,
  choisi,
  surJour,
  surVisite,
  attenue,
}: {
  semaine: Semaine;
  choisi: string | null;
  surJour: (jour: string) => void;
  surVisite: (visite: Visite) => void;
  attenue?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const p = usePalette();
  return (
    <View
      accessibilityLabel={t('mobile.semaine.joursSemaine')}
      style={[styles.grille, attenue && { opacity: 0.55 }]}
    >
      {semaine.jours.map((j) => {
        const actif = j.date === choisi;
        const visites = visitesDu(semaine, j.date);
        return (
          <Carte
            key={j.date}
            marge={0}
            style={{
              flex: 1,
              minWidth: 0,
              minHeight: attenue ? 240 : 560,
              overflow: 'hidden',
              ...(actif ? { borderColor: p.accentPlein } : {}),
            }}
          >
            {actif && <View style={[styles.repereHaut, { backgroundColor: p.orange }]} />}
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: actif }}
              accessibilityLabel={jourLong(j.date, i18n.language)}
              accessibilityHint={t('jour.ouvrir')}
              onPress={() => surJour(j.date)}
              style={({ pressed }) => [
                styles.enteteColonne,
                { borderBottomColor: p.ligne },
                pressed && { backgroundColor: p.surface2 },
              ]}
            >
              <Texte variante="libelle">
                {majuscule(date(j.date, i18n.language, { weekday: 'long' }))}
              </Texte>
              <View style={styles.ligneNombre}>
                <Text style={[styles.nombreColonne, { color: p.texte }]}>
                  {date(j.date, i18n.language, { day: 'numeric' })}
                </Text>
                {!attenue && (
                  <Texte variante="libelle">{t('jour.visites', { count: visites.length })}</Texte>
                )}
              </View>
            </Pressable>
            <View style={{ padding: 8, gap: 6 }}>
              {j.ferie ? (
                <Texte variante="libelle" style={{ padding: 8 }}>
                  {t('semaine.ferie', { libelle: j.ferie })}
                </Texte>
              ) : null}
              {visites.map((v) => (
                <Pressable
                  key={v.id}
                  accessibilityRole="button"
                  accessibilityLabel={[
                    v.heure,
                    v.prospect ? nomProspect(v.prospect, t) : t('visites.sansProspect'),
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                  onPress={() => surVisite(v)}
                  style={({ pressed }) => [
                    styles.visiteColonne,
                    { borderColor: p.ligne, backgroundColor: p.surface2 },
                    pressed && { opacity: 0.7 },
                  ]}
                >
                  {v.prospect && <MarquePotentiel valeur={v.prospect.potentiel} taille={20} />}
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[styles.heureColonne, { color: p.texte }]}>
                      {v.heure ?? '--:--'}
                    </Text>
                    <Text
                      numberOfLines={1}
                      style={[styles.nomColonne, { color: p.texteSecondaire }]}
                    >
                      {v.prospect ? nomProspect(v.prospect, t) : t('visites.sansProspect')}
                    </Text>
                  </View>
                </Pressable>
              ))}
              {!visites.length && !j.ferie && (
                <Texte variante="libelle" style={{ padding: 8, color: p.texteDiscret }}>
                  {t('mobile.semaine.aucuneVisite')}
                </Texte>
              )}
            </View>
          </Carte>
        );
      })}
    </View>
  );
}

/**
 * La semaine a commencé sans planning validé (0.3.9) : elle est fermée ; le délégué en demande
 * la réouverture à son superviseur.
 */
export function SemaineFermee({
  semaine,
  surDemande,
  tablette,
}: {
  semaine: Semaine;
  surDemande: (message: string) => void;
  tablette?: boolean;
}) {
  const { t } = useTranslation();
  const p = usePalette();
  const { client } = useSession();
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  if (!semaine.fermee) return null;

  async function demander() {
    setEnvoi(true);
    setErreur(null);
    try {
      await client.plannings.demanderReouverture(semaine.semaine);
      surDemande(t('fermeture.demandeSucces'));
    } catch (e) {
      setErreur(messageErreur(e, t('erreurs.reseau')));
    } finally {
      setEnvoi(false);
    }
  }

  const action = semaine.demande_envoyee ? (
    <Texte variante="discret" style={tablette ? { maxWidth: 260 } : undefined}>
      {t('fermeture.demandeEnvoyee')}
    </Texte>
  ) : (
    <Bouton
      libelle={t('fermeture.demander')}
      chargement={envoi}
      onPress={() => void demander()}
      style={tablette ? { minWidth: 260 } : undefined}
    />
  );
  return (
    <Carte
      accent={p.erreur}
      marge={tablette ? 24 : 16}
      style={tablette ? { flexDirection: 'row', alignItems: 'center', gap: 24 } : { gap: 12 }}
    >
      <View style={tablette ? { flex: 1, gap: 6 } : { gap: 12 }}>
        {tablette ? (
          <Text accessibilityRole="header" style={[styles.titreFermee, { color: p.texte }]}>
            {t('fermeture.titre')}
          </Text>
        ) : (
          <Texte variante="sousTitre" accessibilityRole="header">
            {t('fermeture.titre')}
          </Texte>
        )}
        <Texte style={[{ fontSize: 15, lineHeight: 21 }, tablette && { maxWidth: 560 }]}>
          {t('fermeture.delegue')}
        </Texte>
        {erreur && <Alerte type="erreur">{erreur}</Alerte>}
      </View>
      {action}
    </Carte>
  );
}

/** Téléphone, semaine fermée : ses jours, sans visite, grisés. */
export function JoursFermes({ semaine }: { semaine: Semaine }) {
  const { t, i18n } = useTranslation();
  const p = usePalette();
  return (
    <Carte marge={0} style={{ opacity: 0.6 }}>
      {semaine.jours.map((j, i) => (
        <View
          key={j.date}
          style={[styles.ligneJour, i > 0 && { borderTopWidth: 1, borderTopColor: p.ligne }]}
        >
          <Texte variante="fort" style={{ flex: 1 }}>
            {majuscule(
              date(j.date, i18n.language, { weekday: 'long', day: 'numeric', month: 'short' }),
            )}
          </Texte>
          <Texte variante="libelle">
            {t('jour.nombre', { count: visitesDu(semaine, j.date).length })}
          </Texte>
        </View>
      ))}
    </Carte>
  );
}

const styles = StyleSheet.create({
  pastilles: { flexDirection: 'row', gap: 6 },
  pastille: {
    flex: 1,
    minWidth: 0,
    minHeight: 64,
    paddingVertical: 8,
    alignItems: 'center',
    gap: 1,
    borderWidth: 1,
    borderRadius: RAYON,
    overflow: 'hidden',
  },
  pastilleJour: { fontFamily: police.texteMoyen, fontSize: 12.5, lineHeight: 18, opacity: 0.8 },
  pastilleNombre: { fontFamily: police.titre, fontSize: 17, lineHeight: 22 },
  pastilleDetail: { fontFamily: police.texteFort, fontSize: 11.5, lineHeight: 14 },
  souligne: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 3 },
  grille: { flexDirection: 'row', gap: 12 },
  repereHaut: { position: 'absolute', left: 0, right: 0, top: 0, height: 3, zIndex: 1 },
  enteteColonne: {
    paddingTop: 12,
    paddingHorizontal: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
  },
  ligneNombre: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  nombreColonne: { fontFamily: police.titreFort, fontSize: 24, lineHeight: 30 },
  visiteColonne: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 8,
    minHeight: 44,
    borderWidth: 1,
    borderRadius: RAYON,
  },
  heureColonne: { fontFamily: police.texteGras, fontSize: 12.5, lineHeight: 16 },
  nomColonne: { fontFamily: police.texteMoyen, fontSize: 12.5, lineHeight: 16 },
  titreFermee: { fontFamily: police.titreFort, fontSize: 22, lineHeight: 28 },
  ligneJour: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 56,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
});
