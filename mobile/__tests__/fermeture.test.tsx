import type { ClientApi, Semaine } from '@innov/api-client';
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import EcranSemaine from '../app/semaine';
import i18n from '../src/i18n';
import { ContexteSession, type Session } from '../src/session';

// 0.3.9 (décision du 6 octobre 2026) : la semaine ferme le lundi 0 h ; le délégué demande à
// son superviseur d'en rouvrir la rédaction.

const mockMemoire = new Map<string, { valeur: unknown; maj: string }>();
jest.mock('../src/baseLocale', () => ({
  lire: jest.fn(async (cle: string) => mockMemoire.get(cle) ?? null),
  ecrire: jest.fn(async (cle: string, valeur: unknown) =>
    mockMemoire.set(cle, { valeur, maj: '2026-10-13T08:00:00.000Z' }),
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
jest.mock('../src/semaineLocale', () => ({
  ...jest.requireActual('../src/semaineLocale'),
  jourIso: () => '2026-10-13',
}));

const FERMEE: Semaine = {
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
  planning: null,
  peut_creer: false,
  modifiable: false,
  visites: [],
  passages: [],
  activites: [],
  controles: null,
  kilometrage: null,
  reprenables: 0,
  fermee: true,
  demande_envoyee: false,
  reseaux: [],
  approbation: null,
  conformite: [],
};

async function rendre(semaines: Semaine[]) {
  const semaine = jest.fn();
  for (const s of semaines) semaine.mockResolvedValueOnce(s);
  semaine.mockResolvedValue(semaines.at(-1));
  const demanderReouverture = jest.fn(async () => ({ destinataires: 1 }));
  const session = {
    etat: { statut: 'chargement' },
    client: { plannings: { semaine, demanderReouverture } } as unknown as ClientApi,
  } as Session;
  await render(
    <ContexteSession.Provider value={session}>
      <EcranSemaine />
    </ContexteSession.Provider>,
  );
  return demanderReouverture;
}

beforeEach(async () => {
  mockMemoire.clear();
  await i18n.changeLanguage('fr');
});

test('semaine fermée sans planning : le délégué demande la réouverture, une fois', async () => {
  const demander = await rendre([FERMEE, { ...FERMEE, demande_envoyee: true }]);
  expect(await screen.findByText(/elle est fermée/)).toBeTruthy();
  expect(screen.queryByText('Préparer cette semaine')).toBeNull();
  await fireEvent.press(screen.getByText('Demander la réouverture'));
  expect(demander).toHaveBeenCalledWith('2026-10-12');
  expect(await screen.findByText('Demande envoyée à votre superviseur.')).toBeTruthy();
  expect(await screen.findByText(/vous serez prévenu/)).toBeTruthy();
  expect(screen.queryByText('Demander la réouverture')).toBeNull();
});

test('planning fermé en préparation : rien ne se modifie, la demande reste possible', async () => {
  await rendre([
    {
      ...FERMEE,
      planning: {
        id: 'pl1',
        semaine: '2026-10-12',
        statut: 'brouillon',
        cree_le: '',
        soumis_le: null,
        en_retard: false,
        echeance: '2026-10-12T00:00:00Z',
        decision: null,
        numero_version: null,
        motif_version: null,
        ferme: true,
        reouvert_le: null,
      },
    },
  ]);
  expect(await screen.findByText(/elle est fermée/)).toBeTruthy();
  expect(screen.getByText('Demander la réouverture')).toBeTruthy();
  expect(screen.queryByText('Soumettre le planning')).toBeNull();
  expect(screen.queryByText('Ajouter une visite')).toBeNull();
});

test('rouvert par le superviseur : la réouverture se lit, la soumission sera en retard', async () => {
  await rendre([
    {
      ...FERMEE,
      fermee: false,
      modifiable: true,
      planning: {
        id: 'pl1',
        semaine: '2026-10-12',
        statut: 'brouillon',
        cree_le: '',
        soumis_le: null,
        en_retard: false,
        echeance: '2026-10-12T00:00:00Z',
        decision: null,
        numero_version: null,
        motif_version: null,
        ferme: false,
        reouvert_le: '2026-10-13T09:30:00Z',
      },
    },
  ]);
  expect(await screen.findByText(/Rédaction rouverte le mardi 13 octobre/)).toBeTruthy();
  expect(screen.queryByText(/elle est fermée/)).toBeNull();
});

test('validé, le planning ne se modifie plus dès le lundi 0 h (RG-018)', async () => {
  await rendre([
    {
      ...FERMEE,
      fermee: false,
      planning: {
        id: 'pl1',
        semaine: '2026-10-12',
        statut: 'approuve',
        cree_le: '',
        soumis_le: '2026-10-09T09:00:00Z',
        en_retard: false,
        echeance: '2026-10-12T00:00:00Z',
        decision: null,
        numero_version: 1,
        motif_version: 'soumission',
        ferme: false,
        reouvert_le: null,
      },
      approbation: { reference: 1, modifiable: false, en_attente: [], retraits: [], mineures: [] },
    },
  ]);
  expect(
    await screen.findByText('La semaine a commencé : ce planning validé ne se modifie plus.'),
  ).toBeTruthy();
  expect(screen.queryByText('Ajouter une visite')).toBeNull();
});
