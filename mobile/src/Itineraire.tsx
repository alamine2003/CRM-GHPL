/**
 * Vues jour et détail du planning (PLN-006) et kilométrage estimé (PLN-010).
 *
 * - Jour : l'itinéraire dans l'ordre de la journée, numéroté, avec la distance d'un arrêt à
 *   l'autre (à vol d'oiseau [H]) ; un passage compte pour un arrêt.
 * - Détail : une visite, avec ses fiches (prospect, lieu) et ce qui reste à faire (src/Visite.tsx).
 * Aucune des deux ne montre de montant (PLN-010 CA2).
 */
import type { Activite, Semaine, Visite } from '@innov/api-client';
import { useRouter } from 'expo-router';
import { type ReactNode, useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { LigneActivite } from './Activites';
import {
  Alerte,
  Bouton,
  Carte,
  Chiffres,
  Gras,
  Ligne,
  MarquePotentiel,
  Texte,
  usePalette,
} from './composants';
import { useTablette } from './disposition';
import { Ecran } from './Ecran';
import { nomProspect } from './Fiches';
import { unitesDuJour } from './Journee';
import { police } from './polices';
import { BandeauHorsLigne } from './Attente';
import { estTransitoire } from './Brouillons';
import { garderSemaine, jourIso, semaineGardee } from './semaineLocale';
import { messageErreur, useSession } from './session';

/** « 12,4 km » dans la langue de l'interface. */
export function kilometres(km: number, langue: string) {
  return new Intl.NumberFormat(langue, { maximumFractionDigits: 1 }).format(km);
}

/**
 * Semaine qui contient ce jour, relue à l'ouverture de l'écran. Sans réseau, la dernière
 * semaine gardée sur le téléphone la remplace (PLN-007), avec l'heure de sa mise à jour.
 */
export function useSemaineDu(jour: string) {
  const { t } = useTranslation();
  const { client } = useSession();
  const [semaine, setSemaine] = useState<Semaine | null>(null);
  const [horsLigne, setHorsLigne] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const charger = useCallback(
    () =>
      client.plannings
        .semaine(jour)
        .then((s) => {
          setSemaine(s);
          setHorsLigne(null);
          setErreur(null);
          garderSemaine(s, jour);
        })
        .catch(async (e: unknown) => {
          const memoire = estTransitoire(e) ? await semaineGardee(jour) : null;
          if (memoire) {
            setSemaine(memoire.valeur);
            setHorsLigne(memoire.maj);
            setErreur(null);
          } else {
            setErreur(messageErreur(e, t('erreurs.reseau')));
          }
        }),
    [client, jour, t],
  );
  useEffect(() => {
    let actif = true;
    void Promise.resolve().then(() => actif && void charger());
    return () => {
      actif = false;
    };
  }, [charger]);
  return { semaine, erreur, horsLigne };
}

const dateLongue = (iso: string, langue: string) =>
  new Intl.DateTimeFormat(langue, { weekday: 'long', day: 'numeric', month: 'long' }).format(
    new Date(`${iso}T12:00:00`),
  );

/** Titre du jour, pour l'en-tête de l'écran. */
export function useTitreDuJour(jour: string) {
  const { i18n } = useTranslation();
  const texte = dateLongue(jour, i18n.language);
  return texte.charAt(0).toUpperCase() + texte.slice(1);
}

/**
 * Journée (`/jour/[date]`, PLN-006), selon la maquette 1.4.3 : en tête ses chiffres (visites,
 * objectif, kilomètres à vol d'oiseau), puis l'itinéraire arrêt par arrêt, la distance d'un arrêt
 * à l'autre en pointillés ; sur la tablette, ses activités et les lieux sans coordonnées à
 * droite. « Modifier dans la semaine » tant que le planning se modifie.
 */
export function VueJour({ jour }: { jour: string }) {
  const { t, i18n } = useTranslation();
  const routeur = useRouter();
  const tablette = useTablette();
  const titre = useTitreDuJour(jour);
  const { semaine, erreur, horsLigne } = useSemaineDu(jour);

  const modifiable =
    !!semaine?.planning &&
    (semaine.modifiable || (!!semaine.approbation?.modifiable && jour >= jourIso(new Date())));
  const modifier = modifiable ? (
    <Bouton
      variante="contour"
      petit={tablette}
      libelle={t('jour.modifier')}
      onPress={() => routeur.navigate({ pathname: '/semaine', params: { jour } })}
      style={tablette ? undefined : { flex: 1 }}
    />
  ) : undefined;

  let contenu: ReactNode;
  if (erreur) contenu = <Alerte type="erreur">{erreur}</Alerte>;
  else if (!semaine) contenu = <Texte variante="discret">{t('session.chargement')}</Texte>;
  else {
    const visites = semaine.visites.filter((v) => v.date === jour);
    const activites = semaine.activites.filter((a) => a.date === jour);
    const km = semaine.kilometrage?.jours.find((j) => j.date === jour);
    const objectif = semaine.controles?.objectifs.find((o) => o.date === jour);
    const ferie = semaine.jours.find((j) => j.date === jour)?.ferie;
    const chiffres = [
      { libelle: t('mobile.journee.visites'), valeur: String(visites.length) },
      {
        libelle: t('mobile.journee.objectif'),
        valeur: objectif
          ? t('mobile.journee.objectifValeur', { min: objectif.min, max: objectif.max })
          : '—',
      },
      {
        libelle: t(tablette ? 'mobile.journee.volOiseauLong' : 'mobile.journee.volOiseau'),
        valeur:
          km && km.km > 0
            ? // Une estimation à vol d'oiseau : au kilomètre près dans la case (maquette).
              t('mobile.journee.kmEnviron', {
                km: kilometres(km.km >= 10 ? Math.round(km.km) : km.km, i18n.language),
              })
            : '—',
      },
      ...(tablette
        ? [
            {
              libelle: t('mobile.journee.sansCoordonnees'),
              valeur: String(km?.sans_coordonnees ?? 0),
              couleur: km?.sans_coordonnees ? '#F26B1D' : undefined,
            },
          ]
        : []),
    ];
    const itineraire = <Itineraire semaine={semaine} jour={jour} />;
    const sansCoordonnees = !!km && km.sans_coordonnees > 0 && (
      <Alerte type="attention">
        <Gras>{t('mobile.journee.sansCoordonneesAlerte', { count: km.sans_coordonnees })}</Gras>
        {` ${t('mobile.journee.sansCoordonneesSuite', { count: km.sans_coordonnees })}`}
      </Alerte>
    );
    contenu = (
      <>
        {horsLigne && <BandeauHorsLigne maj={horsLigne} />}
        {ferie ? <Alerte type="info">{t('semaine.ferie', { libelle: ferie })}</Alerte> : null}
        <Chiffres valeurs={chiffres} />
        {tablette ? (
          <View style={{ flexDirection: 'row', gap: 16, alignItems: 'flex-start' }}>
            <View style={{ flex: 3, minWidth: 0 }}>{itineraire}</View>
            <View style={{ flex: 2, minWidth: 0, gap: 16 }}>
              <ActivitesDuJour activites={activites} />
              {sansCoordonnees}
            </View>
          </View>
        ) : (
          <>
            {activites.length > 0 && (
              <Carte marge={0} style={{ paddingHorizontal: 16 }}>
                {activites.map((a) => (
                  <LigneActivite key={a.id} activite={a} />
                ))}
              </Carte>
            )}
            {itineraire}
            {sansCoordonnees}
          </>
        )}
      </>
    );
  }

  return (
    <Ecran
      titre={t('jour.titre')}
      surTitre={titre}
      retour
      onglets={false}
      enteteTablette={{ action: modifier }}
      pied={!tablette ? modifier : undefined}
    >
      {contenu}
    </Ecran>
  );
}

/** L'itinéraire (.stop) : un numéro marine par arrêt, la distance en pointillés entre deux. */
function Itineraire({ semaine, jour }: { semaine: Semaine; jour: string }) {
  const { t, i18n } = useTranslation();
  const p = usePalette();
  const routeur = useRouter();
  const visites = semaine.visites.filter((v) => v.date === jour);
  const unites = unitesDuJour(
    visites,
    semaine.passages.filter((x) => x.date === jour),
  );
  const km = semaine.kilometrage?.jours.find((j) => j.date === jour);
  const etape = (id: string) => km?.etapes.find((e) => e.visite === id)?.km ?? null;
  const ouvrir = (v: Visite) =>
    routeur.push({ pathname: '/visite/[id]', params: { id: v.id, jour } });
  return (
    <Carte style={{ gap: 0 }}>
      <Texte variante="sousTitre" accessibilityRole="header" style={{ marginBottom: 10 }}>
        {t('mobile.journee.itineraire')}
      </Texte>
      {unites.length === 0 ? (
        <Texte variante="discret">{t('jour.vide')}</Texte>
      ) : (
        unites.map((u, i) => {
          const premiere = u.visites[0]!;
          const distance = etape(premiere.id);
          const heure = (u.passage ? u.passage.heure : premiere.heure) ?? t('visites.sansHeure');
          return (
            <View key={u.passage?.id ?? premiere.id}>
              {i > 0 && (
                <Text
                  style={[styles.trajet, { color: p.texteSecondaire, borderLeftColor: p.ligne }]}
                >
                  {distance === null
                    ? t('km.inconnu')
                    : t('km.depuisPrecedent', { km: kilometres(distance, i18n.language) })}
                </Text>
              )}
              <View style={styles.arret}>
                <Numero n={i + 1} />
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  {u.passage ? (
                    <>
                      <Text style={[styles.nom, { color: p.texte }]}>
                        {`${heure} · `}
                        <Text>
                          {t('passages.ligne', {
                            lieu: u.passage.etablissement.nom,
                            count: u.visites.length,
                          })}
                        </Text>
                      </Text>
                      {u.visites.map((v) => (
                        <Pressable
                          key={v.id}
                          accessibilityRole="button"
                          onPress={() => ouvrir(v)}
                          style={({ pressed }) => [styles.membre, pressed && { opacity: 0.7 }]}
                        >
                          {v.prospect && (
                            <MarquePotentiel valeur={v.prospect.potentiel} taille={20} />
                          )}
                          <Texte variante="libelle" style={{ flex: 1 }}>
                            {v.prospect ? nomProspect(v.prospect, t) : t('visites.sansProspect')}
                          </Texte>
                        </Pressable>
                      ))}
                    </>
                  ) : (
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => ouvrir(premiere)}
                      style={({ pressed }) => [{ gap: 2 }, pressed && { opacity: 0.7 }]}
                    >
                      <Text style={[styles.nom, { color: p.texte }]}>
                        {`${heure} · `}
                        <Text>
                          {premiere.prospect
                            ? nomProspect(premiere.prospect, t)
                            : t('visites.sansProspect')}
                        </Text>
                      </Text>
                      {premiere.etablissement && (
                        <Texte variante="libelle" numberOfLines={1}>
                          {premiere.etablissement.nom}
                        </Texte>
                      )}
                      {premiere.manquants.length > 0 && (
                        <Text style={[styles.manque, { color: p.attention }]}>
                          {t('visites.aCompleter', {
                            champs: premiere.manquants
                              .map((c) => t(`visites.champs.${c}`))
                              .join(', '),
                          })}
                        </Text>
                      )}
                    </Pressable>
                  )}
                </View>
                {!u.passage && premiere.prospect && (
                  <MarquePotentiel valeur={premiere.prospect.potentiel} />
                )}
              </View>
            </View>
          );
        })
      )}
    </Carte>
  );
}

