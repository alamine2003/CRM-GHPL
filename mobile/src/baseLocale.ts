/**
 * Base locale chiffrée du téléphone (architecture-essentials §5, architecture §5.5).
 *
 * SQLite chiffrée par SQLCipher ; la clé, tirée au hasard à la première ouverture, reste
 * dans le Keychain / Keystore (expo-secure-store) et ne quitte jamais l'appareil. La base
 * garde ce que le délégué doit avoir sans réseau : en 0.1.6, sa liste cible (PRP-011 CA2).
 * La synchronisation complète (OFF-001) arrive en 0.8 ; elle reprendra cette base.
 */
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import * as SQLite from 'expo-sqlite';

const CLE_CHIFFREMENT = 'innov.base.cle';
const FICHIER = 'innov.db';

let ouverture: Promise<SQLite.SQLiteDatabase> | null = null;

async function cle(): Promise<string> {
  const existante = await SecureStore.getItemAsync(CLE_CHIFFREMENT);
  if (existante) return existante;
  const octets = Crypto.getRandomBytes(32);
  const nouvelle = Array.from(octets, (o) => o.toString(16).padStart(2, '0')).join('');
  await SecureStore.setItemAsync(CLE_CHIFFREMENT, nouvelle, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
  return nouvelle;
}

function base(): Promise<SQLite.SQLiteDatabase> {
  ouverture ??= (async () => {
    const hex = await cle();
    const db = await SQLite.openDatabaseAsync(FICHIER);
    // Clé brute de 256 bits : SQLCipher ne dérive rien d'un mot de passe.
    await db.execAsync(`PRAGMA key = "x'${hex}'";`);
    await db.execAsync(
      'CREATE TABLE IF NOT EXISTS memoire (cle TEXT PRIMARY KEY NOT NULL, valeur TEXT NOT NULL, maj TEXT NOT NULL);',
    );
    return db;
  })().catch((erreur: unknown) => {
    ouverture = null;
    throw erreur;
  });
  return ouverture;
}

export interface Memorise<T> {
  valeur: T;
  /** Date ISO de la dernière mise à jour depuis le serveur. */
  maj: string;
}

export async function lire<T>(cleDonnee: string): Promise<Memorise<T> | null> {
  const db = await base();
  const ligne = await db.getFirstAsync<{ valeur: string; maj: string }>(
    'SELECT valeur, maj FROM memoire WHERE cle = ?',
    cleDonnee,
  );
  return ligne ? { valeur: JSON.parse(ligne.valeur) as T, maj: ligne.maj } : null;
}

export async function ecrire<T>(cleDonnee: string, valeur: T): Promise<void> {
  const db = await base();
  await db.runAsync(
    'INSERT OR REPLACE INTO memoire (cle, valeur, maj) VALUES (?, ?, ?)',
    cleDonnee,
    JSON.stringify(valeur),
    new Date().toISOString(),
  );
}

/** À la déconnexion (ou à l'effacement à distance, 0.8) : plus rien ne reste sur le téléphone. */
export async function effacer(): Promise<void> {
  if (!ouverture) {
    // Base jamais ouverte dans cette session : on l'ouvre pour la vider (clé connue).
    if (!(await SecureStore.getItemAsync(CLE_CHIFFREMENT))) return;
  }
  const db = await base();
  await db.execAsync('DELETE FROM memoire;');
}
