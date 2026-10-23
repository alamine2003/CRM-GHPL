import type { ClientApi, Semaine } from '@innov/api-client';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import i18n from '../src/i18n';
import { PoserDepuisCible } from '../src/Pose';
import { ContexteSession, type Session } from '../src/session';

// PLN-005 CA1 (maquette 1.4.6) : sur la tablette, le jour se choisit à droite, avec ce que la
// pose fait à l'objectif de la journée.

jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn() }) }));
jest.mock('../src/baseLocale', () => ({
  lire: jest.fn(async () => null),
  ecrire: jest.fn(async () => undefined),
  effacer: jest.fn(async () => undefined),
}));
jest.mock('../src/disposition', () => ({ useTablette: () => true }));
jest.mock('../src/Ecran', () => ({
  Ecran: ({
    surTitre,
    enteteTablette,
    droite,
    children,
  }: {
    surTitre?: string;
    enteteTablette?: { action?: ReactNode };
    droite?: ReactNode;
    children: ReactNode;
  }) => {
    const { Text } = jest.requireActual('react-native');
    return (
      <>
        <Text>{surTitre}</Text>
        {enteteTablette?.action}
        {children}
        {droite}
      </>
    );
  },
}));

const jour = (date: string) => ({ date, planifiable: true, ferie: null });
const SEMAINE = {
  semaine: '2026-10-26',
  planning: { id: 'pl1' },
  jours: [jour('2026-10-26'), jour('2026-10-27'), jour('2026-10-28')],
  activites: [],
  visites: [
    { id: 'v1', date: '2026-10-27', prospect: { id: 'p1' } },
    { id: 'v2', date: '2026-10-27', prospect: { id: 'p3' } },
  ],
  controles: {
    objectifs: [{ date: '2026-10-27', min: 2, max: 3, visites: 2 }],
  },
} as unknown as Semaine;

const cible = (id: string, nom: string, potentiel: string, faites: number) => ({
  id: `c${id}`,
  frequence: 2,
  visites_cycle: faites,
  prospect: {
    id,
    civilite: 'dr',
    prenom: 'Awa',
    nom,
    type_libelle: 'Médecin',
    specialite_libelle: 'Cardiologie',
    potentiel,
    lieu_principal: { id: 'e1', libelle: 'Clinique FICTIVE' },
  },
});

test('PLN-005 CA1 : tablette — le jour, déjà prévues, après la pose, l’objectif', async () => {
  await i18n.changeLanguage('fr');
  const poser = jest.fn(async () => []);
  const surTermine = jest.fn();
  const session = {
    etat: { statut: 'chargement' },
    client: {
      ciblage: {
        mesListes: jest.fn(async () => [
          {
            poste: { id: 'po1', reseaux: [] },
            cibles: [cible('p1', 'PRÉVUE', 'A', 0), cible('p2', 'FICTIVE', 'B', 1)],
          },
        ]),
      },
      plannings: { poser },
    } as unknown as ClientApi,
  } as unknown as Session;
  await render(
    <ContexteSession.Provider value={session}>
      <PoserDepuisCible
        semaine={SEMAINE}
        jour="2026-10-27"
        surTermine={surTermine}
        surAnnuler={jest.fn()}
      />
    </ContexteSession.Provider>,
  );
  expect(await screen.findByText('Dr Awa FICTIVE')).toBeTruthy();
  expect(screen.getByText('Pas encore prévus · 1 prospect')).toBeTruthy();
  // Le cycle de chaque prospect, sur la tablette.
  expect(screen.getByText('1 / 2')).toBeTruthy();
  expect(screen.getByText('Déjà prévues')).toBeTruthy();
  expect(screen.getByText('Objectif de la journée : 2 à 3 visites.')).toBeTruthy();
  await fireEvent.press(screen.getByRole('checkbox', { name: /Dr Awa FICTIVE/ }));
  expect(
    screen.getByText('Objectif de la journée : 2 à 3 visites. Vous êtes à la limite haute.'),
  ).toBeTruthy();
  // Un autre jour : rien n'y est encore prévu.
  await fireEvent.press(screen.getByLabelText('mercredi 28'));
  await fireEvent.press(screen.getByText('Poser 1 visite le mercredi 28'));
  await waitFor(() =>
    expect(surTermine).toHaveBeenCalledWith(
      '1 visite posée le mercredi 28 : à compléter (heure, objectif).',
    ),
  );
  expect(poser).toHaveBeenCalledWith('pl1', '2026-10-28', ['p2']);
});
