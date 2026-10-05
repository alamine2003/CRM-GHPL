/**
 * Contrôles du planning (PLN-004) vus par le délégué pendant la préparation :
 * - à corriger avant de soumettre (bloquants, RG-015) ;
 * - signalés au superviseur, sans empêcher la soumission (RG-016, CA2).
 */
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import type { ControlePlanning, Controles, ObjectifJour, Semaine } from '@innov/api-client';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Carte, Texte, usePalette } from './composants';
import { police } from './polices';

type Traduire = ReturnType<typeof useTranslation>['t'];

/** Marque portée par une ligne de visite. */
export type Alerte = { cle: string; texte: string; ton: 'erreur' | 'attention' | 'info' };

/**
 * Remarques de révision par visite (PLN-013 CA2), tant que le planning est à réviser : le
 * délégué les lit sur la visite concernée.
 */
export function remarquesDeRevision(planning: Semaine['planning']): Record<string, string> {
  const d = planning?.decision;
  if (planning?.statut !== 'a_reviser' || d?.decision !== 'a_reviser') return {};
  return Object.fromEntries(d.remarques.map((r) => [r.visite, r.commentaire]));
}

/** Ce qui concerne une visite précise ; « À compléter » est déjà dit par la ligne elle-même. */
export function alertesDeVisite(
  controles: Controles | null,
  visite: string,
  t: Traduire,
  /** Dans un passage, l'heure est celle du passage : son conflit se dit sur sa ligne. */
  dansPassage = false,
  remarque?: string,
) {
  const alertes: Alerte[] = remarque
    ? [{ cle: 'remarque', texte: t('revision.remarqueLue', { texte: remarque }), ton: 'info' }]
    : [];
  if (!controles) return alertes;
  for (const c of controles.bloquants) {
    if (c.code === 'incomplete' || (dansPassage && c.code === 'meme_heure')) continue;
    if (c.visites.includes(visite)) {
      // Prospect et lieu peuvent être inactifs ensemble : chaque fiche a sa ligne.
      const cle = c.code === 'fiche_inactive' ? `fiche_inactive_${c.fiche}` : c.code;
      alertes.push({
        cle: `${cle}-${alertes.length}`,
        texte: t(`controles.visite.${cle}`, { heure: c.heure }),
        ton: 'erreur',
      });
    }
  }
  for (const c of controles.signalements) {
    if (c.visites.includes(visite)) {
      alertes.push({
        cle: `${c.code}-${alertes.length}`,
        texte: t(`controles.visite.${c.code}`),
        ton: 'attention',
      });
    }
  }
  return alertes;
}

/** « 1 sur 6–10 » à droite du jour ; en orange hors de la fourchette. */
export function ObjectifDuJour({ objectif }: { objectif: ObjectifJour }) {
  const { t } = useTranslation();
  const p = usePalette();
  const dehors = objectif.visites < objectif.min || objectif.visites > objectif.max;
  return (
    <Text
      numberOfLines={1}
      accessibilityLabel={t('controles.objectif', {
        count: objectif.visites,
        min: objectif.min,
        max: objectif.max,
      })}
      style={[styles.objectif, { color: dehors ? p.attention : p.texteSecondaire }]}
    >
      {t('controles.objectifCourt', {
        nombre: objectif.visites,
        min: objectif.min,
        max: objectif.max,
      })}
    </Text>
  );
}

/**
 * Carte « À vérifier » : les points à corriger, puis ce qui sera signalé au superviseur.
 * Les seuils de chaque jour se lisent sur la journée ; ici, une seule ligne les résume.
 */
