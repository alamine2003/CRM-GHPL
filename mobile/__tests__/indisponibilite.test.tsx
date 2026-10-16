import { type ClientApi, ErreurApi, type Programme, type VisiteProgramme } from '@innov/api-client';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { lireAttente } from '../src/Brouillons';
import i18n from '../src/i18n';
import { FormulaireIndisponibilite, resumeDesPeriodes } from '../src/Indisponibilite';
import { ContexteSession, type Session } from '../src/session';

// PLN-009 (maquette 1.5.5) : « Indisponibilité imprévue », sans motif, la période au choix ;
// sans réseau, la déclaration attend dans la file (DC-51).

const mockMemoire = new Map<string, { valeur: unknown; maj: string }>();
jest.mock('../src/baseLocale', () => ({
  lire: jest.fn(async (cle: string) => mockMemoire.get(cle) ?? null),
  ecrire: jest.fn(async (cle: string, valeur: unknown) =>
    mockMemoire.set(cle, { valeur, maj: '2026-10-12T06:30:00.000Z' }),
  ),
  oublier: jest.fn(async (cle: string) => mockMemoire.delete(cle)),
  effacer: jest.fn(),
}));
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), canGoBack: () => true }),
}));
jest.mock('../src/disposition', () => ({ useTablette: () => false }));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'indispo-1' }));
jest.mock('../src/Ecran', () => ({
  Ecran: ({
    titre,
    surTitre,
    pied,
    children,
  }: {
    titre: string;
    surTitre?: string;
    pied?: ReactNode;
    children: ReactNode;
  }) => {
    const { Text } = jest.requireActual('react-native');
    return (
      <>
        <Text>{titre}</Text>
        <Text>{surTitre}</Text>
        {children}
        {pied}
      </>
    );
  },
}));

const visite = (id: string, heure: string, statut: VisiteProgramme['statut']) =>
  ({
    id,
    date: '2026-10-12',
    heure,
    statut,
    prospect: null,
    etablissement: null,
  }) as unknown as VisiteProgramme;

// Lundi 12 octobre : deux visites faites le matin, quatre encore prévues l'après-midi.
const PROGRAMME = {
  semaine: '2026-10-12',
  aujourdhui: '2026-10-12',
  fuseau: 'UTC',
  etat: 'approuve',
  jours: [
    {
      date: '2026-10-12',
      ferie: null,
      activites: [],
      visites: [
        visite('v1', '08:30', 'effectuee'),
        visite('v2', '10:00', 'effectuee'),
        visite('v3', '13:30', 'prevue'),
        visite('v4', '14:30', 'prevue'),
        visite('v5', '15:30', 'prevue'),
        visite('v6', '16:30', 'prevue'),
      ],
    },
  ],
} as unknown as Programme;

const annonces: { texte: string; ton: string }[] = [];
const fin = jest.fn();

async function rendre(declarer: jest.Mock, programme = PROGRAMME) {
  mockMemoire.set('programme.courant', { valeur: programme, maj: '' });
  const session = {
    etat: { statut: 'connecte' },
    client: { plannings: { declarerIndisponibilite: declarer } } as unknown as ClientApi,
  } as unknown as Session;
  await render(
    <ContexteSession.Provider value={session}>
      <FormulaireIndisponibilite
        programme={programme}
        surFin={fin}
        surAnnonce={(a) => annonces.push(a)}
      />
    </ContexteSession.Provider>,
  );
}

beforeEach(async () => {
  mockMemoire.clear();
  annonces.length = 0;
  fin.mockReset();
  await i18n.changeLanguage('fr');
});

test('maquette : le jour, l’encadré sans motif, et ce que chaque période concerne', async () => {
  await rendre(jest.fn());
  expect(screen.getByText('Indisponibilité imprévue')).toBeTruthy();
  expect(screen.getByText('Lundi 12 octobre')).toBeTruthy();
  expect(screen.getByText(/Aucun motif n’est demandé/)).toBeTruthy();
  expect(screen.getByText('4 visites restantes')).toBeTruthy();
  expect(screen.getByText('2 visites déjà faites : aucune concernée')).toBeTruthy();
  expect(screen.getByText('4 visites concernées')).toBeTruthy();
  // Par défaut, toute la journée.
  expect(screen.getByRole('radio', { name: /Toute la journée/ }).props.accessibilityState).toEqual(
    expect.objectContaining({ checked: true }),
  );
});

test('resumeDesPeriodes : une période déjà déclarée n’est plus proposée', () => {
  const jour = PROGRAMME.jours[0]!;
  const matin = {
    ...PROGRAMME,
    jours: [
      {
        ...jour,
        activites: [{ id: 'a', date: '2026-10-12', periode: 'matin', type: 'indisponibilite' }],
      },
    ],
  } as unknown as Programme;
  expect(resumeDesPeriodes(matin).map((r) => [r.periode, r.declaree])).toEqual([
    ['journee', true],
    ['matin', true],
    ['apres_midi', false],
  ]);
});

test('DC-51 : sans choix, la journée est déclarée sans motif, puis l’écran se ferme', async () => {
  const declarer = jest.fn(async () => ({}));
  await rendre(declarer);
  await fireEvent.press(screen.getByText('Déclarer l’indisponibilité'));
  await waitFor(() => expect(fin).toHaveBeenCalled());
  expect(declarer).toHaveBeenCalledWith({ id: 'indispo-1', periode: 'journee' });
  expect(annonces).toEqual([
    {
      texte: 'Indisponibilité déclarée : les visites de la période sont justifiées.',
      ton: 'succes',
    },
  ]);
  // Le programme gardé sur le téléphone connaît déjà l'indisponibilité.
  const gardé = mockMemoire.get('programme.courant')?.valeur as Programme;
  expect(gardé.jours[0]?.activites).toEqual([
    expect.objectContaining({ type: 'indisponibilite', periode: 'journee' }),
  ]);
});

test('DC-51 : sans réseau, la déclaration de l’après-midi attend dans la file', async () => {
  const declarer = jest.fn(async () => {
    throw new TypeError('Network request failed');
  });
  await rendre(declarer);
  await fireEvent.press(screen.getByRole('radio', { name: /L’après-midi/ }));
  await fireEvent.press(screen.getByText('Déclarer l’indisponibilité'));
  await waitFor(() => expect(fin).toHaveBeenCalled());
  expect(annonces[0]?.ton).toBe('info');
  expect(annonces[0]?.texte).toMatch(/gardée sur le téléphone/);
  expect(await lireAttente()).toEqual([
    expect.objectContaining({
      type: 'indisponibilite',
      saisie: { id: 'indispo-1', periode: 'apres_midi' },
    }),
  ]);
});

test('un refus du serveur reste à l’écran, sans le fermer', async () => {
  const declarer = jest.fn(async () => {
    throw new ErreurApi(
      400,
      'deja_declaree',
      'Une indisponibilité est déjà déclarée pour cette période.',
      {},
    );
  });
  await rendre(declarer);
  await fireEvent.press(screen.getByText('Déclarer l’indisponibilité'));
  expect(await screen.findByText(/déjà déclarée pour cette période/)).toBeTruthy();
  expect(fin).not.toHaveBeenCalled();
});
