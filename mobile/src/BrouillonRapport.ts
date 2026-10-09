/**
 * Brouillon du rapport gardé sur le téléphone (RPT-009) : la dernière version reçue du
 * serveur et la saisie en cours, dans la base locale chiffrée. CA1 : il survit à la
 * fermeture de l'application et au redémarrage du téléphone. Sans réseau, le rapport déjà
 * ouvert une fois se complète quand même.
 */
import type { Rapport, SaisieRapport, ValeursChamps } from '@innov/api-client';
import * as FS from 'expo-file-system/legacy';
import { Platform } from 'react-native';
import { ecrire, lire, oublier } from './baseLocale';

export type SaisieLocale = Required<Omit<SaisieRapport, 'champs' | 'version'>> & {
  champs: ValeursChamps;
};

export type BrouillonRapport = {
  /** Le rapport tel que le serveur l'a rendu la dernière fois (listes proposées, statut…). */
  rapport: Rapport;
  /** La saisie du délégué, enregistrée à chaque changement. */
  saisie: SaisieLocale | null;
  modifie_le: string | null;
  /** La saisie a-t-elle été reçue par le serveur ? */
  envoye: boolean;
  /** RPT-010 : soumis sur le téléphone, sans réseau, à cette heure ; en attente d'envoi. */
  soumis_le?: string | null;
  /** RG-052 (0.8.4) : la version du serveur sur laquelle la saisie non envoyée s'appuie. */
  base_version?: number;
};

/** La version que la saisie locale prolonge : celle de sa première modification non envoyée. */
export function versionDeBase(b: BrouillonRapport | null): number | undefined {
  if (!b) return undefined;
  return b.base_version ?? b.rapport.version;
}

/** RG-052 : une saisie non envoyée garde sa base ; une saisie neuve part du rapport reçu. */
function baseDe(actuel: BrouillonRapport | null, rapport: Rapport) {
  return actuel && !actuel.envoye && actuel.saisie
    ? (actuel.base_version ?? actuel.rapport.version)
    : rapport.version;
}

const cle = (visite: string) => `rapport.${visite}`;

export async function lireBrouillonRapport(visite: string): Promise<BrouillonRapport | null> {
  const m = await lire<BrouillonRapport>(cle(visite)).catch(() => null);
  return m?.valeur ?? null;
}

/** Garde la version du serveur, sans perdre une saisie locale pas encore envoyée. */
export async function garderRapport(visite: string, rapport: Rapport) {
  const actuel = await lireBrouillonRapport(visite);
  const enCours = actuel && !actuel.envoye ? actuel : null;
  await ecrire(cle(visite), {
    rapport,
    saisie: enCours?.saisie ?? null,
    modifie_le: enCours?.modifie_le ?? null,
    envoye: !enCours,
    soumis_le: actuel?.soumis_le ?? null,
    // La saisie en cours garde la version sur laquelle elle s'appuie (RG-052).
    base_version: enCours && actuel ? baseDe(actuel, actuel.rapport) : undefined,
  } satisfies BrouillonRapport).catch(() => undefined);
}

export async function garderSaisie(
  visite: string,
  rapport: Rapport,
  saisie: SaisieLocale,
  /** OFF-004 : « Garder ma version » repart de la version du serveur qu'il a vue. */
  base?: number,
) {
  const actuel = await lireBrouillonRapport(visite);
  await ecrire(cle(visite), {
    rapport,
    saisie,
    modifie_le: new Date().toISOString(),
    envoye: false,
    base_version: base ?? baseDe(actuel, rapport),
  } satisfies BrouillonRapport).catch(() => undefined);
}

export async function marquerEnvoye(visite: string, rapport: Rapport) {
  const actuel = await lireBrouillonRapport(visite);
  await ecrire(cle(visite), {
    rapport,
    saisie: actuel?.saisie ?? null,
    modifie_le: actuel?.modifie_le ?? null,
    envoye: true,
    soumis_le: actuel?.soumis_le ?? null,
  } satisfies BrouillonRapport).catch(() => undefined);
}

/** OFF-004 : le délégué abandonne sa saisie locale au profit du rapport du serveur. */
export async function oublierSaisie(visite: string, rapport: Rapport) {
  await ecrire(cle(visite), {
    rapport,
    saisie: null,
    modifie_le: null,
    envoye: true,
    soumis_le: null,
  } satisfies BrouillonRapport).catch(() => undefined);
}

/** RPT-010 : la soumission faite sans réseau ; l'heure du téléphone comptera. */
export async function garderSoumission(
  visite: string,
  rapport: Rapport,
  saisie: SaisieLocale,
  soumis_le: string,
) {
  const actuel = await lireBrouillonRapport(visite);
  await ecrire(cle(visite), {
    rapport,
    saisie,
    modifie_le: actuel?.modifie_le ?? soumis_le,
    // Renvoyée avant la soumission : le serveur vérifie le rapport tel que soumis.
    envoye: false,
    soumis_le,
    base_version: baseDe(actuel, rapport),
  } satisfies BrouillonRapport).catch(() => undefined);
}

export async function oublierBrouillon(visite: string) {
  await oublier(cle(visite)).catch(() => undefined);
}

const DOSSIER = FS.documentDirectory ? `${FS.documentDirectory}pieces-en-attente/` : null;

/** Un document en attente quitte le cache, que le téléphone peut vider, pour un dossier durable
 * de l'application ; dans un navigateur, l'adresse reste telle quelle. */
export async function garderFichier(uri: string, id: string): Promise<string> {
  if (Platform.OS === 'web' || !DOSSIER) return uri;
  try {
    await FS.makeDirectoryAsync(DOSSIER, { intermediates: true }).catch(() => undefined);
    const extension = uri.split('?')[0]?.split('.').pop()?.toLowerCase() || 'bin';
    const destination = `${DOSSIER}${id}.${extension}`;
    await FS.copyAsync({ from: uri, to: destination });
    return destination;
  } catch {
    return uri;
  }
}

/** SEC-006 : à l'effacement à distance, les documents en attente disparaissent aussi. */
export async function effacerFichiers() {
  if (Platform.OS === 'web' || !DOSSIER) return;
  await FS.deleteAsync(DOSSIER, { idempotent: true }).catch(() => undefined);
}

/** Après l'envoi, la copie durable n'a plus lieu d'être. */
export async function oublierFichier(uri: string) {
  if (Platform.OS === 'web' || !DOSSIER || !uri.startsWith(DOSSIER)) return;
  await FS.deleteAsync(uri, { idempotent: true }).catch(() => undefined);
}
