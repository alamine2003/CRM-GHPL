import type { ClientApi, Semaine, Visite } from '@innov/api-client';
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import EcranSemaine from '../app/semaine';
import i18n from '../src/i18n';
import { ContexteSession, type Session } from '../src/session';

// 0.3.7 (PLN-015, RG-018) : le délégué modifie un planning approuvé depuis son téléphone.

const mockMemoire = new Map<string, { valeur: unknown; maj: string }>();
jest.mock('../src/baseLocale', () => ({
  lire: jest.fn(async (cle: string) => mockMemoire.get(cle) ?? null),
  ecrire: jest.fn(async (cle: string, valeur: unknown) =>
    mockMemoire.set(cle, { valeur, maj: '2026-10-12T08:00:00.000Z' }),
  ),
  oublier: jest.fn(async (cle: string) => mockMemoire.delete(cle)),
  effacer: jest.fn(async () => mockMemoire.clear()),
}));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'uuid-du-telephone' }));
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), navigate: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));
jest.mock('../src/Ecran', () => ({
  Ecran: ({ children }: { children: ReactNode }) => children,
}));
// Aujourd'hui : le mardi 13 octobre ; le lundi 12 est passé, donc verrouillé.
jest.mock('../src/semaineLocale', () => ({
  ...jest.requireActual('../src/semaineLocale'),
  jourIso: () => '2026-10-13',
}));

const VISITE: Visite = {
  id: 'v1',
  date: '2026-10-14',
  heure: '09:00',
  prospect: {
    id: 'p1',
    civilite: 'dr',
    prenom: 'Awa',
    nom: 'FICTIF',
    specialite_libelle: 'Cardiologie',
    type_libelle: 'Médecin',
    potentiel: 'A',
  },
  etablissement: { id: 'e1', nom: 'Clinique Fictive' },
  reseau: { id: 'r1', libelle: 'Cardio' },
  objectif: 'Vasculor',
  note: '',
  statut: 'prevue',
  manquants: [],
  passage: null,
  ordre: 1,
  debut_le: null,
  sans_gps: false,
  distance_debut_m: null,
};

const APPROUVEE: Semaine = {
  semaine: '2026-10-12',
  precedente: '2026-10-05',
  suivante: '2026-10-19',
  courante: true,
  fuseau: 'Africa/Dakar',
  jours: ['12', '13', '14', '15', '16'].map((j) => ({
    date: `2026-10-${j}`,
    ferie: null,
    planifiable: true,
  })),
  planning: {
    id: 'pl1',
    semaine: '2026-10-12',
    statut: 'approuve',
    cree_le: '',
    soumis_le: '2026-10-07T09:00:00Z',
    en_retard: false,
    echeance: '2026-10-08T18:00:00Z',
    decision: {
      numero: 1,
      decision: 'approuve',
      decide_le: '2026-10-08T10:00:00Z',
      par: 'Kossi FICTIF',
      mode: 'direct',
      commentaire: '',
      remarques: [],
    },
    numero_version: 1,
    motif_version: 'soumission',
    ferme: false,
    reouvert_le: null,
  },
  peut_creer: false,
  modifiable: false,
  visites: [VISITE, { ...VISITE, id: 'v0', date: '2026-10-12', prospect: null }],
  passages: [],
  activites: [],
  controles: null,
  kilometrage: null,
  reprenables: 0,
  fermee: false,
  demande_envoyee: false,
  reseaux: [{ id: 'r1', libelle: 'Cardio' }],
  approbation: { reference: 1, modifiable: true, en_attente: [], retraits: [], mineures: [] },
};

async function rendre(semaine: Semaine, modifier = jest.fn(async () => VISITE)) {
  const session = {
    etat: { statut: 'chargement' },
    client: {
      plannings: { semaine: jest.fn(async () => semaine) },
      visites: { modifier, retirer: jest.fn() },
      exercices: { duProspect: jest.fn(async () => []) },
    } as unknown as ClientApi,
  } as Session;
  await render(
    <ContexteSession.Provider value={session}>
      <EcranSemaine />
    </ContexteSession.Provider>,
  );
  return modifier;
}

beforeEach(async () => {
  mockMemoire.clear();
  await i18n.changeLanguage('fr');
});

test('PLN-015 CA1 : changer l’heure reste libre, le planning reste approuvé', async () => {
  const modifier = await rendre(APPROUVEE);
  expect(await screen.findByText(/Changer l'heure reste libre/)).toBeTruthy();
  // Une journée à venir propose encore l'ajout ; le lundi passé, non.
  expect(screen.getAllByText('Ajouter une visite')).toHaveLength(4);
  await fireEvent.press(screen.getByText('Dr Awa FICTIF'));
  expect(await screen.findByText(/Planning approuvé\. Changer l'heure/)).toBeTruthy();
  // Le lundi passé n'est plus proposé comme jour de la visite.
  expect(screen.queryByText('lun. 12')).toBeNull();
  fireEvent.changeText(screen.getByDisplayValue('09:00'), '10:30');
  expect(
    await screen.findByText("Seule l'heure change : le planning reste approuvé."),
  ).toBeTruthy();
  await fireEvent.press(screen.getByText('Enregistrer'));
  expect(modifier).toHaveBeenCalledWith('v1', expect.objectContaining({ heure: '10:30' }));
  expect(await screen.findByText('Heure changée : le planning reste approuvé.')).toBeTruthy();
});

test('PLN-015 CA2 : tout autre changement se dit soumis au superviseur', async () => {
  await rendre(APPROUVEE);
  await fireEvent.press(await screen.findByText('Dr Awa FICTIF'));
  fireEvent.changeText(await screen.findByDisplayValue('Vasculor'), 'Cardiolor');
  expect(await screen.findByText(/Ce changement sera soumis à votre superviseur/)).toBeTruthy();
  expect(screen.getByText('Soumettre la modification')).toBeTruthy();
  expect(screen.getByText('Retirer et soumettre')).toBeTruthy();
});

test('PLN-015 CA2 : pendant la décision, la visite concernée est « en attente »', async () => {
  await rendre({
    ...APPROUVEE,
    planning: { ...APPROUVEE.planning!, statut: 'soumis', numero_version: 2 },
    approbation: {
      reference: 1,
      modifiable: false,
      en_attente: ['v1'],
      retraits: [
        {
          id: 'v9',
          date: '2026-10-15',
          heure: '11:00',
          ordre: 1,
          prospect: { id: 'p9', nom: 'Moussa FICTIF' },
          etablissement: null,
          objectif: '',
          note: '',
          passage: null,
        },
      ],
      mineures: [],
    },
  });
  expect(await screen.findByText(/Modification soumise : elle attend la décision/)).toBeTruthy();
  expect(screen.getByText("En attente d'approbation")).toBeTruthy();
  expect(screen.getByText('Retrait en attente : jeu. 15 11:00 · Moussa FICTIF')).toBeTruthy();
  expect(screen.queryByText('Ajouter une visite')).toBeNull();
});
