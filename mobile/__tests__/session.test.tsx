import { type ClientApi, ErreurApi, type Jetons } from '@innov/api-client';
import { fireEvent, render, screen } from '@testing-library/react-native';
import Connexion from '../app/connexion';
import Accueil from '../app/index';
import { FournisseurSession } from '../src/FournisseurSession';
import i18n from '../src/i18n';

jest.mock('expo-constants', () => ({ expoConfig: { version: '0.0.3', extra: {} } }));
jest.mock('expo-router', () => {
  const { Text: Texte } = jest.requireActual('react-native');
  return { Redirect: ({ href }: { href: string }) => <Texte>{`redirection:${href}`}</Texte> };
});
jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual('react-native');
  return {
    SafeAreaView: View,
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});

// Généré à l'exécution : aucun mot de passe, même de test, n'est écrit dans le dépôt.
const MDP = `${Math.random().toString(36).slice(2)}-Aa9-${Date.now()}`;
const JETONS: Jetons = {
  acces: 'A',
  expire_dans: 900,
  rafraichissement: 'R',
  utilisateur: {
    id: '1',
    identifiant: 'awa.diallo',
    prenom: 'Awa',
    nom: 'Diallo',
    courriel: '',
    pays_principal: { code: 'SN', nom: 'Sénégal', fuseau: 'Africa/Dakar' },
    est_siege: false,
  },
};

const PERIMETRE = {
  pays_actif: { code: 'SN', nom: 'Sénégal', fuseau: 'Africa/Dakar' },
  vue_consolidee: false,
  roles: ['delegue'],
  actions: ['pays.lire'],
  pays_accessibles: [{ code: 'SN', nom: 'Sénégal', fuseau: 'Africa/Dakar' }],
};

function fauxClient(surcharges: Partial<ClientApi> = {}): ClientApi {
  return {
    perimetre: jest.fn(async () => PERIMETRE),
    connexion: jest.fn(async () => JETONS),
    reprendre: jest.fn(async () => {
      throw new ErreurApi(401, 'session_invalide', 'Session invalide');
    }),
    deconnexion: jest.fn(async () => undefined),
    demanderReinitialisation: jest.fn(async () => undefined),
    ...surcharges,
  } as unknown as ClientApi;
}

async function rendre(ecran: React.ReactElement, client: ClientApi) {
  return render(<FournisseurSession client={client}>{ecran}</FournisseurSession>);
}

describe('mobile — session', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr');
  });

  it('sans session enregistrée, l’accueil renvoie vers la connexion', async () => {
    await rendre(<Accueil />, fauxClient());
    expect(await screen.findByText('redirection:/connexion')).toBeTruthy();
  });

  it('reprend la session du magasin sécurisé et accueille le délégué', async () => {
    await rendre(<Accueil />, fauxClient({ reprendre: jest.fn(async () => JETONS) }));
    expect(await screen.findByText('Bonjour Awa')).toBeTruthy();
    expect(screen.getAllByText(/Sénégal/).length).toBeGreaterThan(0);
    expect(screen.getByText('0.0.3')).toBeTruthy();
    expect(screen.getByText('Délégué')).toBeTruthy();
  });

  it('se connecte avec l’identifiant et le mot de passe', async () => {
    const client = fauxClient();
    await rendre(<Connexion />, client);
    await fireEvent.changeText(await screen.findByLabelText('Identifiant'), 'awa.diallo');
    await fireEvent.changeText(screen.getByLabelText('Mot de passe'), MDP);
    await fireEvent.press(screen.getByText('Se connecter'));
    expect(client.connexion).toHaveBeenCalledWith('awa.diallo', MDP);
    expect(await screen.findByText('redirection:/')).toBeTruthy();
  });

  it('affiche le message traduit du serveur en cas de refus', async () => {
    const client = fauxClient({
      connexion: jest.fn(async () => {
        throw new ErreurApi(403, 'pays_suspendu', 'Le pays Sénégal est suspendu.');
      }),
    });
    await rendre(<Connexion />, client);
    await fireEvent.changeText(await screen.findByLabelText('Identifiant'), 'awa.diallo');
    await fireEvent.press(screen.getByText('Se connecter'));
    expect(await screen.findByText('Le pays Sénégal est suspendu.')).toBeTruthy();
  });

  it('demande un lien de réinitialisation', async () => {
    const client = fauxClient();
    await rendre(<Connexion />, client);
    await fireEvent.press(await screen.findByText('Mot de passe oublié ?'));
    await fireEvent.changeText(screen.getByLabelText('Identifiant ou courriel'), 'awa.diallo');
    await fireEvent.press(screen.getByText('Envoyer le lien'));
    expect(client.demanderReinitialisation).toHaveBeenCalledWith('awa.diallo');
    expect(await screen.findByText(/vient d'être envoyé/)).toBeTruthy();
  });

  it('se déconnecte', async () => {
    const client = fauxClient({ reprendre: jest.fn(async () => JETONS) });
    await rendre(<Accueil />, client);
    await fireEvent.press(await screen.findByText('Se déconnecter'));
    expect(client.deconnexion).toHaveBeenCalled();
    expect(await screen.findByText('redirection:/connexion')).toBeTruthy();
  });

  it('prévient le délégué qui n’a aucun rôle', async () => {
    await rendre(
      <Accueil />,
      fauxClient({
        reprendre: jest.fn(async () => JETONS),
        perimetre: jest.fn(async () => ({ ...PERIMETRE, roles: [], actions: [] })),
      }),
    );
    expect(await screen.findByText(/Aucun rôle ne vous est attribué/)).toBeTruthy();
  });

  it('bascule en anglais', async () => {
    await rendre(<Accueil />, fauxClient({ reprendre: jest.fn(async () => JETONS) }));
    await fireEvent.press(await screen.findByText('English'));
    expect(await screen.findByText('Hello Awa')).toBeTruthy();
  });
});
