import type { ClientApi } from '@innov/api-client';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { envoyerAttente, lireAttente } from '../src/Brouillons';
import i18n from '../src/i18n';
import { ProposerCorrection } from '../src/Proposition';
import { ContexteSession, type Session } from '../src/session';

// OFF-002 (0.8.2) : une proposition de mise à jour faite sans réseau attend dans la file, avec
// l'identifiant tiré sur le téléphone, et part une seule fois au retour du réseau.
const mockMemoire = new Map<string, { valeur: unknown; maj: string }>();
jest.mock('../src/baseLocale', () => ({
  lire: jest.fn(async (cle: string) => mockMemoire.get(cle) ?? null),
  ecrire: jest.fn(async (cle: string, valeur: unknown) => {
    mockMemoire.set(cle, { valeur, maj: '2026-10-14T08:00:00.000Z' });
  }),
  oublier: jest.fn(async (cle: string) => mockMemoire.delete(cle)),
}));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'id-du-telephone' }));
jest.mock('expo-file-system/legacy', () => ({}));

test('OFF-002 CA1 : sans réseau, la proposition attend avec son identifiant', async () => {
  await i18n.changeLanguage('fr');
  const creer = jest
    .fn()
    .mockRejectedValueOnce(new TypeError('Network request failed'))
    .mockResolvedValue({ id: 'id-du-telephone' });
  const session = {
    etat: { statut: 'connecte', perimetre: { actions: ['propositions.creer'] } },
    client: { propositions: { creer } } as unknown as ClientApi,
  } as unknown as Session;
  await render(
    <ContexteSession.Provider value={session}>
      <ProposerCorrection objet="prospect" id="p1" actuels={{ telephone_mobile: '' }} />
    </ContexteSession.Provider>,
  );
  fireEvent.press(screen.getByRole('button', { name: 'Proposer une correction' }));
  fireEvent.changeText(await screen.findByLabelText('Téléphone mobile'), '77 999 88 77');
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Envoyer la proposition' }).props.accessibilityState
        ?.disabled,
    ).toBeFalsy(),
  );
  fireEvent.press(screen.getByRole('button', { name: 'Envoyer la proposition' }));
  await waitFor(() => expect(creer).toHaveBeenCalledTimes(1));
  expect(await screen.findByText(/votre proposition est gardée sur le téléphone/)).toBeTruthy();
  const [envoi] = await lireAttente();
  expect(envoi).toMatchObject({ id: 'id-du-telephone', type: 'proposition' });
  // Au retour du réseau, elle part avec le même identifiant, une seule fois.
  await waitFor(async () => expect(await envoyerAttente(session.client)).toBe(1));
  expect(creer).toHaveBeenLastCalledWith(
    expect.objectContaining({ id: 'id-du-telephone', prospect: 'p1' }),
  );
  expect(await lireAttente()).toEqual([]);
});
