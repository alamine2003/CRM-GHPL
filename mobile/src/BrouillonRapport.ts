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

export type SaisieLocale = Required<Omit<SaisieRapport, 'champs'>> & { champs: ValeursChamps };

export type BrouillonRapport = {
  /** Le rapport tel que le serveur l'a rendu la dernière fois (listes proposées, statut…). */
  rapport: Rapport;
  /** La saisie du délégué, enregistrée à chaque changement. */
  saisie: SaisieLocale | null;
  modifie_le: string | null;
  /** La saisie a-t-elle été reçue par le serveur ? */
  envoye: boolean;
};

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
  } satisfies BrouillonRapport).catch(() => undefined);
}

export async function garderSaisie(visite: string, rapport: Rapport, saisie: SaisieLocale) {
  await ecrire(cle(visite), {
    rapport,
    saisie,
    modifie_le: new Date().toISOString(),
    envoye: false,
  } satisfies BrouillonRapport).catch(() => undefined);
}

export async function marquerEnvoye(visite: string, rapport: Rapport) {
  const actuel = await lireBrouillonRapport(visite);
  await ecrire(cle(visite), {
    rapport,
    saisie: actuel?.saisie ?? null,
    modifie_le: actuel?.modifie_le ?? null,
    envoye: true,
  } satisfies BrouillonRapport).catch(() => undefined);
}

export async function oublierBrouillon(visite: string) {
  await oublier(cle(visite)).catch(() => undefined);
}

const DOSSIER = FS.documentDirectory ? `${FS.documentDirectory}pieces-en-attente/` : null;

/** Une photo en attente quitte le cache, que le téléphone peut vider, pour un dossier durable
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

/** Après l'envoi, la copie durable n'a plus lieu d'être. */
export async function oublierFichier(uri: string) {
  if (Platform.OS === 'web' || !DOSSIER || !uri.startsWith(DOSSIER)) return;
  await FS.deleteAsync(uri, { idempotent: true }).catch(() => undefined);
}
