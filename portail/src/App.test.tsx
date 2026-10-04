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
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router';
import axe from 'axe-core';
import App from './App';
import i18n from './i18n';
import { ecrireApparence, lireApparence } from './preferences';
import { FournisseurSession } from './session';

const AWA: Moi = {
  id: '1',
  identifiant: 'awa.diallo',
  prenom: 'Awa',
  nom: 'Diallo',
  courriel: 'awa.diallo@exemple.org',
  pays_principal: { code: 'SN', nom: 'Sénégal', fuseau: 'Africa/Dakar' },
  est_siege: false,
  double_auth_active: false,
  double_auth_requise: false,
};
// Généré à l'exécution : aucun mot de passe, même de test, n'est écrit dans le dépôt.
const MDP = `${Math.random().toString(36).slice(2)}-Aa9-${Date.now()}`;
const NOUVEAU = `${Math.random().toString(36).slice(2)}-Bb8-${Date.now()}`;
const JETONS: Jetons = {
  acces: 'A',
  expire_dans: 900,
  rafraichissement: null,
  utilisateur: AWA,
  double_auth_a_activer: false,
};

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
    connexion: vi.fn(async () => ({ etape: 'connecte' as const, jetons: JETONS })),
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
    doubleAuth: {
      etat: vi.fn(async () => ({
        active: false,
        requise: false,
        active_le: null,
        codes_secours_restants: 0,
      })),
    } as unknown as ClientApi['doubleAuth'],
    sessions: {
      liste: vi.fn(async () => []),
      revoquer: vi.fn(async () => undefined),
      revoquerAutres: vi.fn(async () => undefined),
    } as unknown as ClientApi['sessions'],
    activite: vi.fn(async () => []),
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

/** Contrôles d'accessibilité automatiques (WCAG 2.1 A et AA) ; le contraste, que jsdom
 * ne sait pas calculer, est vérifié à part dans le thème. */
