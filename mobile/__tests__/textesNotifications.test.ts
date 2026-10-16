import type { Notification } from '@innov/api-client';
import i18n from '../src/i18n';
import {
  couleurNotification,
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
    'Kossi GUEYE demande une correction de votre rapport du mardi 13 octobre',
  );
  expect(visiteDeNotification(n)).toBe('v1');
  expect(semaineDeNotification(n)).toBeUndefined();
});

test('RPT-016 : la réouverture ouvre le rapport à reprendre', () => {
  const n = {
    id: 'n2',
    type: 'rapport_rouvert',
    donnees: { visite: 'v1', date: '2026-10-13', nom: 'Kossi GUEYE' },
    cree_le: '2026-10-20T08:00:00Z',
    lue_le: null,
  } as Notification;
  expect(texteNotification(n, i18n.t, 'fr')).toBe(
    'Kossi GUEYE a rouvert votre rapport du mardi 13 octobre',
  );
  expect(visiteDeNotification(n)).toBe('v1');
});

test('0.6.8, 37.A : le rappel de 18 h et les rapports validés se lisent au téléphone', () => {
  const rappel = {
    id: 'n3',
    type: 'rappel_rapport',
    donnees: { date: '2026-10-13', nombre: 2 },
    cree_le: '2026-10-13T18:00:00Z',
    lue_le: null,
  } as Notification;
  expect(texteNotification(rappel, i18n.t, 'fr')).toBe(
    '2 rapports du jour à soumettre avant minuit',
  );
  const valides = { ...rappel, type: 'rapports_valides', donnees: { nombre: 1 } } as Notification;
  expect(texteNotification(valides, i18n.t, 'fr')).toBe('1 rapport validé');
});

test('maquette 1.4.9 : une période dans un seul mois, et la couleur de la pastille', () => {
  const p = { orange: 'or', info: 'in', attention: 'wa', erreur: 'er', succes: 'ok' };
  const remplacement = {
    ...notif('remplacement_attribue'),
    donnees: { nom: 'Awa FICTIVE', debut: '2026-10-19', fin: '2026-10-23' },
  } as Notification;
  expect(texteNotification(remplacement, i18n.t, 'fr')).toBe(
    'Vous remplacez Awa FICTIVE du 19 au 23 octobre',
  );
  const aCheval = {
    ...remplacement,
    donnees: { nom: 'Awa FICTIVE', debut: '2026-10-29', fin: '2026-11-02' },
  } as Notification;
  expect(texteNotification(aCheval, i18n.t, 'fr')).toBe(
    'Vous remplacez Awa FICTIVE du 29 octobre au 2 novembre',
  );
  const couleur = (type: Notification['type']) =>
    couleurNotification(notif(type), p as unknown as Parameters<typeof couleurNotification>[1]);
  expect(couleur('correction_demandee')).toBe('or');
  expect(couleur('remplacement_attribue')).toBe('in');
  expect(couleur('rappel_planning')).toBe('wa');
  expect(couleur('planning_approuve')).toBe('ok');
});
