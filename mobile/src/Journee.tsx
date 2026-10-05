/**
 * Une journée de la semaine du délégué : ses absences (PLN-009), ses visites dans l'ordre de la
 * journée et ses passages (PLN-003), avec les actions de préparation.
 *
 * Ordre (0.2.3) : les visites à heure fixe se rangent d'elles-mêmes dans l'ordre chronologique ;
 * en mode « Réordonner », seules celles sans heure se déplacent.
 */
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import type { Absence, Controles, JourSemaine, Passage, Visite } from '@innov/api-client';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { LigneAbsence } from './Absences';
import { alertesDeVisite } from './Controles';
import { Texte, useLien, usePalette } from './composants';
import { police } from './polices';
import { LienAction, LigneVisite } from './Visites';

/** Une visite seule, ou toutes les visites d'un passage, à la place de la première. */
export type Unite = { passage?: Passage; visites: Visite[] };

export function unitesDuJour(visites: Visite[], passages: Passage[]): Unite[] {
  const unites: Unite[] = [];
  const parPassage = new Map<string, Unite>();
  for (const v of visites) {
    const passage = v.passage ? passages.find((x) => x.id === v.passage) : undefined;
    if (!passage) {
      unites.push({ visites: [v] });
      continue;
    }
    const existante = parPassage.get(passage.id);
    if (existante) existante.visites.push(v);
    else {
      const unite = { passage, visites: [v] };
      parPassage.set(passage.id, unite);
      unites.push(unite);
    }
  }
  return unites;
}

const heureDe = (u: Unite) => (u.passage ? u.passage.heure : u.visites[0]?.heure) ?? null;

/** Peut-on réordonner ce jour ? Au moins deux unités, dont une sans heure. */
export function ordonnable(unites: Unite[]) {
  return unites.length > 1 && unites.some((u) => heureDe(u) === null);
}

/** Visites d'un même lieu, pas encore regroupées : un passage est proposé (PLN-003). */
function aRegrouper(visites: Visite[]) {
  const parLieu = new Map<string, Visite[]>();
  for (const v of visites) {
    if (v.passage || !v.etablissement) continue;
    parLieu.set(v.etablissement.id, [...(parLieu.get(v.etablissement.id) ?? []), v]);
  }
  return [...parLieu.values()].filter((liste) => liste.length > 1);
}

export function Journee({
  jour,
  visites,
  passages,
  absences,
  modifiable,
  reordonner,
  controles,
  libelleJour,
  surVisite,
  surAjouterVisite,
  surAbsence,
  surDeclarerAbsence,
  surRegrouper,
  surDissocier,
  surOrdonner,
  surReordonner,
}: {
  jour: JourSemaine;
  visites: Visite[];
  passages: Passage[];
  absences: Absence[];
  modifiable: boolean;
  reordonner: boolean;
  controles: Controles | null;
  /** « mardi 6 octobre », pour les libellés vocalisés. */
  libelleJour: string;
  surVisite: (v: Visite) => void;
  surAjouterVisite: () => void;
  surAbsence: (a: Absence) => void;
  surDeclarerAbsence: () => void;
  surRegrouper: (visites: Visite[]) => void;
  surDissocier: (passage: Passage) => void;
  surOrdonner: (visites: string[]) => void;
  /** Entre dans le réordonnancement de ce jour, ou en sort. */
  surReordonner: (actif: boolean) => void;
}) {
  const { t } = useTranslation();
  const p = usePalette();
  const lien = useLien();
  const unites = unitesDuJour(visites, passages);
  // Absent toute la journée : une absence « journée », ou matin et après-midi (un commando ou un
  // déplacement, lui, garde ses visites).
  const parts = absences
    .filter((a) => !a.avec_visites)
    .reduce((n, a) => n + ((a.periode ?? 'journee') === 'journee' ? 2 : 1), 0);
  const absentToutLeJour = parts >= 2;
  // Une activité de plus ne se déclare que sur une période encore libre.
  const occupees = absences.reduce(
    (n, a) => n + ((a.periode ?? 'journee') === 'journee' ? 2 : 1),
    0,
  );
  const preparation = modifiable && jour.planifiable && !reordonner;

  function deplacer(index: number, sens: -1 | 1) {
    const cible = index + sens;
    if (cible < 0 || cible >= unites.length) return;
    const nouvel = [...unites];
    [nouvel[index], nouvel[cible]] = [nouvel[cible]!, nouvel[index]!];
    surOrdonner(nouvel.flatMap((u) => u.visites.map((v) => v.id)));
  }

  return (
    <>
      {absences.map((a) => (
        <LigneAbsence
          key={a.id}
          absence={a}
          onPress={modifiable && !reordonner ? () => surAbsence(a) : undefined}
        />
      ))}
      {unites.map((u, i) => {
        const fleches =
          reordonner && heureDe(u) === null ? (
            <Fleches
              haut={i > 0 ? () => deplacer(i, -1) : undefined}
              bas={i < unites.length - 1 ? () => deplacer(i, 1) : undefined}
            />
          ) : null;
        const ouvrir = (v: Visite) => (!reordonner ? () => surVisite(v) : undefined);
        if (!u.passage) {
          const v = u.visites[0]!;
          return (
            <View key={v.id} style={styles.unite}>
              <View style={{ flex: 1 }}>
                <LigneVisite
                  visite={v}
                  onPress={ouvrir(v)}
                  alertes={alertesDeVisite(controles, v.id, t)}
                />
              </View>
              {fleches}
            </View>
          );
        }
        const passage = u.passage;
        return (
          <View key={passage.id}>
            <View style={styles.unite}>
              <View style={{ flex: 1 }}>
                <EnTetePassage
                  passage={passage}
                  nombre={u.visites.length}
                  conflit={
                    !!controles?.bloquants.some(
                      (c) =>
                        c.code === 'meme_heure' && u.visites.some((v) => c.visites.includes(v.id)),
                    )
                  }
                />
              </View>
              {fleches}
            </View>
            {/* Un filet relie les visites du passage à sa ligne. */}
            <View style={[styles.membres, { borderLeftColor: lien }]}>
              {u.visites.map((v) => (
                <LigneVisite
                  key={v.id}
                  visite={v}
                  onPress={ouvrir(v)}
                  dansPassage
                  alertes={alertesDeVisite(controles, v.id, t, true)}
                />
              ))}
              {preparation && (
                <LienAction
                  icone="call-split"
                  libelle={t('passages.dissocier')}
                  description={t('passages.dissocierLieu', { lieu: passage.etablissement.nom })}
                  couleur={p.texteSecondaire}
                  onPress={() => surDissocier(passage)}
                />
              )}
            </View>
          </View>
        );
      })}
      {preparation &&
        aRegrouper(visites).map((liste) => (
          <LienAction
            key={liste[0]!.etablissement!.id}
            icone="call-merge"
            libelle={t('passages.regrouper', {
              count: liste.length,
              lieu: liste[0]!.etablissement!.nom,
            })}
            onPress={() => surRegrouper(liste)}
          />
        ))}
      {reordonner && (
        <View style={styles.reordonner}>
          <Texte variante="discret">{t('visites.aideOrdre')}</Texte>
          <LienAction
            icone="check"
            libelle={t('visites.ordreTermine')}
            onPress={() => surReordonner(false)}
          />
        </View>
      )}
      {preparation && (
        <View style={styles.actions}>
          {!absentToutLeJour && (
            <LienAction
              icone="add"
              libelle={t('visites.ajouter')}
              description={t('visites.ajouterLe', { jour: libelleJour })}
              onPress={surAjouterVisite}
            />
          )}
          {occupees < 2 && (
            <LienAction
              icone="event-busy"
              libelle={t('absences.declarerCourt')}
              description={t('absences.declarerLe', { jour: libelleJour })}
              couleur={p.texteSecondaire}
              onPress={surDeclarerAbsence}
            />
          )}
          {ordonnable(unites) && (
            <LienAction
              icone="swap-vert"
              libelle={t('visites.reordonnerCourt')}
              description={t('visites.reordonnerLe', { jour: libelleJour })}
              couleur={p.texteSecondaire}
              onPress={() => surReordonner(true)}
            />
          )}
        </View>
      )}
    </>
  );
}

