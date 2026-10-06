/**
 * Démarrer puis terminer une visite (VIS-003, 0.4.3 ; VIS-004, 0.4.4). Le téléphone prend l'heure réelle et, si le pays active
 * la géolocalisation (RG-028), la position du moment — même sans réseau (CA1) : l'envoi part
 * aussitôt, ou attend dans la file et part au retour du réseau. Sans position, la visite démarre
 * quand même, « sans GPS » (CA2) ; avec une position, la distance au lieu s'affiche (CA3).
 */
import type { ClientApi, DetailVisite, Programme, VisiteProgramme } from '@innov/api-client';
import * as Location from 'expo-location';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { ecrire, lire } from './baseLocale';
import {
  envoyerAttente,
  estTransitoire,
  lireAttente,
  mettreEnAttente,
  nouvelIdentifiant,
} from './Brouillons';
import { Alerte, Bouton, Texte } from './composants';
import { nomProspect } from './Fiches';
import { messageErreur, useSession } from './session';

export const CLE_PROGRAMME = 'programme.courant';

type Ecouteur = (programme: Programme) => void;
const ecouteurs = new Set<Ecouteur>();

/** Les écrans qui montrent le programme suivent ses changements faits sur le téléphone. */
export function ecouterProgramme(ecouteur: Ecouteur) {
  ecouteurs.add(ecouteur);
  return () => {
    ecouteurs.delete(ecouteur);
  };
}

/** Change une visite dans le programme gardé, et prévient les écrans ouverts. */
export async function changerVisite(id: string, champs: Partial<VisiteProgramme>) {
  const memoire = await lire<Programme>(CLE_PROGRAMME).catch(() => null);
  if (!memoire) return;
  const programme: Programme = {
    ...memoire.valeur,
    jours: memoire.valeur.jours.map((j) => ({
      ...j,
      visites: j.visites.map((v) => (v.id === id ? { ...v, ...champs } : v)),
    })),
  };
  await ecrire(CLE_PROGRAMME, programme).catch(() => undefined);
  ecouteurs.forEach((e) => e(programme));
}

type Position = { latitude: number; longitude: number; precision_m: number | null };

/**
 * La position du moment, ou rien : refus, appareil sans GPS, ou plus long que l'attente fixée
 * par le pays (1 minute par défaut, demande d'autorisation comprise).
 */
export async function prendrePosition(attenteSecondes = 60): Promise<Position | null> {
  return attendreAuPlus(lirePosition(), attenteSecondes * 1000);
}

/** La promesse, ou rien au-delà du délai ; le minuteur ne survit pas à la réponse. */
async function attendreAuPlus<T>(promesse: Promise<T>, ms: number): Promise<T | null> {
  let minuteur: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promesse,
      new Promise<null>((fin) => {
        minuteur = setTimeout(() => fin(null), ms);
      }),
    ]);
  } finally {
    clearTimeout(minuteur);
  }
}

async function lirePosition(): Promise<Position | null> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return null;
    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.High,
    });
    if (!position) return null;
    return {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      precision_m: position.coords.accuracy ?? null,
    };
  } catch {
    return null;
  }
}

