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
  ModificationVisite,
  SaisieActivite,
  SaisieVisite,
} from '@innov/api-client';
import { ErreurApi } from '@innov/api-client';
import * as Crypto from 'expo-crypto';
import { ecrire, lire, oublier } from './baseLocale';

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
      type: 'ajout_activite';
      planning: string;
      saisie: SaisieActivite;
      resume: string;
      erreur?: string;
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
      } else {
        await client.plannings.declarerActivite(envoi.planning, envoi.saisie);
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
