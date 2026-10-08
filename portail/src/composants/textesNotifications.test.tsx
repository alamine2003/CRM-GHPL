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

describe('RPT-015, 28.A : rapport corrigé', () => {
  it('se dit avec le nom et le jour, et ouvre la journée', () => {
    const t = i18n.t.bind(i18n);
    const n = notif('rapport_corrige', { delegue: 'd1', date: '2026-09-21', nom: 'Awa FICTIVE' });
    expect(texteNotification(n, t, 'fr')).toBe('Awa FICTIVE a corrigé son rapport du 21 septembre');
    expect(destination(n)).toBe('/a-traiter/d1/2026-09-21');
  });
});

describe('RPT-016, 31.A : rapport rouvert par le DM', () => {
  it('le superviseur l’apprend, et la notification ouvre la journée', () => {
    const t = i18n.t.bind(i18n);
    const n = notif('rapport_rouvert', { delegue: 'd1', date: '2026-09-21', nom: 'Awa FICTIVE' });
    expect(texteNotification(n, t, 'fr')).toBe(
      'Awa FICTIVE a rouvert un rapport validé du 21 septembre',
    );
    expect(destination(n)).toBe('/a-traiter/d1/2026-09-21');
  });
});

describe('RPT-017, 34.A : rapport en retard', () => {
  it('le superviseur est alerté, et la notification ouvre les retards du délégué', () => {
    const t = i18n.t.bind(i18n);
    const n = notif('rapport_en_retard', {
      delegue: 'd1',
      date: '2026-10-13',
      nom: 'Awa FICTIVE',
      nombre: 2,
    });
    expect(texteNotification(n, t, 'fr')).toBe(
      'Awa FICTIVE : 2 rapports du 13 octobre toujours pas soumis, 48 h après les visites',
    );
    expect(texteNotification({ ...n, donnees: { ...n.donnees, nombre: 1 } }, t, 'fr')).toBe(
      'Awa FICTIVE : rapport du 13 octobre toujours pas soumis, 48 h après la visite',
    );
    expect(destination(n)).toBe('/a-traiter?onglet=retards&delegue=d1');
  });
});

describe('0.6.8 : notifications du workflow de rapport', () => {
  it('rapports soumis et journée escaladée : textes et destinations', () => {
    const t = i18n.t.bind(i18n);
    const soumis = notif('rapports_soumis', { nombre: 3 });
    expect(texteNotification(soumis, t, 'fr')).toBe('3 rapports à valider');
    expect(destination(soumis)).toBe('/a-traiter');
    const escalade = notif('journee_escaladee', {
      delegue: 'd1',
      date: '2026-10-13',
      nom: 'Awa FICTIVE',
    });
    expect(texteNotification(escalade, t, 'fr')).toBe(
      'Awa FICTIVE, journée du 13 octobre : à valider par escalade',
    );
    expect(destination(escalade)).toBe('/a-traiter/d1/2026-10-13');
  });
});
