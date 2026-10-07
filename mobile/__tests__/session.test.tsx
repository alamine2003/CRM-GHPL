import { type ClientApi, ErreurApi, type Jetons } from '@innov/api-client';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import { AppState, type AppStateStatus } from 'react-native';
import Connexion from '../app/connexion';
import Accueil from '../app/index';
import Profil from '../app/profil';
import EcranProspects from '../app/prospects';
import { lire } from '../src/baseLocale';
import { FournisseurSession } from '../src/FournisseurSession';
import i18n from '../src/i18n';
import { oublierEnvironnement } from '../src/Demonstration';
import { DELAI_VERROU_MS, horloge, Verrou } from '../src/Verrou';

jest.mock('expo-constants', () => ({ expoConfig: { version: '0.0.3', extra: {} } }));
jest.mock('expo-router', () => {
  const { Text: Texte } = jest.requireActual('react-native');
  return {
    Redirect: ({ href }: { href: string }) => <Texte>{`redirection:${href}`}</Texte>,
    usePathname: () => '/',
    useRouter: () => ({ replace: jest.fn() }),
  };
});
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 0,
}));
jest.mock('expo-local-authentication', () => ({
  SecurityLevel: { NONE: 0, SECRET: 1, BIOMETRIC_WEAK: 2, BIOMETRIC_STRONG: 3 },
  getEnrolledLevelAsync: jest.fn(async () => 3),
  authenticateAsync: jest.fn(async () => ({ success: true })),
}));
jest.mock('expo-location', () => ({
  Accuracy: { High: 4 },
  requestForegroundPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  getCurrentPositionAsync: jest.fn(async () => ({
    coords: { latitude: 14.70001, longitude: -17.45002, accuracy: 9 },
  })),
}));
// Base locale chiffrée (SQLCipher) : propre au téléphone, remplacée ici.
jest.mock('../src/baseLocale', () => ({
  lire: jest.fn(async () => null),
  ecrire: jest.fn(async () => undefined),
  effacer: jest.fn(async () => undefined),
}));
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
    double_auth_active: false,
    double_auth_requise: false,
  },
  double_auth_a_activer: false,
};

const PERIMETRE = {
  pays_actif: { code: 'SN', nom: 'Sénégal', fuseau: 'Africa/Dakar' },
  vue_consolidee: false,
  roles: ['delegue'],
  actions: ['pays.lire'],
  pays_accessibles: [{ code: 'SN', nom: 'Sénégal', fuseau: 'Africa/Dakar' }],
};

const SANS_POSTE = { postes: [], postes_supervises: 0, reseaux: [], superviseur_manquant: false };

