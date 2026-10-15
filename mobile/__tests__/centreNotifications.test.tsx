import type { ClientApi, Notification } from '@innov/api-client';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { EcranNotifications } from '../src/CentreNotifications';
import i18n from '../src/i18n';
import { ContexteSession, type Session } from '../src/session';

const mockPousser = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPousser }) }));
let mockTablette = false;
jest.mock('../src/disposition', () => ({ useTablette: () => mockTablette }));
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
        {mockTablette && enteteTablette?.action}
        {children}
        {droite}
      </>
    );
  },
}));

const RAPPEL: Notification = {
  id: 'n1',
  type: 'rappel_planning',
  donnees: { semaine: '2026-10-19', numero_semaine: 43, echeance: '2026-10-15T18:00:00Z' },
  cree_le: '2026-10-14T09:00:00Z',
  lue_le: null,
};
const APPROUVE: Notification = {
  id: 'n2',
  type: 'planning_approuve',
  donnees: { semaine: '2026-10-12', numero_semaine: 42 },
  cree_le: '2026-10-08T10:00:00Z',
  lue_le: '2026-10-08T11:00:00Z',
};

function session(lue: jest.Mock, extra: object = {}) {
  return {
    etat: {
      statut: 'connecte',
      perimetre: { pays_actif: { code: 'SN', nom: 'Sénégal', fuseau: 'Africa/Dakar' } },
    },
    client: {
      notifications: {
        centre: jest.fn(async () => ({ non_lues: 1, notifications: [RAPPEL, APPROUVE] })),
        lue,
        toutesLues: jest.fn(),
      },
      ...extra,
    } as unknown as ClientApi,
  } as unknown as Session;
}

beforeEach(async () => {
  mockTablette = false;
  await i18n.changeLanguage('fr');
});

test('NOT-001 : le centre liste lues et non lues ; une notification ouvre sa semaine', async () => {
  const lue = jest.fn(async () => RAPPEL);
  await render(
    <ContexteSession.Provider value={session(lue)}>
      <EcranNotifications />
    </ContexteSession.Provider>,
  );
  // NOT-006 CA1 : l'échéance à l'heure du pays.
  const rappel = await screen.findByText(
    "Votre planning de la semaine 43 n'est pas encore soumis : à soumettre avant le jeudi 15 octobre à 18:00",
  );
  expect(screen.getByText('Votre planning de la semaine 42 est approuvé')).toBeTruthy();
  expect(screen.getAllByText(/Non lue/)).toHaveLength(1);
  // Maquette 1.4.9 : le compte sous le titre, la date puis l'heure.
  expect(screen.getByText('1 non lue')).toBeTruthy();
  expect(screen.getByText('mer. 14 octobre, 09:00 · Non lue')).toBeTruthy();
  expect(screen.getByText('Tout marquer comme lu')).toBeTruthy();
  fireEvent.press(rappel);
  await waitFor(() => expect(lue).toHaveBeenCalledWith('n1'));
  expect(mockPousser).toHaveBeenCalledWith({
    pathname: '/semaine',
    params: { jour: '2026-10-19' },
  });
});

test('NOT-001, NOT-005 : tablette — groupes par semaine et réglages à droite', async () => {
  mockTablette = true;
  jest.useFakeTimers({ now: new Date('2026-10-15T12:00:00Z'), doNotFake: ['setImmediate'] });
  try {
    const lire = jest.fn(async () => [
      { type: 'planning_approuve', obligatoire: true, push: true },
      { type: 'remplacement_attribue', obligatoire: false, push: false },
    ]);
    await render(
      <ContexteSession.Provider
        value={session(jest.fn(), { preferences: { lire, changer: jest.fn() } })}
      >
        <EcranNotifications />
      </ContexteSession.Provider>,
    );
    expect(await screen.findByText('Cette semaine')).toBeTruthy();
    expect(screen.getByText('La semaine dernière')).toBeTruthy();
    expect(await screen.findByText('Notifications sur cette tablette')).toBeTruthy();
    expect(screen.getByLabelText('Remplacement attribué').props.accessibilityState.checked).toBe(
      false,
    );
    expect(screen.getByText('Obligatoire')).toBeTruthy();
  } finally {
    jest.useRealTimers();
  }
});
