import { type ClientApi, ErreurApi } from '@innov/api-client';
import { type Envoi, envoyerAttente, lireAttente, mettreEnAttente } from '../src/Brouillons';

// La base chiffrée (SQLCipher) n'existe que sur le téléphone : une mémoire la remplace ici.
const mockMemoire = new Map<string, { valeur: unknown; maj: string }>();
jest.mock('../src/baseLocale', () => ({
  lire: jest.fn(async (cle: string) => mockMemoire.get(cle) ?? null),
  ecrire: jest.fn(async (cle: string, valeur: unknown) =>
    mockMemoire.set(cle, { valeur, maj: '2026-10-26T08:00:00.000Z' }),
  ),
  oublier: jest.fn(async (cle: string) => mockMemoire.delete(cle)),
}));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'uuid-du-telephone' }));

const ajout = (id: string): Envoi => ({
  id,
  type: 'ajout_visite',
  planning: 'pl1',
  saisie: { id, date: '2026-10-27' },
  resume: `visite ${id}`,
});

beforeEach(() => mockMemoire.clear());

test('PLN-007 : un envoi mis en attente pendant un rejeu n’est pas perdu', async () => {
  await mettreEnAttente(ajout('a'));
  let liberer: () => void = () => undefined;
  const ajouterVisite = jest.fn(
    () =>
      new Promise((resolve) => {
        liberer = () => resolve({});
      }),
  );
  const client = { plannings: { ajouterVisite } } as unknown as ClientApi;
  const rejeu = envoyerAttente(client);
  await Promise.resolve();
  // Pendant que « a » part, « b » échoue faute de réseau et rejoint la file.
  await mettreEnAttente(ajout('b'));
  liberer();
  expect(await rejeu).toBe(1);
  expect((await lireAttente()).map((e) => e.id)).toEqual(['b']);
});

test('PLN-007 : deux rejeux simultanés n’envoient chaque visite qu’une fois', async () => {
  await mettreEnAttente(ajout('a'));
  const ajouterVisite = jest.fn(async () => ({}));
  const client = { plannings: { ajouterVisite } } as unknown as ClientApi;
  const [un, deux] = await Promise.all([envoyerAttente(client), envoyerAttente(client)]);
  expect([un, deux]).toEqual([1, 1]);
  expect(ajouterVisite).toHaveBeenCalledTimes(1);
  expect(await lireAttente()).toEqual([]);
});

test('un refus du serveur reste dans la file avec son message ; une panne arrête le rejeu', async () => {
  await mettreEnAttente(ajout('a'));
  await mettreEnAttente(ajout('b'));
  await mettreEnAttente(ajout('c'));
  const ajouterVisite = jest
    .fn()
    .mockRejectedValueOnce(new ErreurApi(400, 'jour_ferie', 'Ce jour est férié.'))
    .mockRejectedValueOnce(new TypeError('Network request failed'));
  const client = { plannings: { ajouterVisite } } as unknown as ClientApi;
  expect(await envoyerAttente(client)).toBe(0);
  expect(ajouterVisite).toHaveBeenCalledTimes(2);
  expect((await lireAttente()).map((e) => [e.id, e.erreur])).toEqual([
    ['a', 'Ce jour est férié.'],
    ['b', undefined],
    ['c', undefined],
  ]);
});