/** Ligne d'un passage, à son heure : le lieu, puis « Passage · 3 prescripteurs » (PLN-003 CA1). */
function EnTetePassage({
  passage,
  nombre,
  conflit,
}: {
  passage: Passage;
  nombre: number;
  /** Une autre visite du jour tombe à la même heure (PLN-004 CA1). */
  conflit?: boolean;
}) {
  const { t } = useTranslation();
  const p = usePalette();
  return (
    <View
      style={styles.passage}
      accessible
      accessibilityLabel={t('passages.ligne', { lieu: passage.etablissement.nom, count: nombre })}
    >
      <Text style={[styles.heure, { color: passage.heure ? p.texte : p.texteDiscret }]}>
        {passage.heure ?? '--:--'}
      </Text>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text numberOfLines={2} style={[styles.titrePassage, { color: p.texte }]}>
          {passage.etablissement.nom}
        </Text>
        <Text style={[styles.sousTitrePassage, { color: p.texteSecondaire }]}>
          {t('passages.nombre', { count: nombre })}
        </Text>
        {conflit && (
          <Text style={[styles.conflit, { color: p.erreur }]}>
            {t('controles.visite.meme_heure')}
          </Text>
        )}
      </View>
    </View>
  );
}

function Fleches({ haut, bas }: { haut?: () => void; bas?: () => void }) {
  const { t } = useTranslation();
  const p = usePalette();
  const bouton = (sens: 'haut' | 'bas', action?: () => void) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={sens === 'haut' ? t('visites.monter') : t('visites.descendre')}
      accessibilityState={{ disabled: !action }}
      disabled={!action}
      onPress={action}
      style={({ pressed }) => [
        styles.fleche,
        { borderColor: p.ligne, backgroundColor: pressed ? p.fond : p.surface },
        !action && { opacity: 0.3 },
      ]}
    >
      <MaterialIcons
        name={sens === 'haut' ? 'arrow-upward' : 'arrow-downward'}
        size={20}
        color={p.texte}
      />
    </Pressable>
  );
  return (
    <View style={styles.fleches}>
      {bouton('haut', haut)}
      {bouton('bas', bas)}
    </View>
  );
}

const styles = StyleSheet.create({
  unite: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  passage: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 48,
    paddingVertical: 8,
    paddingLeft: 4,
  },
  heure: { fontFamily: police.texteFort, fontSize: 14, width: 48, fontVariant: ['tabular-nums'] },
  titrePassage: { fontFamily: police.texteFort, fontSize: 15 },
  sousTitrePassage: { fontFamily: police.texte, fontSize: 13 },
  conflit: { fontFamily: police.texteFort, fontSize: 12 },
  membres: { marginLeft: 22, paddingLeft: 8, borderLeftWidth: 2 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 24 },
  reordonner: { gap: 4, paddingTop: 4 },
  fleches: { flexDirection: 'row', gap: 6 },
  fleche: {
    width: 44,
    height: 44,
    borderWidth: 1,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
