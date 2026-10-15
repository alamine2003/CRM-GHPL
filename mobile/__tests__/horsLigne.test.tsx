/**
 * 0.8.3 : file visible et reprise d'elle-même (OFF-003), données masquées au-delà du délai du
 * pays sans synchronisation (OFF-007, RG-054, DC-54), effacement à distance (SEC-006).
 */
import { type ClientApi, ErreurApi } from '@innov/api-client';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';
import Connexion from '../app/connexion';
import { lireAttente, mettreEnAttente } from '../src/Brouillons';
import { FournisseurSession } from '../src/FournisseurSession';
import i18n from '../src/i18n';
import { ContexteSession, type Session } from '../src/session';
import { GardeHorsLigne, LigneSynchro, StatutSynchro, SynchroAuto } from '../src/Synchronisation';
import { CLE_SYNCHRO, horsDelai } from '../src/synchro';
import { horloge } from '../src/Verrou';

const mockPousser = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPousser, replace: jest.fn() }),
  usePathname: () => '/',
  Redirect: () => null,
}));
jest.mock('expo-location', () => ({}));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'e1' }));
jest.mock('expo-constants', () => ({ expoConfig: { version: '0.8.3', extra: {} } }));
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 0,
}));
jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual('react-native');
  return {
    SafeAreaView: View,
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});

// La base locale chiffrée est remplacée par une mémoire.
const mockMemoire = new Map<string, { valeur: unknown; maj: string }>();
jest.mock('../src/baseLocale', () => ({
  lire: jest.fn(async (cle: string) => mockMemoire.get(cle) ?? null),
  ecrire: jest.fn(async (cle: string, valeur: unknown) => {
    mockMemoire.set(cle, { valeur, maj: '2026-10-14T08:00:00.000Z' });
  }),
  oublier: jest.fn(async (cle: string) => mockMemoire.delete(cle)),
  effacer: jest.fn(async () => mockMemoire.clear()),
}));

// L'heure réelle : la synchronisation date ce qu'elle garde avec l'horloge du téléphone.
const MAINTENANT = Date.now();
const JOUR = 24 * 3600 * 1000;

function synchroniseIlYa(jours: number) {
  mockMemoire.set(CLE_SYNCHRO, {
    valeur: {
      le: new Date(MAINTENANT - jours * JOUR).toISOString(),
      visites: 3,
      prospects: 2,
      historiques: 1,
      rapports: 3,
      echecs: 0,
    },
    maj: '',
  });
}

const envoi = (id: string) =>
  ({
    id,
    type: 'proposition',
    saisie: { id, prospect: 'p1', champs: {} },
    resume: 'Dr Diallo',
  }) as never;

/** Un client dont chaque lecture répond, ou échoue sans réseau. */
function client(reseau = true) {
  const ou = <T,>(valeur: T) =>
    jest.fn(async () => {
      if (!reseau) throw new TypeError('Network request failed');
      return valeur;
    });
  return {
    plannings: {
      programme: ou({ semaine: '2026-10-12', jours: [] }),
      semaine: ou({ semaine: '2026-10-12', suivante: '2026-10-19', visites: [] }),
    },
    visites: { detail: ou({}) },
    ciblage: { mesListes: ou([]) },
    rapports: {
      historique: ou({ prospects: [] }),
      visitesProposees: ou([]),
      modeles: ou({ rapports: [] }),
    },
    pilotage: { mesChiffres: ou({}) },
    propositions: { creer: ou({ id: 'e1' }) },
  } as unknown as ClientApi;
}

function avecSession(api: ClientApi, enfant: React.ReactNode) {
  const session = {
    etat: { statut: 'connecte', utilisateur: { prenom: 'Awa' }, perimetre: {} },
    client: api,
  } as unknown as Session;
  return <ContexteSession.Provider value={session}>{enfant}</ContexteSession.Provider>;
}

let horlogeFigee: jest.SpyInstance;
beforeEach(async () => {
  mockMemoire.clear();
  mockPousser.mockClear();
  horlogeFigee = jest.spyOn(horloge, 'maintenant').mockReturnValue(MAINTENANT);
  await i18n.changeLanguage('fr');
});

afterEach(() => horlogeFigee.mockRestore());

test('OFF-003 CA1 : dès qu’un envoi attend, chaque écran le dit (1.4.0 : seulement alors)', async () => {
  synchroniseIlYa(0);
  await render(<LigneSynchro />);
  // Maquette 1.4.0 : plus de ligne permanente sous l'en-tête quand tout est parti.
  expect(screen.queryByText(/^Synchronisé à \d/)).toBeNull();
  await act(async () => {
    await mettreEnAttente(envoi('e1'));
    await mettreEnAttente(envoi('e2'));
  });
  expect(await screen.findByText(/^Synchronisé à \d.* · 2 envois en attente$/)).toBeTruthy();
  fireEvent.press(screen.getByRole('button'));
  expect(mockPousser).toHaveBeenCalledWith('/envois');
});