async function violationsAccessibilite(conteneur: Element) {
  const resultat = await axe.run(conteneur, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
    rules: { 'color-contrast': { enabled: false } },
  });
  return resultat.violations.map(
    (v) => `${v.id} : ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`,
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
    // Étape en cours (« Cycle 0.1 · Référentiel ») ou cycle terminé (« Cycle 0.0 terminé »).
    expect(screen.getByText(/^Cycle 0\.\d( · | terminé)/)).toBeInTheDocument();
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

  it('demande le code à 6 chiffres quand la double authentification est active (SEC-003)', async () => {
    const client = fauxClient({
      connexion: vi.fn(async () => ({ etape: 'code_requis' as const, jetonEtape: 'E1' })),
      connexionCode: vi.fn(async () => JETONS),
    });
    rendre(client);
    await saisir(/Identifiant/, 'awa.diallo');
    await saisir(/^Mot de passe/, MDP);
    fireEvent.click(screen.getByRole('button', { name: 'Se connecter' }));
    expect(
      await screen.findByRole('heading', { name: 'Vérification en deux étapes' }),
    ).toBeInTheDocument();
    await saisir('Code de vérification', '12a3456');
    expect(screen.getByLabelText('Code de vérification')).toHaveValue('123456');
    fireEvent.click(screen.getByRole('button', { name: 'Valider' }));
    expect(await screen.findByRole('heading', { name: 'Bonjour Awa' })).toBeInTheDocument();
    expect(client.connexionCode).toHaveBeenCalledWith('E1', '123456');
  });

  it('un rôle sensible sans double authentification doit l’activer avant de continuer (SEC-003)', async () => {
    const client = fauxClient({
      reprendre: vi.fn(async () => ({ ...JETONS, double_auth_a_activer: true })),
    });
    rendre(client);
    expect(
      await screen.findByRole('heading', { name: 'Protégez votre compte' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Bonjour Awa' })).not.toBeInTheDocument();
    expect(client.perimetre).not.toHaveBeenCalled();
  });

  it('l’écran de connexion ne présente aucune violation d’accessibilité détectable', async () => {
    const { container } = rendre(fauxClient());
    await screen.findByRole('heading', { name: 'Connexion' });
    expect(await violationsAccessibilite(container)).toEqual([]);
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

describe('portail — administration 0.0.6 (USR-003, USR-004, USR-006, ORG-011)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr');
  });

  const ADMIN: Perimetre = {
    ...PERIMETRE_DELEGUE,
    roles: ['admin_pays'],
    actions: [
      'organisation.gerer',
      'organisation.lire',
      'referentiels.lire',
      'referentiels.gerer',
      'pays.lire',
      'utilisateurs.lire',
      'utilisateurs.gerer',
      'roles.attribuer',
      'appareils.revoquer',
      'parametres.lire',
      'parametres.modifier',
    ],
  };
  const COMPTES = [
    {
      id: 'u1',
      identifiant: 'moussa.fall',
      prenom: 'Moussa',
      nom: 'Fall',
      courriel: '',
      langue: 'fr',
      actif: true,
      pays_principal: SENEGAL,
      roles: ['delegue'],
      last_login: null,
    },
    {
      id: 'u2',
      identifiant: 'awa.mbaye',
      prenom: 'Awa',
      nom: 'Mbaye',
      courriel: '',
      langue: 'fr',
      actif: true,
      pays_principal: SENEGAL,
      roles: [],
      last_login: null,
    },
  ];
  const TELEPHONE = {
    id: 't1',
    identifiant: 'moussa.fall',
    prenom: 'Moussa',
    nom: 'Fall',
    plateforme: 'android',
    plateforme_libelle: 'Android',
    systeme: 'Android 14',
    modele: 'Galaxy A15',
    version_app: '0.0.6',
    cree_le: '2026-10-01T08:00:00Z',
    dernier_contact: '2026-10-04T08:00:00Z',
    revoque: false,
    revoque_le: null,
  };

  function clientAdmin(surcharges: Partial<ClientApi> = {}) {
    return fauxClient({
      reprendre: vi.fn(async () => JETONS),
      perimetre: vi.fn(async () => ADMIN),
      utilisateurs: vi.fn(async () => COMPTES),
      appareils: {
        liste: vi.fn(async () => [TELEPHONE]),
        revoquer: vi.fn(async () => ({ ...TELEPHONE, revoque: true })),
      },
      comptes: {
        creer: vi.fn(async () => COMPTES[0]),
        roles: vi.fn(async () => []),
        affectations: vi.fn(async () => []),
        transferts: vi.fn(async () => []),
      } as unknown as ClientApi['comptes'],
      ...surcharges,
    } as Partial<ClientApi>);
  }

  it('la navigation suit le rôle : l’administrateur pays voit Équipe et Paramètres, pas Pays', async () => {
    rendre(clientAdmin());
    await screen.findByRole('heading', { name: 'Bonjour Awa' });
    // Écran étroit : la navigation est dans le tiroir.
    fireEvent.click(screen.getByRole('button', { name: 'Menu' }));
    expect((await screen.findAllByRole('link', { name: 'Équipe' })).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: 'Paramètres' }).length).toBeGreaterThan(0);
    expect(screen.queryByRole('link', { name: 'Pays' })).not.toBeInTheDocument();
    // Accueil par rôle : « À traiter » signale le compte sans rôle.
    expect(await screen.findByText('1 compte sans rôle')).toBeInTheDocument();
  });

  it('liste les comptes, filtre ceux sans rôle et crée un compte', async () => {
    const client = clientAdmin();
    rendre(client, '/equipe');
    expect(await screen.findByText('Moussa Fall')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Sans rôle' }));
    expect(screen.queryByText('Moussa Fall')).not.toBeInTheDocument();
    expect(screen.getByText('Awa Mbaye')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Nouveau compte' }));
    await saisir(/^Prénom/, 'Ndèye');
    await saisir(/^Nom/, 'Diop');
    fireEvent.click(screen.getByRole('button', { name: 'Créer' }));
    await vi.waitFor(() =>
      expect(client.comptes.creer).toHaveBeenCalledWith(
        expect.objectContaining({ identifiant: 'ndeye.diop', prenom: 'Ndèye', nom: 'Diop' }),
      ),
    );
  });

  it('affiche les téléphones et en révoque un après confirmation (USR-006)', async () => {
    const client = clientAdmin();
    rendre(client, '/equipe');
    fireEvent.click(await screen.findByRole('tab', { name: 'Téléphones' }));
    expect(await screen.findByText('Galaxy A15')).toBeInTheDocument();
    expect(screen.getByText('Android 14')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Révoquer' }));
    const dialogue = await screen.findByRole('dialog');
    fireEvent.click(within(dialogue).getByRole('button', { name: 'Révoquer' }));
    await vi.waitFor(() => expect(client.appareils.revoquer).toHaveBeenCalledWith('t1'));
  });

  it('change la langue et la mémorise sur le compte (USR-004)', async () => {
    const changerLangue = vi.fn(async () => ({ ...AWA, langue: 'en' as const }));
    rendre(clientAdmin({ changerLangue }), '/profil');
    fireEvent.click(await screen.findByRole('button', { name: 'English' }));
    expect(await screen.findByRole('heading', { name: 'My profile' })).toBeInTheDocument();
    expect(changerLangue).toHaveBeenCalledWith('en');
  });

  it('le profil montre les sessions ouvertes et en ferme une (SEC-004)', async () => {
    const SESSION = {
      id: 's1',
      client: 'portail' as const,
      appareil: null,
      adresse: '196.200.x.x',
      cree_le: '2026-10-04T08:00:00Z',
      utilisee_le: '2026-10-04T09:00:00Z',
      courante: true,
    };
    const sessions = {
      liste: vi.fn(async () => [
        SESSION,
        { ...SESSION, id: 's2', client: 'mobile' as const, courante: false },
      ]),
      revoquer: vi.fn(async () => undefined),
      revoquerAutres: vi.fn(async () => undefined),
    };
    const activite = vi.fn(async () => [
      {
        action: 'connexion',
        resultat: 'echec',
        le: '2026-10-04T07:00:00Z',
        client: 'portail',
        adresse: null,
      },
    ]);
    rendre(clientAdmin({ sessions, activite } as unknown as Partial<ClientApi>), '/profil');
    expect(await screen.findByText('Cette session')).toBeInTheDocument();
    expect(await screen.findByText('Connexion refusée')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Activer la double authentification' }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Fermer' }));
    await vi.waitFor(() => expect(sessions.revoquer).toHaveBeenCalledWith('s2'));
  });

  it('modifie un paramètre du pays (ORG-011)', async () => {
    const modifierParametre = vi.fn(async () => ({}));
    const parametres = vi.fn(async () => [
      {
        cle: 'distance_pointage_m',
        description: 'Distance de pointage acceptée en mètres (VIS-010)',
        valeur: 200,
        defaut: 200,
        personnalise: false,
        hypothese: false,
      },
    ]);
    rendre(
      clientAdmin({
        pays: { parametres, modifierParametre } as unknown as ClientApi['pays'],
      }),
      '/parametres',
    );
    expect(await screen.findByText('Distance de pointage (mètres)')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Modifier' }));
    await saisir(/^Valeur/, '300');
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await vi.waitFor(() =>
      expect(modifierParametre).toHaveBeenCalledWith('SN', 'distance_pointage_m', 300),
    );
  });

  it.each(['/', '/equipe', '/profil', '/organisation'])(
    'la page %s ne présente aucune violation d’accessibilité détectable',
    async (chemin) => {
      const { container } = rendre(clientAdmin(), chemin);
      await screen.findByRole('heading', { level: 1 });
      await act(async () => new Promise((r) => setTimeout(r, 50)));
      expect(await violationsAccessibilite(container)).toEqual([]);
    },
  );
});

vi.mock('./signalement', () => ({
  signalerErreur: vi.fn(),
  surveillerErreursGlobales: vi.fn(),
}));

describe('portail — erreurs et exploitation (0.0.7)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr');
  });

  const TECHNIQUE: Perimetre = {
    pays_actif: null,
    vue_consolidee: false,
    roles: ['admin_technique'],
    actions: ['exploitation.lire'],
    pays_accessibles: [],
  };
  const ETAT = {
    version: '0.0.7',
    environnement: 'production',
    heure_serveur: '2026-10-04T12:00:00Z',
    base: { disponible: true, latence_ms: 1.2, migrations_en_attente: 0 },
    isolation: { tables_protegees: 10, tables_attendues: 10, role_contourne: false },
    suivi_erreurs_actif: true,
    audit_immuable: true,
    verification_fuites_active: true,
    format_journaux: 'json',
  };

  it('une adresse inconnue affiche une page 404 dans le cadre', async () => {
    rendre(fauxClient({ reprendre: vi.fn(async () => JETONS) }), '/nulle-part');
    expect(await screen.findByRole('heading', { name: 'Page introuvable' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: "Retour à l'accueil" })).toBeInTheDocument();
  });

  it('l’administrateur technique voit l’état du service', async () => {
    rendre(
      fauxClient({
        reprendre: vi.fn(async () => JETONS),
        perimetre: vi.fn(async () => TECHNIQUE),
        exploitation: vi.fn(async () => ETAT),
      } as Partial<ClientApi>),
      '/exploitation',
    );
    expect(await screen.findByText('Tout est opérationnel')).toBeInTheDocument();
    expect(screen.getByText('10 / 10')).toBeInTheDocument();
    expect(screen.getByText('Immuable : la base refuse toute modification.')).toBeInTheDocument();
  });

  it('signale les points d’attention', async () => {
    const degrade = {
      ...ETAT,
      isolation: { ...ETAT.isolation, role_contourne: true },
      suivi_erreurs_actif: false,
    };
    rendre(
      fauxClient({
        reprendre: vi.fn(async () => JETONS),
        perimetre: vi.fn(async () => TECHNIQUE),
        exploitation: vi.fn(async () => degrade),
      } as Partial<ClientApi>),
      '/exploitation',
    );
    expect(await screen.findByText('2 points d’attention')).toBeInTheDocument();
    expect(screen.getByText(/contourne l'isolation/)).toBeInTheDocument();
  });

  it('une page qui plante affiche l’écran d’erreur et la signale, sans emporter le cadre', async () => {
    const { signalerErreur } = await import('./signalement');
    rendre(
      fauxClient({
        reprendre: vi.fn(async () => JETONS),
        perimetre: vi.fn(async () => TECHNIQUE),
        // Réponse malformée : la page lève pendant son rendu.
        exploitation: vi.fn(async () => ({ version: '0.0.7' })),
      } as unknown as Partial<ClientApi>),
      '/exploitation',
    );
    expect(
      await screen.findByRole('heading', { name: 'Quelque chose s’est mal passé' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/^Référence : /)).toBeInTheDocument();
    expect(signalerErreur).toHaveBeenCalled();
    // Le cadre (barre supérieure, menu) reste là.
    expect(screen.getByRole('button', { name: 'Menu' })).toBeInTheDocument();
  });

  it('une erreur de chargement montre le message, la référence et « Réessayer »', async () => {
    const utilisateurs = vi.fn(async () => {
      throw new ErreurApi(
        500,
        'erreur_interne',
        'Une erreur inattendue s’est produite.',
        {},
        'ref1234567',
      );
    });
    rendre(
      fauxClient({
        reprendre: vi.fn(async () => JETONS),
        perimetre: vi.fn(async () => ({
          ...PERIMETRE_DELEGUE,
          roles: ['admin_pays'],
          actions: ['utilisateurs.lire'],
        })),
        utilisateurs,
        appareils: { liste: vi.fn(async () => []) } as unknown as ClientApi['appareils'],
      } as Partial<ClientApi>),
      '/equipe',
    );
    expect(await screen.findByText('Référence : ref1234567')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
    await vi.waitFor(() => expect(utilisateurs).toHaveBeenCalledTimes(2));
  });
});

describe('portail — démonstration et apparence (0.0.9)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr');
  });

  const INFOS = {
    produit: 'INNOV CRM',
    version: '0.0.9',
    langue: 'fr',
    message: '',
    langues: [],
  };

  it('une instance de démonstration l’annonce sur chaque écran (DEM-001)', async () => {
    rendre(
      fauxClient({
        informations: vi.fn(async () => ({ ...INFOS, environnement: 'demonstration' })),
      }),
    );
    expect(await screen.findByText('Démonstration')).toBeInTheDocument();
    expect(screen.getByText(/Données fictives/)).toBeInTheDocument();
  });

  it('la production n’affiche pas le bandeau de démonstration', async () => {
    rendre(
      fauxClient({
        reprendre: vi.fn(async () => JETONS),
        informations: vi.fn(async () => ({ ...INFOS, environnement: 'production' })),
      }),
    );
    await screen.findByRole('heading', { name: 'Bonjour Awa' });
    await act(async () => new Promise((r) => setTimeout(r, 20)));
    expect(screen.queryByText('Démonstration')).not.toBeInTheDocument();
  });

  it('l’apparence choisie est mémorisée sur ce navigateur, « système » par défaut', () => {
    ecrireApparence('systeme');
    expect(lireApparence()).toBe('systeme');
    ecrireApparence('sombre');
    expect(lireApparence()).toBe('sombre');
    ecrireApparence('systeme');
    expect(lireApparence()).toBe('systeme');
  });
});

