import type { ClientApi, ListeCible, Proposition } from '@innov/api-client';
import { fireEvent, render, screen } from '@testing-library/react-native';
import i18n from '../src/i18n';
import { MesPropositions } from '../src/MesPropositions';
import { normaliserNom, ressemble, ressemblantesLocales } from '../src/ressemblances';
import { ContexteSession, type Session } from '../src/session';

jest.mock('../src/baseLocale', () => ({
  lire: jest.fn(async () => null),
  ecrire: jest.fn(async () => undefined),
  effacer: jest.fn(async () => undefined),
}));

const PROSPECT = {
  id: 'p1',
  civilite: 'dr' as const,
  prenom: 'Aïssatou',
  nom: 'NDIAYE',
  type_libelle: 'Médecin',
  specialite_libelle: 'Cardiologie',
  potentiel: 'A' as const,
  statut: 'actif' as const,
  lieu_principal: { id: 'e1', libelle: 'Clinique du Cap' },
  secteur: 'Plateau',
};
const LISTES = [
  {
    poste: { id: 'po1' },
    cibles: [
      { id: 'c1', prospect: PROSPECT },
      { id: 'c2', prospect: { ...PROSPECT, id: 'p2', prenom: 'Moussa', nom: 'DIOP' } },
    ],
  },
] as unknown as ListeCible[];

beforeEach(async () => {
  await i18n.changeLanguage('fr');
});

test('PRP-007 CA2 : sans réseau, les fiches du téléphone servent aux suggestions', () => {
  expect(normaliserNom('Dr', "Aïssatou N'Diaye")).toBe('aissatou ndiaye');
  // Faute de frappe, accent, titre, saisie partielle.
  expect(ressemblantesLocales(LISTES, 'Ndiay', 'Aissatou').map((p) => p.id)).toEqual(['p1']);
  expect(ressemblantesLocales(LISTES, 'Dr NDIAYE').map((p) => p.id)).toEqual(['p1']);
  expect(ressemblantesLocales(LISTES, 'ndiaie').map((p) => p.id)).toEqual(['p1']);
  expect(ressemblantesLocales(LISTES, 'Fall')).toEqual([]);
  expect(ressemble('di', 'moussa diop')).toBe(true);
});

test('PRP-014 CA2 : le délégué voit les décisions sur ses propositions', async () => {
  const decision = {
    id: 'pr1',
    prospect: { ...PROSPECT },
    etablissement: null,
    statut: 'acceptee',
    vue_le: null,
  } as unknown as Proposition;
  const propositions = {
    liste: jest.fn(async () => [decision, { ...decision, id: 'pr2', statut: 'en_attente' }]),
    marquerVues: jest.fn(async () => undefined),
  };
  const session = {
    etat: { statut: 'connecte', perimetre: { actions: ['propositions.creer'] } },
    client: { propositions } as unknown as ClientApi,
  } as unknown as Session;
  await render(
    <ContexteSession.Provider value={session}>
      <MesPropositions />
    </ContexteSession.Provider>,
  );
  expect(await screen.findByText('1 décision sur vos propositions')).toBeTruthy();
  expect(screen.getByText('Acceptée')).toBeTruthy();
  await fireEvent.press(screen.getByText('Vu'));
  expect(propositions.marquerVues).toHaveBeenCalled();
  expect(screen.queryByText('Acceptée')).toBeNull();
});
