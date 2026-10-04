import { fireEvent, render, screen } from '@testing-library/react-native';
import { useState } from 'react';
import { Text } from 'react-native';
import { LimiteErreur } from '../src/Erreurs';
import i18n from '../src/i18n';

const mockSignaler = jest.fn(async (_rapport: unknown) => undefined);
jest.mock('../src/client', () => ({
  creerClientMobile: () => ({ signalerErreur: (rapport: unknown) => mockSignaler(rapport) }),
}));
jest.mock('expo-constants', () => ({ expoConfig: { version: '0.0.7', extra: {} } }));

let panne = true;
function Fragile() {
  const [, forcer] = useState(0);
  if (panne) throw new Error('panne simulée');
  return <Text onPress={() => forcer(1)}>Tout va bien</Text>;
}

describe('mobile — erreurs (0.0.7)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr');
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  it('affiche l’écran d’erreur, signale la panne et permet de réessayer', async () => {
    await render(
      <LimiteErreur>
        <Fragile />
      </LimiteErreur>,
    );
    expect(await screen.findByText('Quelque chose s’est mal passé')).toBeTruthy();
    expect(screen.getByText(/^Référence : /)).toBeTruthy();
    expect(mockSignaler).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Error: panne simulée', version: '0.0.7' }),
    );
    panne = false;
    await fireEvent.press(screen.getByText('Réessayer'));
    expect(await screen.findByText('Tout va bien')).toBeTruthy();
  });
});