/** Distance à vol d'oiseau (haversine), comme le serveur la calcule. */
export function distanceKm(a: [number, number], b: [number, number]) {
  const rad = (x: number) => (x * Math.PI) / 180;
  const [lat1, lon1, lat2, lon2] = [a[0], a[1], b[0], b[1]].map(rad) as [
    number,
    number,
    number,
    number,
  ];
  const h =
    Math.sin((lat2 - lat1) / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin((lon2 - lon1) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/** Distance au lieu, en mètres, d'après les coordonnées gardées avec le détail de la visite. */
async function distanceAuLieu(id: string, latitude: number, longitude: number) {
  const detail = (await lire<DetailVisite>(`visite.${id}`).catch(() => null))?.valeur;
  const lieu = detail?.lieu;
  if (!lieu?.latitude || !lieu.longitude) return null;
  return Math.round(
    distanceKm([latitude, longitude], [Number(lieu.latitude), Number(lieu.longitude)]) * 1000,
  );
}

/** Démarre la visite ; rend « parti » ou « en attente » (sans réseau). Un refus remonte. */
export async function demarrerVisite(
  client: ClientApi,
  visite: VisiteProgramme,
  geolocalisation: boolean,
  resume: string,
  attenteSecondes = 60,
): Promise<'parti' | 'en_attente'> {
  const position = geolocalisation ? await prendrePosition(attenteSecondes) : null;
  const saisie = { debut_le: new Date().toISOString(), ...(position ?? {}) };
  const distance = position
    ? await distanceAuLieu(visite.id, position.latitude, position.longitude)
    : null;
  const local = {
    statut: 'en_cours' as const,
    debut_le: saisie.debut_le,
    sans_gps: geolocalisation && !position,
    distance_debut_m: distance,
  };
  try {
    const recue = await client.visites.demarrer(visite.id, saisie);
    await changerVisite(visite.id, {
      statut: recue.statut,
      debut_le: recue.debut_le,
      sans_gps: recue.sans_gps,
      distance_debut_m: recue.distance_debut_m ?? distance,
    });
    return 'parti';
  } catch (e) {
    if (!estTransitoire(e)) throw e;
    await mettreEnAttente({
      id: nouvelIdentifiant(),
      type: 'demarrer_visite',
      visite: visite.id,
      saisie,
      resume,
    });
    await changerVisite(visite.id, local);
    return 'en_attente';
  }
}

/**
 * Termine la visite en cours (VIS-004). Ce qui attend dans la file part d'abord : une visite
 * démarrée sans réseau doit être connue du serveur avant sa fin.
 */
export async function terminerVisite(
  client: ClientApi,
  visite: VisiteProgramme,
  geolocalisation: boolean,
  resume: string,
  attenteSecondes = 60,
): Promise<'parti' | 'en_attente'> {
  const position = geolocalisation ? await prendrePosition(attenteSecondes) : null;
  const saisie = { fin_le: new Date().toISOString(), ...(position ?? {}) };
  const local = {
    statut: 'effectuee' as const,
    fin_le: saisie.fin_le,
    fin_sans_gps: geolocalisation && !position,
    distance_fin_m: position
      ? await distanceAuLieu(visite.id, position.latitude, position.longitude)
      : null,
  };
  const attente = await lireAttente();
  if (attente.length) await envoyerAttente(client).catch(() => 0);
  const encoreEnAttente = (await lireAttente()).some(
    (e) => e.type === 'demarrer_visite' && e.visite === visite.id,
  );
  try {
    if (encoreEnAttente) throw new TypeError('Démarrage encore en attente');
    const recue = await client.visites.terminer(visite.id, saisie);
    await changerVisite(visite.id, {
      statut: recue.statut,
      fin_le: recue.fin_le,
      fin_sans_gps: recue.fin_sans_gps,
      distance_fin_m: recue.distance_fin_m ?? local.distance_fin_m,
    });
    return 'parti';
  } catch (e) {
    if (!estTransitoire(e)) throw e;
    await mettreEnAttente({
      id: nouvelIdentifiant(),
      type: 'terminer_visite',
      visite: visite.id,
      saisie,
      resume,
    });
    await changerVisite(visite.id, local);
    return 'en_attente';
  }
}

function dureeMinutes(debut: string | null, fin: string) {
  return debut ? Math.max(1, Math.round((Date.parse(fin) - Date.parse(debut)) / 60000)) : 0;
}

export function distanceLisible(
  metres: number,
  t: ReturnType<typeof useTranslation>['t'],
  langue: string,
) {
  return metres < 1000
    ? t('execution.metres', { n: metres })
    : t('execution.kilometres', {
        n: new Intl.NumberFormat(langue, { maximumFractionDigits: 1 }).format(metres / 1000),
      });
}

/**
 * Ce que l'on peut faire d'une visite du programme : la démarrer le jour prévu, ou lire depuis
 * quand elle est en cours, à quelle distance du lieu.
 */
export function ExecutionVisite({
  visite,
  aujourdhui,
  geolocalisation,
  fuseau,
  attenteSecondes = 60,
  surTerminee,
}: {
  visite: VisiteProgramme;
  aujourdhui: string;
  geolocalisation: boolean;
  fuseau: string;
  attenteSecondes?: number;
  /** La visite terminée quitte souvent l'écran (la suivante prend sa place) : on l'annonce. */
  surTerminee?: (annonce: { texte: string; horsLigne: boolean }) => void;
}) {
  const { t, i18n } = useTranslation();
  const { client } = useSession();
  const [envoi, setEnvoi] = useState(false);
  const [message, setMessage] = useState<{
    ton: 'erreur' | 'info' | 'succes';
    texte: string;
  } | null>(null);
  const heureDe = (iso: string) => {
    try {
      return new Intl.DateTimeFormat(i18n.language, {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: fuseau,
      }).format(new Date(iso));
    } catch {
      return new Date(iso).toTimeString().slice(0, 5);
    }
  };
  const resume = [visite.heure, visite.prospect ? nomProspect(visite.prospect, t) : '']
    .filter(Boolean)
    .join(' · ');

  async function agir(action: 'demarrer' | 'terminer') {
    setEnvoi(true);
    setMessage(null);
    try {
      if (action === 'demarrer') {
        const issue = await demarrerVisite(
          client,
          visite,
          geolocalisation,
          resume,
          attenteSecondes,
        );
        if (issue === 'en_attente') setMessage({ ton: 'info', texte: t('execution.horsLigne') });
      } else {
        const fin = new Date().toISOString();
        const issue = await terminerVisite(
          client,
          visite,
          geolocalisation,
          resume,
          attenteSecondes,
        );
        const texte = t('execution.terminee', {
          nom: visite.prospect ? nomProspect(visite.prospect, t) : t('visites.sansProspect'),
          debut: visite.debut_le ? heureDe(visite.debut_le) : '',
          fin: heureDe(fin),
          duree: t('execution.duree', { n: dureeMinutes(visite.debut_le, fin) }),
        });
        const horsLigne = issue === 'en_attente';
        if (surTerminee) surTerminee({ texte, horsLigne });
        else
          setMessage({
            ton: horsLigne ? 'info' : 'succes',
            texte: horsLigne ? t('execution.termineeHorsLigne', { texte }) : texte,
          });
      }
    } catch (e) {
      setMessage({
        ton: 'erreur',
        texte: t('execution.refus', { message: messageErreur(e, t('erreurs.reseau')) }),
      });
    } finally {
      setEnvoi(false);
    }
  }

  const attente = envoi && (
    <Texte variante="discret" accessibilityLiveRegion="polite">
      {geolocalisation
        ? t(visite.statut === 'en_cours' ? 'execution.positionFin' : 'execution.position', {
            n: attenteSecondes,
          })
        : t('execution.demarrage')}
    </Texte>
  );

  if (visite.statut === 'effectuee' && visite.debut_le && visite.fin_le) {
    const minutes = dureeMinutes(visite.debut_le, visite.fin_le);
    return (
      <View style={{ gap: 6 }}>
        <Texte variante="fort">
          {t('execution.effectuee', {
            debut: heureDe(visite.debut_le),
            fin: heureDe(visite.fin_le),
            duree: t('execution.duree', { n: minutes }),
          })}
        </Texte>
        {visite.fin_sans_gps && <Texte variante="discret">{t('execution.finSansGps')}</Texte>}
        {message && <Alerte type={message.ton}>{message.texte}</Alerte>}
      </View>
    );
  }

  if (visite.statut === 'en_cours' && visite.debut_le) {
    const heure = heureDe(visite.debut_le);
    return (
      <View style={{ gap: 6 }}>
        <Texte variante="fort">
          {[
            t('execution.enCours', { heure }),
            visite.distance_debut_m != null
              ? t('execution.distance', {
                  distance: distanceLisible(visite.distance_debut_m, t, i18n.language),
                })
              : '',
          ]
            .filter(Boolean)
            .join(' · ')}
        </Texte>
        {visite.sans_gps && <Texte variante="discret">{t('execution.sansGps')}</Texte>}
        {message && <Alerte type={message.ton}>{message.texte}</Alerte>}
        <Bouton
          libelle={t('execution.terminer')}
          chargement={envoi}
          onPress={() => void agir('terminer')}
        />
        {attente}
      </View>
    );
  }
  if (visite.statut !== 'prevue' || visite.date !== aujourdhui) return null;

  return (
    <View style={{ gap: 6 }}>
      {message && <Alerte type={message.ton}>{message.texte}</Alerte>}
      <Bouton
        libelle={t('execution.demarrer')}
        chargement={envoi}
        onPress={() => void agir('demarrer')}
      />
      {attente}
    </View>
  );
}

/** Pour le détail d'une visite : la même action, d'après le programme gardé sur le téléphone. */
export function ExecutionDepuisProgramme({ id }: { id: string }) {
  const [programme, setProgramme] = useState<Programme | null>(null);
  useEffect(() => {
    let actif = true;
    void lire<Programme>(CLE_PROGRAMME)
      .then((m) => actif && m && setProgramme(m.valeur))
      .catch(() => undefined);
    const arreter = ecouterProgramme((p) => actif && setProgramme(p));
    return () => {
      actif = false;
      arreter();
    };
  }, []);
  const visite = programme?.jours.flatMap((j) => j.visites).find((v) => v.id === id);
  if (!programme || !visite) return null;
  return (
    <ExecutionVisite
      visite={visite}
      aujourdhui={programme.aujourdhui}
      geolocalisation={programme.geolocalisation}
      fuseau={programme.fuseau}
      attenteSecondes={programme.attente_gps_secondes}
    />
  );
}
