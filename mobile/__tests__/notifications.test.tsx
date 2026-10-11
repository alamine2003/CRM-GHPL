import type { ClientApi, ResumeNotifications } from '@innov/api-client';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import i18n from '../src/i18n';
import { MesNotifications } from '../src/MesNotifications';
import { ContexteSession, type Session } from '../src/session';

const mockPousser = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPousser }) }));

const RESUME: ResumeNotifications = {
  non_lues: 1,
  notifications: [
    {
      id: 'n1',
      type: 'planning_approuve',
      donnees: { planning: 'pl1', semaine: '2026-10-12', numero_semaine: 42 },
      cree_le: '2026-10-07T10:30:00Z',
      lue_le: null,
    },
  ],
};

test('PLN-012 CA2 : le délégué voit l’approbation, l’ouvre, et elle passe en lue', async () => {
  await i18n.changeLanguage('fr');
  const lue = jest.fn(async () => ({ ...RESUME.notifications[0]!, lue_le: 'x' }));
  const session = {
    etat: { statut: 'connecte', perimetre: { actions: ['notifications.lire'] } },
    client: { notifications: { liste: jest.fn(async () => RESUME), lue } } as unknown as ClientApi,
  } as unknown as Session;
  await render(
    <ContexteSession.Provider value={session}>
      <MesNotifications />
    </ContexteSession.Provider>,
  );
  expect(await screen.findByText('Nouvelle notification')).toBeTruthy();
  fireEvent.press(screen.getByText('Votre planning de la semaine 42 est approuvé'));
  expect(lue).toHaveBeenCalledWith('n1');
  expect(mockPousser).toHaveBeenCalledWith({
    pathname: '/semaine',
    params: { jour: '2026-10-12' },
  });
  await waitFor(() => expect(screen.queryByText('Nouvelle notification')).toBeNull());
});

test('sans le droit de lire des notifications, rien ne s’affiche ni ne se demande', async () => {
  const liste = jest.fn();
  const session = {
    etat: { statut: 'connecte', perimetre: { actions: [] } },
    client: { notifications: { liste } } as unknown as ClientApi,
  } as unknown as Session;
  await render(
    <ContexteSession.Provider value={session}>
      <MesNotifications />
    </ContexteSession.Provider>,
  );
  expect(liste).not.toHaveBeenCalled();
});
