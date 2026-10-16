/** NOT-005 (0.8.6) : couper une notification ; une obligatoire ne se coupe pas. */
import type { ClientApi } from '@innov/api-client';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import i18n from '../src/i18n';
import { CartePreferences } from '../src/Preferences';
import { ContexteSession, type Session } from '../src/session';

const LISTE = [
  { type: 'correction_demandee', obligatoire: true, push: true },
  { type: 'rapports_valides', obligatoire: false, push: true },
];

function rendre(lire: jest.Mock, changer: jest.Mock) {
  const session = {
    etat: { statut: 'connecte' },
    client: { preferences: { lire, changer } } as unknown as ClientApi,
  } as unknown as Session;
  return render(
    <ContexteSession.Provider value={session}>
      <CartePreferences />
    </ContexteSession.Provider>,
  );
}

beforeEach(async () => {
  await i18n.changeLanguage('fr');
});

test('NOT-005 : couper une notification, les obligatoires restent', async () => {
  const changer = jest.fn(async (coupes: string[]) =>
    LISTE.map((x) => ({ ...x, push: x.obligatoire || !coupes.includes(x.type) })),
  );
  await rendre(
    jest.fn(async () => LISTE),
    changer,
  );
  const correction = await screen.findByLabelText('Correction de rapport demandée');
  expect(correction.props.accessibilityState?.disabled).toBe(true);
  expect(screen.getByText('Obligatoire')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Rapports validés'));
  await waitFor(() => expect(changer).toHaveBeenCalledWith(['rapports_valides']));
  expect(screen.getByLabelText('Rapports validés').props.accessibilityState.checked).toBe(false);
});

test('NOT-005 : sans réseau, le réglage revient et le dit', async () => {
  const changer = jest.fn(async () => {
    throw new TypeError('Network request failed');
  });
  await rendre(
    jest.fn(async () => LISTE),
    changer,
  );
  await fireEvent.press(await screen.findByLabelText('Rapports validés'));
  expect(await screen.findByText(/Pas de réseau/)).toBeTruthy();
  expect(screen.getByLabelText('Rapports validés').props.accessibilityState.checked).toBe(true);
});

test('NOT-005 : sans réseau à l’ouverture, la carte le dit', async () => {
  await rendre(
    jest.fn(async () => {
      throw new TypeError('Network request failed');
    }),
    jest.fn(),
  );
  expect(await screen.findByText(/se changent avec du réseau/)).toBeTruthy();
});
