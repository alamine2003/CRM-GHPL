/**
 * 1.0.2 (NFR-014) : la file d'envoi rejoue chaque sorte d'envoi saisi sans réseau, et le délégué
 * peut retirer un envoi, abandonner sa saisie au profit du serveur ou garder la sienne (OFF-003,
 * OFF-004, RG-052, RG-053).
 */
import type { ClientApi, Rapport } from '@innov/api-client';
import {
  abandonnerEnvoi,
  abandonnerRapportLocal,
  type Envoi,
  envoyerAttente,
  garderMaVersion,
  lireAttente,
  mettreEnAttente,
  retirerBrouillonsRapport,
} from '../src/Brouillons';
import { lireBrouillonRapport } from '../src/BrouillonRapport';

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
jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///documents/',
  makeDirectoryAsync: jest.fn(async () => undefined),
  copyAsync: jest.fn(async () => undefined),
  deleteAsync: jest.fn(async () => undefined),
}));

beforeEach(() => {
  mockMemoire.clear();
  jest.clearAllMocks();
});

const base = { resume: 'envoi' };
const ENVOIS = [
  { ...base, id: '1', type: 'ajout_visite', planning: 'pl1', saisie: { id: 'v1' } },
  { ...base, id: '2', type: 'modif_visite', visite: 'v1', saisie: { avant: {}, apres: {} } },
  { ...base, id: '3', type: 'demarrer_visite', visite: 'v1', saisie: { debut_le: 'd' } },
  { ...base, id: '4', type: 'terminer_visite', visite: 'v1', saisie: { fin_le: 'f' } },
  { ...base, id: '5', type: 'imprevue_visite', visite: 'v2', saisie: { id: 'v2' } },
  { ...base, id: '6', type: 'reporter_visite', visite: 'v3', saisie: { id: 'v4' } },
  { ...base, id: '7', type: 'annonce_piece', visite: 'v1', saisie: { id: 'p1', nom: 'a.pdf' } },
  {
    ...base,
    id: '8',
    type: 'piece_jointe',
    visite: 'v1',
    saisie: {
      id: 'p1',
      uri: 'file:///documents/pieces/a.pdf',
      nom: 'a.pdf',
      type_mime: 'application/pdf',
      taille: 10,
      prise_le: 'p',
    },
  },
  { ...base, id: '9', type: 'brouillon_rapport', visite: 'v5' },
  { ...base, id: '10', type: 'soumission_rapport', visite: 'v6', soumis_le: 's' },
  { ...base, id: '11', type: 'proposition', saisie: { id: 'pr1' } },
  { ...base, id: '12', type: 'indisponibilite', saisie: { id: 'i1', periode: 'journee' } },
  { ...base, id: '13', type: 'ajout_activite', planning: 'pl1', saisie: { id: 'a1' } },
  { ...base, id: '14', type: 'absent_visite', visite: 'v7', saisie: { motif: 'm' } },
  { ...base, id: '15', type: 'annuler_visite', visite: 'v8', saisie: { motif: 'm' } },
  { ...base, id: '16', type: 'non_realisee_visite', visite: 'v9', saisie: { motif: 'm' } },
] as unknown as Envoi[];

function fauxClient() {
  const ok = () => jest.fn(async () => ({}));
  return {
    plannings: {
      ajouterVisite: ok(),
      declarerIndisponibilite: ok(),
      declarerActivite: ok(),
    },
    visites: {
      modifier: ok(),
      demarrer: ok(),
      terminer: ok(),
      imprevue: ok(),
      reporter: ok(),
      annoncerPiece: ok(),
      joindrePiece: ok(),
      enregistrerRapport: ok(),
      soumettreRapport: ok(),
      absent: ok(),
      annuler: ok(),
      nonRealisee: ok(),
    },
    propositions: { creer: ok() },
  };
}

