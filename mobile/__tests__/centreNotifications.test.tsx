import type { ClientApi, Notification } from '@innov/api-client';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { CentreNotifications } from '../src/CentreNotifications';
import i18n from '../src/i18n';
import { ContexteSession, type Session } from '../src/session';

const mockPousser = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPousser }) }));

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

test('NOT-001 : le centre liste lues et non lues ; une notification ouvre sa semaine', async () => {
  await i18n.changeLanguage('fr');
  const lue = jest.fn(async () => RAPPEL);
  const session = {
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
    } as unknown as ClientApi,
  } as unknown as Session;
  await render(
    <ContexteSession.Provider value={session}>
      <CentreNotifications />
    </ContexteSession.Provider>,
  );
  // NOT-006 CA1 : l'échéance à l'heure du pays.
  const rappel = await screen.findByText(
    "Votre planning de la semaine 43 n'est pas encore soumis : à soumettre avant le jeudi 15 octobre à 18:00",
  );
  expect(screen.getByText('Votre planning de la semaine 42 est approuvé')).toBeTruthy();
  expect(screen.getAllByText(/Non lue/)).toHaveLength(1);
  fireEvent.press(rappel);
  await waitFor(() => expect(lue).toHaveBeenCalledWith('n1'));
  expect(mockPousser).toHaveBeenCalledWith({
    pathname: '/semaine',
    params: { jour: '2026-10-19' },
  });
});