/** Tablette : les activités du jour, matin et après-midi. */
function ActivitesDuJour({ activites }: { activites: Activite[] }) {
  const { t } = useTranslation();
  const de = (periode: 'matin' | 'apres_midi') =>
    activites
      .filter((a) => (a.periode ?? 'journee') === periode || (a.periode ?? 'journee') === 'journee')
      .map((a) => t(`activites.types.${a.type}`))
      .join(', ') || '—';
  return (
    <Carte marge={0}>
      <Texte
        variante="sousTitre"
        accessibilityRole="header"
        style={{ paddingTop: 14, paddingHorizontal: 16, paddingBottom: 4 }}
      >
        {t('mobile.journee.activites')}
      </Texte>
      <Ligne libelle={t('activites.periodes.matin')} valeur={de('matin')} />
      <Ligne libelle={t('activites.periodes.apres_midi')} valeur={de('apres_midi')} derniere />
    </Carte>
  );
}

function Numero({ n }: { n: number }) {
  const p = usePalette();
  return (
    <View style={[styles.numero, { backgroundColor: p.marine }]}>
      <Text style={styles.numeroTexte}>{n}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  // .leg : 13 px de marge, filet pointillé de 2 px, texte à 21 px du filet.
  trajet: {
    marginLeft: 13,
    paddingVertical: 4,
    paddingLeft: 21,
    borderLeftWidth: 2,
    borderStyle: 'dashed',
    fontFamily: police.texteMoyen,
    fontSize: 12.5,
    lineHeight: 18,
  },
  arret: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  numero: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  numeroTexte: { color: '#FFFFFF', fontFamily: police.titre, fontSize: 13 },
  nom: { fontFamily: police.texteFort, fontSize: 15, lineHeight: 21 },
  membre: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 32 },
  manque: { fontFamily: police.texteFort, fontSize: 12 },
});
