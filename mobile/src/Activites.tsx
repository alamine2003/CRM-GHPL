/**
 * Activités connexes déclarées dans le planning, sur la journée ou une demi-journée :
 * - absences (PLN-009) : congé, formation, réunion ou autre ; une demi-journée réduit de
 *   moitié les seuils du jour (CA1) ;
 * - activités avec visites (PLN-018, 0.3.1) : commando, déplacement (justifié ou demandé par le
 *   superviseur), accompagnement du superviseur ; elles s'expliquent et gardent leurs visites.
 */
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import type { Activite, PeriodeActivite, Semaine, TypeActivite } from '@innov/api-client';
import { type ReactNode, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  type ChampsActivite,
  estTransitoire,
  garderBrouillon,
  mettreEnAttente,
  nouvelIdentifiant,
  oublierBrouillon,
} from './Brouillons';
import { Alerte, Bouton, Champ, ListeDeroulante, Segments, Texte, usePalette } from './composants';
import { useTablette } from './disposition';
import { Ecran } from './Ecran';
import { Pilule } from './Etablissements';
import { police } from './polices';
import { jourLong } from './Semaine';
import { messageErreur, useSession } from './session';

// DC-51 : l'indisponibilité imprévue ne se planifie pas ; elle se déclare le jour même.
const AVEC_VISITES: TypeActivite[] = ['commando', 'deplacement', 'accompagnement'];
/** Les types dans l'ordre de la maquette : « Autre » ferme la liste. */
const TYPES: TypeActivite[] = [
  'conge',
  'formation',
  'reunion',
  'commando',
  'deplacement',
  'accompagnement',
  'autre',
];

export const avecVisites = (type: TypeActivite | null) => !!type && AVEC_VISITES.includes(type);

const ICONES: Partial<Record<TypeActivite, keyof typeof MaterialIcons.glyphMap>> = {
  commando: 'groups',
  deplacement: 'directions-car',
  accompagnement: 'supervisor-account',
};
const PERIODES: PeriodeActivite[] = ['journee', 'matin', 'apres_midi'];

/** Ligne d'une activité dans la journée : « Formation · après-midi ». */
export function LigneActivite({ activite, onPress }: { activite: Activite; onPress?: () => void }) {
  const { t } = useTranslation();
  const p = usePalette();
  const libelle = t('activites.ligne', {
    type: t(`activites.types.${activite.type}`),
    periode: t(`activites.periodes.${activite.periode ?? 'journee'}`),
  });
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityHint={onPress ? t('activites.modifier') : undefined}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [styles.ligne, pressed && { backgroundColor: p.fond }]}
    >
      <View style={styles.icone}>
        <MaterialIcons
          name={ICONES[activite.type] ?? 'event-busy'}
          size={20}
          color={activite.avec_visites ? p.texte : p.texteSecondaire}
        />
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        {/* Une activité avec visites est du travail : elle se lit comme une ligne de la journée. */}
        <Text
          style={[styles.libelle, { color: activite.avec_visites ? p.texte : p.texteSecondaire }]}
        >
          {libelle}
        </Text>
        {activite.demande_superviseur ? (
          <Texte variante="discret">{t('activites.parSuperviseur')}</Texte>
        ) : null}
        {activite.commentaire ? (
          <Texte variante="discret" numberOfLines={activite.avec_visites ? 3 : 1}>
            {activite.commentaire}
          </Texte>
        ) : null}
      </View>
      {onPress && <MaterialIcons name="chevron-right" size={22} color={p.texteDiscret} />}
    </Pressable>
  );
}

