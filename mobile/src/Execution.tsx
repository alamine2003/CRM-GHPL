/**
 * Démarrer puis terminer une visite (VIS-003, 0.4.3 ; VIS-004, 0.4.4), ou déclarer le prospect
 * absent (VIS-005, 0.4.5), l'annuler (VIS-006) ou la justifier non réalisée (VIS-009, 0.4.6),
 * avec un motif de la liste du pays. Le téléphone prend l'heure réelle et, si le pays active
 * la géolocalisation (RG-028), la position du moment — même sans réseau (CA1) : l'envoi part
 * aussitôt, ou attend dans la file et part au retour du réseau. Sans position, la visite démarre
 * quand même, « sans GPS » (CA2) ; avec une position, la distance au lieu s'affiche (CA3).
 */
import type {
  Activite,
  ClientApi,
  DetailVisite,
  Programme,
  VisiteProgramme,
} from '@innov/api-client';
import * as Location from 'expo-location';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ecrire, lire } from './baseLocale';
import { garderRapport } from './BrouillonRapport';
import {
  envoyerAttente,
  estTransitoire,
  lireAttente,
  mettreEnAttente,
  nouvelIdentifiant,
} from './Brouillons';
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
    a_justifier: (memoire.valeur.a_justifier ?? []).map((v) =>
      v.id === id ? { ...v, ...champs } : v,
    ),
    a_corriger: (memoire.valeur.a_corriger ?? []).map((v) =>
      v.id === id ? { ...v, ...champs } : v,
    ),
  };
  await ecrire(CLE_PROGRAMME, programme).catch(() => undefined);
  ecouteurs.forEach((e) => e(programme));
}

/** DC-51 : ajoute une indisponibilité imprévue au programme gardé, à son jour, et prévient. */
export async function ajouterActiviteAuProgramme(activite: Activite) {
  const memoire = await lire<Programme>(CLE_PROGRAMME).catch(() => null);
  if (!memoire) return;
  const programme: Programme = {
    ...memoire.valeur,
    jours: memoire.valeur.jours.map((j) =>
      j.date === activite.date && !j.activites.some((a) => a.id === activite.id)
        ? { ...j, activites: [...j.activites, activite] }
        : j,
    ),
  };
  await ecrire(CLE_PROGRAMME, programme).catch(() => undefined);
  ecouteurs.forEach((e) => e(programme));
}

/** Ajoute une visite (une imprévue, VIS-008) au programme gardé, à son jour, et prévient. */
export async function ajouterAuProgramme(visite: VisiteProgramme) {
  const memoire = await lire<Programme>(CLE_PROGRAMME).catch(() => null);
  if (!memoire) return;
  const programme: Programme = {
    ...memoire.valeur,
    jours: memoire.valeur.jours.map((j) =>
      j.date === visite.date && !j.visites.some((v) => v.id === visite.id)
        ? { ...j, visites: [...j.visites, visite] }
        : j,
    ),
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
    rapport_statut: 'attendu' as const,
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
      rapport_statut: recue.rapport_statut ?? local.rapport_statut,
    });
    // RPT-009 : le rapport est gardé sur le téléphone dès la fin de la visite, pour s'écrire
    // ensuite même sans réseau.
    void Promise.resolve()
      .then(() => client.visites.rapport(visite.id))
      .then((r) => garderRapport(visite.id, r))
      .catch(() => undefined);
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

export function dureeMinutes(debut: string | null, fin: string) {
  return debut ? Math.max(1, Math.round((Date.parse(fin) - Date.parse(debut)) / 60000)) : 0;
}

/** Les écarts d'une visite (prd.md §12, RG-031) : chacun exige un motif de la liste du pays. */
export type TypeEcart = 'absent' | 'annuler' | 'non_realisee' | 'reporter';

const ECARTS = {
  absent: { statut: 'prospect_absent', envoi: 'absent_visite' },
  annuler: { statut: 'annulee', envoi: 'annuler_visite' },
  non_realisee: { statut: 'non_realisee', envoi: 'non_realisee_visite' },
  reporter: { statut: 'reportee', envoi: 'reporter_visite' },
} as const;

/** Le nouveau jour d'une visite reportée (VIS-007) ; la nouvelle visite reçoit son identifiant
 * du téléphone, pour qu'un envoi rejoué ne la crée qu'une fois. */
export type NouveauJour = { date: string; heure: string };

