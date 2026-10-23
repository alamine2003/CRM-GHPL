import type { ClientApi, Programme, VisiteProgramme } from '@innov/api-client';
import { ErreurApi } from '@innov/api-client';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as Location from 'expo-location';
import { lireAttente } from '../src/Brouillons';
import { distanceKm } from '../src/Execution';
import i18n from '../src/i18n';
import { ContexteSession, type Session } from '../src/session';
import type { ReactNode } from 'react';
import { EcranVisite } from '../src/Visite';

// VIS-003 (0.4.3) et VIS-004 (0.4.4) : démarrer puis terminer une visite — heure réelle, position si le pays l'active ; CA1 :
// capturée hors connexion ; CA2 : sans GPS, elle démarre quand même ; CA3 : la distance au lieu.
// Depuis 1.4.1, depuis l'écran de la visite : ses boutons collés en bas, son déroulement.

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
// Le gabarit (en-tête, onglets) est testé ailleurs : ici, le contenu et les boutons du bas.
jest.mock('../src/Ecran', () => ({
  Ecran: ({ children, pied }: { children: ReactNode; pied?: ReactNode }) => (
    <>
      {children}
      {pied}
    </>
  ),
}));
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
  version: 1,
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
  fin_le: null,
  fin_sans_gps: false,
  distance_fin_m: null,
  motif_ecart: null,
  commentaire_ecart: '',
  ecart_le: null,
  reportee_de: null,
  report: null,
  est_imprevue: false,
  rapport_statut: null,
  justification: '',
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
  attente_gps_secondes: 60,
  verrouillage_minutes: 15,
  delai_hors_ligne_jours: 7,
  motifs_ecart: [{ id: 'm-absent', libelle: 'Absent du cabinet' }],
  a_justifier: [],
  a_corriger: [],
  jours: [{ date: '2026-10-13', ferie: null, visites: [VISITE], activites: [] }],
};

/** Le lieu de la visite, gardé avec son détail : à Dakar. */
function lieuGarde() {
  mockMemoire.set('visite.v1', {
    valeur: {
      visite: VISITE,
      prospect: null,
      lieu: { latitude: '14.700000', longitude: '-17.400000' },
      historique: [],
      action_precedente: null,
      preparation: null,
    },
    maj: '',
  });
}

const sansReseau = () => Promise.reject(new TypeError('Network request failed'));

/** L'écran de la visite v1, le programme du jour gardé sur le téléphone. */
async function ouvrir(visites: Record<string, unknown>, programme = PROGRAMME) {
  mockMemoire.set('programme.courant', { valeur: programme, maj: '2026-10-13T06:30:00.000Z' });
  const session = {
    etat: { statut: 'connecte' },
    client: {
      plannings: { semaine: jest.fn(sansReseau) },
      visites: { detail: jest.fn(sansReseau), ...visites },
    } as unknown as ClientApi,
  } as unknown as Session;
  await render(
    <ContexteSession.Provider value={session}>
      <EcranVisite id="v1" jour="2026-10-13" />
    </ContexteSession.Provider>,
  );
}

const rendre = (demarrer: jest.Mock, programme = PROGRAMME) => ouvrir({ demarrer }, programme);

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
    fin_le: null,
    fin_sans_gps: false,
    distance_fin_m: null,
    motif_ecart: null,
    commentaire_ecart: '',
    ecart_le: null,
    reportee_de: null,
    report: null,
    est_imprevue: false,
    justification: '',
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

const EN_COURS: VisiteProgramme = {
  ...VISITE,
  statut: 'en_cours',
  debut_le: '2026-10-13T09:02:00.000Z',
  distance_debut_m: 40,
};

test('VIS-004 : la visite en cours se termine, effectuée, avec sa durée', async () => {
  const terminer = jest.fn(async (_id: string, s: { fin_le: string }) => ({
    ...EN_COURS,
    statut: 'effectuee',
    fin_le: s.fin_le,
    fin_sans_gps: false,
    distance_fin_m: 35,
    motif_ecart: null,
    commentaire_ecart: '',
    ecart_le: null,
    reportee_de: null,
    report: null,
    est_imprevue: false,
    justification: '',
  }));
  const demarrer = jest.fn();
  const rapportOuvert = {
    id: 'r1',
    visite: 'v1',
    statut: 'brouillon',
    correction: null,
    reouverture: null,
    objectif_prevu: '',
  };
  const rapport = jest.fn(async () => rapportOuvert);
  jest.useFakeTimers({ doNotFake: ['setTimeout', 'setImmediate', 'nextTick'] });
  jest.setSystemTime(new Date('2026-10-13T09:27:00.000Z'));
  await ouvrir(
    { demarrer, terminer, rapport },
    { ...PROGRAMME, jours: [{ ...PROGRAMME.jours[0]!, visites: [EN_COURS] }] },
  );
  expect(await screen.findByText(/^En cours depuis 09:02 · À 40 m du lieu$/)).toBeTruthy();
  await fireEvent.press(screen.getByText('Terminer la visite'));
  expect(terminer).toHaveBeenCalledWith(
    'v1',
    expect.objectContaining({ fin_le: '2026-10-13T09:27:00.000Z', latitude: 14.701 }),
  );
  // Terminée : l'écran l'annonce et dit sa durée.
  expect(
    await screen.findByText('Visite de Dr Awa FICTIF terminée : 09:02 – 09:27 · 25 min.'),
  ).toBeTruthy();
  expect(screen.getByText('Effectuée · 09:02 – 09:27 · 25 min')).toBeTruthy();
  expect(screen.queryByText('Terminer la visite')).toBeNull();
  // En bas, le rapport s'ouvre d'un appui ; il est déjà gardé sur le téléphone (RPT-009).
  expect(screen.getByText('Rédiger le rapport')).toBeTruthy();
  await waitFor(() =>
    expect(mockMemoire.get('rapport.v1')?.valeur).toEqual(
      expect.objectContaining({ rapport: rapportOuvert, saisie: null, envoye: true }),
    ),
  );
  expect(rapport).toHaveBeenCalledWith('v1');
  jest.useRealTimers();
});

test('VIS-004 : démarrée puis terminée sans réseau, les deux envois attendent dans l’ordre', async () => {
  const horsReseau = jest.fn(sansReseau);
  await ouvrir({ demarrer: horsReseau, terminer: horsReseau });
  await fireEvent.press(await screen.findByText('Démarrer la visite'));
  await fireEvent.press(await screen.findByText('Terminer la visite'));
  expect(await screen.findByText(/terminée : .* Sans réseau : l'envoi partira/)).toBeTruthy();
  expect((await lireAttente()).map((e) => e.type)).toEqual(['demarrer_visite', 'terminer_visite']);
});
