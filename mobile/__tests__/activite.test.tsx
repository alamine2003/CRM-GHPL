import type { ClientApi, Semaine } from '@innov/api-client';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { FormulaireActivite } from '../src/Activites';
import i18n from '../src/i18n';
import { ContexteSession, type Session } from '../src/session';

// PLN-009, PLN-018 (maquette 1.5.7) : « Nouvelle activité » — un écran à part ; le type, la
// période, le commentaire ; sur la tablette, une colonne centrée et l'encadré d'information.

const mockMemoire = new Map<string, { valeur: unknown; maj: string }>();
jest.mock('../src/baseLocale', () => ({
  lire: jest.fn(async (cle: string) => mockMemoire.get(cle) ?? null),
  ecrire: jest.fn(async (cle: string, valeur: unknown) =>
    mockMemoire.set(cle, { valeur, maj: '2026-10-12T06:30:00.000Z' }),
  ),
  oublier: jest.fn(async (cle: string) => mockMemoire.delete(cle)),
  effacer: jest.fn(),
}));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn(), back: jest.fn() }) }));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'activite-1' }));
let mockTablette = false;
jest.mock('../src/disposition', () => ({ useTablette: () => mockTablette }));
jest.mock('../src/Ecran', () => ({
  Ecran: ({
    titre,
    surTitre,
    enteteTablette,
    pied,
    children,
  }: {
    titre: string;
    surTitre?: string;
    enteteTablette?: { action?: ReactNode };
    pied?: ReactNode;
    children: ReactNode;
  }) => {
    const { Text } = jest.requireActual('react-native');
    return (
      <>
        <Text>{titre}</Text>
        <Text>{surTitre}</Text>
        {mockTablette && enteteTablette?.action}
        {children}
        {pied}
      </>
    );
  },
}));

const SEMAINE = {
  semaine: '2026-10-12',
  planning: { id: 'pl1' },
  jours: [
    { date: '2026-10-14', planifiable: true, ferie: null },
    { date: '2026-10-15', planifiable: true, ferie: null },
  ],
} as unknown as Semaine;

const termine = jest.fn();
const annule = jest.fn();

async function rendre(declarerActivite = jest.fn(async () => ({}))) {
  const session = {
    etat: { statut: 'connecte' },
    client: { plannings: { declarerActivite } } as unknown as ClientApi,
  } as unknown as Session;
  await render(
    <ContexteSession.Provider value={session}>
      <FormulaireActivite
        semaine={SEMAINE}
        jour="2026-10-14"
        surTermine={termine}
        surAnnuler={annule}
      />
    </ContexteSession.Provider>,
  );
  return declarerActivite;
}

beforeEach(async () => {
  mockTablette = false;
  mockMemoire.clear();
  termine.mockReset();
  annule.mockReset();
  await i18n.changeLanguage('fr');
});

test('téléphone : le jour, les types, la période en segments, le commentaire', async () => {
  const declarerActivite = await rendre();
  expect(screen.getByText('Nouvelle activité')).toBeTruthy();
  expect(screen.getByLabelText('Jour : Mercredi 14 octobre')).toBeTruthy();
  // L'indisponibilité imprévue ne se planifie pas : elle n'est pas proposée ici (DC-51).
  expect(screen.queryByText('Indisponibilité imprévue')).toBeNull();
  expect(screen.getByText('Accompagnement du superviseur')).toBeTruthy();
  expect(screen.getByRole('radio', { name: 'Journée' }).props.accessibilityState).toEqual(
    expect.objectContaining({ checked: true }),
  );
  // Sans type, rien ne s'enregistre.
  await fireEvent.press(screen.getByText('Enregistrer'));
  expect(declarerActivite).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByText('Formation'));
  await fireEvent.press(screen.getByRole('radio', { name: 'Matin' }));
  await fireEvent.changeText(screen.getByLabelText('Commentaire (facultatif)'), 'Stage produit');
  await fireEvent.press(screen.getByText('Enregistrer'));
  await waitFor(() => expect(termine).toHaveBeenCalledWith('Activité déclarée.'));
  expect(declarerActivite).toHaveBeenCalledWith(
    'pl1',
    expect.objectContaining({
      id: 'activite-1',
      date: '2026-10-14',
      type: 'formation',
      periode: 'matin',
      commentaire: 'Stage produit',
      demande_superviseur: false,
    }),
  );
});

test('un déplacement dit qui l’a décidé, et demande une explication', async () => {
  const declarerActivite = await rendre();
  await fireEvent.press(screen.getByText('Déplacement'));
  expect(screen.getByText('Expliquez cette activité : où, avec qui, et pourquoi.')).toBeTruthy();
  await fireEvent.press(screen.getByRole('radio', { name: 'Demandé par mon superviseur' }));
  await fireEvent.changeText(
    screen.getByLabelText('Explication : où, avec qui, pourquoi'),
    'Thiès, avec le DM, formation',
  );
  await fireEvent.press(screen.getByText('Enregistrer'));
  await waitFor(() => expect(declarerActivite).toHaveBeenCalled());
  expect(declarerActivite).toHaveBeenCalledWith(
    'pl1',
    expect.objectContaining({ type: 'deplacement', demande_superviseur: true }),
  );
});

test('« Annuler » ferme l’écran sans rien envoyer', async () => {
  const declarerActivite = await rendre();
  await fireEvent.press(screen.getByText('Annuler'));
  expect(annule).toHaveBeenCalled();
  expect(declarerActivite).not.toHaveBeenCalled();
});

test('tablette : les boutons dans l’en-tête et l’encadré sur les visites du jour', async () => {
  mockTablette = true;
  await rendre();
  expect(screen.getByText('Annuler')).toBeTruthy();
  expect(screen.getByText('Enregistrer')).toBeTruthy();
  expect(screen.getByText(/Les visites de ce jour restent dans le planning/)).toBeTruthy();
  expect(screen.getByText('Période')).toBeTruthy();
});
