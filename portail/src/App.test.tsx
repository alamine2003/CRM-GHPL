import {
  type ClientApi,
  ErreurApi,
  type Jetons,
  type Moi,
  type MonOrganisation,
  type Perimetre,
  type Poste,
} from '@innov/api-client';
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
// Généré à l'exécution : aucun mot de passe, même de test, n'est écrit dans le dépôt.
const MDP = `${Math.random().toString(36).slice(2)}-Aa9-${Date.now()}`;
const NOUVEAU = `${Math.random().toString(36).slice(2)}-Bb8-${Date.now()}`;
const JETONS: Jetons = { acces: 'A', expire_dans: 900, rafraichissement: null, utilisateur: AWA };

const SENEGAL = { code: 'SN', nom: 'Sénégal', fuseau: 'Africa/Dakar' };
const TOGO = { code: 'TG', nom: 'Togo', fuseau: 'Africa/Lome' };
const PERIMETRE_DELEGUE: Perimetre = {
  pays_actif: SENEGAL,
  vue_consolidee: false,
  roles: ['delegue'],
  actions: ['pays.lire'],
  pays_accessibles: [SENEGAL],
};

const SANS_POSTE: MonOrganisation = {
  postes: [],
  postes_supervises: 0,
  reseaux: [],
  superviseur_manquant: false,
};
const SYNTHESE = {
  divisions: 1,
  reseaux: 2,
  zones: 2,
  secteurs: 5,
  postes: 3,
  postes_vacants: 1,
  postes_sans_superviseur: 1,
};
const MOUSSA = { id: 'p1', identifiant: 'moussa.fall', prenom: 'Moussa', nom: 'Fall' };
const NDEYE = { id: 'p2', identifiant: 'ndeye.diop', prenom: 'Ndèye', nom: 'Diop' };
function poste(id: string, libelle: string, occupant: typeof MOUSSA | null, superviseur = NDEYE) {
  return {
    id,
    pays: 'SN',
    libelle,
    type_poste: 'vm',
    type_libelle: 'Visiteur médical',
    reseaux: [{ id: 'r1', libelle: 'Cardio' }],
    secteurs: [],
    occupant,
    superviseur: superviseur as typeof NDEYE | null,
    vacant: occupant === null,
    archive: false,
  } as Poste;
}
const POSTES: Poste[] = [
  poste('a', 'VM Dakar Plateau', MOUSSA),
  poste('b', 'VM Thiès', null),
  { ...poste('c', 'KAM Saint-Louis', MOUSSA), superviseur: null },
];

function fausseOrganisation(surcharges: Partial<ClientApi['organisation']> = {}) {
  return {
    synthese: vi.fn(async () => SYNTHESE),
    moi: vi.fn(async () => SANS_POSTE),
    postes: vi.fn(async () => POSTES),
    zones: vi.fn(async () => []),
    secteurs: vi.fn(async () => []),
    divisions: vi.fn(async () => []),
    reseaux: vi.fn(async () => []),
    creerPoste: vi.fn(async () => POSTES[0]),
    ...surcharges,
  } as unknown as ClientApi['organisation'];
}

