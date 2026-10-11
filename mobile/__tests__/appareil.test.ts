import { decrireAppareil } from '../src/appareil';

jest.mock('expo-constants', () => ({ expoConfig: { version: '0.0.6', extra: {} } }));
jest.mock('expo-secure-store', () => {
  const magasin = new Map<string, string>();
  return {
    getItemAsync: jest.fn(async (cle: string) => magasin.get(cle) ?? null),
    setItemAsync: jest.fn(async (cle: string, valeur: string) => void magasin.set(cle, valeur)),
    WHEN_UNLOCKED_THIS_DEVICE_ONLY: 0,
  };
});

describe('mobile — description du téléphone (USR-006)', () => {
  it('garde le même identifiant d’installation d’une connexion à l’autre', async () => {
    const premiere = await decrireAppareil();
    const seconde = await decrireAppareil();
    expect(premiere.identifiant_installation).toMatch(/^[A-Za-z0-9-]{8,64}$/);
    expect(seconde.identifiant_installation).toBe(premiere.identifiant_installation);
    expect(premiere.version_app).toBe('0.0.6');
    expect(['ios', 'android', 'web']).toContain(premiere.plateforme);
  });
});
