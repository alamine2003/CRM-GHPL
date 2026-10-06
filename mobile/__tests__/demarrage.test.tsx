import type { ClientApi, Programme, VisiteProgramme } from '@innov/api-client';
import { ErreurApi } from '@innov/api-client';
import { fireEvent, render, screen } from '@testing-library/react-native';
import * as Location from 'expo-location';
import { lireAttente } from '../src/Brouillons';
import { distanceKm } from '../src/Execution';
import i18n from '../src/i18n';
import { ProgrammeDuJour } from '../src/Programme';
import { ContexteSession, type Session } from '../src/session';

// VIS-003 (0.4.3) : démarrer une visite — heure réelle, position si le pays l'active ; CA1 :
// capturée hors connexion ; CA2 : sans GPS, elle démarre quand même ; CA3 : la distance au lieu.

const mockMemoire = new Map<string, { valeur: unknown; maj: string }>();
jest.mock('../src/baseLocale', () => ({
  lire: jest.fn(async (cle: string) => mockMemoire.get(cle) ?? null),
  ecrire: jest.fn(async (cle: string, valeur: unknown) =>
    mockMemoire.set(cle, { valeur, maj: '2026-10-13T06:30:00.000Z' }),
  ),
  oublier: jest.fn(async (cle: string) => mockMemoire.delete(cle)),
  effacer: jest.fn(),
}));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'envoi-1' }));
jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
  Accuracy: { High: 4 },
}));
const permission = Location.requestForegroundPermissionsAsync as jest.Mock;
const position = Location.getCurrentPositionAsync as jest.Mock;

const VISITE: VisiteProgramme = {
  id: 'v1',
  date: '2026-10-13',
  heure: '09:00',
  prospect: {
    id: 'p1',
    civilite: 'dr',
    prenom: 'Awa',
    nom: 'FICTIF',
    specialite_libelle: 'Cardiologie',
    type_libelle: 'Médecin',
    potentiel: 'A',
  },
  etablissement: { id: 'e1', nom: 'Clinique Fictive' },
  reseau: null,
  objectif: 'Présenter le produit du mois',
  note: '',
  statut: 'prevue',
  manquants: [],
  passage: null,
  ordre: 1,
  debut_le: null,
  sans_gps: false,
  distance_debut_m: null,
  modification_en_attente: false,
};

const PROGRAMME: Programme = {
  semaine: '2026-10-12',
  aujourdhui: '2026-10-13',
  fuseau: 'UTC',
  etat: 'approuve',
  planning: null,
  version: 1,
  prochaine: 'v1',
  geolocalisation: true,
  jours: [{ date: '2026-10-13', ferie: null, visites: [VISITE], activites: [] }],
};

/** Le lieu de la visite, gardé avec son détail : à Dakar. */
function lieuGarde() {
  mockMemoire.set('visite.v1', {
    valeur: { lieu: { latitude: '14.700000', longitude: '-17.400000' } },
    maj: '',
  });
}

async function rendre(demarrer: jest.Mock, programme = PROGRAMME) {
  const session = {
    etat: { statut: 'connecte' },
    client: {
      plannings: { programme: jest.fn(async () => programme), semaine: jest.fn(async () => ({})) },
      visites: { demarrer, detail: jest.fn(async () => Promise.reject(new TypeError('x'))) },
    } as unknown as ClientApi,
  } as unknown as Session;
  await render(
    <ContexteSession.Provider value={session}>
      <ProgrammeDuJour />
    </ContexteSession.Provider>,
  );
}

beforeEach(async () => {
  mockMemoire.clear();
  permission.mockReset().mockResolvedValue({ status: 'granted' });
  // 0,001° de latitude au nord du lieu : environ 111 m.
  position
    .mockReset()
    .mockResolvedValue({ coords: { latitude: 14.701, longitude: -17.4, accuracy: 9 } });
  await i18n.changeLanguage('fr');
});

test('VIS-003 : la visite démarre à l’heure réelle, avec sa position et la distance au lieu', async () => {
  lieuGarde();
  const demarrer = jest.fn(async (_id: string, s: { debut_le: string }) => ({
    ...VISITE,
    statut: 'en_cours',
    debut_le: s.debut_le,
    sans_gps: false,
    distance_debut_m: 111,
  }));
  await rendre(demarrer);
  await fireEvent.press(await screen.findByText('Démarrer la visite'));
  expect(demarrer).toHaveBeenCalledWith(
    'v1',
    expect.objectContaining({ latitude: 14.701, longitude: -17.4, precision_m: 9 }),
  );
  expect(await screen.findByText(/^En cours depuis \d\d:\d\d · À 111 m du lieu$/)).toBeTruthy();
  expect(screen.queryByText('Démarrer la visite')).toBeNull();
});

test('VIS-003 CA1 : sans réseau, la position est prise et l’envoi attend dans la file', async () => {
  lieuGarde();
  await rendre(
    jest.fn(async () => {
      throw new TypeError('Network request failed');
    }),
  );
  await fireEvent.press(await screen.findByText('Démarrer la visite'));
  expect(await screen.findByText(/Démarrée sans réseau/)).toBeTruthy();
  // CA3 sans réseau : la distance se calcule sur le téléphone.
  expect(screen.getByText(/^En cours depuis \d\d:\d\d · À 111 m du lieu$/)).toBeTruthy();
  const [envoi] = await lireAttente();
  expect(envoi).toMatchObject({ type: 'demarrer_visite', visite: 'v1' });
  expect(envoi?.type === 'demarrer_visite' && envoi.saisie.latitude).toBe(14.701);
});

test('VIS-003 CA2 : sans GPS, la visite démarre quand même, « sans GPS »', async () => {
  permission.mockResolvedValue({ status: 'denied' });
  const demarrer = jest.fn(async (_id: string, s: { debut_le: string }) => ({
    ...VISITE,
    statut: 'en_cours',
    debut_le: s.debut_le,
    sans_gps: true,
    distance_debut_m: null,
  }));
  await rendre(demarrer);
  await fireEvent.press(await screen.findByText('Démarrer la visite'));
  expect(demarrer).toHaveBeenCalledWith('v1', { debut_le: expect.any(String) });
  expect(await screen.findByText('Sans GPS : position indisponible')).toBeTruthy();
});

test('un refus du serveur se dit et rien ne part dans la file', async () => {
  await rendre(
    jest.fn(async () => {
      throw new ErreurApi(409, 'autre_jour', 'Une visite se démarre le jour prévu.', {});
    }),
  );
  await fireEvent.press(await screen.findByText('Démarrer la visite'));
  expect(await screen.findByText(/n'a pas été accepté : Une visite se démarre/)).toBeTruthy();
  expect(await lireAttente()).toEqual([]);
});

test('la distance se calcule comme sur le serveur (haversine)', () => {
  expect(Math.round(distanceKm([14.7, -17.4], [14.701, -17.4]) * 1000)).toBe(111);
});
