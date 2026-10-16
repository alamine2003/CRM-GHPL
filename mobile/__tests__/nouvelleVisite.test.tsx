import type { ClientApi, Semaine, Visite } from '@innov/api-client';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import i18n from '../src/i18n';
import { ContexteSession, type Session } from '../src/session';
import { FormulaireVisite } from '../src/Visites';

// PLN-002 (maquette 1.5.6) : « Nouvelle visite » — un écran à part, tout peut se compléter plus
// tard ; sur la tablette, la journée à droite avec la nouvelle visite à sa place.

const mockMemoire = new Map<string, { valeur: unknown; maj: string }>();
jest.mock('../src/baseLocale', () => ({
  lire: jest.fn(async (cle: string) => mockMemoire.get(cle) ?? null),
  ecrire: jest.fn(async (cle: string, valeur: unknown) =>
    mockMemoire.set(cle, { valeur, maj: '2026-10-12T06:30:00.000Z' }),
  ),
  oublier: jest.fn(async (cle: string) => mockMemoire.delete(cle)),
  effacer: jest.fn(),
}));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn(), back: jest.fn() }) }));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'visite-1' }));
let mockTablette = false;
jest.mock('../src/disposition', () => ({ useTablette: () => mockTablette }));
jest.mock('../src/Ecran', () => ({
  Ecran: ({
    titre,
    surTitre,
    enteteTablette,
    pied,
    droite,
    children,
  }: {
    titre: string;
    surTitre?: string;
    enteteTablette?: { surTitre?: string; action?: ReactNode };
    pied?: ReactNode;
    droite?: ReactNode;
    children: ReactNode;
  }) => {
    const { Text } = jest.requireActual('react-native');
    return (
      <>
        <Text>{titre}</Text>
        <Text>{mockTablette ? enteteTablette?.surTitre : surTitre}</Text>
        {mockTablette && enteteTablette?.action}
        {children}
        {pied}
        {mockTablette && droite}
      </>
    );
  },
}));

const prospect = (id: string, nom: string, potentiel: string) => ({
  id,
  civilite: 'dr',
  prenom: '',
  nom,
  potentiel,
  specialite_libelle: 'Généraliste',
  type_libelle: 'Médecin',
});

const existante = (id: string, heure: string, nom: string, potentiel: string) =>
  ({
    id,
    date: '2026-10-13',
    heure,
    prospect: prospect(`p-${id}`, nom, potentiel),
    etablissement: null,
    reseau: null,
    objectif: '',
    note: '',
    manquants: [],
  }) as unknown as Visite;

const SEMAINE = {
  semaine: '2026-10-12',
  fuseau: 'UTC',
  planning: { id: 'pl1' },
  modifiable: true,
  approbation: null,
  activites: [],
  passages: [],
  reseaux: [{ id: 'r1', libelle: 'LEAP GYN' }],
  controles: { objectifs: [{ date: '2026-10-13', min: 6, max: 8 }] },
  jours: [
    { date: '2026-10-13', planifiable: true, ferie: null },
    { date: '2026-10-14', planifiable: true, ferie: null },
  ],
  visites: [
    existante('v1', '08:30', 'DIOP', 'B'),
    existante('v2', '10:00', 'SY', 'A'),
    existante('v3', '11:15', 'PORT', 'C'),
  ],
} as unknown as Semaine;

const termine = jest.fn();
const annule = jest.fn();

async function rendre(ajouterVisite = jest.fn(async () => ({}))) {
  const session = {
    etat: { statut: 'connecte' },
    client: {
      plannings: { ajouterVisite },
      ciblage: {
        mesListes: jest.fn(async () => [
          {
            cibles: [
              {
                prospect: {
                  ...prospect('p9', 'DIOP', 'B'),
                  prenom: 'Ousmane',
                  lieu_principal: null,
                },
              },
            ],
          },
        ]),
      },
      rapports: { visitesProposees: jest.fn(async () => []) },
      exercices: {
        duProspect: jest.fn(async () => [
          {
            actif: true,
            principal: true,
            etablissement: { id: 'e9', nom: 'Cabinet Grand Dakar' },
          },
        ]),
      },
    } as unknown as ClientApi,
  } as unknown as Session;
  await render(
    <ContexteSession.Provider value={session}>
      <FormulaireVisite
        semaine={SEMAINE}
        jour="2026-10-13"
        surTermine={termine}
        surAnnuler={annule}
      />
    </ContexteSession.Provider>,
  );
  return ajouterVisite;
}

