/**
 * Brouillons et envois en attente du planning (PLN-007, 0.2.7).
 *
 * - **Brouillon de saisie** : le formulaire d'une visite ou d'une absence est gardé dans la
 *   base locale chiffrée à chaque changement ; si l'application se ferme en pleine saisie, la
 *   semaine propose de la reprendre (CA1 : aucune visite perdue).
 * - **Envois en attente** : sans réseau, une visite ou une absence enregistrée part dans une
 *   file sur le téléphone, avec un identifiant tiré ici (OFF-002 CA1) ; la file se vide dès que
 *   le réseau revient, et le serveur ne crée rien deux fois (OFF-003 CA2). La synchronisation
 *   complète (conflits, 7 jours hors ligne) arrive au cycle 0.8.
 */
import type {
  ClientApi,
  Demarrage,
  Ecart,
  Imprevue,
  ModificationVisite,
  PeriodeActivite,
  Report,
  Terminaison,
  SaisieActivite,
  SaisieVisite,
} from '@innov/api-client';
import { Platform } from 'react-native';
import { ErreurApi } from '@innov/api-client';
import * as Crypto from 'expo-crypto';
import { ecrire, lire, oublier } from './baseLocale';
import {
  lireBrouillonRapport,
  marquerEnvoye,
  oublierBrouillon as oublierBrouillonRapport,
  oublierFichier,
} from './BrouillonRapport';

const CLE_BROUILLON = 'planning.brouillon';
const CLE_ATTENTE = 'planning.attente';

/** Champs d'une visite en cours de saisie, tels que le formulaire les tient. */
export type ChampsVisite = {
  date: string;
  heure: string;
  prospect: {
    id: string;
    civilite?: string;
    prenom?: string;
    nom: string;
    potentiel: string;
    detail: string;
  } | null;
  lieu: { id: string; nom: string } | null;
  reseau: string | null;
  objectif: string;
  note: string;
};

export type ChampsActivite = {
  date: string;
  type: SaisieActivite['type'] | null;
  periode: NonNullable<SaisieActivite['periode']>;
  commentaire: string;
  /** Déplacement demandé par le superviseur (0.3.1) ; absent des brouillons plus anciens. */
  demande_superviseur?: boolean;
};

export type Brouillon =
  | { objet: 'visite'; semaine: string; visite?: string; champs: ChampsVisite }
  | { objet: 'activite'; semaine: string; activite?: string; champs: ChampsActivite };

