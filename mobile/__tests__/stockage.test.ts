import * as SecureStore from 'expo-secure-store';
import { stockageSecurise } from '../src/client';

jest.mock('expo-constants', () => ({ expoConfig: { extra: {} } }));
jest.mock('expo-secure-store', () => {
  const memoire = new Map<string, string>();
  return {
    WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'ceDispositifSeulement',
    getItemAsync: jest.fn(async (cle: string) => memoire.get(cle) ?? null),
    setItemAsync: jest.fn(async (cle: string, valeur: string) => void memoire.set(cle, valeur)),
    deleteItemAsync: jest.fn(async (cle: string) => void memoire.delete(cle)),
  };
});

describe('stockage du jeton de rafraîchissement', () => {
  it('écrit dans le magasin sécurisé, limité à cet appareil déverrouillé', async () => {
    await stockageSecurise.ecrire('R1');
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith('innov.rafraichissement', 'R1', {
      keychainAccessible: 'ceDispositifSeulement',
    });
    expect(await stockageSecurise.lire()).toBe('R1');
  });

  it('efface le jeton à la déconnexion', async () => {
    await stockageSecurise.ecrire('R1');
    await stockageSecurise.ecrire(null);
    expect(await stockageSecurise.lire()).toBeNull();
  });
});