describe('portail — référentiels et portefeuilles (PRP-001, ORG-004)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr');
  });

  const ADMIN_REF: Perimetre = {
    ...PERIMETRE_DELEGUE,
    roles: ['admin_pays'],
    actions: ['organisation.lire', 'referentiels.lire', 'referentiels.gerer', 'pays.lire'],
  };
  const CV = { id: 'r1', code: 'CV', libelle: 'Cardio Vasculaire' };
  const GYN = { id: 'r2', code: 'GYN', libelle: 'Gynécologie' };
  const CLASSE = {
    id: 'c1',
    pays: 'SN',
    liste: 'classe_therapeutique' as const,
    code: 'antihypertenseurs',
    libelle: 'Antihypertenseurs',
    ordre: 1,
    parent: null,
    archive: false,
    utilisations: 1,
  };
  const VALEURS = [
    CLASSE,
    {
      ...CLASSE,
      id: 'v1',
      liste: 'type_prospect' as const,
      code: 'medecin',
      libelle: 'Médecin',
      utilisations: 0,
    },
    {
      ...CLASSE,
      id: 'v2',
      liste: 'specialite' as const,
      code: 'cardiologie',
      libelle: 'Cardiologie',
      parent: 'v1',
      utilisations: 0,
    },
  ];
  const PRODUITS = [
    {
      id: 'p1',
      pays: 'SN',
      code: 'TENSIO5',
      libelle: 'Tensiovar 5 mg',
      classe: 'c1',
      classe_libelle: 'Antihypertenseurs',
      reseaux: [CV, GYN],
      archive: false,
    },
    {
      id: 'p2',
      pays: 'SN',
      code: 'FERRO',
      libelle: 'Ferrogyn',
      classe: null,
      classe_libelle: null,
      reseaux: [],
      archive: false,
    },
  ];
  const PORTEFEUILLES = [
    {
      reseau: CV,
      division: 'Cardio-métabolique',
      produits: [
        {
          id: 'p1',
          code: 'TENSIO5',
          libelle: 'Tensiovar 5 mg',
          classe_libelle: 'Antihypertenseurs',
        },
      ],
    },
    { reseau: GYN, division: 'Santé de la femme', produits: [] },
  ];

  function clientRef() {
    const referentiel = {
      valeurs: vi.fn(async () => VALEURS),
      produits: vi.fn(async () => PRODUITS),
      portefeuilles: vi.fn(async () => PORTEFEUILLES),
      creerValeur: vi.fn(async () => VALEURS[0]),
      modifierValeur: vi.fn(async () => VALEURS[0]),
      creerProduit: vi.fn(async () => PRODUITS[0]),
      modifierProduit: vi.fn(async () => PRODUITS[0]),
      archiver: vi.fn(async () => ({})),
      reactiver: vi.fn(async () => ({})),
      definirPortefeuille: vi.fn(async () => PORTEFEUILLES[1]),
      monPortefeuille: vi.fn(async () => []),
    };
    const client = fauxClient({
      reprendre: vi.fn(async () => JETONS),
      perimetre: vi.fn(async () => ADMIN_REF),
      referentiel: referentiel as unknown as ClientApi['referentiel'],
    } as Partial<ClientApi>);
    return { client, referentiel };
  }

  it('liste les produits avec leur classe et leurs réseaux, et les filtre (ORG-004 CA2)', async () => {
    const { client } = clientRef();
    rendre(client, '/referentiels');
    expect(await screen.findByText('Tensiovar 5 mg')).toBeInTheDocument();
    expect(screen.getAllByText('Cardio Vasculaire').length).toBeGreaterThan(0);
    expect(screen.getByText('Hors portefeuille')).toBeInTheDocument();
    // Recherche insensible aux accents et à la casse.
    await saisir('Rechercher un produit ou un code', 'FERRÔ');
    expect(screen.queryByText('Tensiovar 5 mg')).not.toBeInTheDocument();
    expect(screen.getByText('Ferrogyn')).toBeInTheDocument();
  });

  it('crée un produit et le range dans des réseaux', async () => {
    const { client, referentiel } = clientRef();
    rendre(client, '/referentiels');
    fireEvent.click(await screen.findByRole('button', { name: 'Nouveau produit' }));
    await saisir(/^Nom du produit/, 'Glycomet 500 mg');
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await vi.waitFor(() =>
      expect(referentiel.creerProduit).toHaveBeenCalledWith(
        expect.objectContaining({ libelle: 'Glycomet 500 mg', reseaux: [] }),
      ),
    );
  });

  it('gère le portefeuille d’un réseau', async () => {
    const { client, referentiel } = clientRef();
    rendre(client, '/referentiels');
    fireEvent.click(await screen.findByRole('tab', { name: 'Portefeuilles' }));
    expect(await screen.findByText('Portefeuille vide')).toBeInTheDocument();
    const boutons = screen.getAllByRole('button', { name: 'Gérer le portefeuille' });
    fireEvent.click(boutons[1]!);
    const dialogue = await screen.findByRole('dialog');
    fireEvent.click(within(dialogue).getByLabelText(/Ferrogyn/));
    fireEvent.click(within(dialogue).getByRole('button', { name: 'Enregistrer' }));
    await vi.waitFor(() =>
      expect(referentiel.definirPortefeuille).toHaveBeenCalledWith('r2', ['p2']),
    );
  });

  it('ajoute une valeur à une liste et archive au lieu de supprimer (PRP-001)', async () => {
    const { client, referentiel } = clientRef();
    rendre(client, '/referentiels');
    fireEvent.click(await screen.findByRole('tab', { name: 'Listes de valeurs' }));
    fireEvent.click(await screen.findByRole('button', { name: /Spécialités/ }));
    expect(await screen.findByText('Cardiologie')).toBeInTheDocument();
    await saisir(/^Nouvelle valeur/, 'Allergologie');
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter' }));
    await vi.waitFor(() =>
      expect(referentiel.creerValeur).toHaveBeenCalledWith({
        liste: 'specialite',
        libelle: 'Allergologie',
        parent: null,
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Archiver Cardiologie' }));
    await vi.waitFor(() => expect(referentiel.archiver).toHaveBeenCalledWith('valeurs', 'v2'));
  });

  it('la page Référentiels ne présente aucune violation d’accessibilité détectable', async () => {
    const { client } = clientRef();
    const { container } = rendre(client, '/referentiels');
    await screen.findByText('Tensiovar 5 mg');
    expect(await violationsAccessibilite(container)).toEqual([]);
  });
});

describe('portail — prospects (PRP-002, PRP-006)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr');
  });

  const TYPES = [
    {
      id: 't1',
      pays: 'SN',
      liste: 'type_prospect' as const,
      code: 'medecin',
      libelle: 'Médecin',
      ordre: 1,
      parent: null,
      archive: false,
      utilisations: 0,
    },
    {
      id: 's1',
      pays: 'SN',
      liste: 'specialite' as const,
      code: 'cardiologie',
      libelle: 'Cardiologie',
      ordre: 1,
      parent: 't1',
      archive: false,
      utilisations: 0,
    },
  ];
  const FICHE = {
    id: 'p1',
    pays: 'SN',
    civilite: 'dr' as const,
    nom: 'Ndiaye',
    prenom: 'Aïssatou',
    type: 't1',
    type_libelle: 'Médecin',
    specialite: 's1',
    specialite_libelle: 'Cardiologie',
    numero_ordre: 'SN-1',
    telephone_mobile: '+221771234567',
    telephone_pro: '',
    courriel: '',
    potentiel: 'A' as const,
    statut: 'a_valider' as const,
    cree_par: { id: 'u1', identifiant: 'gabriel.sn', prenom: 'Gabriel', nom: 'Sn' },
    cree_le: '2026-10-04T08:00:00Z',
    valide_le: null,
    modifiable: true,
  };

  function clientProspects(perimetre: Perimetre) {
    const prospects = {
      liste: vi.fn(async () => ({ total: 1, limite: 100, resultats: [FICHE] })),
      synthese: vi.fn(async () => ({
        actifs: 12,
        a_valider: 1,
        mes_a_valider: 1,
        potentiels: { A: 3, B: 4, C: 5 },
      })),
      detail: vi.fn(async () => FICHE),
      creer: vi.fn(async () => FICHE),
      modifier: vi.fn(async () => FICHE),
      valider: vi.fn(async () => ({ ...FICHE, statut: 'actif' })),
      archiver: vi.fn(async () => FICHE),
    };
    const referentiel = { valeurs: vi.fn(async () => TYPES) };
    const client = fauxClient({
      reprendre: vi.fn(async () => JETONS),
      perimetre: vi.fn(async () => perimetre),
      prospects: prospects as unknown as ClientApi['prospects'],
      referentiel: referentiel as unknown as ClientApi['referentiel'],
    } as Partial<ClientApi>);
    return { client, prospects };
  }
  const ADMIN_P: Perimetre = {
    ...PERIMETRE_DELEGUE,
    roles: ['admin_pays'],
    actions: ['prospects.lire', 'prospects.creer', 'prospects.gerer', 'pays.lire'],
  };
  const DELEGUE_P: Perimetre = {
    ...PERIMETRE_DELEGUE,
    actions: ['prospects.lire', 'prospects.creer', 'pays.lire'],
  };

  it('liste les fiches, recherche et ouvre une fiche avec son potentiel (PRP-002)', async () => {
    const { client, prospects } = clientProspects(ADMIN_P);
    rendre(client, '/prospects');
    expect(await screen.findByText('Dr Aïssatou Ndiaye')).toBeInTheDocument();
    expect(screen.getByText('A 3 · B 4 · C 5')).toBeInTheDocument();
    await saisir("Nom, téléphone ou n° d'ordre", 'ndiaye');
    await vi.waitFor(() =>
      expect(prospects.liste).toHaveBeenCalledWith(expect.objectContaining({ q: 'ndiaye' })),
    );
    fireEvent.click(screen.getByText('Dr Aïssatou Ndiaye'));
    expect(await screen.findByText('+221771234567')).toBeInTheDocument();
    expect(screen.getByText('Potentiel A')).toBeInTheDocument();
  });

  it('l’administrateur pays valide une fiche à valider (RG-041)', async () => {
    const { client, prospects } = clientProspects(ADMIN_P);
    rendre(client, '/prospects');
    fireEvent.click(await screen.findByText('Dr Aïssatou Ndiaye'));
    fireEvent.click(await screen.findByRole('button', { name: 'Valider la fiche' }));
    await vi.waitFor(() => expect(prospects.valider).toHaveBeenCalledWith('p1'));
  });

  it('le délégué crée une fiche, prévenu qu’elle sera à valider (PRP-006)', async () => {
    const { client, prospects } = clientProspects(DELEGUE_P);
    rendre(client, '/prospects');
    fireEvent.click(await screen.findByRole('button', { name: 'Nouveau prospect' }));
    expect(await screen.findByText(/vous pouvez l'utiliser tout de suite/)).toBeInTheDocument();
    const dialogue = await screen.findByRole('dialog');
    fireEvent.change(within(dialogue).getByLabelText(/^Nom/), { target: { value: 'Sarr' } });
    fireEvent.click(within(dialogue).getByRole('button', { name: 'Enregistrer' }));
    await vi.waitFor(() =>
      expect(prospects.creer).toHaveBeenCalledWith(
        expect.objectContaining({ nom: 'Sarr', type: 't1', potentiel: 'B' }),
      ),
    );
    expect(screen.queryByRole('button', { name: 'Valider la fiche' })).not.toBeInTheDocument();
  });

  it('la page Prospects ne présente aucune violation d’accessibilité détectable', async () => {
    const { client } = clientProspects(ADMIN_P);
    const { container } = rendre(client, '/prospects');
    await screen.findByText('Dr Aïssatou Ndiaye');
    expect(await violationsAccessibilite(container)).toEqual([]);
  });
});
