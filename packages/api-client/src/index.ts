/**
 * Client de l'API INNOV CRM, partagé par le portail et l'application mobile.
 *
 * - Le jeton d'accès (15 minutes) reste en mémoire, jamais dans un stockage
 *   persistant (architecture-essentials §10).
 * - Le jeton de rafraîchissement est dans un cookie HttpOnly pour le portail,
 *   dans le magasin sécurisé du téléphone pour le mobile (architecture §11.1).
 * - Une réponse 401 déclenche un seul rafraîchissement puis un nouvel essai.
 */
import type {
  Activite,
  Affectation,
  Appareil,
  DescriptionAppareil,
  Division,
  EtatDoubleAuth,
  EtatExploitation,
  InitialisationDoubleAuth,
  Informations,
  Jetons,
  Moi,
  MonOrganisation,
  Occupation,
  Parametre,
  Pays,
  Perimetre,
  Poste,
  Rattachement,
  Reseau,
  RoleAttribue,
  Secteur,
  SessionOuverte,
  StatutPays,
  SyntheseOrganisation,
  Transfert,
  TypeClient,
  TypePoste,
  Utilisateur,
  Zone,
} from '@innov/api-types';

export type {
  Activite,
  Affectation,
  Appareil,
  CodeRole,
  DescriptionAppareil,
  Division,
  EtatDoubleAuth,
  EtatExploitation,
  InitialisationDoubleAuth,
  Informations,
  Jetons,
  Moi,
  MonOrganisation,
  MonPoste,
  Occupation,
  Parametre,
  Pays,
  Perimetre,
  Personne,
  Poste,
  Rattachement,
  Reseau,
  RoleAttribue,
  Secteur,
  SessionOuverte,
  StatutPays,
  SyntheseOrganisation,
  Transfert,
  TypeClient,
  TypePoste,
  Utilisateur,
  Zone,
} from '@innov/api-types';

/** Résultat d'une connexion : une session, ou l'attente du code (SEC-003). */
export type ResultatConnexion =
  { etape: 'connecte'; jetons: Jetons } | { etape: 'code_requis'; jetonEtape: string };

/** Erreur d'un client signalée au serveur (architecture §19), sans donnée saisie. */
export interface RapportErreur {
  message: string;
  version: string;
  pile?: string;
  ecran?: string;
  reference?: string;
}

/** Données de création d'un compte (USR-003). */
export interface NouveauCompte {
  identifiant: string;
  prenom: string;
  nom: string;
  courriel?: string;
  langue?: 'fr' | 'en';
}

/** Affectation dans un autre pays (ORG-009). */
export interface NouvelleAffectation {
  pays: string;
  role: string;
  motif: string;
  debut?: string;
  fin?: string | null;
}

/** Données de création d'un poste (ORG-005). */
export interface NouveauPoste {
  libelle: string;
  type_poste: TypePoste;
  reseaux: string[];
  secteurs: string[];
}

/** Stockage du jeton de rafraîchissement, pour l'application mobile uniquement. */
export interface StockageRafraichissement {
  lire(): Promise<string | null>;
  ecrire(jeton: string | null): Promise<void>;
}

export class ErreurApi extends Error {
  constructor(
    readonly statut: number,
    readonly code: string,
    message: string,
    readonly details: Record<string, unknown> = {},
    /** Référence de la requête, à donner au support (X-Request-Id). */
    readonly reference: string | null = null,
  ) {
    super(message);
    this.name = 'ErreurApi';
  }
}

export interface OptionsClient {
  baseUrl: string;
  client: TypeClient;
  /** Langue courante, envoyée dans Accept-Language pour des messages traduits. */
  langue: () => string;
  /** Obligatoire pour le mobile ; ignoré par le portail. */
  stockage?: StockageRafraichissement;
  /** Mobile : description du téléphone envoyée à la connexion (USR-006). */
  appareil?: () => Promise<DescriptionAppareil>;
  /** Appelé quand la session est définitivement perdue (expirée, révoquée). */
  surSessionPerdue?: () => void;
  fetch?: typeof fetch;
}

interface OptionsRequete {
  methode?: 'GET' | 'POST' | 'PATCH' | 'PUT';
  corps?: unknown;
  authentifiee?: boolean;
}

const ORG = '/api/v1/organisation';

