import type { Notification } from '@innov/api-client';
import { beforeEach, describe, expect, it } from 'vitest';
import i18n from '../i18n';
import { destination, texteNotification } from './textesNotifications';

// NOT-001 CA1 : chaque notification ouvre l'écran de l'action attendue (0.3.3 à 0.3.9).

const notif = (type: Notification['type'], donnees: Notification['donnees'] = {}) =>
  ({ id: 'n1', type, donnees, cree_le: '2026-10-13T09:00:00Z', lue_le: null }) as Notification;
const DONNEES = { planning: 'pl1', semaine: '2026-10-12', numero_semaine: 42, nom: 'Awa FICTIVE' };

beforeEach(async () => {
  await i18n.changeLanguage('fr');
});

describe('NOT-001 CA1 : destinations', () => {
  it.each([
    ['planning_soumis', '/validation/pl1'],
    ['escalade', '/validation/pl1'],
    ['remplacement_attribue', '/validation'],
    ['plannings_non_approuves', '/validation'],
    ['reouverture_demandee', '/validation'],
    ['planning_approuve', '/planning?semaine=2026-10-12'],
    ['revision_demandee', '/planning?semaine=2026-10-12'],
    ['rappel_planning', '/planning?semaine=2026-10-12'],
    ['redaction_rouverte', '/planning?semaine=2026-10-12'],
  ] as const)('%s mène à %s', (type, chemin) => {
    expect(destination(notif(type, DONNEES))).toBe(chemin);
  });
});

describe('0.3.9 : textes de la fermeture', () => {
  it('la demande et la réouverture se disent avec le nom et la semaine', () => {
    const t = i18n.t.bind(i18n);
    expect(texteNotification(notif('reouverture_demandee', DONNEES), t, 'fr')).toBe(
      'Awa FICTIVE demande la réouverture de son planning de la semaine 42',
    );
    expect(
      texteNotification(notif('redaction_rouverte', { ...DONNEES, nom: 'Kossi FICTIF' }), t, 'fr'),
    ).toBe('Kossi FICTIF a rouvert la rédaction de votre planning de la semaine 42');
  });
});
