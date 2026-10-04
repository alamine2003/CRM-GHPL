import { type ClientApi, ErreurApi, type Jetons, type Moi } from '@innov/api-client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router';
import App from './App';
import i18n from './i18n';
import { FournisseurSession } from './session';

const AWA: Moi = {
  id: '1',
  identifiant: 'awa.diallo',
  prenom: 'Awa',
  nom: 'Diallo',
  courriel: 'awa.diallo@exemple.org',
  pays_principal: { code: 'SN', nom: 'Sénégal', fuseau: 'Africa/Dakar' },
  est_siege: false,
};
const JETONS: Jetons = { acces: 'A', expire_dans: 900, rafraichissement: null, utilisateur: AWA };

function fauxClient(surcharges: Partial<ClientApi> = {}): ClientApi {
  return {
    connexion: vi.fn(async () => JETONS),
    reprendre: vi.fn(async () => {
      throw new ErreurApi(401, 'session_invalide', 'Session invalide');
    }),
    deconnexion: vi.fn(async () => undefined),
    moi: vi.fn(async () => AWA),
    informations: vi.fn(async () => ({
      produit: 'INNOV CRM',
      version: '0.0.3',
      environnement: 'test',
      langue: 'fr',
      message: '',
      langues: [],
    })),
    demanderReinitialisation: vi.fn(async () => undefined),
    reinitialiser: vi.fn(async () => undefined),
    requete: vi.fn(),
    estConnecte: () => false,
    ...surcharges,
  } as ClientApi;
}

function rendre(client: ClientApi, chemin = '/') {
  const requetes = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={requetes}>
      <MemoryRouter initialEntries={[chemin]}>
        <FournisseurSession client={client}>
          <App />
        </FournisseurSession>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

async function saisir(libelle: RegExp | string, valeur: string) {
  fireEvent.change(await screen.findByLabelText(libelle), { target: { value: valeur } });
}

describe('portail — connexion (USR-001, SEC-002)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr');
  });

  it('sans session, redirige vers la page de connexion', async () => {
    rendre(fauxClient());
    expect(await screen.findByRole('heading', { name: 'Connexion' })).toBeInTheDocument();
  });

  it('reprend une session existante et affiche l’accueil personnalisé', async () => {
    rendre(fauxClient({ reprendre: vi.fn(async () => JETONS) }));
    expect(await screen.findByRole('heading', { name: 'Bonjour Awa' })).toBeInTheDocument();
    expect(screen.getByText('Sénégal')).toBeInTheDocument();
    expect(await screen.findByText('Service disponible')).toBeInTheDocument();
  });

  it('se connecte puis se déconnecte', async () => {
    const client = fauxClient();
    rendre(client);
    await saisir(/Identifiant/, 'awa.diallo');
    await saisir(/^Mot de passe/, String(Date.now()));
    fireEvent.click(screen.getByRole('button', { name: 'Se connecter' }));
    expect(await screen.findByRole('heading', { name: 'Bonjour Awa' })).toBeInTheDocument();
    expect(client.connexion).toHaveBeenCalledWith('awa.diallo', String(Date.now()));
    fireEvent.click(screen.getByRole('button', { name: 'Se déconnecter' }));
    expect(await screen.findByRole('heading', { name: 'Connexion' })).toBeInTheDocument();
    expect(client.deconnexion).toHaveBeenCalled();
  });

  it('affiche le message du serveur et vide le mot de passe en cas d’échec', async () => {
    const client = fauxClient({
      connexion: vi.fn(async () => {
        throw new ErreurApi(423, 'compte_verrouille', 'Trop d’essais : compte verrouillé.');
      }),
    });
    rendre(client);
    await saisir(/Identifiant/, 'awa.diallo');
    await saisir(/^Mot de passe/, 'mauvais');
    fireEvent.click(screen.getByRole('button', { name: 'Se connecter' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('compte verrouillé');
    expect(screen.getByLabelText(/^Mot de passe/)).toHaveValue('');
  });

  it('signale un service injoignable', async () => {
    const client = fauxClient({
      connexion: vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    });
    rendre(client);
    await saisir(/Identifiant/, 'awa.diallo');
    await saisir(/^Mot de passe/, 'x');
    fireEvent.click(screen.getByRole('button', { name: 'Se connecter' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Service injoignable');
  });

  it('affiche ou masque le mot de passe', async () => {
    rendre(fauxClient());
    const champ = await screen.findByLabelText(/^Mot de passe/);
    expect(champ).toHaveAttribute('type', 'password');
    fireEvent.click(screen.getByRole('button', { name: 'Afficher le mot de passe' }));
    expect(champ).toHaveAttribute('type', 'text');
  });

  it('bascule en anglais', async () => {
    rendre(fauxClient());
    await screen.findByRole('heading', { name: 'Connexion' });
    await act(() => i18n.changeLanguage('en'));
    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
  });
});

describe('portail — récupération d’accès (USR-005)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr');
  });

  it('demande un lien sans révéler si le compte existe', async () => {
    const client = fauxClient();
    rendre(client, '/mot-de-passe-oublie');
    await saisir(/Identifiant ou courriel/, 'awa.diallo');
    fireEvent.click(screen.getByRole('button', { name: 'Envoyer le lien' }));
    expect(await screen.findByText(/vient d'être envoyé/)).toBeInTheDocument();
    expect(client.demanderReinitialisation).toHaveBeenCalledWith('awa.diallo');
  });

  it('refuse deux mots de passe différents sans appeler le serveur', async () => {
    const client = fauxClient();
    rendre(client, '/reinitialisation?jeton=abc');
    await saisir(/^Nouveau mot de passe/, String(Date.now()));
    await saisir(/^Confirmez le mot de passe/, 'Autre-Chose-Encore');
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('ne correspondent pas');
    expect(client.reinitialiser).not.toHaveBeenCalled();
  });

  it('enregistre le nouveau mot de passe avec le jeton du lien', async () => {
    const client = fauxClient();
    rendre(client, '/reinitialisation?jeton=abc');
    await saisir(/^Nouveau mot de passe/, String(Date.now()));
    await saisir(/^Confirmez le mot de passe/, String(Date.now()));
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(await screen.findByText(/Mot de passe enregistré/)).toBeInTheDocument();
    expect(client.reinitialiser).toHaveBeenCalledWith('abc', String(Date.now()));
  });

  it('signale un lien incomplet', async () => {
    rendre(fauxClient(), '/reinitialisation');
    expect(await screen.findByText(/Lien incomplet/)).toBeInTheDocument();
  });
});