export type Envoi =
  | {
      id: string;
      type: 'ajout_visite';
      planning: string;
      saisie: SaisieVisite;
      resume: string;
      erreur?: string;
    }
  | {
      id: string;
      type: 'modif_visite';
      visite: string;
      saisie: ModificationVisite;
      resume: string;
      erreur?: string;
    }
  | {
      id: string;
      /** DC-51 : indisponibilité imprévue déclarée sans réseau, avec l'identifiant du téléphone. */
      type: 'indisponibilite';
      saisie: { id: string; periode: PeriodeActivite };
      resume: string;
      erreur?: string;
    }
  | {
      id: string;
      type: 'ajout_activite';
      planning: string;
      saisie: SaisieActivite;
      resume: string;
      erreur?: string;
    }
  | {
      id: string;
      /** Visite démarrée sans réseau (VIS-003 CA1) : l'heure et la position du moment. */
      type: 'demarrer_visite';
      visite: string;
      saisie: Demarrage;
      resume: string;
      erreur?: string;
    }
  | {
      id: string;
      /** Visite terminée sans réseau (VIS-004) : l'heure et la position du moment. */
      type: 'terminer_visite';
      visite: string;
      saisie: Terminaison;
      resume: string;
      erreur?: string;
    }
  | {
      id: string;
      /** Écart déclaré sans réseau : prospect absent (VIS-005), annulée (VIS-006), non
       * réalisée (VIS-009). */
      type: 'absent_visite' | 'annuler_visite' | 'non_realisee_visite';
      visite: string;
      saisie: Ecart;
      resume: string;
      erreur?: string;
    }
  | {
      id: string;
      /** Visite imprévue démarrée sans réseau (VIS-008), avec son identifiant. */
      type: 'imprevue_visite';
      visite: string;
      saisie: Imprevue;
      resume: string;
      erreur?: string;
    }
  | {
      id: string;
      /** Report déclaré sans réseau (VIS-007), avec l'identifiant de la nouvelle visite. */
      type: 'reporter_visite';
      visite: string;
      saisie: Report;
      resume: string;
      erreur?: string;
    }
  | {
      id: string;
      /** Brouillon du rapport saisi sans réseau (RPT-009) : la saisie est dans la base
       * locale ; seul le rappel d'envoyer attend dans la file. */
      type: 'brouillon_rapport';
      visite: string;
      resume: string;
      erreur?: string;
    }
  | {
      id: string;
      /** Rapport soumis sans réseau (RPT-010) : l'heure du téléphone part avec lui ; la
       * saisie, gardée dans la base locale, est envoyée d'abord si elle ne l'est pas. */
      type: 'soumission_rapport';
      visite: string;
      soumis_le: string;
      resume: string;
      erreur?: string;
    }
  | {
      id: string;
      /** Document du rapport choisi sans réseau (RPT-007) : le fichier reste sur le
       * téléphone, à son adresse locale, jusqu'à l'envoi. */
      type: 'piece_jointe';
      visite: string;
      saisie: PieceEnAttente;
      resume: string;
      erreur?: string;
    };

/** Le fichier tel que l'envoi l'attend : sur le téléphone, son adresse locale ({ uri, name,
 * type }) que React Native lit lui-même ; dans un navigateur, son contenu (Blob). */
export async function fichierAEnvoyer(uri: string, nom: string, type: string) {
  if (Platform.OS === 'web') return (await fetch(uri)).blob();
  return { uri, name: nom, type };
}

export type PieceEnAttente = {
  id: string;
  uri: string;
  nom: string;
  type_mime: string;
  taille: number;
  prise_le: string;
};

/** Panne de réseau ou serveur indisponible : la saisie attend ; un refus métier, non. */
export function estTransitoire(erreur: unknown) {
  return !(erreur instanceof ErreurApi) || erreur.statut >= 500;
}

export function nouvelIdentifiant() {
  return Crypto.randomUUID();
}

export async function lireBrouillon() {
  return (await lire<Brouillon>(CLE_BROUILLON).catch(() => null))?.valeur ?? null;
}

export async function garderBrouillon(brouillon: Brouillon) {
  await ecrire(CLE_BROUILLON, brouillon).catch(() => undefined);
}

export async function oublierBrouillon() {
  await oublier(CLE_BROUILLON).catch(() => undefined);
}

export async function lireAttente() {
  return (await lire<Envoi[]>(CLE_ATTENTE).catch(() => null))?.valeur ?? [];
}

async function garderAttente(envois: Envoi[]) {
  if (envois.length) await ecrire(CLE_ATTENTE, envois).catch(() => undefined);
  else await oublier(CLE_ATTENTE).catch(() => undefined);
}

/**
 * Toute écriture de la file passe ici, l'une après l'autre : elle relit la file juste avant
 * d'écrire, pour qu'un envoi ajouté pendant un rejeu ne soit jamais écrasé (0.2.9).
 */
let fileOccupee: Promise<unknown> = Promise.resolve();
function modifierFile(changer: (envois: Envoi[]) => Envoi[]): Promise<void> {
  const suite = fileOccupee.then(async () => garderAttente(changer(await lireAttente())));
  fileOccupee = suite.catch(() => undefined);
  return suite;
}

/** Ajoute un envoi à la file (après un échec de réseau). */
export async function mettreEnAttente(envoi: Envoi) {
  await modifierFile((envois) => [...envois, envoi]);
}