export function CarteControles({
  controles,
  jourCourt,
  surVisite,
}: {
  controles: Controles;
  /** « mar. 13 » */
  jourCourt: (iso: string) => string;
  surVisite: (id: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const { bloquants, signalements } = controles;
  if (bloquants.length === 0 && signalements.length === 0) return null;

  const jours = (code: string) =>
    signalements
      .filter((c) => c.code === code)
      .map((c) => (c.date ? jourCourt(c.date) : ''))
      .join(', ');
  const lignesSignalees: { cle: string; texte: string; visite?: string }[] = [];
  for (const code of ['seuil_bas', 'seuil_haut'] as const) {
    const n = signalements.filter((c) => c.code === code).length;
    if (n)
      lignesSignalees.push({
        cle: code,
        texte: t(`controles.${code}`, { count: n, jours: jours(code) }),
      });
  }
  for (const c of signalements) {
    if (c.code === 'seuil_bas' || c.code === 'seuil_haut') continue;
    lignesSignalees.push({
      cle: `${c.code}-${c.visites[0] ?? c.mois}`,
      texte: texteControle(c, t, i18n.language, jourCourt),
      visite: c.visites[0],
    });
  }

  return (
    <Carte style={{ gap: 4 }}>
      <Texte variante="sousTitre">{t('controles.titre')}</Texte>
      {bloquants.length > 0 && (
        <Section titre={t('controles.aCorriger', { count: bloquants.length })} ton="erreur">
          {regrouper(bloquants).map(({ controle: c, nombre }, i) => (
            <Ligne
              key={`${c.code}-${i}`}
              ton="erreur"
              texte={texteControle(c, t, i18n.language, jourCourt, nombre)}
              onPress={c.visites[0] ? () => surVisite(c.visites[0]!) : undefined}
            />
          ))}
        </Section>
      )}
      {lignesSignalees.length > 0 && (
        <Section titre={t('controles.signales')} ton="attention">
          {lignesSignalees.map((l) => (
            <Ligne
              key={l.cle}
              ton="attention"
              texte={l.texte}
              onPress={l.visite ? () => surVisite(l.visite!) : undefined}
            />
          ))}
        </Section>
      )}
    </Carte>
  );
}

/** Les visites d'un même jour à qui manquent les mêmes champs tiennent sur une ligne. */
function regrouper(controles: ControlePlanning[]) {
  const lignes: { controle: ControlePlanning; nombre: number }[] = [];
  const parCle = new Map<string, { controle: ControlePlanning; nombre: number }>();
  for (const c of controles) {
    if (c.code !== 'incomplete') {
      lignes.push({ controle: c, nombre: 1 });
      continue;
    }
    const cle = `${c.date}|${(c.manquants ?? []).join(',')}`;
    const existante = parCle.get(cle);
    if (existante) existante.nombre += 1;
    else {
      const ligne = { controle: c, nombre: 1 };
      parCle.set(cle, ligne);
      lignes.push(ligne);
    }
  }
  return lignes;
}

export function texteControle(
  c: ControlePlanning,
  t: Traduire,
  langue: string,
  jourCourt: (iso: string) => string,
  /** Nombre de visites regroupées sur la ligne (visites à compléter). */
  nombre = 1,
) {
  const jour = c.date ? jourCourt(c.date) : '';
  if (c.code === 'a_non_planifie') {
    const noms = (c.prospects ?? []).map((x) => x.nom);
    const mois = c.mois
      ? new Intl.DateTimeFormat(langue, { month: 'long' }).format(new Date(`${c.mois}-15T12:00:00`))
      : '';
    return t('controles.a_non_planifie', {
      count: noms.length,
      mois,
      noms: noms.slice(0, 3).join(', '),
      suite: noms.length > 3 ? t('controles.etAutres', { count: noms.length - 3 }) : '',
    });
  }
  return t(`controles.${c.code}`, {
    jour,
    heure: c.heure,
    champs: (c.manquants ?? []).map((m) => t(`visites.champs.${m}`)).join(', '),
    fiche: c.fiche ? t(`controles.fiches.${c.fiche}`) : '',
    count: c.code === 'incomplete' ? nombre : c.visites.length,
  });
}

function Section({
  titre,
  ton,
  children,
}: {
  titre: string;
  ton: 'erreur' | 'attention';
  children: ReactNode;
}) {
  const p = usePalette();
  return (
    <View style={{ gap: 2, paddingTop: 8 }}>
      <Text style={[styles.section, { color: ton === 'erreur' ? p.erreur : p.attention }]}>
        {titre}
      </Text>
      {children}
    </View>
  );
}

function Ligne({
  texte,
  ton,
  onPress,
}: {
  texte: string;
  ton: 'erreur' | 'attention';
  onPress?: () => void;
}) {
  const p = usePalette();
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [styles.ligne, pressed && { backgroundColor: p.fond }]}
    >
      <MaterialIcons
        name={ton === 'erreur' ? 'error-outline' : 'info-outline'}
        size={18}
        color={ton === 'erreur' ? p.erreur : p.attention}
        style={{ marginTop: 2 }}
      />
      <Text style={[styles.texte, { color: p.texte }]}>{texte}</Text>
      {onPress && <MaterialIcons name="chevron-right" size={20} color={p.texteDiscret} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  objectif: {
    fontFamily: police.texteFort,
    fontSize: 13,
    fontVariant: ['tabular-nums'],
    flexShrink: 0,
  },
  section: {
    fontFamily: police.texteFort,
    fontSize: 13,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  ligne: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    minHeight: 44,
    paddingVertical: 8,
  },
  texte: { flex: 1, fontFamily: police.texte, fontSize: 15, lineHeight: 21 },
});