export function creerClient(options: OptionsClient) {
  const base = options.baseUrl.replace(/\/$/, '');
  const appel = options.fetch ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  const portail = options.client === 'portail';
  if (!portail && !options.stockage) {
    throw new Error('Le client mobile a besoin d’un stockage sécurisé.');
  }
  let acces: string | null = null;
  // Pays actif envoyé dans X-Pays ; nul = pays principal (ou vue consolidée pour le siège).
  let paysActif: string | null = null;
  let rafraichissementEnCours: Promise<Jetons> | null = null;

  async function brute<T>(chemin: string, opts: OptionsRequete = {}): Promise<T> {
    const entetes: Record<string, string> = {
      Accept: 'application/json',
      'Accept-Language': options.langue(),
    };
    if (opts.corps !== undefined) entetes['Content-Type'] = 'application/json';
    if (portail) entetes['X-Innov-Client'] = 'portail';
    if (paysActif) entetes['X-Pays'] = paysActif;
    if (opts.authentifiee && acces) entetes.Authorization = `Bearer ${acces}`;
    const reponse = await appel(`${base}${chemin}`, {
      method: opts.methode ?? 'GET',
      headers: entetes,
      body: opts.corps === undefined ? undefined : JSON.stringify(opts.corps),
      credentials: portail ? 'include' : 'omit',
    });
    if (reponse.status === 204) return undefined as T;
    const texte = await reponse.text();
    const donnees = texte ? JSON.parse(texte) : {};
    if (!reponse.ok) {
      throw new ErreurApi(
        reponse.status,
        donnees.code ?? 'erreur',
        donnees.message ?? `Erreur ${reponse.status}`,
        donnees.details ?? {},
        donnees.reference ?? reponse.headers.get('X-Request-Id'),
      );
    }
    return donnees as T;
  }

  async function memoriser(jetons: Jetons): Promise<Jetons> {
    acces = jetons.acces;
    if (!portail && jetons.rafraichissement)
      await options.stockage!.ecrire(jetons.rafraichissement);
    return jetons;
  }

  async function oublier(): Promise<void> {
    acces = null;
    paysActif = null;
    if (!portail) await options.stockage!.ecrire(null);
  }

  async function rafraichir(): Promise<Jetons> {
    // Un seul rafraîchissement à la fois : le jeton change à chaque usage.
    rafraichissementEnCours ??= (async () => {
      try {
        const corps = portail ? {} : { rafraichissement: await options.stockage!.lire() };
        if (!portail && !corps.rafraichissement) {
          throw new ErreurApi(401, 'session_invalide', 'Aucune session enregistrée.');
        }
        return await memoriser(
          await brute<Jetons>('/api/v1/auth/rafraichir/', { methode: 'POST', corps }),
        );
      } catch (erreur) {
        if (erreur instanceof ErreurApi && erreur.statut < 500) await oublier();
        throw erreur;
      } finally {
        rafraichissementEnCours = null;
      }
    })();
    return rafraichissementEnCours;
  }

  async function requete<T>(chemin: string, opts: OptionsRequete = {}): Promise<T> {
    try {
      return await brute<T>(chemin, { ...opts, authentifiee: true });
    } catch (erreur) {
      if (!(erreur instanceof ErreurApi) || erreur.statut !== 401) throw erreur;
      try {
        await rafraichir();
      } catch (echec) {
        options.surSessionPerdue?.();
        throw echec;
      }
      return brute<T>(chemin, { ...opts, authentifiee: true });
    }
  }

  return {
    /** Ouvre une session, ou annonce que le code à usage unique est attendu. */
    async connexion(identifiant: string, motDePasse: string): Promise<ResultatConnexion> {
      const reponse = await brute<Jetons | { etape: string; jeton_etape: string }>(
        '/api/v1/auth/connexion/',
        {
          methode: 'POST',
          corps: {
            identifiant,
            mot_de_passe: motDePasse,
            client: options.client,
            ...(options.appareil ? { appareil: await options.appareil() } : {}),
          },
        },
      );
      if ('jeton_etape' in reponse)
        return { etape: 'code_requis', jetonEtape: reponse.jeton_etape };
      return { etape: 'connecte', jetons: await memoriser(reponse) };
    },
    /** Deuxième étape : code de l'application ou code de secours. */
    async connexionCode(jetonEtape: string, code: string): Promise<Jetons> {
      return memoriser(
        await brute<Jetons>('/api/v1/auth/connexion/code/', {
          methode: 'POST',
          corps: { jeton_etape: jetonEtape, code },
        }),
      );
    },
    /** Reprend une session existante (cookie ou magasin sécurisé), sinon échoue. */
    reprendre: rafraichir,
    async deconnexion(): Promise<void> {
      try {
        if (acces)
          await brute('/api/v1/auth/deconnexion/', { methode: 'POST', authentifiee: true });
      } finally {
        await oublier();
      }
    },
    moi: () => requete<Moi>('/api/v1/auth/moi/'),
    /** Langue de l'interface, mémorisée sur le compte (USR-004). */
    changerLangue: (langue: 'fr' | 'en') =>
      requete<Moi>('/api/v1/auth/moi/', { methode: 'PATCH', corps: { langue } }),
    changerMotDePasse: (actuel: string, nouveau: string) =>
      requete<void>('/api/v1/auth/mot-de-passe/changement/', {
        methode: 'POST',
        corps: { actuel, nouveau },
      }),
    /** Rôles, actions permises et pays accessibles pour le pays actif. */
    perimetre: () => requete<Perimetre>('/api/v1/auth/perimetre/'),
    /** Choisit le pays actif (code ISO) ; nul pour revenir au pays principal. */
    choisirPays(code: string | null) {
      paysActif = code;
    },
    paysActif: () => paysActif,
    informations: () => brute<Informations>('/api/v1/informations/'),
    demanderReinitialisation: (identifiant: string) =>
      brute<void>('/api/v1/auth/mot-de-passe/oubli/', { methode: 'POST', corps: { identifiant } }),
    reinitialiser: (jeton: string, motDePasse: string) =>
      brute<void>('/api/v1/auth/mot-de-passe/reinitialisation/', {
        methode: 'POST',
        corps: { jeton, mot_de_passe: motDePasse },
      }),
    /** Organisation du pays actif (ORG-003 à ORG-008). */
    organisation: {
      synthese: () => requete<SyntheseOrganisation>(`${ORG}/synthese/`),
      moi: () => requete<MonOrganisation>(`${ORG}/moi/`),
      divisions: () => requete<Division[]>(`${ORG}/divisions/`),
      reseaux: () => requete<Reseau[]>(`${ORG}/reseaux/`),
      zones: () => requete<Zone[]>(`${ORG}/zones/`),
      secteurs: () => requete<Secteur[]>(`${ORG}/secteurs/`),
      postes: () => requete<Poste[]>(`${ORG}/postes/`),
      creerDivision: (code: string, libelle: string) =>
        requete<Division>(`${ORG}/divisions/`, { methode: 'POST', corps: { code, libelle } }),
      creerReseau: (division: string, code: string, libelle: string) =>
        requete<Reseau>(`${ORG}/reseaux/`, {
          methode: 'POST',
          corps: { division, code, libelle },
        }),
      creerZone: (libelle: string) =>
        requete<Zone>(`${ORG}/zones/`, { methode: 'POST', corps: { libelle } }),
      creerSecteur: (zone: string, libelle: string) =>
        requete<Secteur>(`${ORG}/secteurs/`, { methode: 'POST', corps: { zone, libelle } }),
      archiver: (type: 'divisions' | 'reseaux' | 'zones' | 'secteurs' | 'postes', id: string) =>
        requete<unknown>(`${ORG}/${type}/${id}/archiver/`, { methode: 'POST' }),
      creerPoste: (poste: NouveauPoste) =>
        requete<Poste>(`${ORG}/postes/`, { methode: 'POST', corps: poste }),
      occuper: (poste: string, utilisateur: string, debut?: string) =>
        requete<Occupation>(`${ORG}/postes/${poste}/occupations/`, {
          methode: 'POST',
          corps: { utilisateur, ...(debut ? { debut } : {}) },
        }),
      occupations: (poste: string) => requete<Occupation[]>(`${ORG}/postes/${poste}/occupations/`),
      terminerOccupation: (occupation: string, fin?: string) =>
        requete<Occupation>(`${ORG}/occupations/${occupation}/terminer/`, {
          methode: 'POST',
          corps: fin ? { fin } : {},
        }),
      rattacher: (poste: string, superviseur: string, debut?: string) =>
        requete<Rattachement>(`${ORG}/postes/${poste}/rattachements/`, {
          methode: 'POST',
          corps: { superviseur, ...(debut ? { debut } : {}) },
        }),
    },
    /** Comptes du pays actif (USR-003). */
    utilisateurs: () => requete<Utilisateur[]>('/api/v1/utilisateurs/'),
    comptes: {
      creer: (compte: NouveauCompte) =>
        requete<Utilisateur>('/api/v1/utilisateurs/', { methode: 'POST', corps: compte }),
      operation: (
        id: string,
        operation:
          | 'suspendre'
          | 'reactiver'
          | 'reinitialiser'
          | 'fermer_sessions'
          | 'reinitialiser_double_auth',
      ) => requete<Utilisateur>(`/api/v1/utilisateurs/${id}/${operation}/`, { methode: 'POST' }),
      roles: (id: string) => requete<RoleAttribue[]>(`/api/v1/utilisateurs/${id}/roles/`),
      attribuerRole: (id: string, role: string) =>
        requete<RoleAttribue>(`/api/v1/utilisateurs/${id}/roles/`, {
          methode: 'POST',
          corps: { role },
        }),
      retirerRole: (role: string) =>
        requete<RoleAttribue>(`/api/v1/roles/${role}/retirer/`, { methode: 'POST' }),
      affectations: (id: string) =>
        requete<Affectation[]>(`/api/v1/utilisateurs/${id}/affectations/`),
      accorderAffectation: (id: string, affectation: NouvelleAffectation) =>
        requete<Affectation>(`/api/v1/utilisateurs/${id}/affectations/`, {
          methode: 'POST',
          corps: affectation,
        }),
      terminerAffectation: (affectation: string) =>
        requete<Affectation>(`/api/v1/affectations/${affectation}/terminer/`, {
          methode: 'POST',
          corps: {},
        }),
      transferts: (id: string) => requete<Transfert[]>(`/api/v1/utilisateurs/${id}/transferts/`),
      transferer: (id: string, pays: string, motif: string, role?: string) =>
        requete<Transfert>(`/api/v1/utilisateurs/${id}/transferts/`, {
          methode: 'POST',
          corps: { pays, motif, ...(role ? { role } : {}) },
        }),
    },
    /** Téléphones des comptes du pays actif (USR-006). */
    appareils: {
      liste: () => requete<Appareil[]>('/api/v1/appareils/'),
      revoquer: (id: string) =>
        requete<Appareil>(`/api/v1/appareils/${id}/revoquer/`, { methode: 'POST' }),
    },
    /** Pays et paramètres (ORG-001, ORG-011). */
    pays: {
      liste: () => requete<Pays[]>('/api/v1/pays/'),
      creer: (code: string) => requete<Pays>('/api/v1/pays/', { methode: 'POST', corps: { code } }),
      changerStatut: (code: string, statut: StatutPays) =>
        requete<Pays>(`/api/v1/pays/${code}/statut/`, { methode: 'POST', corps: { statut } }),
      parametres: (code: string) => requete<Parametre[]>(`/api/v1/pays/${code}/parametres/`),
      modifierParametre: (code: string, cle: string, valeur: unknown) =>
        requete<Parametre>(`/api/v1/pays/${code}/parametres/${cle}/`, {
          methode: 'PUT',
          corps: { valeur },
        }),
    },
    /** Double authentification du compte (SEC-003). */
    doubleAuth: {
      etat: () => requete<EtatDoubleAuth>('/api/v1/auth/double-auth/'),
      initialiser: () =>
        requete<InitialisationDoubleAuth>('/api/v1/auth/double-auth/initialiser/', {
          methode: 'POST',
        }),
      activer: (code: string) =>
        requete<{ codes_secours: string[] }>('/api/v1/auth/double-auth/activer/', {
          methode: 'POST',
          corps: { code },
        }),
      codesSecours: (code: string) =>
        requete<{ codes_secours: string[] }>('/api/v1/auth/double-auth/codes-secours/', {
          methode: 'POST',
          corps: { code },
        }),
      desactiver: (code: string) =>
        requete<void>('/api/v1/auth/double-auth/desactiver/', { methode: 'POST', corps: { code } }),
    },
    /** Sessions ouvertes du compte et révocation à distance (SEC-004). */
    sessions: {
      liste: () => requete<SessionOuverte[]>('/api/v1/auth/sessions/'),
      revoquer: (id: string) =>
        requete<void>(`/api/v1/auth/sessions/${id}/revoquer/`, { methode: 'POST' }),
      revoquerAutres: () =>
        requete<void>('/api/v1/auth/sessions/autres/revoquer/', { methode: 'POST' }),
    },
    /** Derniers événements de sécurité du compte (AUD-001). */
    activite: () => requete<Activite[]>('/api/v1/auth/activite/'),
    /** État technique du service (administrateur technique, siège). */
    exploitation: () => requete<EtatExploitation>('/api/v1/exploitation/'),
    /** Signale une erreur du client ; ne lève jamais (le signalement est un renfort). */
    async signalerErreur(rapport: RapportErreur): Promise<void> {
      try {
        await brute<void>('/api/v1/erreurs-clients/', {
          methode: 'POST',
          corps: {
            client: options.client,
            ...rapport,
            message: rapport.message.slice(0, 500),
            pile: rapport.pile?.slice(0, 4000),
            ecran: rapport.ecran?.slice(0, 200),
          },
        });
      } catch {
        // Hors ligne ou serveur indisponible : rien à faire de plus.
      }
    },
    requete,
    estConnecte: () => acces !== null,
  };
}

export type ClientApi = ReturnType<typeof creerClient>;
