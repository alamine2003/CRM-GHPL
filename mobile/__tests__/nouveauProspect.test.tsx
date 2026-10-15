import type { ClientApi } from '@innov/api-client';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import i18n from '../src/i18n';
import { EcranNouveauProspect } from '../src/NouveauProspect';
import { EcranNouvelEtablissement } from '../src/NouvelEtablissement';
import { ContexteSession, type Session } from '../src/session';

// PRP-006, PRP-007, PRP-008 (maquette 1.4.4) : le délégué crée une fiche, voit celles qui lui
// ressemblent, choisit son établissement d'exercice ; la fiche créée s'ouvre.

const mockRemplacer = jest.fn();
const mockPousser = jest.fn();
const mockRetour = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockRemplacer, push: mockPousser, back: mockRetour }),
}));
jest.mock('expo-location', () => ({}));
jest.mock('../src/baseLocale', () => ({
  lire: jest.fn(async () => null),
  ecrire: jest.fn(async () => undefined),
  effacer: jest.fn(async () => undefined),
}));
const mockTablette = { valeur: false };
jest.mock('../src/disposition', () => ({ useTablette: () => mockTablette.valeur }));
jest.mock('../src/Ecran', () => ({
  Ecran: ({
    children,
    pied,
    droite,
  }: {
    children: ReactNode;
    pied?: ReactNode;
    droite?: ReactNode;
  }) => (
    <>
      {children}
      {droite}
      {pied}
    </>
  ),
}));

const VALEURS = [
  { id: 't1', liste: 'type_prospect', libelle: 'Médecin', parent: null, archive: false },
  { id: 't2', liste: 'type_prospect', libelle: 'Pharmacien', parent: null, archive: false },
  { id: 'sp1', liste: 'specialite', libelle: 'Cardiologie', parent: 't1', archive: false },
];

function rendre(client: Partial<ClientApi>, element = <EcranNouveauProspect />) {
  const session = {
    etat: {
      statut: 'connecte',
      perimetre: { actions: ['prospects.creer'], pays_actif: { code: 'SN', nom: 'Sénégal' } },
    },
    client: client as ClientApi,
  } as unknown as Session;
  return render(<ContexteSession.Provider value={session}>{element}</ContexteSession.Provider>);
}

beforeEach(async () => {
  await i18n.changeLanguage('fr');
  mockRemplacer.mockClear();
  mockPousser.mockClear();
  mockTablette.valeur = false;
});