export async function abandonnerEnvoi(id: string) {
  await modifierFile((envois) => envois.filter((e) => e.id !== id));
}

/**
 * Rejoue la file dans l'ordre. Un envoi réussi en sort ; un refus du serveur reste, avec son
 * message, pour que le délégué corrige ou abandonne ; une panne de réseau arrête tout.
 * Un seul rejeu à la fois : un second appel reçoit la réponse du premier, sans rien renvoyer
 * deux fois. Rend le nombre d'envois partis.
 */
let rejeuEnCours: Promise<number> | null = null;
export function envoyerAttente(client: ClientApi): Promise<number> {
  rejeuEnCours ??= rejouer(client).finally(() => {
    rejeuEnCours = null;
  });
  return rejeuEnCours;
}

async function rejouer(client: ClientApi): Promise<number> {
  const envois = await lireAttente();
  const partis = new Set<string>();
  const refus = new Map<string, string>();
  for (const envoi of envois) {
    try {
      if (envoi.type === 'ajout_visite') {
        await client.plannings.ajouterVisite(envoi.planning, envoi.saisie);
      } else if (envoi.type === 'modif_visite') {
        await client.visites.modifier(envoi.visite, envoi.saisie);
      } else if (envoi.type === 'demarrer_visite') {
        await client.visites.demarrer(envoi.visite, envoi.saisie);
      } else if (envoi.type === 'terminer_visite') {
        await client.visites.terminer(envoi.visite, envoi.saisie);
      } else if (envoi.type === 'imprevue_visite') {
        await client.visites.imprevue(envoi.saisie);
      } else if (envoi.type === 'reporter_visite') {
        await client.visites.reporter(envoi.visite, envoi.saisie);
      } else if (envoi.type === 'piece_jointe') {
        const { id, uri, nom, type_mime, prise_le } = envoi.saisie;
        await client.visites.joindrePiece(envoi.visite, {
          id,
          nom,
          prise_le,
          fichier: await fichierAEnvoyer(uri, nom, type_mime),
        });
        await oublierFichier(uri);
      } else if (envoi.type === 'brouillon_rapport') {
        const brouillon = await lireBrouillonRapport(envoi.visite);
        if (brouillon?.saisie && !brouillon.envoye) {
          const rapport = await client.visites.enregistrerRapport(envoi.visite, brouillon.saisie);
          await marquerEnvoye(envoi.visite, rapport);
        }
      } else if (envoi.type === 'soumission_rapport') {
        const brouillon = await lireBrouillonRapport(envoi.visite);
        if (brouillon?.saisie && !brouillon.envoye)
          await client.visites.enregistrerRapport(envoi.visite, brouillon.saisie);
        await client.visites.soumettreRapport(envoi.visite, envoi.soumis_le);
        await oublierBrouillonRapport(envoi.visite);
      } else if (envoi.type === 'indisponibilite') {
        await client.plannings.declarerIndisponibilite(envoi.saisie);
      } else if (envoi.type === 'ajout_activite') {
        await client.plannings.declarerActivite(envoi.planning, envoi.saisie);
      } else {
        const declarer = {
          absent_visite: client.visites.absent,
          annuler_visite: client.visites.annuler,
          non_realisee_visite: client.visites.nonRealisee,
        }[envoi.type];
        await declarer(envoi.visite, envoi.saisie);
      }
      partis.add(envoi.id);
    } catch (e) {
      if (estTransitoire(e)) break;
      refus.set(envoi.id, e instanceof Error ? e.message : String(e));
    }
  }
  // Seuls les envois rejoués changent ; ce qui s'est ajouté entre-temps reste tel quel.
  await modifierFile((actuels) =>
    actuels
      .filter((e) => !partis.has(e.id))
      .map((e) => (refus.has(e.id) ? { ...e, erreur: refus.get(e.id) } : e)),
  );
  return partis.size;
}