function fauxClient(surcharges: Partial<ClientApi> = {}): ClientApi {
  return {
    organisation: { moi: jest.fn(async () => SANS_POSTE) },
    perimetre: jest.fn(async () => PERIMETRE),
    connexion: jest.fn(async () => ({ etape: 'connecte', jetons: JETONS })),
    reprendre: jest.fn(async () => {
      throw new ErreurApi(401, 'session_invalide', 'Session invalide');
    }),
    deconnexion: jest.fn(async () => undefined),
    demanderReinitialisation: jest.fn(async () => undefined),
    informations: jest.fn(async () => ({ environnement: 'test' })),
    referentiel: { monPortefeuille: jest.fn(async () => []) },
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
  afterEach(() => {
    jest.restoreAllMocks();
    oublierEnvironnement();
  });

  it('sans session enregistrée, l’accueil renvoie vers la connexion', async () => {
    await rendre(<Accueil />, fauxClient());
    expect(await screen.findByText('redirection:/connexion')).toBeTruthy();
  });

  it('reprend la session du magasin sécurisé et accueille le délégué', async () => {
    await rendre(<Accueil />, fauxClient({ reprendre: jest.fn(async () => JETONS) }));
    expect(await screen.findByText('Bonjour Awa')).toBeTruthy();
    expect(screen.getAllByText(/Sénégal/).length).toBeGreaterThan(0);
    // Version et rôles se lisent dans « Profil » : l'en-tête ne porte plus que le titre (0.1.8).
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

  it('demande le code de double authentification puis ouvre la session (SEC-003)', async () => {
    const client = fauxClient({
      connexion: jest.fn(async () => ({ etape: 'code_requis' as const, jetonEtape: 'E1' })),
      connexionCode: jest.fn(async () => JETONS),
    });
    await rendre(<Connexion />, client);
    await fireEvent.changeText(await screen.findByLabelText('Identifiant'), 'awa.diallo');
    await fireEvent.changeText(screen.getByLabelText('Mot de passe'), MDP);
    await fireEvent.press(screen.getByText('Se connecter'));
    expect(await screen.findByText('Vérification en deux étapes')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Code de vérification'), '12 34-56');
    await fireEvent.press(screen.getByText('Valider'));
    expect(client.connexionCode).toHaveBeenCalledWith('E1', '123456');
    expect(await screen.findByText('redirection:/')).toBeTruthy();
  });

  it('renvoie vers le portail un rôle qui doit activer la double authentification', async () => {
    const client = fauxClient({
      connexion: jest.fn(async () => ({
        etape: 'connecte' as const,
        jetons: { ...JETONS, double_auth_a_activer: true },
      })),
    });
    await rendre(<Connexion />, client);
    await fireEvent.changeText(await screen.findByLabelText('Identifiant'), 'awa.diallo');
    await fireEvent.changeText(screen.getByLabelText('Mot de passe'), MDP);
    await fireEvent.press(screen.getByText('Se connecter'));
    expect(await screen.findByText(/Activez-la depuis le portail web/)).toBeTruthy();
    expect(client.deconnexion).toHaveBeenCalled();
    expect(client.perimetre).not.toHaveBeenCalled();
  });

  it('DC-59 : se verrouille après 15 minutes en arrière-plan (délai par défaut) et se déverrouille par biométrie', async () => {
    const abonnes: ((statut: AppStateStatus) => void)[] = [];
    const surChangement = (statut: AppStateStatus) => abonnes.forEach((f) => f(statut));
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, f) => {
      abonnes.push(f as (statut: AppStateStatus) => void);
      return { remove: jest.fn() } as unknown as ReturnType<typeof AppState.addEventListener>;
    });
    const maintenant = jest.spyOn(horloge, 'maintenant').mockReturnValue(1_000_000);
    const authentifier = jest.mocked(LocalAuthentication.authenticateAsync);
    authentifier.mockResolvedValueOnce({ success: false, error: 'user_cancel' });
    await rendre(
      <Verrou>
        <Accueil />
      </Verrou>,
      fauxClient({ reprendre: jest.fn(async () => JETONS) }),
    );
    expect(await screen.findByText('Bonjour Awa')).toBeTruthy();
    await act(async () => surChangement('background'));
    maintenant.mockReturnValue(1_000_000 + DELAI_VERROU_MS + 1);
    await act(async () => surChangement('active'));
    expect(await screen.findByText('Application verrouillée')).toBeTruthy();
    expect(screen.queryByText('Bonjour Awa')).toBeNull();
    await fireEvent.press(screen.getByText('Déverrouiller'));
    expect(await screen.findByText('Bonjour Awa')).toBeTruthy();
    expect(authentifier).toHaveBeenCalledTimes(2);
  });

  it('DC-59 : le pays règle le délai ; 20 minutes dehors ne verrouillent pas à 30', async () => {
    const abonnes: ((statut: AppStateStatus) => void)[] = [];
    const surChangement = (statut: AppStateStatus) => abonnes.forEach((f) => f(statut));
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, f) => {
      abonnes.push(f as (statut: AppStateStatus) => void);
      return { remove: jest.fn() } as unknown as ReturnType<typeof AppState.addEventListener>;
    });
    jest.mocked(lire).mockImplementation(async (cle: string) =>
      cle === 'programme.courant'
        ? {
            valeur: {
              etat: 'sans_poste',
              jours: [],
              aujourdhui: '2026-10-13',
              verrouillage_minutes: 30,
            },
            maj: '',
          }
        : null,
    );
    const maintenant = jest.spyOn(horloge, 'maintenant').mockReturnValue(1_000_000);
    await rendre(
      <Verrou>
        <Accueil />
      </Verrou>,
      fauxClient({ reprendre: jest.fn(async () => JETONS) }),
    );
    expect(await screen.findByText('Bonjour Awa')).toBeTruthy();
    await act(async () => surChangement('background'));
    maintenant.mockReturnValue(1_000_000 + 20 * 60 * 1000);
    await act(async () => surChangement('active'));
    expect(screen.queryByText('Application verrouillée')).toBeNull();
    jest.mocked(lire).mockImplementation(async () => null);
  });

  it('signale une instance de démonstration dès l’écran de connexion (DEM-001)', async () => {
    await rendre(
      <Connexion />,
      fauxClient({
        informations: jest.fn(async () => ({ environnement: 'demonstration' })),
      } as unknown as Partial<ClientApi>),
    );
    expect(await screen.findByText('Démonstration')).toBeTruthy();
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

  it('se déconnecte depuis le profil', async () => {
    const client = fauxClient({ reprendre: jest.fn(async () => JETONS) });
    await rendre(<Profil />, client);
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

  it('affiche le poste du délégué et l’absence de superviseur (ORG-006, ORG-007)', async () => {
    const moi = {
      postes: [
        {
          occupation: {
            id: 'o1',
            poste: { id: 'a', libelle: 'VM Dakar Plateau' },
            personne: { id: '1', identifiant: 'awa.diallo', prenom: 'Awa', nom: 'Diallo' },
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
    await rendre(
      <Accueil />,
      fauxClient({
        reprendre: jest.fn(async () => JETONS),
        organisation: { moi: jest.fn(async () => moi) } as unknown as ClientApi['organisation'],
      }),
    );
    expect(await screen.findByText('VM Dakar Plateau')).toBeTruthy();
    expect(screen.getByText('Cardio')).toBeTruthy();
    expect(screen.getByText(/pas de superviseur/)).toBeTruthy();
  });

  it('montre les produits du portefeuille de ses réseaux (ORG-004 CA3)', async () => {
    const produits = Array.from({ length: 10 }, (_, i) => ({
      id: `p${i}`,
      code: `P${i}`,
      libelle: `Produit ${i}`,
      classe_libelle: null,
    }));
    await rendre(
      <Accueil />,
      fauxClient({
        reprendre: jest.fn(async () => JETONS),
        referentiel: {
          monPortefeuille: jest.fn(async () => [
            {
              reseau: { id: 'r1', code: 'CV', libelle: 'Cardio Vasculaire' },
              division: 'Cardio',
              produits,
            },
          ]),
        },
      } as unknown as Partial<ClientApi>),
    );
    expect(await screen.findByText('Mes produits')).toBeTruthy();
    expect(screen.getByText(/Produit 0/)).toBeTruthy();
    expect(screen.queryByText(/Produit 9/)).toBeNull();
    await fireEvent.press(screen.getByText('+2'));
    expect(screen.getByText(/Produit 9/)).toBeTruthy();
  });

  it('cherche un prospect et en crée un au statut à valider (PRP-006)', async () => {
    const fiche = {
      id: 'p1',
      civilite: 'dr',
      nom: 'Ndiaye',
      prenom: 'Awa',
      type: 't1',
      type_libelle: 'Médecin',
      specialite: null,
      specialite_libelle: null,
      potentiel: 'A',
      statut: 'a_valider',
    };
    const prospects = {
      liste: jest.fn(async () => ({ total: 1, limite: 100, resultats: [fiche] })),
      creer: jest.fn(async () => fiche),
    };
    const valeurs = [
      { id: 't1', liste: 'type_prospect', libelle: 'Médecin', parent: null, archive: false },
      { id: 's1', liste: 'specialite', libelle: 'Cardiologie', parent: 't1', archive: false },
    ];
    await rendre(
      <EcranProspects />,
      fauxClient({
        reprendre: jest.fn(async () => JETONS),
        perimetre: jest.fn(async () => ({
          ...PERIMETRE,
          actions: ['prospects.lire', 'prospects.creer'],
        })),
        prospects,
        ciblage: { mesListes: jest.fn(async () => []) },
        referentiel: {
          valeurs: jest.fn(async () => valeurs),
          monPortefeuille: jest.fn(async () => []),
        },
      } as unknown as Partial<ClientApi>),
    );
    // L'onglet s'ouvre sur « Ma liste » ; la recherche dans les fiches est à côté.
    expect(await screen.findByText(/aucun poste/)).toBeTruthy();
    await fireEvent.press(screen.getAllByText('Prospects')[1]!);
    expect(await screen.findByText('Dr Awa Ndiaye')).toBeTruthy();
    expect(screen.getByText('À valider')).toBeTruthy();
    await fireEvent.press(screen.getByText('Nouveau prospect'));
    await fireEvent.changeText(await screen.findByLabelText('Nom'), 'Sarr');
    await fireEvent.press(await screen.findByText('Médecin'));
    await fireEvent.press(await screen.findByText('Cardiologie'));
    await fireEvent.press(screen.getByText('Créer la fiche'));
    expect(prospects.creer).toHaveBeenCalledWith(
      expect.objectContaining({ nom: 'Sarr', type: 't1', specialite: 's1', potentiel: 'B' }),
    );
    expect(await screen.findByText(/à valider par l'administrateur pays/)).toBeTruthy();
  });

  it('sans réseau, le formulaire suggère les fiches de la liste enregistrée (PRP-007 CA2)', async () => {
    const cible = {
      id: 'p1',
      civilite: 'dr',
      prenom: 'Aïssatou',
      nom: 'NDIAYE',
      type_libelle: 'Médecin',
      specialite_libelle: 'Cardiologie',
      potentiel: 'A',
      statut: 'actif',
      lieu_principal: { id: 'e1', libelle: 'Clinique du Cap' },
      secteur: 'Plateau',
    };
    const autre = { ...cible, id: 'p2', prenom: 'Moussa', nom: 'DIOP' };
    jest.mocked(lire).mockImplementation(async (cle: string) =>
      cle === 'ciblage.moi'
        ? {
            valeur: [{ poste: { id: 'po1' }, cibles: [{ prospect: cible }, { prospect: autre }] }],
            maj: '2026-10-04T08:00:00Z',
          }
        : null,
    );
    const ressemblants = jest.fn(async () => {
      throw new Error('réseau');
    });
    try {
      await rendre(
        <EcranProspects />,
        fauxClient({
          reprendre: jest.fn(async () => JETONS),
          perimetre: jest.fn(async () => ({
            ...PERIMETRE,
            actions: ['prospects.lire', 'prospects.creer'],
          })),
          prospects: {
            liste: jest.fn(async () => ({ total: 0, limite: 100, resultats: [] })),
            ressemblants,
          },
          ciblage: { mesListes: jest.fn(async () => []) },
          referentiel: {
            valeurs: jest.fn(async () => []),
            monPortefeuille: jest.fn(async () => []),
          },
        } as unknown as Partial<ClientApi>),
      );
      await fireEvent.press(screen.getAllByText('Prospects')[1]!);
      await fireEvent.press(await screen.findByText('Nouveau prospect'));
      await fireEvent.changeText(await screen.findByLabelText('Nom'), 'Ndiay');
      // Le serveur est injoignable : la liste cible du téléphone sert de référence.
      expect(await screen.findByText('Aïssatou NDIAYE')).toBeTruthy();
      expect(screen.getByText(/Hors connexion : comparaison avec votre liste cible/)).toBeTruthy();
      expect(screen.getByText('Cardiologie · Clinique du Cap')).toBeTruthy();
      expect(screen.queryByText('Moussa DIOP')).toBeNull();
      expect(ressemblants).toHaveBeenCalledWith(expect.objectContaining({ nom: 'Ndiay' }));
    } finally {
      jest.mocked(lire).mockReset().mockResolvedValue(null);
    }
  });

  it('crée un établissement avec la position du téléphone (PRP-003 CA2)', async () => {
    const etablissements = {
      liste: jest.fn(async () => ({ total: 0, limite: 100, resultats: [] })),
      secteurs: jest.fn(async () => [{ id: 's1', libelle: 'Plateau', zone: 'Dakar' }]),
      creer: jest.fn(async () => ({})),
    };
    await rendre(
      <EcranProspects />,
      fauxClient({
        reprendre: jest.fn(async () => JETONS),
        perimetre: jest.fn(async () => ({
          ...PERIMETRE,
          actions: ['prospects.lire', 'prospects.creer'],
        })),
        prospects: { liste: jest.fn(async () => ({ total: 0, limite: 100, resultats: [] })) },
        ciblage: { mesListes: jest.fn(async () => []) },
        etablissements,
        referentiel: {
          valeurs: jest.fn(async () => [
            {
              id: 't1',
              liste: 'type_etablissement',
              libelle: 'Pharmacie',
              parent: null,
              archive: false,
            },
          ]),
          monPortefeuille: jest.fn(async () => []),
        },
      } as unknown as Partial<ClientApi>),
    );
    await fireEvent.press(await screen.findByText('Établissements'));
    await fireEvent.press(await screen.findByText('Nouvel établissement'));
    await fireEvent.changeText(
      await screen.findByLabelText("Nom de l'établissement"),
      'Pharmacie Médina',
    );
    await fireEvent.press(await screen.findByText('Pharmacie'));
    await fireEvent.press(await screen.findByText('Plateau'));
    await fireEvent.press(screen.getByText('Utiliser ma position'));
    expect(await screen.findByText('Position enregistrée (9 m)')).toBeTruthy();
    await fireEvent.press(screen.getByText("Créer l'établissement"));
    expect(etablissements.creer).toHaveBeenCalledWith(
      expect.objectContaining({
        nom: 'Pharmacie Médina',
        type: 't1',
        secteur: 's1',
        latitude: 14.70001,
        longitude: -17.45002,
      }),
    );
    expect(await screen.findByText(/Établissement créé/)).toBeTruthy();
  });

  it('bascule en anglais et mémorise la langue sur le compte (USR-004)', async () => {
    const changerLangue = jest.fn(async () => ({ ...JETONS.utilisateur, langue: 'en' as const }));
    await rendre(<Profil />, fauxClient({ reprendre: jest.fn(async () => JETONS), changerLangue }));
    await fireEvent.press(await screen.findByText('English'));
    expect(await screen.findByText('Profile')).toBeTruthy();
    expect(changerLangue).toHaveBeenCalledWith('en');
  });

  it('applique la langue enregistrée sur le compte à la connexion', async () => {
    const anglais = { ...JETONS, utilisateur: { ...JETONS.utilisateur, langue: 'en' as const } };
    await rendre(<Accueil />, fauxClient({ reprendre: jest.fn(async () => anglais) }));
    expect(await screen.findByText('Hello Awa')).toBeTruthy();
  });
});
