import { fireEvent, render, screen } from '@testing-library/react-native';
import Accueil from '../app/index';
import i18n from '../src/i18n';

jest.mock('expo-constants', () => ({ expoConfig: { version: '0.0.1' } }));

describe('premier écran mobile', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr');
  });

  it('affiche le titre et la version de l’application', async () => {
    await render(<Accueil />);
    expect(screen.getByText('Bienvenue')).toBeTruthy();
    expect(screen.getByText('0.0.1')).toBeTruthy();
  });

  it('bascule en anglais', async () => {
    await render(<Accueil />);
    await fireEvent.press(screen.getByText('English'));
    expect(await screen.findByText('Welcome')).toBeTruthy();
  });
});
