import type { Notification } from '@innov/api-client';
import i18n from '../src/i18n';
import {
  semaineDeNotification,
  texteNotification,
  visiteDeNotification,
} from '../src/textesNotifications';

// NOT-001 CA1 au téléphone : la semaine qu'ouvre une notification ; ce qui se décide au
// portail ne s'ouvre pas ici.

const notif = (type: Notification['type']) =>
  ({
    id: 'n1',
    type,
    donnees: { planning: 'pl1', semaine: '2026-10-12', numero_semaine: 42, nom: 'Awa FICTIVE' },
    cree_le: '2026-10-13T09:00:00Z',
    lue_le: null,
  }) as Notification;

beforeEach(async () => {
  await i18n.changeLanguage('fr');
});

test.each([
  ['planning_approuve', '2026-10-12'],
  ['revision_demandee', '2026-10-12'],
  ['rappel_planning', '2026-10-12'],
  ['redaction_rouverte', '2026-10-12'],
  ['planning_soumis', undefined],
  ['escalade', undefined],
  ['plannings_non_approuves', undefined],
  ['reouverture_demandee', undefined],
] as const)('%s ouvre %s', (type, semaine) => {
  expect(semaineDeNotification(notif(type))).toBe(semaine);
});

test('0.3.9 : la réouverture se dit au délégué', () => {
  expect(texteNotification(notif('redaction_rouverte'), i18n.t.bind(i18n), 'fr')).toBe(
    'Awa FICTIVE a rouvert la rédaction de votre planning de la semaine 42',
  );
});

test('RPT-014 : la correction demandée ouvre le rapport, sans nom de prospect', () => {
  const n = {
    id: 'n2',
    type: 'correction_demandee',
    donnees: { visite: 'v1', date: '2026-10-13', nom: 'Kossi GUEYE' },
    cree_le: '2026-10-14T08:00:00Z',
    lue_le: null,
  } as Notification;
  expect(texteNotification(n, i18n.t, 'fr')).toBe(
    'Kossi GUEYE demande une correction de votre rapport du 13 octobre',
  );
  expect(visiteDeNotification(n)).toBe('v1');
  expect(semaineDeNotification(n)).toBeUndefined();
});
