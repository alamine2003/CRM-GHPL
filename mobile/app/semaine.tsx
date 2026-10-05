import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import type { Activite, Semaine, Visite } from '@innov/api-client';
import { marque } from '@innov/design';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, type ScrollView, StyleSheet, Text, View } from 'react-native';
import { Alerte, Bouton, Carte, Texte, useLien, usePalette } from '../src/composants';
import { Ecran } from '../src/Ecran';
import { police } from '../src/polices';
import { messageErreur, useSession } from '../src/session';
import { FormulaireActivite } from '../src/Activites';
import { BandeauBrouillon, BandeauHorsLigne, CarteAttente } from '../src/Attente';
import {
  abandonnerEnvoi,
  type Brouillon,
  type ChampsActivite,
  type ChampsVisite,
  type Envoi,
  envoyerAttente,
  estTransitoire,
  lireAttente,
  lireBrouillon,
  oublierBrouillon,
} from '../src/Brouillons';
import { kilometres } from '../src/Itineraire';
import { PoserDepuisCible } from '../src/Pose';
import { CarteControles, ObjectifDuJour, remarquesDeRevision } from '../src/Controles';
import { Journee } from '../src/Journee';
import { garderSemaine, jourIso, semaineGardee } from '../src/semaineLocale';
import { CarteSoumission, dateHeure, EtatSoumission } from '../src/Soumission';
import { FormulaireVisite, LienAction } from '../src/Visites';

const majuscule = (texte: string) => texte.charAt(0).toUpperCase() + texte.slice(1);

/**
 * Une saisie interrompue ne se reprend que sur un planning modifiable, et seulement si ce
 * qu'elle modifiait existe encore (retiré depuis le portail, par exemple).
 */