test('PRP-007 : les fiches ressemblantes ; PRP-006 : la fiche créée avec son lieu', async () => {
  const creer = jest.fn(async () => ({ id: 'p9', doublon: 'probable' }));
  const ajouter = jest.fn(async () => ({}));
  await rendre({
    referentiel: { valeurs: jest.fn(async () => VALEURS) },
    prospects: {
      creer,
      ressemblants: jest.fn(async () => [
        {
          prospect: {
            id: 'p1',
            civilite: 'dr',
            prenom: 'Awa',
            nom: 'NDIAYE',
            type_libelle: 'Médecin',
            specialite_libelle: 'Cardiologie',
            potentiel: 'A',
          },
          lieu_principal: 'Clinique du Plateau',
        },
      ]),
    },
    etablissements: {
      liste: jest.fn(async () => ({
        total: 1,
        resultats: [
          {
            id: 'e1',
            nom: 'Clinique du Plateau',
            type_libelle: 'Clinique',
            secteur: { id: 's1', libelle: 'Plateau' },
            localite: null,
          },
        ],
      })),
    },
    exercices: { ajouter },
  } as unknown as Partial<ClientApi>);
  // Le premier type du pays est proposé d'office ; « Créer » attend le nom.
  expect(await screen.findByText('Médecin')).toBeTruthy();
  expect(screen.getByPlaceholderText('+221')).toBeTruthy();
  await fireEvent.changeText(screen.getByLabelText('Nom'), 'Ndiaye');
  await fireEvent.changeText(screen.getByLabelText('Prénom'), 'Awa');
  expect(await screen.findByText('Fiches ressemblantes')).toBeTruthy();
  expect(await screen.findByText('Dr Awa NDIAYE')).toBeTruthy();
  expect(screen.getByText('Cardiologie · Clinique du Plateau')).toBeTruthy();
  // L'établissement d'exercice : cherché puis choisi.
  await fireEvent.changeText(screen.getByLabelText('Établissement d’exercice'), 'plateau');
  await fireEvent.press(await screen.findByText('Clinique · Plateau'));
  expect(screen.getByText('Changer')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Potentiel A'));
  await fireEvent.press(screen.getByText('Créer la fiche'));
  await waitFor(() => expect(mockRemplacer).toHaveBeenCalledWith('/fiche/p9'));
  expect(creer).toHaveBeenCalledWith(
    expect.objectContaining({ nom: 'Ndiaye', prenom: 'Awa', type: 't1', potentiel: 'A' }),
  );
  expect(ajouter).toHaveBeenCalledWith('p9', { etablissement: 'e1', principal: true });
});

test('PRP-008 : une saisie rattachée à une fiche existante ne touche pas ses lieux', async () => {
  const ajouter = jest.fn(async () => ({}));
  await rendre({
    referentiel: { valeurs: jest.fn(async () => VALEURS) },
    prospects: {
      creer: jest.fn(async () => ({ id: 'p1', doublon: 'certain' })),
      ressemblants: jest.fn(async () => []),
    },
    etablissements: {
      liste: jest.fn(async () => ({
        total: 1,
        resultats: [
          {
            id: 'e1',
            nom: 'Clinique du Plateau',
            type_libelle: 'Clinique',
            secteur: { id: 's1', libelle: 'Plateau' },
            localite: null,
          },
        ],
      })),
    },
    exercices: { ajouter },
  } as unknown as Partial<ClientApi>);
  await fireEvent.changeText(await screen.findByLabelText('Nom'), 'Ndiaye');
  await fireEvent.changeText(screen.getByLabelText('Établissement d’exercice'), 'plateau');
  await fireEvent.press(await screen.findByText('Clinique · Plateau'));
  await fireEvent.press(screen.getByText('Créer la fiche'));
  await waitFor(() => expect(mockRemplacer).toHaveBeenCalledWith('/fiche/p1'));
  expect(ajouter).not.toHaveBeenCalled();
});

test('PRP-003 : l’établissement créé depuis « Nouveau prospect » y revient, choisi', async () => {
  const creer = jest.fn(async () => ({
    id: 'e7',
    nom: 'Cabinet FICTIF',
    type_libelle: 'Cabinet',
    secteur: { id: 's1', libelle: 'Plateau' },
    localite: null,
  }));
  await rendre(
    {
      referentiel: {
        valeurs: jest.fn(async (liste?: string) =>
          liste === 'type_etablissement'
            ? [{ id: 'c1', liste, libelle: 'Cabinet', parent: null, archive: false }]
            : VALEURS,
        ),
      },
      prospects: { ressemblants: jest.fn(async () => []) },
      etablissements: {
        creer,
        secteurs: jest.fn(async () => [
          { id: 's1', libelle: 'Plateau', zone: 'Dakar', localites: [] },
        ]),
        liste: jest.fn(async () => ({ total: 0, resultats: [] })),
      },
    } as unknown as Partial<ClientApi>,
    <>
      <EcranNouveauProspect />
      <EcranNouvelEtablissement pour="prospect" />
    </>,
  );
  await fireEvent.press(await screen.findByText('Ajouter un établissement'));
  expect(mockPousser).toHaveBeenCalledWith('/etablissement/nouveau?pour=prospect');
  await fireEvent.changeText(screen.getByLabelText("Nom de l'établissement"), 'Cabinet FICTIF');
  await fireEvent.press(screen.getByLabelText("Type d'établissement : Choisir…"));
  await fireEvent.press(await screen.findByText('Cabinet'));
  await fireEvent.press(screen.getByLabelText('Secteur : Choisir…'));
  await fireEvent.press(await screen.findByText('Plateau'));
  await fireEvent.press(screen.getByText("Créer l'établissement"));
  await waitFor(() => expect(mockRetour).toHaveBeenCalled());
  expect(creer).toHaveBeenCalledWith(
    expect.objectContaining({ nom: 'Cabinet FICTIF', type: 'c1', secteur: 's1' }),
  );
  // Revenu sur « Nouveau prospect », l'établissement est choisi.
  expect(await screen.findByText('Changer')).toBeTruthy();
  expect(screen.getByText('Cabinet · Plateau')).toBeTruthy();
});