/** Saisie d'une activité, en pleine page ; ajout si `activite` est absente. */
export function FormulaireActivite({
  semaine,
  jour,
  activite,
  brouillon,
  surTermine,
  surAnnuler,
}: {
  semaine: Semaine;
  jour: string;
  activite?: Activite;
  /** Saisie reprise d'un brouillon gardé sur le téléphone (PLN-007). */
  brouillon?: ChampsActivite;
  surTermine: (message: string) => void;
  surAnnuler: () => void;
}) {
  const { t, i18n } = useTranslation();
  const { client } = useSession();
  const [date, setDate] = useState(brouillon?.date ?? activite?.date ?? jour);
  const [type, setType] = useState<TypeActivite | null>(
    brouillon ? brouillon.type : (activite?.type ?? null),
  );
  const [periode, setPeriode] = useState<PeriodeActivite>(
    brouillon?.periode ?? activite?.periode ?? 'journee',
  );
  const [commentaire, setCommentaire] = useState(
    brouillon?.commentaire ?? activite?.commentaire ?? '',
  );
  const [demandeSuperviseur, setDemandeSuperviseur] = useState(
    brouillon?.demande_superviseur ?? activite?.demande_superviseur ?? false,
  );

  // PLN-007 : la saisie est gardée sur le téléphone à chaque changement.
  useEffect(() => {
    const minuterie = setTimeout(() => {
      void garderBrouillon({
        objet: 'activite',
        semaine: semaine.semaine,
        activite: activite?.id,
        champs: { date, type, periode, commentaire, demande_superviseur: demandeSuperviseur },
      });
    }, 300);
    return () => clearTimeout(minuterie);
  }, [semaine.semaine, activite?.id, date, type, periode, commentaire, demandeSuperviseur]);
  const [envoi, setEnvoi] = useState<'enregistrer' | 'retirer' | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const avec = avecVisites(type);
  const motifManquant = (type === 'autre' || avec) && !commentaire.trim();
  const jours = semaine.jours.filter((j) => j.planifiable);
  const libelleJour = (iso: string) =>
    new Intl.DateTimeFormat(i18n.language, { weekday: 'short', day: 'numeric' }).format(
      new Date(`${iso}T12:00:00`),
    );

  async function enregistrer() {
    if (!type) return;
    setEnvoi('enregistrer');
    setErreur(null);
    const saisie = {
      date,
      type,
      periode,
      commentaire: commentaire.trim(),
      demande_superviseur: type === 'deplacement' && demandeSuperviseur,
    };
    const ajout = { ...saisie, id: nouvelIdentifiant() };
    try {
      if (activite) await client.activites.modifier(activite.id, saisie);
      else if (semaine.planning)
        await client.plannings.declarerActivite(semaine.planning.id, ajout);
      await oublierBrouillon();
      surTermine(activite ? t('activites.modifiee') : t('activites.declaree'));
    } catch (e) {
      // Sans réseau, une nouvelle absence attend sur le téléphone (PLN-007).
      if (estTransitoire(e) && !activite && semaine.planning) {
        await mettreEnAttente({
          id: ajout.id,
          type: 'ajout_activite',
          planning: semaine.planning.id,
          saisie: ajout,
          resume: `${libelleJour(date)} · ${t(`activites.types.${type}`)}`,
        });
        await oublierBrouillon();
        surTermine(t('attente.gardee'));
        return;
      }
      setErreur(messageErreur(e, t('erreurs.reseau')));
      setEnvoi(null);
    }
  }

  async function retirer() {
    if (!activite) return;
    setEnvoi('retirer');
    setErreur(null);
    try {
      await client.activites.retirer(activite.id);
      await oublierBrouillon();
      surTermine(t('activites.retiree'));
    } catch (e) {
      setErreur(messageErreur(e, t('erreurs.reseau')));
      setEnvoi(null);
    }
  }

  const tablette = useTablette();
  const titre = activite ? t('activites.modifier') : t('activites.nouvelle');
  const jourEntier = jourLong(date, i18n.language);
  const annuler = () => {
    void oublierBrouillon();
    surAnnuler();
  };

  const boutons = (
    <>
      <Bouton
        variante="contour"
        petit={tablette}
        libelle={t('commun.annuler')}
        onPress={annuler}
        style={tablette ? undefined : { flex: 1 }}
      />
      <Bouton
        petit={tablette}
        libelle={t('commun.enregistrer')}
        chargement={envoi === 'enregistrer'}
        desactive={!type || motifManquant || envoi === 'retirer'}
        onPress={() => void enregistrer()}
        style={tablette ? { minWidth: 140 } : { flex: 2 }}
      />
    </>
  );

  const optionsJours = jours.map((j) => ({ id: j.date, libelle: jourLong(j.date, i18n.language) }));
  const champJour = (
    <ListeDeroulante
      libelle={t('activites.champs.date')}
      valeur={date}
      options={
        optionsJours.some((o) => o.id === date)
          ? optionsJours
          : [{ id: date, libelle: jourEntier }, ...optionsJours]
      }
      surChoix={setDate}
    />
  );
  const champType = (
    <Groupe titre={t('activites.champs.type')}>
      {TYPES.map((v) => (
        <Pilule
          key={v}
          libelle={t(`activites.types.${v}`)}
          actif={type === v}
          onPress={() => setType(v)}
        />
      ))}
    </Groupe>
  );
  const champPeriode = (
    <View style={{ gap: 6, flex: tablette ? 1 : undefined, minWidth: 0 }}>
      <Texte variante="libelle">{t('activites.champs.periode')}</Texte>
      <Segments
        libelle={t('activites.champs.periode')}
        options={PERIODES.map((v) => ({ cle: v, libelle: t(`activites.periodes.${v}`) }))}
        valeur={periode}
        surChoix={setPeriode}
      />
    </View>
  );
  const champDemande =
    type === 'deplacement' ? (
      <View style={{ gap: 6 }}>
        <Texte variante="libelle">{t('activites.demande')}</Texte>
        <Segments
          libelle={t('activites.demande')}
          options={[
            { cle: 'moi', libelle: t('activites.demandeMoi') },
            { cle: 'superviseur', libelle: t('activites.demandeSuperviseur') },
          ]}
          valeur={demandeSuperviseur ? 'superviseur' : 'moi'}
          surChoix={(c) => setDemandeSuperviseur(c === 'superviseur')}
        />
      </View>
    ) : null;
  const champCommentaire = (
    <>
      <Champ
        libelle={
          avec
            ? t('activites.explication')
            : type === 'autre'
              ? t('activites.motif')
              : t('activites.commentaire')
        }
        placeholder={t('activites.indiceCommentaire')}
        value={commentaire}
        onChangeText={setCommentaire}
        maxLength={500}
        multiline
        style={{ minHeight: tablette ? 110 : 80 }}
      />
      {motifManquant && (
        <Texte variante="discret">
          {avec ? t('activites.explicationRequise') : t('activites.motifRequis')}
        </Texte>
      )}
    </>
  );
  const retrait = activite ? (
    <Pressable
      accessibilityRole="button"
      disabled={envoi !== null}
      onPress={() => void retirer()}
      style={({ pressed }) => [styles.retirer, pressed && { opacity: 0.6 }]}
    >
      <Retirer libelle={envoi === 'retirer' ? t('session.chargement') : t('activites.retirer')} />
    </Pressable>
  ) : null;

  if (tablette) {
    return (
      <Ecran
        titre={titre}
        surTitre={jourEntier}
        fermer
        surRetour={annuler}
        onglets={false}
        enteteTablette={{ action: <View style={styles.actionsEntete}>{boutons}</View> }}
      >
        <View style={styles.colonne}>
          {erreur && <Alerte type="erreur">{erreur}</Alerte>}
          <View style={styles.deuxColonnes}>
            {champJour}
            {champPeriode}
          </View>
          {champType}
          {champDemande}
          {champCommentaire}
          <Alerte type="info">{t('activites.visitesRestent')}</Alerte>
          {retrait}
        </View>
      </Ecran>
    );
  }

  return (
    <Ecran
      titre={titre}
      surTitre={jourEntier}
      fermer
      surRetour={annuler}
      onglets={false}
      pied={boutons}
    >
      {erreur && <Alerte type="erreur">{erreur}</Alerte>}
      {champJour}
      {champType}
      {champPeriode}
      {champDemande}
      {champCommentaire}
      {retrait}
    </Ecran>
  );
}

function Retirer({ libelle }: { libelle: string }) {
  const p = usePalette();
  return <Text style={[styles.lien, { color: p.erreur }]}>{libelle}</Text>;
}

function Groupe({ titre, children }: { titre: string; children: ReactNode }) {
  return (
    <View style={{ gap: 8 }}>
      <Texte variante="libelle">{titre}</Texte>
      <View style={styles.pilules}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  ligne: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 48,
    paddingVertical: 8,
    paddingLeft: 4,
    borderRadius: 6,
  },
  icone: { width: 48, alignItems: 'flex-start' },
  libelle: { fontFamily: police.texteFort, fontSize: 15 },
  pilules: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  retirer: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  colonne: { width: '100%', maxWidth: 680, alignSelf: 'center', gap: 22 },
  deuxColonnes: { flexDirection: 'row', gap: 16, alignItems: 'flex-start' },
  actionsEntete: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  lien: { fontFamily: police.texteFort, fontSize: 14 },
});
