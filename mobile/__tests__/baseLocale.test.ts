/**
 * SEC-005 (0.8.1) : la base locale est chiffrée par SQLCipher ; sa clé de 256 bits, tirée au
 * hasard une fois, reste dans le magasin sécurisé du téléphone, limitée à cet appareil
 * déverrouillé, et s'applique avant toute lecture.
 */
const mockOrdres: string[] = [];
const mockMagasin = new Map<string, string>();

jest.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'ceDispositifSeulement',
  getItemAsync: jest.fn(async (cle: string) => mockMagasin.get(cle) ?? null),
  setItemAsync: jest.fn(async (cle: string, valeur: string) => void mockMagasin.set(cle, valeur)),
}));
jest.mock('expo-crypto', () => ({ getRandomBytes: (n: number) => new Uint8Array(n).fill(171) }));
jest.mock('expo-sqlite', () => ({
  openDatabaseAsync: jest.fn(async () => ({
    execAsync: jest.fn(async (sql: string) => void mockOrdres.push(sql)),
    runAsync: jest.fn(async (sql: string) => void mockOrdres.push(sql)),
    getFirstAsync: jest.fn(async (sql: string) => {
      mockOrdres.push(sql);
      return null;
    }),
  })),
}));

import * as SecureStore from 'expo-secure-store';
import { ecrire, lire } from '../src/baseLocale';

test('SEC-005 CA1 : clé de 256 bits dans le magasin sécurisé, appliquée en premier', async () => {
  await ecrire('essai', { a: 1 });
  await lire('essai');
  const cle = mockMagasin.get('innov.base.cle');
  expect(cle).toMatch(/^[0-9a-f]{64}$/);
  expect(SecureStore.setItemAsync).toHaveBeenCalledWith('innov.base.cle', cle, {
    keychainAccessible: 'ceDispositifSeulement',
  });
  // La clé est la toute première instruction : rien ne se lit ni ne s'écrit en clair.
  expect(mockOrdres[0]).toBe(`PRAGMA key = "x'${cle}'";`);
  expect(mockOrdres.slice(1).some((x) => x.startsWith('INSERT OR REPLACE'))).toBe(true);
});

describe('1.0.2 (NFR-014) : oubli, effacement et échec d’ouverture', () => {
  type Module = typeof import('../src/baseLocale');
  const charger = () => {
    let module: Module | undefined;
    jest.isolateModules(() => {
      module = jest.requireActual<Module>('../src/baseLocale');
    });
    return module!;
  };

  beforeEach(() => {
    mockOrdres.length = 0;
  });

  test('oublier retire une seule donnée', async () => {
    const { oublier } = charger();
    await oublier('planning.attente');
    expect(mockOrdres.at(-1)).toBe('DELETE FROM memoire WHERE cle = ?');
  });

  test('sans clé enregistrée, effacer n’ouvre pas de base : il n’y a rien à vider', async () => {
    mockMagasin.clear();
    const { effacer } = charger();
    await effacer();
    expect(mockOrdres).toEqual([]);
    expect(mockMagasin.size).toBe(0); // aucune clé tirée pour rien
  });

  test('avec une clé, effacer ouvre la base et la vide', async () => {
    mockMagasin.set('innov.base.cle', 'ab'.repeat(32));
    const { effacer } = charger();
    await effacer();
    expect(mockOrdres[0]).toBe(`PRAGMA key = "x'${'ab'.repeat(32)}'";`);
    expect(mockOrdres.at(-1)).toBe('DELETE FROM memoire;');
  });

  test('une ouverture ratée est retentée à l’appel suivant', async () => {
    const SQLite = jest.requireMock<{ openDatabaseAsync: jest.Mock }>('expo-sqlite');
    SQLite.openDatabaseAsync.mockRejectedValueOnce(new Error('disque plein'));
    const { lire: lireIsole } = charger();
    await expect(lireIsole('essai')).rejects.toThrow('disque plein');
    await expect(lireIsole('essai')).resolves.toBeNull();
  });
});
