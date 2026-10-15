import type { ClientApi } from '@innov/api-client';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import i18n from '../src/i18n';
import { ContexteSession, type Session } from '../src/session';
import { CarteSynchro } from '../src/Synchronisation';
import { aRafraichir, synchroniser } from '../src/synchro';

jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('expo-location', () => ({}));

// OFF-001 (0.8.1) : la base locale chiffrée est remplacée par une mémoire.
const mockMemoire = new Map<string, { valeur: unknown; maj: string }>();
jest.mock('../src/baseLocale', () => ({
  lire: jest.fn(async (cle: string) => mockMemoire.get(cle) ?? null),
  ecrire: jest.fn(async (cle: string, valeur: unknown) => {
    mockMemoire.set(cle, { valeur, maj: '2026-10-14T08:00:00.000Z' });
  }),
  oublier: jest.fn(async (cle: string) => mockMemoire.delete(cle)),
  effacer: jest.fn(async () => mockMemoire.clear()),
}));

const visite = (id: string, date: string) => ({ id, date }) as never;

function client(echoue: string[] = []) {
  const ou = <T,>(nom: string, valeur: T) =>
    jest.fn(async () => {
      if (echoue.includes(nom) || echoue.includes('*'))
        throw new TypeError('Network request failed');
      return valeur;
    });
  return {
    plannings: {
      programme: ou('programme', {
        semaine: '2026-10-12',
        aujourdhui: '2026-10-14',
        jours: [{ date: '2026-10-14', visites: [visite('v1', '2026-10-14')], activites: [] }],
      }),
      semaine: jest.fn(async (jour?: string) => {
        if (echoue.includes('*')) throw new TypeError('Network request failed');
        return jour
          ? { semaine: '2026-10-19', suivante: '2026-10-26', visites: [visite('v2', '2026-10-20')] }
          : {
              semaine: '2026-10-12',
              suivante: '2026-10-19',
              visites: [visite('v1', '2026-10-14')],
            };
      }),
    },
    visites: { detail: ou('detail', { id: 'v' }) },
    ciblage: {
      mesListes: ou('listes', [
        { poste: { id: 'po1' }, cibles: [{ prospect: { id: 'p1' } }, { prospect: { id: 'p2' } }] },
      ]),
    },
    rapports: {
      historique: ou('historique', {
        genere_le: '2026-10-14T08:00:00Z',
        prospects: [{ prospect: 'p1', rapports: [{ id: 'r1', date: '2026-10-13' }] }],
      }),
      visitesProposees: ou('proposees', []),
      modeles: ou('modeles', {
        genere_le: '2026-10-14T08:00:00Z',
        rapports: [
          { visite: 'v1', rapport: { id: 'm1', statut: 'brouillon', visite: 'v1' } },
          { visite: 'v2', rapport: { id: 'm2', statut: 'brouillon', visite: 'v2' } },
        ],
      }),
    },
    pilotage: { mesChiffres: ou('chiffres', { semaine: {} }) },
  } as unknown as ClientApi;
}

beforeEach(async () => {
  mockMemoire.clear();
  await i18n.changeLanguage('fr');
});

test("OFF-001 CA1 : une passe garde la semaine, la suivante, la liste et l'historique", async () => {
  const etat = await synchroniser(client());
  expect(etat).toMatchObject({ visites: 2, prospects: 2, historiques: 1, rapports: 2, echecs: 0 });
  for (const cle of [
    'programme.courant',
    'semaine.courante',
    'semaine.2026-10-12',
    'semaine.2026-10-19',
    'visite.v1',
    'visite.v2',
    'ciblage.moi',
    'chronologie.p1',
    'visites.proposees',
    'mes-chiffres',
    'rapport.v1',
    'rapport.v2',
    'synchro.derniere',
  ])
    expect(mockMemoire.has(cle)).toBe(true);
  expect(aRafraichir(etat, new Date(etat.le).getTime() + 10 * 60 * 1000)).toBe(false);
  expect(aRafraichir(etat, new Date(etat.le).getTime() + 31 * 60 * 1000)).toBe(true);
});

test('une partie qui échoue est comptée et ne vide rien', async () => {
  mockMemoire.set('ciblage.moi', { valeur: ['ancienne'], maj: '2026-10-01T08:00:00.000Z' });
  const etat = await synchroniser(client(['listes']));
  expect(etat.echecs).toBe(1);
  expect(mockMemoire.get('ciblage.moi')?.valeur).toEqual(['ancienne']);
  expect(mockMemoire.has('programme.courant')).toBe(true);
});

test("sans réseau, la passe échoue et garde l'état précédent", async () => {
  await synchroniser(client());
  const avant = mockMemoire.get('synchro.derniere')?.valeur;
  await expect(synchroniser(client(['*']))).rejects.toThrow();
  expect(mockMemoire.get('synchro.derniere')?.valeur).toEqual(avant);
});

test('le profil montre la dernière synchronisation et la relance', async () => {
  const session = { etat: { statut: 'connecte' }, client: client() } as unknown as Session;
  await render(
    <ContexteSession.Provider value={session}>
      <CarteSynchro />
    </ContexteSession.Provider>,
  );
  expect(await screen.findByText('Pas encore synchronisé sur ce téléphone.')).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: 'Synchroniser maintenant' }));
  expect(await screen.findByText('Prospects de la liste cible')).toBeTruthy();
  expect(screen.getByText('Visites de la semaine et de la suivante')).toBeTruthy();
  // Maquette 1.5.0 : au téléphone, l'heure en pastille à côté du titre.
  expect(screen.getByText(/^Synchronisé à /)).toBeTruthy();
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Synchroniser maintenant' }).props.accessibilityState
        ?.busy,
    ).toBeFalsy(),
  );
});

test('OFF-002 : le modèle reçu ne remplace pas une saisie faite sur le téléphone', async () => {
  const saisie = { resume: 'Écrit sans réseau' };
  mockMemoire.set('rapport.v1', {
    valeur: { rapport: { id: 'm0' }, saisie, modifie_le: '2026-10-14T07:00:00Z', envoye: false },
    maj: '2026-10-14T07:00:00.000Z',
  });
  await synchroniser(client());
  const garde = mockMemoire.get('rapport.v1')?.valeur as {
    saisie: unknown;
    rapport: { id: string };
  };
  expect(garde.saisie).toEqual(saisie);
  expect(garde.rapport.id).toBe('m1');
});
