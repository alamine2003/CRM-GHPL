/**
 * Absences déclarées dans le planning (PLN-009) : congé, formation, réunion, maladie ou autre,
 * sur la journée ou une demi-journée. Une demi-journée réduit de moitié les seuils du jour (CA1,
 * contrôles en 0.2.4) ; l'absence se valide avec le planning (CA2, cycle 0.3).
 */
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import type { Absence, PeriodeAbsence, Semaine, TypeAbsence } from '@innov/api-client';
import { type ReactNode, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  type ChampsAbsence,
  estTransitoire,
  garderBrouillon,
  mettreEnAttente,
  nouvelIdentifiant,
  oublierBrouillon,
} from './Brouillons';
import { Alerte, Bouton, Champ, Texte, usePalette } from './composants';
import { Pilule } from './Etablissements';
import { police } from './polices';
import { messageErreur, useSession } from './session';

const TYPES: TypeAbsence[] = ['conge', 'formation', 'reunion', 'maladie', 'autre'];
const PERIODES: PeriodeAbsence[] = ['journee', 'matin', 'apres_midi'];

/** Ligne d'une absence dans la journée : « Formation · après-midi ». */
export function LigneAbsence({ absence, onPress }: { absence: Absence; onPress?: () => void }) {
  const { t } = useTranslation();
  const p = usePalette();
  const libelle = t('absences.ligne', {
    type: t(`absences.types.${absence.type}`),
    periode: t(`absences.periodes.${absence.periode ?? 'journee'}`),
  });
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityHint={onPress ? t('absences.modifier') : undefined}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [styles.ligne, pressed && { backgroundColor: p.fond }]}
    >
      <View style={styles.icone}>
        <MaterialIcons name="event-busy" size={20} color={p.texteSecondaire} />
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text style={[styles.libelle, { color: p.texteSecondaire }]}>{libelle}</Text>
        {absence.commentaire ? (
          <Texte variante="discret" numberOfLines={1}>
            {absence.commentaire}
          </Texte>
        ) : null}
      </View>
      {onPress && <MaterialIcons name="chevron-right" size={22} color={p.texteDiscret} />}
    </Pressable>
  );
}

