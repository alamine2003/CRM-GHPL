import { type ClientApi, ErreurApi, type Rapport } from '@innov/api-client';
import { type Envoi, envoyerAttente, lireAttente, mettreEnAttente } from '../src/Brouillons';
import {
  garderFichier,
  garderSaisie,
  garderSoumission,
  lireBrouillonRapport,
  type SaisieLocale,
} from '../src/BrouillonRapport';
import * as FS from 'expo-file-system/legacy';

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
// Le système de fichiers du téléphone : seuls les appels comptent ici.
jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///documents/',
  makeDirectoryAsync: jest.fn(async () => undefined),
  copyAsync: jest.fn(async () => undefined),
  deleteAsync: jest.fn(async () => undefined),
}));

const ajout = (id: string): Envoi => ({
  id,
  type: 'ajout_visite',
  planning: 'pl1',
  saisie: { id, date: '2026-10-27' },
  resume: `visite ${id}`,
});

beforeEach(() => {
  mockMemoire.clear();
  jest.clearAllMocks();
});

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

// RPT-009 : la saisie du rapport, sa soumission et sa pièce, rejouées au retour du réseau.
const RAPPORT = { id: 'r1', visite: 'v1', statut: 'brouillon' } as unknown as Rapport;
const SAISIE = { resume: 'Bon accueil', presentations: [] } as unknown as SaisieLocale;

test('RPT-009 : saisie, soumission puis pièce partent dans l’ordre, une fois, avec l’heure du geste', async () => {
  const appels: string[] = [];
  const enregistrerRapport = jest.fn(async (visite: string) => {
    appels.push(`enregistrer ${visite}`);
    return RAPPORT;
  });
  const soumettreRapport = jest.fn(async (visite: string, soumisLe: string) => {
    appels.push(`soumettre ${visite} ${soumisLe}`);
    return RAPPORT;
  });
  const joindrePiece = jest.fn(async (visite: string, piece: { id: string }) => {
    appels.push(`joindre ${visite} ${piece.id}`);
    return {};
  });
  const client = {
    visites: { enregistrerRapport, soumettreRapport, joindrePiece },
  } as unknown as ClientApi;

  // Sans réseau : une saisie, puis la soumission à 18 h 05, puis un document choisi.
  await garderSaisie('v1', RAPPORT, SAISIE);
  await mettreEnAttente({ id: 'e1', type: 'brouillon_rapport', visite: 'v1', resume: 'rapport' });
  await garderSoumission('v1', RAPPORT, SAISIE, '2026-10-26T18:05:00.000Z');
  await mettreEnAttente({
    id: 'e2',
    type: 'soumission_rapport',
    visite: 'v1',
    soumis_le: '2026-10-26T18:05:00.000Z',
    resume: 'soumission',
  });
  await mettreEnAttente({
    id: 'e3',
    type: 'piece_jointe',
    visite: 'v1',
    saisie: {
      id: 'p1',
      uri: 'file:///cache/ordonnance.pdf',
      nom: 'ordonnance.pdf',
      type_mime: 'application/pdf',
      taille: 1200,
      prise_le: '2026-10-26T18:06:00.000Z',
    },
    resume: 'pièce',
  });

  expect(await envoyerAttente(client)).toBe(3);
  expect(appels).toEqual([
    'enregistrer v1',
    'soumettre v1 2026-10-26T18:05:00.000Z',
    'joindre v1 p1',
  ]);
  expect(enregistrerRapport).toHaveBeenCalledWith('v1', SAISIE);
  expect(joindrePiece).toHaveBeenCalledWith(
    'v1',
    expect.objectContaining({
      id: 'p1',
      nom: 'ordonnance.pdf',
      prise_le: '2026-10-26T18:06:00.000Z',
    }),
  );
  expect(await lireAttente()).toEqual([]);
  expect(await lireBrouillonRapport('v1')).toBeNull();

  // Un second rejeu n'envoie plus rien.
  expect(await envoyerAttente(client)).toBe(0);
  expect(appels).toHaveLength(3);
});

test('RPT-009 : la pièce en attente est copiée dans pieces-en-attente/, puis effacée après l’envoi', async () => {
  const gardee = await garderFichier('file:///cache/DocumentPicker/Scan.PDF', 'p2');
  expect(gardee).toBe('file:///documents/pieces-en-attente/p2.pdf');
  expect(FS.makeDirectoryAsync).toHaveBeenCalledWith('file:///documents/pieces-en-attente/', {
    intermediates: true,
  });
  expect(FS.copyAsync).toHaveBeenCalledWith({
    from: 'file:///cache/DocumentPicker/Scan.PDF',
    to: 'file:///documents/pieces-en-attente/p2.pdf',
  });
  expect(FS.deleteAsync).not.toHaveBeenCalled();

  await mettreEnAttente({
    id: 'e4',
    type: 'piece_jointe',
    visite: 'v1',
    saisie: {
      id: 'p2',
      uri: gardee,
      nom: 'Scan.PDF',
      type_mime: 'application/pdf',
      taille: 800,
      prise_le: '2026-10-26T18:10:00.000Z',
    },
    resume: 'pièce',
  });
  const joindrePiece = jest.fn(async () => ({}));
  const client = { visites: { joindrePiece } } as unknown as ClientApi;
  expect(await envoyerAttente(client)).toBe(1);
  expect(joindrePiece).toHaveBeenCalledWith(
    'v1',
    expect.objectContaining({
      fichier: { uri: gardee, name: 'Scan.PDF', type: 'application/pdf' },
    }),
  );
  expect(FS.deleteAsync).toHaveBeenCalledWith(gardee, { idempotent: true });
});
