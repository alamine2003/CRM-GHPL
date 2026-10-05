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
import type { ClientApi, ModificationVisite, SaisieAbsence, SaisieVisite } from '@innov/api-client';
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

export type ChampsAbsence = {
  date: string;
  type: SaisieAbsence['type'] | null;
  periode: NonNullable<SaisieAbsence['periode']>;
  commentaire: string;
};

export type Brouillon =
  | { objet: 'visite'; semaine: string; visite?: string; champs: ChampsVisite }
  | { objet: 'absence'; semaine: string; absence?: string; champs: ChampsAbsence };

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
      type: 'ajout_absence';
      planning: string;
      saisie: SaisieAbsence;
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

/** Ajoute un envoi à la file (après un échec de réseau). */
export async function mettreEnAttente(envoi: Envoi) {
  await garderAttente([...(await lireAttente()), envoi]);
}

export async function abandonnerEnvoi(id: string) {
  await garderAttente((await lireAttente()).filter((e) => e.id !== id));
}

/**
 * Rejoue la file dans l'ordre. Un envoi réussi en sort ; un refus du serveur reste, avec son
 * message, pour que le délégué corrige ou abandonne ; une panne de réseau arrête tout.
 * Rend le nombre d'envois partis.
 */
export async function envoyerAttente(client: ClientApi): Promise<number> {
  const envois = await lireAttente();
  const restants: Envoi[] = [];
  let partis = 0;
  let coupure = false;
  for (const envoi of envois) {
    if (coupure) {
      restants.push(envoi);
      continue;
    }
    try {
      if (envoi.type === 'ajout_visite') {
        await client.plannings.ajouterVisite(envoi.planning, envoi.saisie);
      } else if (envoi.type === 'modif_visite') {
        await client.visites.modifier(envoi.visite, envoi.saisie);
      } else {
        await client.plannings.declarerAbsence(envoi.planning, envoi.saisie);
      }
      partis += 1;
    } catch (e) {
      if (estTransitoire(e)) {
        coupure = true;
        restants.push(envoi);
      } else {
        restants.push({ ...envoi, erreur: e instanceof Error ? e.message : String(e) });
      }
    }
  }
  await garderAttente(restants);
  return partis;
}