function fauxClient(surcharges: Partial<ClientApi> = {}): ClientApi {
  return {
    organisation: fausseOrganisation(),
    utilisateurs: vi.fn(async () => []),
    perimetre: vi.fn(async () => PERIMETRE_DELEGUE),
    choisirPays: vi.fn(),
    paysActif: () => null,
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
    expect(screen.getAllByText('Sénégal').length).toBeGreaterThan(0);
    expect(screen.getByText(/^Cycle 0\.\d · /)).toBeInTheDocument();
    expect(screen.getByText('Délégué')).toBeInTheDocument();
    expect(await screen.findByText('Service disponible')).toBeInTheDocument();
  });

  it('se connecte puis se déconnecte', async () => {
    const client = fauxClient();
    rendre(client);
    await saisir(/Identifiant/, 'awa.diallo');
    await saisir(/^Mot de passe/, MDP);
    fireEvent.click(screen.getByRole('button', { name: 'Se connecter' }));
    expect(await screen.findByRole('heading', { name: 'Bonjour Awa' })).toBeInTheDocument();
    expect(client.connexion).toHaveBeenCalledWith('awa.diallo', MDP);
    // Écran étroit : la navigation est repliée dans le menu.
    fireEvent.click(screen.getByRole('button', { name: 'Menu' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Se déconnecter' }));
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

describe('portail — rôles et pays actif (USR-001, USR-002)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr');
  });

  it('prévient l’utilisateur qui n’a aucun rôle', async () => {
    const sansRole = { ...PERIMETRE_DELEGUE, roles: [], actions: [] };
    rendre(
      fauxClient({ reprendre: vi.fn(async () => JETONS), perimetre: vi.fn(async () => sansRole) }),
    );
    expect(await screen.findByText(/Aucun rôle ne vous est attribué/)).toBeInTheDocument();
  });

  it('un délégué d’un seul pays n’a pas de sélecteur de pays', async () => {
    rendre(fauxClient({ reprendre: vi.fn(async () => JETONS) }));
    await screen.findByRole('heading', { name: 'Bonjour Awa' });
    expect(screen.queryByLabelText('Pays')).not.toBeInTheDocument();
  });

  it('le siège passe de la vue consolidée à un pays', async () => {
    const consolide: Perimetre = {
      pays_actif: null,
      vue_consolidee: true,
      roles: ['direction_siege'],
      actions: ['pays.lire'],
      pays_accessibles: [SENEGAL, TOGO],
    };
    const perimetre = vi
      .fn()
      .mockResolvedValueOnce(consolide)
      .mockResolvedValueOnce({ ...consolide, pays_actif: TOGO, vue_consolidee: false });
    const client = fauxClient({ reprendre: vi.fn(async () => JETONS), perimetre });
    rendre(client);
    const selecteur = await screen.findByLabelText('Pays');
    expect(screen.getAllByText('Vue consolidée').length).toBeGreaterThan(0);
    fireEvent.mouseDown(selecteur);
    fireEvent.click(await screen.findByRole('option', { name: 'Togo' }));
    expect(client.choisirPays).toHaveBeenCalledWith('TG');
    expect((await screen.findAllByText('Togo')).length).toBeGreaterThan(0);
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
    await saisir(/^Nouveau mot de passe/, NOUVEAU);
    await saisir(/^Confirmez le mot de passe/, 'Autre-Chose-Encore');
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('ne correspondent pas');
    expect(client.reinitialiser).not.toHaveBeenCalled();
  });

  it('enregistre le nouveau mot de passe avec le jeton du lien', async () => {
    const client = fauxClient();
    rendre(client, '/reinitialisation?jeton=abc');
    await saisir(/^Nouveau mot de passe/, NOUVEAU);
    await saisir(/^Confirmez le mot de passe/, NOUVEAU);
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(await screen.findByText(/Mot de passe enregistré/)).toBeInTheDocument();
    expect(client.reinitialiser).toHaveBeenCalledWith('abc', NOUVEAU);
  });

  it('signale un lien incomplet', async () => {
    rendre(fauxClient(), '/reinitialisation');
    expect(await screen.findByText(/Lien incomplet/)).toBeInTheDocument();
  });
});

describe('portail — organisation (ORG-003 à ORG-008)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr');
  });

  const ADMIN_PAYS: Perimetre = {
    ...PERIMETRE_DELEGUE,
    roles: ['admin_pays'],
    actions: ['organisation.gerer', 'organisation.lire', 'pays.lire'],
  };

  it('le délégué voit son poste et l’alerte s’il n’a pas de superviseur (ORG-007)', async () => {
    const moi: MonOrganisation = {
      postes: [
        {
          occupation: {
            id: 'o1',
            poste: { id: 'a', libelle: 'VM Dakar Plateau' },
            personne: MOUSSA,
            debut: '2026-09-01',
            fin: null,
            principal: true,
            actif: true,
          },
          type_poste: 'vm',
          type_libelle: 'Visiteur médical',
          reseaux: [{ id: 'r1', libelle: 'Cardio' }],
          secteurs: [{ id: 's1', libelle: 'Plateau' }],
          superviseur: null,
        },
      ],
      postes_supervises: 0,
      reseaux: [],
      superviseur_manquant: true,
    };
    rendre(
      fauxClient({
        reprendre: vi.fn(async () => JETONS),
        organisation: fausseOrganisation({ moi: vi.fn(async () => moi) }),
      }),
    );
    expect(await screen.findByText('VM Dakar Plateau')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('pas de superviseur');
    // Le délégué n'a pas accès à la page Organisation.
    expect(screen.queryByRole('link', { name: /Organisation/ })).not.toBeInTheDocument();
  });

  it('l’administrateur pays consulte les postes, les filtre et voit les vacants', async () => {
    rendre(
      fauxClient({
        reprendre: vi.fn(async () => JETONS),
        perimetre: vi.fn(async () => ADMIN_PAYS),
      }),
      '/organisation',
    );
    expect(await screen.findByRole('heading', { name: 'Organisation' })).toBeInTheDocument();
    expect(await screen.findByText('VM Thiès')).toBeInTheDocument();
    expect(screen.getByText('Postes vacants')).toBeInTheDocument();
    expect(screen.getAllByText('Vacant').length).toBe(1);
    fireEvent.click(screen.getByRole('button', { name: 'Vacants' }));
    expect(screen.queryByText('VM Dakar Plateau')).not.toBeInTheDocument();
    expect(screen.getByText('VM Thiès')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Tous' }));
    await saisir('Rechercher', 'saint');
    expect(screen.getByText('KAM Saint-Louis')).toBeInTheDocument();
    expect(screen.queryByText('VM Thiès')).not.toBeInTheDocument();
  });

  it('l’administrateur pays crée un poste', async () => {
    const organisation = fausseOrganisation();
    rendre(
      fauxClient({
        reprendre: vi.fn(async () => JETONS),
        perimetre: vi.fn(async () => ADMIN_PAYS),
        organisation,
      }),
      '/organisation',
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Nouveau poste' }));
    await saisir(/^Libellé/, 'VM Mbour');
    fireEvent.click(screen.getByRole('button', { name: 'Créer' }));
    await screen.findByRole('heading', { name: 'Organisation' });
    await vi.waitFor(() =>
      expect(organisation.creerPoste).toHaveBeenCalledWith({
        libelle: 'VM Mbour',
        type_poste: 'vm',
        reseaux: [],
        secteurs: [],
      }),
    );
  });

  it('sans le droit de lecture, la page Organisation renvoie à l’accueil', async () => {
    rendre(fauxClient({ reprendre: vi.fn(async () => JETONS) }), '/organisation');
    expect(await screen.findByRole('heading', { name: 'Bonjour Awa' })).toBeInTheDocument();
  });
});
