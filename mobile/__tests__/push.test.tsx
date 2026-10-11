/** NOT-002 (0.8.5) : adresse push donnée au serveur ; toucher la notification ouvre l'objet. */
import type { ClientApi } from '@innov/api-client';
import { render, waitFor } from '@testing-library/react-native';
import * as Notifications from 'expo-notifications';
import { destinationPush, Push } from '../src/Push';
import { ContexteSession, type Session } from '../src/session';

const mockPousser = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPousser }) }));
jest.mock('expo-constants', () => ({ expoConfig: { extra: { eas: { projectId: 'projet' } } } }));
const mockEcouteurs: ((r: unknown) => void)[] = [];
jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  requestPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  getExpoPushTokenAsync: jest.fn(async () => ({ data: 'ExponentPushToken[abcdefgh123]' })),
  getLastNotificationResponseAsync: jest.fn(async () => null),
  addNotificationResponseReceivedListener: jest.fn((f: (r: unknown) => void) => {
    mockEcouteurs.push(f);
    return { remove: jest.fn() };
  }),
}));

const reponse = (identifier: string, data: Record<string, string>) => ({
  notification: { request: { identifier, content: { data } } },
});

function rendre(statut: 'connecte' | 'anonyme' = 'connecte') {
  const client = {
    push: { enregistrer: jest.fn(async () => undefined) },
    notifications: { lue: jest.fn(async () => ({})) },
  };
  const session = { etat: { statut }, client: client as unknown as ClientApi } as Session;
  render(
    <ContexteSession.Provider value={session}>
      <Push />
    </ContexteSession.Provider>,
  );
  return client;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockEcouteurs.length = 0;
});

test('NOT-002 : connecté, le téléphone donne son adresse push au serveur', async () => {
  const client = rendre();
  await waitFor(() =>
    expect(client.push.enregistrer).toHaveBeenCalledWith('ExponentPushToken[abcdefgh123]'),
  );
  expect(Notifications.getExpoPushTokenAsync).toHaveBeenCalledWith({ projectId: 'projet' });
});

test('NOT-002 : refusée par la personne, aucune adresse ne part', async () => {
  jest
    .mocked(Notifications.requestPermissionsAsync)
    .mockResolvedValueOnce({ status: 'denied' } as never);
  const client = rendre();
  await waitFor(() => expect(Notifications.requestPermissionsAsync).toHaveBeenCalled());
  expect(client.push.enregistrer).not.toHaveBeenCalled();
});

test('NOT-002 CA1 : application fermée, le toucher ouvre le rapport à corriger', async () => {
  jest
    .mocked(Notifications.getLastNotificationResponseAsync)
    .mockResolvedValueOnce(
      reponse('p1', { notification: 'n1', type: 'correction_demandee', visite: 'v9' }) as never,
    );
  const client = rendre();
  await waitFor(() =>
    expect(mockPousser).toHaveBeenCalledWith({ pathname: '/rapport/[id]', params: { id: 'v9' } }),
  );
  expect(client.notifications.lue).toHaveBeenCalledWith('n1');
});

test('NOT-002 CA1 : application ouverte, le toucher ouvre la semaine, une seule fois', async () => {
  rendre();
  await waitFor(() => expect(mockEcouteurs).toHaveLength(1));
  const r = reponse('p2', { type: 'planning_approuve', semaine: '2026-10-12' });
  mockEcouteurs[0]!(r);
  mockEcouteurs[0]!(r);
  expect(mockPousser).toHaveBeenCalledTimes(1);
  expect(mockPousser).toHaveBeenCalledWith({
    pathname: '/semaine',
    params: { jour: '2026-10-12' },
  });
});

test('NOT-002 : sans objet à ouvrir, le centre de notifications', () => {
  expect(destinationPush({ type: 'rapports_valides' })).toEqual({ pathname: '/notifications' });
  expect(destinationPush({})).toEqual({ pathname: '/notifications' });
});

test('NOT-002 : déconnecté, rien n’est demandé', async () => {
  rendre('anonyme');
  await new Promise((r) => setTimeout(r, 20));
  expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
});