function empechementBrouillon(
  b: Brouillon,
  semaine: Semaine,
  t: ReturnType<typeof useTranslation>['t'],
) {
  if (b.semaine !== semaine.semaine) return undefined;
  if (!semaine.planning || !semaine.modifiable) return t('brouillon.nonModifiable');
  const disparu =
    b.objet === 'visite'
      ? !!b.visite && !semaine.visites.some((v) => v.id === b.visite)
      : !!b.activite && !semaine.activites.some((a) => a.id === b.activite);
  return disparu ? t('brouillon.disparu') : undefined;
}

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
  const routeur = useRouter();
  // Arrivée depuis la vue jour ou le détail : la semaine de ce jour, et la visite à modifier.
  const parametres = useLocalSearchParams<{ jour?: string; modifier?: string }>();
  const [jour, setJour] = useState<string | undefined>(parametres.jour);
  const aModifier = useRef<string | undefined>(parametres.modifier);
  const [semaine, setSemaine] = useState<Semaine | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [creation, setCreation] = useState(false);
  const [edition, setEdition] = useState<
    | { objet: 'visite'; jour: string; visite?: Visite; brouillon?: ChampsVisite }
    | { objet: 'activite'; jour: string; activite?: Activite; brouillon?: ChampsActivite }
    | { objet: 'cible'; jour: string }
    | null
  >(null);
  /** Jour dont le délégué règle l'ordre à la main. */
  const [reprise, setReprise] = useState(false);
  const [horsLigne, setHorsLigne] = useState<string | null>(null);
  const [brouillon, setBrouillon] = useState<Brouillon | null>(null);
  const [attente, setAttente] = useState<Envoi[]>([]);
  const [envoiAttente, setEnvoiAttente] = useState(false);
  const [reordonner, setReordonner] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  // Une saisie gardée faute de réseau se dit en information, pas en succès.
  const [tonMessage, setTonMessage] = useState<'succes' | 'info'>('succes');
  const defilement = useRef<ScrollView>(null);
  const aujourdhui = jourIso(new Date());

  const charger = useCallback(
    (cible?: string) =>
      // Ce qui attend sur le téléphone part d'abord : la semaine relue le contient déjà.
      envoyerAttente(client)
        .catch(() => 0)
        .then(async (partis) => {
          setAttente(await lireAttente());
          // Ce qui attendait est parti : le dire, à la place de « enregistrée sur le téléphone ».
          if (partis > 0) {
            setMessage(t('attente.envoyes', { count: partis }));
            setTonMessage('succes');
          }
        })
        .then(() => client.plannings.semaine(cible))
        .then((s) => {
          setSemaine(s);
          setErreur(null);
          setHorsLigne(null);
          // La semaine reste lisible sans réseau (PLN-007, base locale chiffrée).
          garderSemaine(s, cible);
          // Visite demandée depuis son détail : son formulaire s'ouvre, une seule fois.
          const visite = s.visites.find((v) => v.id === aModifier.current);
          aModifier.current = undefined;
          if (visite && s.modifiable) {
            setEdition({ objet: 'visite', jour: visite.date, visite });
          }
        })
        .catch(async (e: unknown) => {
          const memoire = estTransitoire(e) ? await semaineGardee(cible) : null;
          if (memoire) {
            setSemaine(memoire.valeur);
            setHorsLigne(memoire.maj);
            setErreur(null);
          } else {
            setErreur(messageErreur(e, t('erreurs.reseau')));
          }
        }),
    [client, t],
  );

  // Une saisie interrompue (application fermée, téléphone éteint) se retrouve ici (PLN-007).
  useEffect(() => {
    let actif = true;
    void lireBrouillon().then((b) => {
      if (actif) setBrouillon(b);
    });
    return () => {
      actif = false;
    };
  }, []);

  // L'onglet reste monté : un nouvel aller vers /semaine?jour=… change ses paramètres.
  useEffect(() => {
    let actif = true;
    void Promise.resolve().then(() => {
      if (!actif || !parametres.jour) return;
      aModifier.current = parametres.modifier;
      setJour(parametres.jour);
    });
    return () => {
      actif = false;
    };
  }, [parametres.jour, parametres.modifier]);

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

  /** Reprend la saisie interrompue : sur sa semaine, avec ses champs tels qu'ils étaient. */
  function reprendreBrouillon(b: Brouillon) {
    if (!semaine) return;
    if (b.semaine !== semaine.semaine) {
      setJour(b.semaine);
      return;
    }
    setMessage(null);
    setBrouillon(null);
    if (b.objet === 'visite') {
      const visite = b.visite ? semaine.visites.find((v) => v.id === b.visite) : undefined;
      setEdition({ objet: 'visite', jour: b.champs.date, visite, brouillon: b.champs });
    } else {
      const activite = b.activite ? semaine.activites.find((a) => a.id === b.activite) : undefined;
      setEdition({ objet: 'activite', jour: b.champs.date, activite, brouillon: b.champs });
    }
  }

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

  /** Reprend la semaine précédente sur cette semaine vide (PLN-005 CA2). */
  async function reprendre() {
    if (!semaine?.planning) return;
    setReprise(true);
    setMessage(null);
    try {
      const r = await client.plannings.reprendre(semaine.planning.id);
      const jours = [...new Set(r.ignorees.map((x) => x.date))]
        .map((d) => date(d, { weekday: 'short', day: 'numeric' }))
        .join(', ');
      setMessage(
        [
          t('pose.reprises', { count: r.copiees }),
          r.ignorees.length ? t('pose.ignorees', { count: r.ignorees.length, jours }) : '',
        ]
          .filter(Boolean)
          .join(' '),
      );
      await charger(semaine.semaine);
    } catch (e) {
      setErreur(messageErreur(e, t('erreurs.reseau')));
    } finally {
      setReprise(false);
    }
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
  // PLN-013 : pendant la révision, le commentaire et les remarques par visite.
  const remarques = remarquesDeRevision(semaine?.planning ?? null);
  const revision =
    semaine?.planning?.statut === 'a_reviser' && semaine.planning.decision?.decision === 'a_reviser'
      ? semaine.planning.decision
      : null;
  const planningId = semaine?.planning?.id ?? '';
  // Jour proposé pour poser depuis la liste cible : aujourd'hui s'il est dans la semaine.
  const premierJour =
    semaine?.jours.find((j) => j.planifiable && j.date >= aujourdhui)?.date ??
    semaine?.jours.find((j) => j.planifiable)?.date ??
    '';
  const objectifs = new Map((semaine?.controles?.objectifs ?? []).map((o) => [o.date, o]));
  const terminer = (texte: string) => {
    setTonMessage(texte === t('attente.gardee') ? 'info' : 'succes');
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
            brouillon={edition.brouillon}
            surAnnuler={() => setEdition(null)}
            surTermine={terminer}
          />
        ) : edition.objet === 'cible' ? (
          <PoserDepuisCible
            semaine={semaine}
            jour={edition.jour}
            surAnnuler={() => setEdition(null)}
            surTermine={terminer}
          />
        ) : (
          <FormulaireActivite
            semaine={semaine}
            jour={edition.jour}
            activite={edition.activite}
            brouillon={edition.brouillon}
            surAnnuler={() => setEdition(null)}
            surTermine={terminer}
          />
        )}
      </Ecran>
    );
  }

  return (
    <Ecran
      key="semaine"
      titre={t('mobile.onglets.semaine')}
      surTitre={periode}
      defilement={defilement}
    >
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
      {horsLigne && <BandeauHorsLigne maj={horsLigne} />}
      {brouillon && semaine && (
        <BandeauBrouillon
          brouillon={brouillon}
          empechement={empechementBrouillon(brouillon, semaine, t)}
          surReprendre={() => reprendreBrouillon(brouillon)}
          surAbandonner={() => {
            void oublierBrouillon();
            setBrouillon(null);
          }}
        />
      )}
      {attente.length > 0 && (
        <CarteAttente
          envois={attente}
          envoi={envoiAttente}
          surEnvoyer={() => {
            setEnvoiAttente(true);
            void charger(semaine?.semaine).finally(() => setEnvoiAttente(false));
          }}
          surAbandonner={(id) =>
            void abandonnerEnvoi(id).then(async () => setAttente(await lireAttente()))
          }
        />
      )}
      {!semaine ? (
        !erreur && <Texte variante="discret">{t('session.chargement')}</Texte>
      ) : (
        <>
          {message && <Alerte type={tonMessage}>{message}</Alerte>}
          {revision && (
            <Alerte type="attention">
              {[
                t('approbation.decisionsCourt.a_reviser', {
                  par: revision.par,
                  date: dateHeure(revision.decide_le, i18n.language, semaine.fuseau),
                }),
                revision.commentaire,
                t('revision.aCorrigerAide'),
              ]
                .filter(Boolean)
                .join('\n')}
            </Alerte>
          )}
          <Carte style={{ gap: 8 }}>
            <Texte variante="sousTitre">{t('semaine.planning')}</Texte>
            {semaine.planning ? (
              <>
                <Texte>{t(`semaine.statuts.${semaine.planning.statut}`)}</Texte>
                <EtatSoumission
                  planning={semaine.planning}
                  modifiable={modifiable}
                  fuseau={semaine.fuseau}
                />
                {(semaine.planning.numero_version ?? 0) > 1 && (
                  <LienAction
                    icone="history"
                    libelle={t('versions.voirHistorique', {
                      count: semaine.planning.numero_version ?? 0,
                    })}
                    onPress={() =>
                      routeur.push({
                        pathname: '/versions/[id]',
                        params: { id: semaine.planning!.id, fuseau: semaine.fuseau },
                      })
                    }
                  />
                )}
                <Texte variante="discret">
                  {visites.length === 0
                    ? modifiable
                      ? t('visites.aucuneEncore')
                      : t('visites.aucune')
                    : aCompleter > 0
                      ? t('visites.bilanACompleter', { count: visites.length, aCompleter })
                      : t('visites.bilan', { count: visites.length })}
                </Texte>
                {semaine.kilometrage && semaine.kilometrage.total_km > 0 && (
                  <Texte variante="discret">
                    {t('km.semaine', {
                      km: kilometres(semaine.kilometrage.total_km, i18n.language),
                    })}
                    {semaine.kilometrage.sans_coordonnees > 0
                      ? ` ${t('km.partiel', { count: semaine.kilometrage.sans_coordonnees })}`
                      : ''}
                  </Texte>
                )}
                {modifiable && semaine.reprenables > 0 && (
                  <Texte variante="discret">
                    {t('pose.reprenables', { count: semaine.reprenables })}
                  </Texte>
                )}
                {modifiable && semaine.reprenables > 0 && (
                  <Bouton
                    secondaire
                    libelle={t('pose.reprendre', { count: semaine.reprenables })}
                    chargement={reprise}
                    onPress={() => void reprendre()}
                  />
                )}
                {modifiable && (
                  <Bouton
                    secondaire
                    libelle={t('pose.depuisListe')}
                    onPress={() => {
                      setMessage(null);
                      setEdition({ objet: 'cible', jour: premierJour });
                    }}
                  />
                )}
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
                  <Pressable
                    accessibilityRole={semaine.planning ? 'button' : undefined}
                    accessibilityHint={semaine.planning ? t('jour.ouvrir') : undefined}
                    disabled={!semaine.planning}
                    onPress={() => routeur.push(`/jour/${j.date}`)}
                    style={({ pressed }) => [styles.jour, pressed && { opacity: 0.7 }]}
                  >
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
                    {objectifs.get(j.date) ? (
                      <ObjectifDuJour objectif={objectifs.get(j.date)!} />
                    ) : semaine.planning && j.planifiable ? (
                      // Sans seuil connu, le nombre de visites du jour seul (PLN-006 CA1).
                      <Text style={[styles.aujourdhui, { color: p.texteSecondaire }]}>
                        {t('jour.nombre', {
                          count: visites.filter((v) => v.date === j.date).length,
                        })}
                      </Text>
                    ) : null}
                    {estAujourdhui && (
                      <Text style={[styles.aujourdhui, { color: marque.orange }]}>
                        {t('semaine.aujourdhui')}
                      </Text>
                    )}
                    {semaine.planning && (
                      <MaterialIcons name="chevron-right" size={20} color={p.texteDiscret} />
                    )}
                  </Pressable>
                  <Journee
                    jour={j}
                    visites={duJour}
                    passages={semaine.passages.filter((x) => x.date === j.date)}
                    activites={semaine.activites.filter((a) => a.date === j.date)}
                    modifiable={modifiable}
                    reordonner={reordonner === j.date}
                    controles={semaine.controles}
                    remarques={remarques}
                    libelleJour={date(j.date, { weekday: 'long', day: 'numeric', month: 'long' })}
                    surVisite={(v) => {
                      setMessage(null);
                      // Un planning soumis se consulte : la visite s'ouvre en détail (PLN-006).
                      if (modifiable) setEdition({ objet: 'visite', jour: j.date, visite: v });
                      else
                        routeur.push({
                          pathname: '/visite/[id]',
                          params: { id: v.id, jour: j.date },
                        });
                    }}
                    surAjouterVisite={() => {
                      setMessage(null);
                      setEdition({ objet: 'visite', jour: j.date });
                    }}
                    surActivite={(a) => {
                      setMessage(null);
                      setEdition({ objet: 'activite', jour: j.date, activite: a });
                    }}
                    surDeclarerActivite={() => {
                      setMessage(null);
                      setEdition({ objet: 'activite', jour: j.date });
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
          {modifiable && (
            <CarteSoumission
              semaine={semaine}
              surSoumis={(texte) => {
                setTonMessage('succes');
                setMessage(texte);
                // Le message et « Soumis le … » sont en haut : la page y remonte.
                defilement.current?.scrollTo({ y: 0, animated: true });
                void charger(semaine.semaine);
              }}
              surCorriger={(id) => {
                const v = visites.find((x) => x.id === id);
                if (!v) return;
                setMessage(null);
                setEdition({ objet: 'visite', jour: v.date, visite: v });
              }}
            />
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