test('OFF-003 CA1 : l’en-tête de la tablette dit la dernière synchronisation (1.4.0)', async () => {
  synchroniseIlYa(0);
  await render(<StatutSynchro />);
  expect(await screen.findByText(/^Synchronisé à \d/)).toBeTruthy();
});

test('OFF-003 CA1 : un téléphone jamais synchronisé le dit aussi', async () => {
  await render(<StatutSynchro />);
  expect(await screen.findByText('Pas encore synchronisé')).toBeTruthy();
});

test('OFF-003 : au retour dans l’application, la file part d’elle-même, une seule fois', async () => {
  synchroniseIlYa(0);
  await mettreEnAttente(envoi('e1'));
  const api = client();
  await render(avecSession(api, <SynchroAuto />));
  await waitFor(async () => expect(await lireAttente()).toEqual([]));
  expect(api.propositions.creer).toHaveBeenCalledTimes(1);
});

test('OFF-007 CA1 : au 8ᵉ jour sans synchronisation, les données ne s’affichent plus', async () => {
  synchroniseIlYa(8);
  await render(
    avecSession(
      client(false),
      <GardeHorsLigne>
        <Text>Ma semaine</Text>
      </GardeHorsLigne>,
    ),
  );
  expect(await screen.findByText('Synchronisation nécessaire')).toBeTruthy();
  expect(screen.getByText(/Au-delà de 7 jours sans synchronisation/)).toBeTruthy();
  expect(screen.queryByText('Ma semaine')).toBeNull();
});

test('OFF-007 : avant le délai, rien n’est masqué', async () => {
  expect(horsDelai(null, 7, MAINTENANT)).toBe(false);
  synchroniseIlYa(6);
  await render(
    avecSession(
      client(),
      <GardeHorsLigne>
        <Text>Ma semaine</Text>
      </GardeHorsLigne>,
    ),
  );
  expect(await screen.findByText('Ma semaine')).toBeTruthy();
});

test('OFF-007, DC-54 : le pays allonge le délai pour une zone isolée', async () => {
  // 14 jours, lus avec le programme gardé sur le téléphone.
  mockMemoire.set('programme.courant', { valeur: { delai_hors_ligne_jours: 14 }, maj: '' });
  synchroniseIlYa(10);
  await render(
    avecSession(
      client(),
      <GardeHorsLigne>
        <Text>Ma semaine</Text>
      </GardeHorsLigne>,
    ),
  );
  expect(await screen.findByText('Ma semaine')).toBeTruthy();
});

test('OFF-007 CA2 : la file est gardée et part à la synchronisation qui rend les données', async () => {
  synchroniseIlYa(9);
  await mettreEnAttente(envoi('e1'));
  const api = client();
  await render(
    avecSession(
      api,
      <GardeHorsLigne>
        <Text>Ma semaine</Text>
      </GardeHorsLigne>,
    ),
  );
  expect(await screen.findByText(/1 envoi en attente est gardé sur le téléphone/)).toBeTruthy();
  fireEvent.press(screen.getByText('Synchroniser maintenant'));
  expect(await screen.findByText('Ma semaine')).toBeTruthy();
  expect(api.propositions.creer).toHaveBeenCalledTimes(1);
  expect(await lireAttente()).toEqual([]);
});

test('SEC-006 CA1 : un téléphone révoqué efface ses données et revient à la connexion', async () => {
  synchroniseIlYa(1);
  await mettreEnAttente(envoi('e1'));
  const api = {
    informations: jest.fn(async () => ({ environnement: 'developpement' })),
    reprendre: jest.fn(async () => {
      throw new ErreurApi(403, 'appareil_revoque', 'Ce téléphone a été révoqué.');
    }),
  } as unknown as ClientApi;
  await render(
    <FournisseurSession client={api}>
      <Connexion />
    </FournisseurSession>,
  );
  expect(await screen.findByText(/ses données ont été effacées/)).toBeTruthy();
  expect(mockMemoire.size).toBe(0);
});

test('SEC-006 : une session simplement expirée n’efface rien', async () => {
  synchroniseIlYa(1);
  const api = {
    informations: jest.fn(async () => ({ environnement: 'developpement' })),
    reprendre: jest.fn(async () => {
      throw new ErreurApi(401, 'session_expiree', 'Votre session a expiré.');
    }),
  } as unknown as ClientApi;
  await render(
    <FournisseurSession client={api}>
      <Connexion />
    </FournisseurSession>,
  );
  await waitFor(() => expect(api.reprendre).toHaveBeenCalled());
  expect(screen.queryByText(/ses données ont été effacées/)).toBeNull();
  expect(mockMemoire.has(CLE_SYNCHRO)).toBe(true);
});
