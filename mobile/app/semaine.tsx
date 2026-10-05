import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import type { Absence, Semaine, Visite } from '@innov/api-client';
import { marque } from '@innov/design';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Alerte, Bouton, Carte, Texte, useLien, usePalette } from '../src/composants';
import { Ecran } from '../src/Ecran';
import { police } from '../src/polices';
import { messageErreur, useSession } from '../src/session';
import { FormulaireAbsence } from '../src/Absences';
import { CarteControles, ObjectifDuJour } from '../src/Controles';
import { Journee } from '../src/Journee';
import { FormulaireVisite } from '../src/Visites';

const majuscule = (texte: string) => texte.charAt(0).toUpperCase() + texte.slice(1);

const jourIso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * Semaine du délégué (PLN-001) : ses jours ouvrés, les jours fériés du pays (affichés, non
 * planifiables, CA2) et son planning, un seul par semaine (CA1). Tant que le planning est en
 * préparation, chaque jour planifiable reçoit ses visites (PLN-002) ; une visite incomplète
 * reste permise et montre ce qui manque (CA1). Depuis 0.2.3 : ordre de la journée, passages
 * (PLN-003) et absences (PLN-009).
 */
export default function EcranSemaine() {
  const { t, i18n } = useTranslation();
  const p = usePalette();
  const lien = useLien();
  const { client } = useSession();
  const [jour, setJour] = useState<string | undefined>(undefined);
  const [semaine, setSemaine] = useState<Semaine | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [creation, setCreation] = useState(false);
  const [edition, setEdition] = useState<
    | { objet: 'visite'; jour: string; visite?: Visite }
    | { objet: 'absence'; jour: string; absence?: Absence }
    | null
  >(null);
  /** Jour dont le délégué règle l'ordre à la main. */
  const [reordonner, setReordonner] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const aujourdhui = jourIso(new Date());

  const charger = useCallback(
    (cible?: string) =>
      client.plannings
        .semaine(cible)
        .then((s) => {
          setSemaine(s);
          setErreur(null);
        })
        .catch((e: unknown) => setErreur(messageErreur(e, t('erreurs.reseau')))),
    [client, t],
  );

  useEffect(() => {
    let actif = true;
    void Promise.resolve().then(() => {
      if (actif) void charger(jour);
    });
    return () => {
      actif = false;
    };
  }, [charger, jour]);

  const date = (iso: string, options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(i18n.language, options).format(new Date(`${iso}T12:00:00`));

  /** Action rapide sur la semaine (regrouper, dissocier, ordonner) puis relecture. */
  async function executer(action: () => Promise<unknown>, succes?: string) {
    if (!semaine) return;
    setMessage(null);
    try {
      await action();
      if (succes) setMessage(succes);
    } catch (e) {
      setErreur(messageErreur(e, t('erreurs.reseau')));
    }
    await charger(semaine.semaine);
  }

  async function preparer() {
    if (!semaine) return;
    setCreation(true);
    try {
      await client.plannings.creer(semaine.semaine);
      await charger(semaine.semaine);
    } catch (e) {
      setErreur(messageErreur(e, t('erreurs.reseau')));
    } finally {
      setCreation(false);
    }
  }

  const fin = semaine?.jours.at(-1)?.date;
  const periode =
    semaine && fin
      ? t('semaine.periode', {
          debut: date(semaine.semaine, { day: 'numeric', month: 'short' }),
          fin: date(fin, { day: 'numeric', month: 'short' }),
        })
      : undefined;
  const feries = semaine?.jours.filter((j) => j.ferie).length ?? 0;
  const visites = semaine?.visites ?? [];
  const aCompleter = visites.filter((v) => v.manquants.length > 0).length;
  const modifiable = !!semaine?.planning && semaine.modifiable;
  const planningId = semaine?.planning?.id ?? '';
  const objectifs = new Map((semaine?.controles?.objectifs ?? []).map((o) => [o.date, o]));
  const terminer = (texte: string) => {
    setEdition(null);
    setMessage(texte);
    if (semaine) void charger(semaine.semaine);
  };

  if (semaine && edition) {
    return (
      // Une clé propre : le formulaire s'ouvre en haut de page, pas au défilement de la semaine.
      <Ecran key="edition" titre={t('mobile.onglets.semaine')} surTitre={periode}>
        {edition.objet === 'visite' ? (
          <FormulaireVisite
            semaine={semaine}
            jour={edition.jour}
            visite={edition.visite}
            surAnnuler={() => setEdition(null)}
            surTermine={terminer}
          />
        ) : (
          <FormulaireAbsence
            semaine={semaine}
            jour={edition.jour}
            absence={edition.absence}
            surAnnuler={() => setEdition(null)}
            surTermine={terminer}
          />
        )}
      </Ecran>
    );
  }

  return (
    <Ecran key="semaine" titre={t('mobile.onglets.semaine')} surTitre={periode}>
      <View style={styles.navigation}>
        <Fleche
          sens="precedente"
          libelle={t('semaine.precedente')}
          onPress={() => {
            setMessage(null);
            if (semaine) setJour(semaine.precedente);
          }}
        />
        <Pressable
          accessibilityRole="button"
          disabled={!semaine || semaine.courante}
          onPress={() => setJour(undefined)}
          style={styles.centre}
        >
          <Text style={[styles.reperes, { color: semaine?.courante ? p.texteSecondaire : lien }]}>
            {semaine?.courante ? t('semaine.cetteSemaine') : t('semaine.revenir')}
          </Text>
        </Pressable>
        <Fleche
          sens="suivante"
          libelle={t('semaine.suivante')}
          onPress={() => {
            setMessage(null);
            if (semaine) setJour(semaine.suivante);
          }}
        />
      </View>

      {erreur && <Alerte type="erreur">{erreur}</Alerte>}
      {!semaine ? (
        !erreur && <Texte variante="discret">{t('session.chargement')}</Texte>
      ) : (
        <>
          {message && <Alerte type="succes">{message}</Alerte>}
          <Carte style={{ gap: 8 }}>
            <Texte variante="sousTitre">{t('semaine.planning')}</Texte>
            {semaine.planning ? (
              <>
                <Texte>{t(`semaine.statuts.${semaine.planning.statut}`)}</Texte>
                <Texte variante="discret">
                  {visites.length === 0
                    ? modifiable
                      ? t('visites.aucuneEncore')
                      : t('visites.aucune')
                    : aCompleter > 0
                      ? t('visites.bilanACompleter', { count: visites.length, aCompleter })
                      : t('visites.bilan', { count: visites.length })}
                </Texte>
              </>
            ) : semaine.peut_creer ? (
              <>
                <Texte variante="discret">{t('semaine.aPreparer')}</Texte>
                <Bouton
                  libelle={t('semaine.preparer')}
                  chargement={creation}
                  onPress={() => void preparer()}
                />
              </>
            ) : (
              <Texte variante="discret">
                {semaine.suivante <= aujourdhui ? t('semaine.passee') : t('semaine.sansPoste')}
              </Texte>
            )}
          </Carte>

          {semaine.controles && modifiable && (
            <CarteControles
              controles={semaine.controles}
              jourCourt={(iso) => date(iso, { weekday: 'short', day: 'numeric' })}
              surVisite={(id) => {
                const v = visites.find((x) => x.id === id);
                if (!v) return;
                setMessage(null);
                setEdition({ objet: 'visite', jour: v.date, visite: v });
              }}
            />
          )}
          <Carte style={{ paddingVertical: 4 }}>
            {semaine.jours.map((j, i) => {
              const estAujourdhui = j.date === aujourdhui;
              const duJour = visites.filter((v) => v.date === j.date);
              return (
                <View
                  key={j.date}
                  style={[
                    styles.bloc,
                    i < semaine.jours.length - 1 && {
                      borderBottomWidth: StyleSheet.hairlineWidth,
                      borderBottomColor: p.ligne,
                    },
                  ]}
                >
                  <View style={styles.jour}>
                    <Text
                      style={[styles.date, { color: j.planifiable ? p.texte : p.texteSecondaire }]}
                    >
                      <Text style={styles.nomJour}>
                        {majuscule(date(j.date, { weekday: 'long' }))}
                      </Text>{' '}
                      {date(j.date, { day: 'numeric', month: 'short' })}
                    </Text>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      {j.ferie ? (
                        <Texte variante="discret" numberOfLines={1}>
                          {t('semaine.ferie', { libelle: j.ferie })}
                        </Texte>
                      ) : null}
                    </View>
                    {objectifs.get(j.date) && <ObjectifDuJour objectif={objectifs.get(j.date)!} />}
                    {estAujourdhui && (
                      <Text style={[styles.aujourdhui, { color: marque.orange }]}>
                        {t('semaine.aujourdhui')}
                      </Text>
                    )}
                  </View>
                  <Journee
                    jour={j}
                    visites={duJour}
                    passages={semaine.passages.filter((x) => x.date === j.date)}
                    absences={semaine.absences.filter((a) => a.date === j.date)}
                    modifiable={modifiable}
                    reordonner={reordonner === j.date}
                    controles={semaine.controles}
                    libelleJour={date(j.date, { weekday: 'long', day: 'numeric', month: 'long' })}
                    surVisite={(v) => {
                      setMessage(null);
                      setEdition({ objet: 'visite', jour: j.date, visite: v });
                    }}
                    surAjouterVisite={() => {
                      setMessage(null);
                      setEdition({ objet: 'visite', jour: j.date });
                    }}
                    surAbsence={(a) => {
                      setMessage(null);
                      setEdition({ objet: 'absence', jour: j.date, absence: a });
                    }}
                    surDeclarerAbsence={() => {
                      setMessage(null);
                      setEdition({ objet: 'absence', jour: j.date });
                    }}
                    surRegrouper={(liste) =>
                      void executer(
                        () =>
                          client.plannings.regrouper(
                            planningId,
                            liste.map((v) => v.id),
                          ),
                        t('passages.regroupe'),
                      )
                    }
                    surDissocier={(passage) =>
                      void executer(
                        () => client.passages.dissocier(passage.id),
                        t('passages.dissocie'),
                      )
                    }
                    surReordonner={(actif) => {
                      setMessage(null);
                      setReordonner(actif ? j.date : null);
                    }}
                    surOrdonner={(ids) =>
                      void executer(() => client.plannings.ordonner(planningId, j.date, ids))
                    }
                  />
                </View>
              );
            })}
          </Carte>
          {feries > 0 && (
            <Texte variante="discret">{t('semaine.feriesExclus', { count: feries })}</Texte>
          )}
        </>
      )}
    </Ecran>
  );
}

function Fleche({
  sens,
  libelle,
  onPress,
}: {
  sens: 'precedente' | 'suivante';
  libelle: string;
  onPress: () => void;
}) {
  const p = usePalette();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={libelle}
      hitSlop={6}
      onPress={onPress}
      style={({ pressed }) => [
        styles.fleche,
        { borderColor: p.ligne, backgroundColor: pressed ? p.fond : p.surface },
      ]}
    >
      <MaterialIcons
        name={sens === 'precedente' ? 'chevron-left' : 'chevron-right'}
        size={24}
        color={p.texte}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  navigation: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 44 },
  reperes: { fontFamily: police.texteFort, fontSize: 14 },
  fleche: {
    width: 44,
    height: 44,
    borderWidth: 1,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bloc: { paddingVertical: 4 },
  jour: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44, paddingVertical: 4 },
  date: { fontFamily: police.texte, fontSize: 15, width: 132 },
  nomJour: { fontFamily: police.texteFort },
  aujourdhui: { fontFamily: police.texteFort, fontSize: 12 },
});
