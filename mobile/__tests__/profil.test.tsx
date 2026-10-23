import type { ClientApi } from '@innov/api-client';
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import i18n from '../src/i18n';
import { EcranProfil } from '../src/Profil';
import { ContexteSession, type Session } from '../src/session';

// Maquette 1.5.0 : Mon profil (USR-004 langue, USR-006 appareil, OFF-001 données gardées).

let mockTablette = false;
jest.mock('../src/disposition', () => ({ useTablette: () => mockTablette }));
jest.mock('../src/appareil', () => ({ identifiantInstallation: async () => 'a3f91c2e-0000' }));
jest.mock('../src/Synchronisation', () => {
  const { Text } = jest.requireActual('react-native');
  return {
    CarteSynchro: ({ tablette }: { tablette?: boolean }) => (
      <Text>{tablette ? 'Synchro (tablette)' : 'Synchro (téléphone)'}</Text>
    ),
    StatutSynchro: () => <Text>Synchronisé à 10:32</Text>,
  };
});
jest.mock('../src/MonPoste', () => ({ MonPoste: () => null }));
jest.mock('../src/MesProduits', () => ({ MesProduits: () => null }));
jest.mock('../src/Preferences', () => ({ CartePreferences: () => null }));
jest.mock('../src/Ecran', () => ({
  Ecran: ({
    titre,
    surTitre,
    enteteTablette,
    children,
  }: {
    titre: string;
    surTitre?: string;
    enteteTablette?: { surTitre?: string; action?: ReactNode };
    children: ReactNode;
  }) => {
    const { Text } = jest.requireActual('react-native');
    return (
      <>
        <Text>{titre}</Text>
        <Text>{mockTablette ? enteteTablette?.surTitre : surTitre}</Text>
        {mockTablette && enteteTablette?.action}
        {children}
      </>
    );
  },
}));

function session(changerLangue = jest.fn(), deconnexion = jest.fn()) {
  return {
    etat: {
      statut: 'connecte',
      utilisateur: {
        identifiant: 'awa.fictive',
        prenom: 'Awa',
        nom: 'FICTIVE',
        courriel: 'awa.fictive@exemple.test',
      },
      perimetre: { roles: ['delegue'], pays_actif: { code: 'SN', nom: 'Sénégal' } },
    },
    client: {} as ClientApi,
    changerLangue,
    deconnexion,
  } as unknown as Session;
}

beforeEach(async () => {
  mockTablette = false;
  await i18n.changeLanguage('fr');
});

test('téléphone : qui je suis, la langue, ce téléphone, la déconnexion', async () => {
  const changerLangue = jest.fn();
  const deconnexion = jest.fn();
  await render(
    <ContexteSession.Provider value={session(changerLangue, deconnexion)}>
      <EcranProfil />
    </ContexteSession.Provider>,
  );
  expect(screen.getByText('Mon profil')).toBeTruthy();
  expect(screen.getAllByText('Awa FICTIVE')).toHaveLength(2);
  expect(screen.getByText('Délégué · Sénégal')).toBeTruthy();
  expect(screen.getByText('Synchro (téléphone)')).toBeTruthy();
  expect(screen.getByText('Ce téléphone')).toBeTruthy();
  expect(await screen.findByText('a3f91c2e…')).toBeTruthy();
  await fireEvent.press(screen.getByRole('radio', { name: 'English' }));
  expect(changerLangue).toHaveBeenCalledWith('en');
  await fireEvent.press(screen.getByText('Se déconnecter'));
  expect(deconnexion).toHaveBeenCalled();
});

test('tablette : le compte à gauche, les données hors connexion à droite', async () => {
  mockTablette = true;
  await render(
    <ContexteSession.Provider value={session()}>
      <EcranProfil />
    </ContexteSession.Provider>,
  );
  expect(screen.getByText('Awa FICTIVE · Sénégal')).toBeTruthy();
  expect(screen.getByText('Délégué · Sénégal · awa.fictive')).toBeTruthy();
  expect(screen.getByText('Synchronisé à 10:32')).toBeTruthy();
  expect(screen.getByText('Compte')).toBeTruthy();
  expect(screen.getByText('awa.fictive@exemple.test')).toBeTruthy();
  expect(screen.getByText('Cette tablette')).toBeTruthy();
  expect(screen.getByText('Synchro (tablette)')).toBeTruthy();
  expect(screen.getByText('Se déconnecter')).toBeTruthy();
  expect(await screen.findByText('a3f91c2e…')).toBeTruthy();
});
