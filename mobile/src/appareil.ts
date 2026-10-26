import type { DescriptionAppareil } from '@innov/api-client';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { VERSION_APP } from './version';

const CLE = 'innov.installation';
let enMemoire: string | null = null;

function nouvelIdentifiant(): string {
  // Identifie l'installation, sans valeur secrète : il sert à reconnaître le téléphone.
  const aleatoire = globalThis.crypto?.randomUUID?.();
  if (aleatoire) return aleatoire;
  const hex = () =>
    Math.floor(Math.random() * 0x10000)
      .toString(16)
      .padStart(4, '0');
  return `${hex()}${hex()}-${hex()}-4${hex().slice(1)}-${hex()}-${hex()}${hex()}${hex()}`;
}

/** Identifiant d'installation, tiré une fois puis gardé dans le magasin sécurisé (USR-006). */
export async function identifiantInstallation(): Promise<string> {
  if (Platform.OS === 'web') {
    enMemoire ??= nouvelIdentifiant();
    return enMemoire;
  }
  const existant = await SecureStore.getItemAsync(CLE);
  if (existant) return existant;
  const identifiant = nouvelIdentifiant();
  await SecureStore.setItemAsync(CLE, identifiant, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
  return identifiant;
}

/** Description du téléphone envoyée à la connexion. */
export async function decrireAppareil(): Promise<DescriptionAppareil> {
  const constantes = (Platform.constants ?? {}) as { Model?: string; Brand?: string };
  const systeme =
    Platform.OS === 'ios'
      ? `iOS ${Platform.Version}`
      : Platform.OS === 'android'
        ? `Android (API ${Platform.Version})`
        : 'Web';
  return {
    identifiant_installation: await identifiantInstallation(),
    plateforme: Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'web',
    systeme,
    modele: [constantes.Brand, constantes.Model].filter(Boolean).join(' ').slice(0, 80),
    version_app: VERSION_APP,
  };
}

/** 1.4.0 (écran de connexion) : ce téléphone s'est-il déjà fait connaître du serveur ? */
export async function installationConnue(): Promise<boolean> {
  if (Platform.OS === 'web') return enMemoire !== null;
  return (await SecureStore.getItemAsync(CLE).catch(() => null)) !== null;
}