beforeEach(async () => {
  mockTablette = false;
  mockMemoire.clear();
  termine.mockReset();
  annule.mockReset();
  await i18n.changeLanguage('fr');
});

test('téléphone : le jour, l’aide, puis le prospect, le lieu, l’heure et le réseau', async () => {
  const ajouterVisite = await rendre();
  expect(screen.getByText('Nouvelle visite')).toBeTruthy();
  expect(screen.getAllByText('Mardi 13 octobre').length).toBeGreaterThan(0);
  expect(screen.getByText(/Tout peut se compléter plus tard/)).toBeTruthy();
  await fireEvent.press(await screen.findByText('Dr Ousmane DIOP'));
  // Un seul lieu d'exercice et un seul réseau : ils se lisent, sans liste à ouvrir.
  expect(await screen.findByLabelText('Lieu : Cabinet Grand Dakar')).toBeTruthy();
  expect(screen.getByLabelText('Réseau : LEAP GYN')).toBeTruthy();
  expect(screen.getByLabelText('Dr Ousmane DIOP, Changer')).toBeTruthy();
  await fireEvent.changeText(screen.getByLabelText('Heure'), '9h30');
  await fireEvent.press(screen.getByText('Enregistrer'));
  await waitFor(() => expect(termine).toHaveBeenCalledWith('Visite ajoutée.'));
  expect(ajouterVisite).toHaveBeenCalledWith(
    'pl1',
    expect.objectContaining({
      id: 'visite-1',
      date: '2026-10-13',
      heure: '09:30',
      prospect: 'p9',
      etablissement: 'e9',
      reseau: 'r1',
    }),
  );
});

test('« Annuler » ferme l’écran sans rien envoyer', async () => {
  const ajouterVisite = await rendre();
  await fireEvent.press(screen.getByText('Annuler'));
  expect(annule).toHaveBeenCalled();
  expect(ajouterVisite).not.toHaveBeenCalled();
});

test('un jour de plus à choisir : le champ Jour se déplie', async () => {
  await rendre();
  await fireEvent.press(screen.getByLabelText('Jour : Mardi 13 octobre'));
  await fireEvent.press(screen.getByText('Mercredi 14 octobre'));
  expect(screen.getByLabelText('Jour : Mercredi 14 octobre')).toBeTruthy();
});

test('tablette : la journée à droite, la nouvelle visite à sa place et sans heure', async () => {
  mockTablette = true;
  await rendre();
  expect(screen.getByText('Mardi 13 octobre · Tout peut se compléter plus tard')).toBeTruthy();
  expect(screen.getByText('3 visites · objectif 6 à 8')).toBeTruthy();
  expect(screen.getByText('Dr DIOP')).toBeTruthy();
  expect(screen.getByText('Dr SY')).toBeTruthy();
  expect(screen.getByText(/Cette visite se placera dans la journée/)).toBeTruthy();
  await fireEvent.press(await screen.findByText('Dr Ousmane DIOP'));
  // Tablette : la spécialité accompagne le nom ; la nouvelle visite rejoint la journée.
  expect(await screen.findByLabelText('Dr Ousmane DIOP · Généraliste, Changer')).toBeTruthy();
  expect(screen.getByText('4 visites · objectif 6 à 8')).toBeTruthy();
  expect(screen.getByText('--:--')).toBeTruthy();
  expect(screen.getByText('Dr Ousmane DIOP (nouvelle)')).toBeTruthy();
  // L'heure donnée la place dans la journée.
  await fireEvent.changeText(screen.getByLabelText('Heure'), '9h30');
  expect(screen.getByText('09:30')).toBeTruthy();
});
