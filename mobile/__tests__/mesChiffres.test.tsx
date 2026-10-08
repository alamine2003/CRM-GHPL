import type { ClientApi, MesChiffres } from '@innov/api-client';
import { fireEvent, render, screen } from '@testing-library/react-native';
import i18n from '../src/i18n';
import { ecartPoints, EcranMesChiffres } from '../src/MesChiffres';
import { ContexteSession, type Session } from '../src/session';

// DSH-001 (0.7.1) : les chiffres du délégué ; CA1 : sans réseau, les derniers chiffres lus
// s'affichent avec l'heure de leur calcul.

const mockMemoire = new Map<string, { valeur: unknown; maj: string }>();
jest.mock('../src/baseLocale', () => ({
  lire: jest.fn(async (cle: string) => mockMemoire.get(cle) ?? null),
  ecrire: jest.fn(async (cle: string, valeur: unknown) =>
    mockMemoire.set(cle, { valeur, maj: '2026-10-15T12:00:00.000Z' }),
  ),
}));

const vide = {
  activite: false,
  visites: {
    prevues: 0,
    echues: 0,
    a_venir: 0,
    effectuees_prevues: 0,
    ecarts: 0,
    ecarts_justifies: 0,
    a_justifier: 0,
    imprevues: 0,
    effectuees: 0,
    geolocalisees: 0,
  },
  rapports: { soumis: 0, dans_delai: 0, valides: 0, a_soumettre: 0, en_retard: 0 },
  couverture: { cibles: 0, visitees: 0, cibles_ab: 0, visitees_ab: 0, frequence_ab: 0 },
  taux: {
    realisation: null,
    ecarts_justifies: null,
    geolocalisation: null,
    rapports_dans_delai: null,
    couverture: null,
    couverture_ab: null,
    frequence_ab: null,
    part_planifiee: null,
  },
};

const CHIFFRES: MesChiffres = {
  aujourdhui: '2026-10-15',
  calcule_le: '2026-10-15T12:00:00Z',
  semaine: {
    debut: '2026-10-12',
    fin: '2026-10-18',
    activite: true,
    visites: {
      prevues: 4,
      echues: 3,
      a_venir: 1,
      effectuees_prevues: 1,
      ecarts: 2,
      ecarts_justifies: 1,
      a_justifier: 1,
      imprevues: 1,
      effectuees: 2,
      geolocalisees: 1,
    },
    rapports: { soumis: 1, dans_delai: 1, valides: 0, a_soumettre: 1, en_retard: 1 },
    couverture: { cibles: 2, visitees: 1, cibles_ab: 2, visitees_ab: 1, frequence_ab: 1 },
    taux: {
      realisation: 0.333,
      ecarts_justifies: 0.5,
      geolocalisation: 0.5,
      rapports_dans_delai: 0.5,
      couverture: 0.5,
      couverture_ab: 0.5,
      frequence_ab: 0.5,
      part_planifiee: 0.5,
    },
  },
  precedente: {
    ...vide,
    debut: '2026-10-05',
    fin: '2026-10-11',
    activite: true,
    taux: { ...vide.taux, realisation: 0.25 },
  },
  cycle: {
    ...vide,
    debut: '2026-09-21',
    fin: '2026-10-18',
    semaines: 4,
    activite: true,
    couverture: { cibles: 2, visitees: 1, cibles_ab: 2, visitees_ab: 1, frequence_ab: 0 },
    taux: { ...vide.taux, couverture: 0.5, couverture_ab: 0.5, frequence_ab: 0 },
  },
  jours: [
    { date: '2026-10-12', prevues: 0, effectuees: 0 },
    { date: '2026-10-13', prevues: 2, effectuees: 2 },
    { date: '2026-10-14', prevues: 1, effectuees: 0 },
  ],
};

async function rendre(mesChiffres: jest.Mock) {
  const session = {
    etat: { statut: 'connecte' },
    client: { pilotage: { mesChiffres } } as unknown as ClientApi,
  } as unknown as Session;
  await render(
    <ContexteSession.Provider value={session}>
      <EcranMesChiffres />
    </ContexteSession.Provider>,
  );
}

beforeEach(async () => {
  mockMemoire.clear();
  await i18n.changeLanguage('fr');
});

test('DSH-001 : les chiffres de la semaine, sans note ni classement', async () => {
  const lire = jest.fn(async () => CHIFFRES);
  await rendre(lire);
  expect(await screen.findByText('visites faites')).toBeTruthy();
  expect(screen.getByText('dont 1 imprévue')).toBeTruthy();
  expect(screen.getByText('1 sur 3 visites prévues échues')).toBeTruthy();
  expect(screen.getByText('+8 pts')).toBeTruthy(); // 33 % contre 25 % la semaine précédente
  expect(
    screen.getByText('1 visite prévue reste à venir : elle ne compte pas encore.'),
  ).toBeTruthy();
  expect(screen.getByText('1 visite passée attend sa justification (Tournée).')).toBeTruthy();
  expect(screen.getByText('Sur le cycle de 4 semaines, du 21 sept. au 18 oct.')).toBeTruthy();
  expect(screen.getByText(/^Vos chiffres, sans note ni classement/)).toBeTruthy();
  // Gardés pour le mode avion (CA1).
  expect(mockMemoire.get('mes-chiffres')?.valeur).toEqual(CHIFFRES);
  // La semaine précédente se demande par son lundi ; la suivante n'existe pas encore.
  expect(screen.getByLabelText('Semaine suivante').props.accessibilityState.disabled).toBe(true);
  await fireEvent.press(screen.getByLabelText('Semaine précédente'));
  expect(lire).toHaveBeenLastCalledWith('2026-10-05');
});

test('DSH-001 CA1 : sans réseau, les derniers chiffres et leur heure', async () => {
  mockMemoire.set('mes-chiffres', { valeur: CHIFFRES, maj: '2026-10-15T12:00:00.000Z' });
  await rendre(
    jest.fn(async () => {
      throw new TypeError('Network request failed');
    }),
  );
  expect(await screen.findByText(/^Hors connexion : chiffres gardés du /)).toBeTruthy();
  expect(screen.getByText('visites faites')).toBeTruthy();
  // Une semaine jamais lue : rien de gardé, l'écran le dit au lieu d'afficher l'ancienne.
  await fireEvent.press(screen.getByLabelText('Semaine précédente'));
  expect(await screen.findByText(/pas encore sur ce téléphone/)).toBeTruthy();
  expect(screen.queryByText('visites faites')).toBeNull();
  await fireEvent.press(screen.getByText('Revenir à la semaine en cours'));
  expect(await screen.findByText('visites faites')).toBeTruthy();
});

test('DSH-012 CA2 : sans visite, « Aucune activité »', async () => {
  await rendre(
    jest.fn(async () => ({ ...CHIFFRES, semaine: { ...CHIFFRES.precedente, ...vide } })),
  );
  expect(await screen.findByText('Aucune activité')).toBeTruthy();
});

test('la variation se compte en points', () => {
  expect(ecartPoints(0.333, 0.25)).toBe(8);
  expect(ecartPoints(null, 0.25)).toBeNull();
});