/** Saisie d'une absence, en pleine page ; ajout si `absence` est absente. */
export function FormulaireAbsence({
  semaine,
  jour,
  absence,
  brouillon,
  surTermine,
  surAnnuler,
}: {
  semaine: Semaine;
  jour: string;
  absence?: Absence;
  /** Saisie reprise d'un brouillon gardé sur le téléphone (PLN-007). */
  brouillon?: ChampsAbsence;
  surTermine: (message: string) => void;
  surAnnuler: () => void;
}) {
  const { t, i18n } = useTranslation();
  const { client } = useSession();
  const [date, setDate] = useState(brouillon?.date ?? absence?.date ?? jour);
  const [type, setType] = useState<TypeAbsence | null>(
    brouillon ? brouillon.type : (absence?.type ?? null),
  );
  const [periode, setPeriode] = useState<PeriodeAbsence>(
    brouillon?.periode ?? absence?.periode ?? 'journee',
  );
  const [commentaire, setCommentaire] = useState(
    brouillon?.commentaire ?? absence?.commentaire ?? '',
  );

  // PLN-007 : la saisie est gardée sur le téléphone à chaque changement.
  useEffect(() => {
    const minuterie = setTimeout(() => {
      void garderBrouillon({
        objet: 'absence',
        semaine: semaine.semaine,
        absence: absence?.id,
        champs: { date, type, periode, commentaire },
      });
    }, 300);
    return () => clearTimeout(minuterie);
  }, [semaine.semaine, absence?.id, date, type, periode, commentaire]);
  const [envoi, setEnvoi] = useState<'enregistrer' | 'retirer' | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const motifManquant = type === 'autre' && !commentaire.trim();
  const jours = semaine.jours.filter((j) => j.planifiable);
  const libelleJour = (iso: string) =>
    new Intl.DateTimeFormat(i18n.language, { weekday: 'short', day: 'numeric' }).format(
      new Date(`${iso}T12:00:00`),
    );

  async function enregistrer() {
    if (!type) return;
    setEnvoi('enregistrer');
    setErreur(null);
    const saisie = { date, type, periode, commentaire: commentaire.trim() };
    const ajout = { ...saisie, id: nouvelIdentifiant() };
    try {
      if (absence) await client.absences.modifier(absence.id, saisie);
      else if (semaine.planning) await client.plannings.declarerAbsence(semaine.planning.id, ajout);
      await oublierBrouillon();
      surTermine(absence ? t('absences.modifiee') : t('absences.declaree'));
    } catch (e) {
      // Sans réseau, une nouvelle absence attend sur le téléphone (PLN-007).
      if (estTransitoire(e) && !absence && semaine.planning) {
        await mettreEnAttente({
          id: ajout.id,
          type: 'ajout_absence',
          planning: semaine.planning.id,
          saisie: ajout,
          resume: `${libelleJour(date)} · ${t(`absences.types.${type}`)}`,
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
    if (!absence) return;
    setEnvoi('retirer');
    setErreur(null);
    try {
      await client.absences.retirer(absence.id);
      await oublierBrouillon();
      surTermine(t('absences.retiree'));
    } catch (e) {
      setErreur(messageErreur(e, t('erreurs.reseau')));
      setEnvoi(null);
    }
  }

  return (
    <View style={{ gap: 16 }}>
      <Texte variante="sousTitre">
        {absence ? t('absences.modifier') : t('absences.nouvelle')}
      </Texte>
      <Texte variante="discret">{t('absences.aide')}</Texte>
      {erreur && <Alerte type="erreur">{erreur}</Alerte>}

      <Groupe titre={t('absences.champs.date')}>
        {jours.map((j) => (
          <Pilule
            key={j.date}
            libelle={libelleJour(j.date)}
            actif={date === j.date}
            onPress={() => setDate(j.date)}
          />
        ))}
      </Groupe>
      <Groupe titre={t('absences.champs.type')}>
        {TYPES.map((v) => (
          <Pilule
            key={v}
            libelle={t(`absences.types.${v}`)}
            actif={type === v}
            onPress={() => setType(v)}
          />
        ))}
      </Groupe>
      <Groupe titre={t('absences.champs.periode')}>
        {PERIODES.map((v) => (
          <Pilule
            key={v}
            libelle={t(`absences.periodes.${v}`)}
            actif={periode === v}
            onPress={() => setPeriode(v)}
          />
        ))}
      </Groupe>
      <Champ
        libelle={type === 'autre' ? t('absences.motif') : t('absences.commentaire')}
        value={commentaire}
        onChangeText={setCommentaire}
        maxLength={200}
      />
      {motifManquant && <Texte variante="discret">{t('absences.motifRequis')}</Texte>}

      <Bouton
        libelle={t('commun.enregistrer')}
        chargement={envoi === 'enregistrer'}
        desactive={!type || motifManquant || envoi === 'retirer'}
        onPress={() => void enregistrer()}
      />
      <Bouton
        secondaire
        libelle={t('commun.annuler')}
        onPress={() => {
          void oublierBrouillon();
          surAnnuler();
        }}
      />
      {absence && (
        <Pressable
          accessibilityRole="button"
          disabled={envoi !== null}
          onPress={() => void retirer()}
          style={({ pressed }) => [styles.retirer, pressed && { opacity: 0.6 }]}
        >
          <Retirer
            libelle={envoi === 'retirer' ? t('session.chargement') : t('absences.retirer')}
          />
        </Pressable>
      )}
    </View>
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
  lien: { fontFamily: police.texteFort, fontSize: 14 },
});
