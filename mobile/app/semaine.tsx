import type { Activite, Semaine, Visite } from '@innov/api-client';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, type ScrollView, StyleSheet, View } from 'react-native';
import { Alerte, Bouton, Carte, Texte } from '../src/composants';
import { useTablette } from '../src/disposition';
import { Ecran } from '../src/Ecran';
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
  garderMaVersion,
  lireAttente,
  lireBrouillon,
  oublierBrouillon,
} from '../src/Brouillons';
import { kilometres } from '../src/Itineraire';
import { PoserDepuisCible } from '../src/Pose';
import { CarteControles, remarquesDeRevision } from '../src/Controles';
import { absentToutLeJour, Journee } from '../src/Journee';
import { garderSemaine, jourIso, semaineGardee } from '../src/semaineLocale';
import {
  ChoixJours,
  GrilleSemaine,
  JoursFermes,
  jourLong,
  NavigationSemaine,
  periodeDe,
  SemaineFermee,
  StatutPlanning,
} from '../src/Semaine';
import { CarteSoumission, dateHeure, EtatSoumission } from '../src/Soumission';
import { FormulaireVisite, LienAction } from '../src/Visites';

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
  const tablette = useTablette();
  const { client, etat } = useSession();
  const routeur = useRouter();
  // Arrivée depuis la vue jour ou le détail : la semaine de ce jour, et la visite à modifier.
  const parametres = useLocalSearchParams<{ jour?: string; modifier?: string }>();
  const [jour, setJour] = useState<string | undefined>(parametres.jour);
  /** Le jour dont les visites se lisent (téléphone) ou se préparent (tablette). */
  const [choisi, setChoisi] = useState<string | null>(parametres.jour ?? null);
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
          if (visite && (s.modifiable || s.approbation?.modifiable)) {
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
      setChoisi(parametres.jour);
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

  const pays = etat.statut === 'connecte' ? etat.perimetre.pays_actif?.nom : undefined;
  const periode = semaine ? periodeDe(semaine, t, i18n.language) : undefined;
  const feries = semaine?.jours.filter((j) => j.ferie).length ?? 0;
  const visites = semaine?.visites ?? [];
  const aCompleter = visites.filter((v) => v.manquants.length > 0).length;
  const modifiable = !!semaine?.planning && semaine.modifiable;
  // PLN-015 : approuvé, le planning se modifie encore — l'heure librement, le reste soumis.
  const suivi = semaine?.approbation ?? null;
  const apresApprobation = !!suivi?.modifiable;
  const enAttente = new Set(suivi?.en_attente ?? []);
  const enDecision = !!suivi && !suivi.modifiable && semaine?.planning?.statut === 'soumis';
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

  // Le jour lu : celui demandé, sinon aujourd'hui s'il est dans la semaine, sinon le premier
  // jour qui a des visites, sinon le premier jour planifiable.
  const jourChoisi =
    (semaine &&
      ((choisi && semaine.jours.some((j) => j.date === choisi) ? choisi : null) ??
        semaine.jours.find((j) => j.date === aujourdhui)?.date ??
        semaine.jours.find((j) => semaine.visites.some((v) => v.date === j.date))?.date ??
        semaine.jours.find((j) => j.planifiable)?.date ??
        semaine.jours[0]?.date)) ||
    null;
  const jourSemaine = semaine?.jours.find((j) => j.date === jourChoisi) ?? null;
  /** Le jour choisi reçoit encore des visites : en préparation, ou approuvé et à venir. */
  const ajoutPossible =
    !!jourSemaine &&
    jourSemaine.planifiable &&
    (modifiable || (apresApprobation && jourSemaine.date >= aujourdhui)) &&
    !absentToutLeJour(semaine!.activites.filter((a) => a.date === jourSemaine.date));
  const changerSemaine = (lundi: string | undefined) => {
    setMessage(null);
    setChoisi(null);
    setJour(lundi);
  };
  /** Un planning soumis se consulte : la visite s'ouvre en détail (PLN-006). Approuvé, une
   * visite à venir se modifie encore (PLN-015). */
  const ouvrirVisite = (v: Visite) => {
    setMessage(null);
    if (modifiable || (apresApprobation && v.date >= aujourdhui))
      setEdition({ objet: 'visite', jour: v.date, visite: v });
    else routeur.push({ pathname: '/visite/[id]', params: { id: v.id, jour: v.date } });
  };
  const objectifSemaine = [...objectifs.values()].reduce(
    (o, x) => ({ min: o.min + x.min, max: o.max + x.max }),
    { min: 0, max: 0 },
  );
  // Rien à faire sur ce planning : la semaine se lit, sans la carte du planning (maquette).
  const consultation =
    ['approuve', 'en_cours', 'termine'].includes(semaine?.planning?.statut ?? '') &&
    !modifiable &&
    !enDecision &&
    !semaine?.fermee;

  // « Depuis ma liste cible » est un écran entier (maquette 1.4.6) ; son retour revient ici.
  if (semaine && edition?.objet === 'cible') {
    return (
      <PoserDepuisCible
        key="pose"
        semaine={semaine}
        jour={edition.jour}
        surAnnuler={() => setEdition(null)}
        surTermine={terminer}
      />
    );
  }

  // « Nouvelle visite » est un écran entier (maquette 1.5.6) ; son retour revient ici.
  if (semaine && edition?.objet === 'visite') {
    return (
      <FormulaireVisite
        key="visite"
        semaine={semaine}
        jour={edition.jour}
        visite={edition.visite}
        brouillon={edition.brouillon}
        surAnnuler={() => setEdition(null)}
        surTermine={terminer}
      />
    );
  }

  if (semaine && edition) {
    return (
      // Une clé propre : le formulaire s'ouvre en haut de page, pas au défilement de la semaine.
      <Ecran key="edition" titre={t('mobile.onglets.semaine')} surTitre={periode}>
        {edition.objet === 'activite' ? (
          <FormulaireActivite
            semaine={semaine}
            jour={edition.jour}
            activite={edition.activite}
            brouillon={edition.brouillon}
            surAnnuler={() => setEdition(null)}
            surTermine={terminer}
          />
        ) : null}
      </Ecran>
    );
  }

  const jourSection = semaine && jourSemaine && (
    <SectionJour
      semaine={semaine}
      jour={jourSemaine.date}
      titre={jourLong(jourSemaine.date, i18n.language)}
      detail={
        jourSemaine.ferie
          ? t('semaine.ferie', { libelle: jourSemaine.ferie })
          : [
              t('jour.visites', {
                count: visites.filter((v) => v.date === jourSemaine.date).length,
              }),
              objectifs.get(jourSemaine.date)
                ? t('jour.objectif', {
                    min: objectifs.get(jourSemaine.date)!.min,
                    max: objectifs.get(jourSemaine.date)!.max,
                  })
                : null,
            ]
              .filter(Boolean)
              .join(' · ')
      }
      surOuvrir={semaine.planning ? () => routeur.push(`/jour/${jourSemaine.date}`) : undefined}
    >
      {visites.some((v) => v.date === jourSemaine.date) ||
      semaine.activites.some((a) => a.date === jourSemaine.date) ||
      ajoutPossible ? (
        <Journee
          jour={jourSemaine}
          visites={visites.filter((v) => v.date === jourSemaine.date)}
          passages={semaine.passages.filter((x) => x.date === jourSemaine.date)}
          activites={semaine.activites.filter((a) => a.date === jourSemaine.date)}
          modifiable={modifiable}
          reordonner={reordonner === jourSemaine.date}
          controles={semaine.controles}
          remarques={remarques}
          apresApprobation={apresApprobation && jourSemaine.date >= aujourdhui}
          enAttente={enAttente}
          libelleJour={date(jourSemaine.date, { weekday: 'long', day: 'numeric', month: 'long' })}
          ajoutAilleurs={!tablette}
          surVisite={ouvrirVisite}
          surAjouterVisite={() => {
            setMessage(null);
            setEdition({ objet: 'visite', jour: jourSemaine.date });
          }}
          surActivite={(a) => {
            setMessage(null);
            setEdition({ objet: 'activite', jour: jourSemaine.date, activite: a });
          }}
          surDeclarerActivite={() => {
            setMessage(null);
            setEdition({ objet: 'activite', jour: jourSemaine.date });
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
            void executer(() => client.passages.dissocier(passage.id), t('passages.dissocie'))
          }
          surReordonner={(actif) => {
            setMessage(null);
            setReordonner(actif ? jourSemaine.date : null);
          }}
          surOrdonner={(ids) =>
            void executer(() => client.plannings.ordonner(planningId, jourSemaine.date, ids))
          }
        />
      ) : (
        <Texte variante="discret" style={{ padding: 16 }}>
          {t('jour.vide')}
        </Texte>
      )}
    </SectionJour>
  );

  const planningCarte = semaine && !consultation && !(semaine.fermee && !semaine.planning) && (
    <Carte style={{ gap: 8 }}>
      <Texte variante="sousTitre">{t('semaine.planning')}</Texte>
      {semaine.planning ? (
        <>
          <EtatSoumission
            planning={semaine.planning}
            modifiable={modifiable}
            fuseau={semaine.fuseau}
          />
          <SemaineFermee semaine={semaine} surDemande={terminer} />
          {enDecision && <Alerte type="info">{t('apresApprobation.attente')}</Alerte>}
          {enDecision && suivi && suivi.retraits.length > 0 && (
            <Texte variante="discret">
              {t('apresApprobation.retraits', {
                count: suivi.retraits.length,
                liste: suivi.retraits
                  .map(
                    (v) =>
                      `${date(v.date, { weekday: 'short', day: 'numeric' })}${
                        v.heure ? ` ${v.heure}` : ''
                      } · ${v.prospect?.nom ?? t('visites.sansProspect')}`,
                  )
                  .join(', '),
              })}
            </Texte>
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
                setEdition({
                  objet: 'cible',
                  jour: ajoutPossible && jourChoisi ? jourChoisi : premierJour,
                });
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
  );

  /** Sous la semaine : la règle après approbation, les kilomètres, l'historique des versions. */
  const complements = semaine && (
    <>
      {feries > 0 && (
        <Texte variante="libelle">{t('semaine.feriesExclus', { count: feries })}</Texte>
      )}
      {semaine.planning && apresApprobation && (
        <Texte variante="libelle">{t('apresApprobation.regleCourte')}</Texte>
      )}
      {suivi && !suivi.modifiable && semaine.planning?.statut === 'approuve' && (
        <Texte variante="libelle">{t('fermeture.semaineCommencee')}</Texte>
      )}
      {semaine.planning && semaine.kilometrage && semaine.kilometrage.total_km > 0 && (
        <Texte variante="libelle">
          {t('km.semaine', {
            km: kilometres(semaine.kilometrage.total_km, i18n.language),
          })}
          {semaine.kilometrage.sans_coordonnees > 0
            ? ` ${t('km.partiel', { count: semaine.kilometrage.sans_coordonnees })}`
            : ''}
        </Texte>
      )}
      {(semaine.planning?.numero_version ?? 0) > 1 && (
        <LienAction
          icone="history"
          libelle={t('versions.voirHistorique', {
            count: semaine.planning!.numero_version ?? 0,
          })}
          onPress={() =>
            routeur.push({
              pathname: '/versions/[id]',
              params: {
                id: semaine.planning!.id,
                fuseau: semaine.fuseau,
                semaine: semaine.semaine,
                nombre: String(semaine.planning!.numero_version ?? 2),
              },
            })
          }
        />
      )}
    </>
  );

  const fermee = !!semaine?.fermee && !semaine.planning;

  return (
    <Ecran
      key="semaine"
      titre={t('mobile.semaine.titre')}
      surTitre={[periode, pays].filter(Boolean).join(' · ')}
      action={semaine ? <StatutPlanning semaine={semaine} /> : undefined}
      enteteTablette={{
        titre: semaine ? periodeDe(semaine, t, i18n.language, true) : t('mobile.semaine.titre'),
        surTitre: semaine
          ? [
              pays,
              fermee
                ? t('mobile.semaine.aucunPlanningValide')
                : t('mobile.semaine.visitesPlanifiees', { count: visites.length }),
              !fermee && objectifSemaine.max > 0
                ? t('jour.objectif', { min: objectifSemaine.min, max: objectifSemaine.max })
                : null,
            ]
              .filter(Boolean)
              .join(' · ')
          : undefined,
        action: (
          <>
            {semaine && <StatutPlanning semaine={semaine} long />}
            <NavigationSemaine
              semaine={semaine}
              surSemaine={changerSemaine}
              style={{ width: 330 }}
            />
          </>
        ),
      }}
      defilement={defilement}
      pied={
        !tablette && ajoutPossible && !reordonner ? (
          <Bouton
            variante="contour"
            libelle={t('visites.ajouter')}
            accessibilityLabel={t('visites.ajouterLe', {
              jour: date(jourChoisi!, { weekday: 'long', day: 'numeric', month: 'long' }),
            })}
            onPress={() => {
              setMessage(null);
              setEdition({ objet: 'visite', jour: jourChoisi! });
            }}
            style={{ flex: 1 }}
          />
        ) : undefined
      }
    >
      {!tablette && <NavigationSemaine semaine={semaine} surSemaine={changerSemaine} />}
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
          surGarderMienne={(id) => {
            setEnvoiAttente(true);
            void garderMaVersion(id)
              .then(() => charger(semaine?.semaine))
              .finally(() => setEnvoiAttente(false));
          }}
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
          {fermee ? (
            <>
              <SemaineFermee semaine={semaine} surDemande={terminer} tablette={tablette} />
              {tablette ? (
                <GrilleSemaine
                  semaine={semaine}
                  choisi={null}
                  surJour={() => undefined}
                  surVisite={() => undefined}
                  attenue
                />
              ) : (
                <JoursFermes semaine={semaine} />
              )}
              {tablette ? (
                <Alerte type="info">{t('mobile.semaine.fermeeNoteTablette')}</Alerte>
              ) : (
                <Texte variante="libelle">{t('mobile.semaine.fermeeNote')}</Texte>
              )}
            </>
          ) : (
            <>
              {planningCarte}
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
              {tablette ? (
                <GrilleSemaine
                  semaine={semaine}
                  choisi={jourChoisi}
                  surJour={(d) =>
                    // En préparation, la colonne choisit le jour à préparer ; sinon elle ouvre
                    // la journée.
                    modifiable || apresApprobation
                      ? setChoisi(d)
                      : semaine.planning && routeur.push(`/jour/${d}`)
                  }
                  surVisite={ouvrirVisite}
                />
              ) : (
                <ChoixJours semaine={semaine} choisi={jourChoisi} surChoix={setChoisi} />
              )}
              {(!tablette || modifiable || apresApprobation) && jourSection}
              {complements}
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
        </>
      )}
    </Ecran>
  );
}

/** Le jour choisi : son titre (qui ouvre la journée), son bilan, puis ses lignes en carte. */
function SectionJour({
  semaine,
  jour,
  titre,
  detail,
  surOuvrir,
  children,
}: {
  semaine: Semaine;
  jour: string;
  titre: string;
  detail: string;
  surOuvrir?: () => void;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <View accessibilityLabel={titre} style={{ gap: 10 }} key={`${semaine.semaine}-${jour}`}>
      <Pressable
        accessibilityRole={surOuvrir ? 'button' : undefined}
        accessibilityHint={surOuvrir ? t('jour.ouvrir') : undefined}
        disabled={!surOuvrir}
        onPress={surOuvrir}
        style={({ pressed }) => [styles.enteteJour, pressed && { opacity: 0.7 }]}
      >
        <Texte variante="sousTitre" accessibilityRole="header" style={{ flexShrink: 1 }}>
          {titre}
        </Texte>
        <Texte variante="libelle">{detail}</Texte>
      </Pressable>
      <Carte marge={0} style={{ overflow: 'hidden' }}>
        {children}
      </Carte>
    </View>
  );
}

const styles = StyleSheet.create({
  enteteJour: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: 12,
    minHeight: 32,
  },
});