/** Déclare un écart : la file part d'abord, puis la déclaration ; sans réseau, elle attend. */
export async function declarerEcart(
  client: ClientApi,
  type: TypeEcart,
  visite: VisiteProgramme,
  motif: { id: string; libelle: string },
  commentaire: string,
  resume: string,
  nouveauJour?: NouveauJour,
): Promise<'parti' | 'en_attente'> {
  const saisie = { le: new Date().toISOString(), motif: motif.id, commentaire: commentaire.trim() };
  const report = nouveauJour && { ...saisie, ...nouveauJour, id: nouvelIdentifiant() };
  const local = {
    statut: ECARTS[type].statut,
    motif_ecart: motif,
    commentaire_ecart: saisie.commentaire,
    ecart_le: saisie.le,
    ...(report && { report: { id: report.id, date: report.date, heure: report.heure } }),
  };
  if ((await lireAttente()).length) await envoyerAttente(client).catch(() => 0);
  const encoreEnAttente = (await lireAttente()).some(
    (e) => 'visite' in e && e.visite === visite.id,
  );
  try {
    if (encoreEnAttente) throw new TypeError('Un envoi de cette visite attend encore');
    const recue = report
      ? await client.visites.reporter(visite.id, report)
      : await {
          absent: client.visites.absent,
          annuler: client.visites.annuler,
          non_realisee: client.visites.nonRealisee,
          reporter: client.visites.annuler, // jamais : un report porte son nouveau jour
        }[type](visite.id, saisie);
    await changerVisite(visite.id, {
      statut: recue.statut,
      motif_ecart: recue.motif_ecart,
      commentaire_ecart: recue.commentaire_ecart,
      ecart_le: recue.ecart_le,
      report: recue.report,
    });
    return 'parti';
  } catch (e) {
    if (!estTransitoire(e)) throw e;
    await mettreEnAttente(
      report
        ? {
            id: nouvelIdentifiant(),
            type: 'reporter_visite',
            visite: visite.id,
            saisie: report,
            resume,
          }
        : {
            id: nouvelIdentifiant(),
            type: ECARTS[type].envoi as 'absent_visite' | 'annuler_visite' | 'non_realisee_visite',
            visite: visite.id,
            saisie,
            resume,
          },
    );
    await changerVisite(visite.id, local);
    return 'en_attente';
  }
}

/** Textes de chaque écart : titre du panneau, bouton de confirmation, annonce, motif lu. */
export const TEXTES_ECART = {
  absent: {
    titre: 'execution.absentTitre',
    confirmer: 'execution.confirmerAbsent',
    note: 'execution.absentNote',
  },
  annuler: {
    titre: 'execution.annuleeTitre',
    confirmer: 'execution.confirmerAnnulee',
    note: 'execution.annuleeNote',
  },
  non_realisee: {
    titre: 'execution.nonRealiseeTitre',
    confirmer: 'execution.confirmerNonRealisee',
    note: 'execution.nonRealiseeNote',
  },
  reporter: {
    titre: 'execution.reportTitre',
    confirmer: 'execution.confirmerReport',
    note: 'execution.reportNote',
  },
} as const;

export const MOTIF_LU: Record<string, string> = {
  prospect_absent: 'execution.motifLu',
  annulee: 'execution.motifAnnulee',
  non_realisee: 'execution.motifNonRealisee',
  reportee: 'execution.motifReport',
};

export const HEURE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Les prochains jours ouvrés après `apres` (jours de la semaine du pays), pour un report. */
export function joursProposes(apres: string, joursOuvres: number[], nombre = 8): string[] {
  const jours: string[] = [];
  const d = new Date(`${apres}T12:00:00Z`);
  for (let i = 0; i < 31 && jours.length < nombre; i++) {
    d.setUTCDate(d.getUTCDate() + 1);
    if (joursOuvres.includes(d.getUTCDay())) jours.push(d.toISOString().slice(0, 10));
  }
  return jours;
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
 * Démarrer ou terminer une visite (VIS-003, VIS-004) : heure réelle, position si le pays
 * l'active, envoi aussitôt ou mis en file. Partagé par le bandeau « Prochaine visite » de la
 * Tournée et le détail de la visite (1.4.0).
 */
export function useActionVisite(
  visite: VisiteProgramme,
  {
    geolocalisation,
    fuseau,
    attenteSecondes = 60,
    surTerminee,
  }: {
    geolocalisation: boolean;
    fuseau: string;
    attenteSecondes?: number;
    surTerminee?: (annonce: { texte: string; ton: 'info' | 'succes'; rapport?: string }) => void;
  },
) {
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
        const annonce = {
          texte: horsLigne ? t('execution.termineeHorsLigne', { texte }) : texte,
          ton: horsLigne ? ('info' as const) : ('succes' as const),
          // Reçue par le serveur, la visite a son rapport à rédiger tout de suite (RPT-001).
          rapport: horsLigne ? undefined : visite.id,
        };
        if (surTerminee) surTerminee(annonce);
        else setMessage(annonce);
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

  return { envoi, setEnvoi, message, setMessage, agir, heureDe, resume };
}

/** Le programme gardé sur le téléphone, à jour des actions (écrans qui s'ouvrent à part). */
export function useProgrammeGarde() {
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
  return programme;
}

/** La visite telle que le programme gardé sur le téléphone la connaît, à jour des actions. */
export function useVisiteDuProgramme(id: string) {
  const programme = useProgrammeGarde();
  const visite = [
    ...(programme?.jours.flatMap((j) => j.visites) ?? []),
    ...(programme?.a_justifier ?? []),
    // 29.A : un rapport à corriger d'une semaine passée s'ouvre aussi.
    ...(programme?.a_corriger ?? []),
  ].find((v) => v.id === id);
  return { programme, visite };
}

/** Les jours de la semaine où le pays travaille, d'après les journées du programme. */
export function joursOuvresDe(programme: Programme): number[] {
  const jours = programme.jours.map((j) => new Date(`${j.date}T12:00:00Z`).getUTCDay());
  return jours.length ? jours : [1, 2, 3, 4, 5];
}

export function plusSept(lundi: string) {
  const d = new Date(`${lundi}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 7);
  return d.toISOString().slice(0, 10);
}
