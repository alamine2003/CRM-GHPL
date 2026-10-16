import type { ClientApi } from '@innov/api-client';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { type Envoi, lireAttente, mettreEnAttente } from '../src/Brouillons';
import { EcranEnvois } from '../src/Envois';
import i18n from '../src/i18n';
import { ContexteSession, type Session } from '../src/session';

// OFF-003 (maquette 1.5.1) : les envois en attente, leur heure de saisie, « Abandonner »,
// « Envoyer maintenant ».

const mockMemoire = new Map<string, { valeur: unknown; maj: string }>();
jest.mock('../src/baseLocale', () => ({
  lire: jest.fn(async (cle: string) => mockMemoire.get(cle) ?? null),
  ecrire: jest.fn(async (cle: string, valeur: unknown) =>
    mockMemoire.set(cle, { valeur, maj: '2026-10-15T10:32:00.000Z' }),
  ),
  oublier: jest.fn(async (cle: string) => mockMemoire.delete(cle)),
  effacer: jest.fn(async () => mockMemoire.clear()),
}));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn(), back: jest.fn() }) }));
jest.mock('expo-location', () => ({}));
let mockTablette = false;
jest.mock('../src/disposition', () => ({ useTablette: () => mockTablette }));
jest.mock('../src/Ecran', () => ({
  Ecran: ({
    titre,
    surTitre,
    enteteTablette,
    droite,
    children,
  }: {
    titre: string;
    surTitre?: string;
    enteteTablette?: { surTitre?: string; action?: ReactNode };
    droite?: ReactNode;
    children: ReactNode;
  }) => {
    const { Text } = jest.requireActual('react-native');
    return (
      <>
        <Text>{titre}</Text>
        <Text>{mockTablette ? enteteTablette?.surTitre : surTitre}</Text>
        {mockTablette && enteteTablette?.action}
        {children}
        {mockTablette && droite}
      </>
    );
  },
}));

const proposition = (id: string, resume: string, extra: Partial<Envoi> = {}) =>
  ({
    id,
    type: 'proposition',
    saisie: { id, prospect: 'p1', changements: {}, commentaire: '' },
    resume,
    le: '2026-10-15T08:50:00.000Z',
    ...extra,
  }) as Envoi;

function rendre(creer: jest.Mock) {
  const session = {
    etat: { statut: 'connecte' },
    client: { propositions: { creer } } as unknown as ClientApi,
  } as unknown as Session;
  return render(
    <ContexteSession.Provider value={session}>
      <EcranEnvois />
    </ContexteSession.Provider>,
  );
}

beforeEach(async () => {
  mockTablette = false;
  mockMemoire.clear();
  await i18n.changeLanguage('fr');
});

test('OFF-003 : la file se lit, un envoi pas encore parti ne s’abandonne qu’après confirmation', async () => {
  await mettreEnAttente(proposition('e1', 'Dr Awa FICTIVE'));
  await mettreEnAttente(proposition('e2', 'Dr Kossi FICTIF', { erreur: 'Fiche inactive.' }));
  await rendre(jest.fn());
  expect(await screen.findByText('2 envois en attente')).toBeTruthy();
  expect(screen.getAllByText('Proposition de fiche')).toHaveLength(2);
  expect(screen.getByText(/^Dr Awa FICTIVE · /)).toBeTruthy();
  expect(screen.getByText('Fiche inactive.')).toBeTruthy();

  // Refusé par le serveur : il s'abandonne d'un geste.
  await fireEvent.press(screen.getByLabelText("Abandonner l'envoi : Dr Kossi FICTIF"));
  await waitFor(async () => expect(await lireAttente()).toHaveLength(1));

  // Pas encore parti : la confirmation dit ce qui serait perdu ; « Le garder » ne retire rien.
  await fireEvent.press(screen.getByLabelText("Abandonner l'envoi : Dr Awa FICTIVE"));
  expect(screen.getByText(/pas encore parti/)).toBeTruthy();
  await fireEvent.press(screen.getByText('Le garder'));
  expect(await lireAttente()).toHaveLength(1);
});

test('OFF-003 : « Envoyer maintenant » rejoue la file et dit ce qui est parti', async () => {
  await mettreEnAttente(proposition('e1', 'Dr Awa FICTIVE'));
  const creer = jest.fn(async () => ({}));
  await rendre(creer);
  await fireEvent.press(await screen.findByText('Envoyer maintenant'));
  expect(await screen.findByText('Réseau retrouvé : 1 envoi est parti.')).toBeTruthy();
  expect(creer).toHaveBeenCalledTimes(1);
  expect(await lireAttente()).toHaveLength(0);
  expect(screen.getByText('Rien n’attend : tout est parti.')).toBeTruthy();
});

test('OFF-003 : sans réseau, « Pas de réseau » ; tablette : l’heure de saisie et le volet', async () => {
  mockTablette = true;
  await mettreEnAttente(proposition('e1', 'Dr Awa FICTIVE'));
  const creer = jest.fn(async () => {
    throw new TypeError('Network request failed');
  });
  await rendre(creer);
  expect(await screen.findByText('Enregistrés sur cette tablette sans réseau')).toBeTruthy();
  await act(async () => {
    fireEvent.press(screen.getByText('Envoyer maintenant'));
  });
  expect(await screen.findByText('Pas de réseau')).toBeTruthy();
  expect(screen.getByText(/C’est l’heure de saisie sur la tablette qui compte/)).toBeTruthy();
  expect(screen.getByText('Données hors connexion')).toBeTruthy();
  expect(screen.getByText('Rapports prêts sans réseau')).toBeTruthy();
  expect(await lireAttente()).toHaveLength(1);
});