test('OFF-003 : chaque sorte d’envoi part vers sa route, les fichiers en dernier', async () => {
  for (const envoi of ENVOIS) await mettreEnAttente(envoi);
  const client = fauxClient();
  const ordre: string[] = [];
  for (const groupe of Object.values(client))
    for (const [nom, f] of Object.entries(groupe as Record<string, jest.Mock>))
      f.mockImplementation(async () => void ordre.push(nom));

  expect(await envoyerAttente(client as unknown as ClientApi)).toBe(ENVOIS.length);
  expect(await lireAttente()).toEqual([]);

  const v = client.visites;
  expect(client.plannings.ajouterVisite).toHaveBeenCalledWith('pl1', { id: 'v1' });
  expect(v.modifier).toHaveBeenCalledWith('v1', { avant: {}, apres: {} });
  expect(v.demarrer).toHaveBeenCalledWith('v1', { debut_le: 'd' });
  expect(v.terminer).toHaveBeenCalledWith('v1', { fin_le: 'f' });
  expect(v.imprevue).toHaveBeenCalledWith({ id: 'v2' });
  expect(v.reporter).toHaveBeenCalledWith('v3', { id: 'v4' });
  expect(v.annoncerPiece).toHaveBeenCalledWith('v1', { id: 'p1', nom: 'a.pdf' });
  // Le fichier reste à son adresse locale ; React Native le lit lui-même.
  expect(v.joindrePiece).toHaveBeenCalledWith('v1', {
    id: 'p1',
    nom: 'a.pdf',
    prise_le: 'p',
    fichier: { uri: 'file:///documents/pieces/a.pdf', name: 'a.pdf', type: 'application/pdf' },
  });
  // Sans saisie locale, le rappel d'envoi du brouillon ne renvoie rien ; la soumission part.
  expect(v.enregistrerRapport).not.toHaveBeenCalled();
  expect(v.soumettreRapport).toHaveBeenCalledWith('v6', 's');
  expect(client.propositions.creer).toHaveBeenCalledWith({ id: 'pr1' });
  expect(client.plannings.declarerIndisponibilite).toHaveBeenCalledWith({
    id: 'i1',
    periode: 'journee',
  });
  expect(client.plannings.declarerActivite).toHaveBeenCalledWith('pl1', { id: 'a1' });
  expect(v.absent).toHaveBeenCalledWith('v7', { motif: 'm' });
  expect(v.annuler).toHaveBeenCalledWith('v8', { motif: 'm' });
  expect(v.nonRealisee).toHaveBeenCalledWith('v9', { motif: 'm' });
  // OFF-005 : le document part après tout le reste, même mis en file avant.
  expect(ordre.at(-1)).toBe('joindrePiece');
});

test('le délégué retire un envoi, ou les rappels d’un rapport arrivé au serveur', async () => {
  for (const envoi of ENVOIS) await mettreEnAttente(envoi);
  await abandonnerEnvoi('1');
  await retirerBrouillonsRapport('v5');
  const restants = (await lireAttente()).map((e) => e.id);
  expect(restants).not.toContain('1');
  expect(restants).not.toContain('9');
  // La soumission du même rapport, elle, reste : seul le rappel du brouillon est retiré.
  expect(restants).toContain('10');
});

test('OFF-004 : abandonner sa saisie retire le brouillon et la soumission du rapport', async () => {
  for (const envoi of ENVOIS) await mettreEnAttente(envoi);
  await mettreEnAttente({ ...base, id: '17', type: 'brouillon_rapport', visite: 'v6' } as Envoi);
  const rapport = { id: 'r6', version: 3 } as unknown as Rapport;
  await abandonnerRapportLocal('v6', rapport);
  const restants = (await lireAttente()).map((e) => e.id);
  expect(restants).not.toContain('10');
  expect(restants).not.toContain('17');
  expect(restants).toContain('9');
  // La version du serveur devient celle du téléphone, sans saisie en cours.
  const local = await lireBrouillonRapport('v6');
  expect(local?.rapport).toEqual(rapport);
  expect(local?.saisie).toBeNull();
});

test('RG-053 : « Garder ma version » repart des valeurs montrées par le serveur', async () => {
  const conflit = {
    ...base,
    id: 'c1',
    type: 'modif_visite',
    visite: 'v1',
    saisie: { avant: { heure: '09:00', ordre: 1 }, apres: { heure: '10:00' } },
    erreur: 'La visite a changé ailleurs.',
    conflit: { serveur: { heure: '09:30' } },
  } as unknown as Envoi;
  const autre = { ...base, id: 'c2', type: 'proposition', saisie: { id: 'pr' } } as Envoi;
  await mettreEnAttente(conflit);
  await mettreEnAttente(autre);
  await garderMaVersion('c1');
  await garderMaVersion('c2'); // sans conflit : rien ne change
  const [garde, intact] = await lireAttente();
  expect(garde).toMatchObject({
    id: 'c1',
    saisie: { avant: { heure: '09:30', ordre: 1 }, apres: { heure: '10:00' } },
  });
  expect(garde).not.toHaveProperty('conflit', expect.anything());
  expect(garde).not.toHaveProperty('erreur', expect.anything());
  expect(intact).toEqual(autre);
});
