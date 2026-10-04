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
  Division,
  Informations,
  Jetons,
  Moi,
  MonOrganisation,
  Occupation,
  Perimetre,
  Poste,
  Rattachement,
  Reseau,
  Secteur,
  SyntheseOrganisation,
  TypeClient,
  TypePoste,
  Utilisateur,
  Zone,
} from '@innov/api-types';

export type {
  CodeRole,
  Division,
  Informations,
  Jetons,
  Moi,
  MonOrganisation,
  MonPoste,
  Occupation,
  Perimetre,
  Personne,
  Poste,
  Rattachement,
  Reseau,
  Secteur,
  SyntheseOrganisation,
  TypeClient,
  TypePoste,
  Utilisateur,
  Zone,
} from '@innov/api-types';

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
  /** Appelé quand la session est définitivement perdue (expirée, révoquée). */
  surSessionPerdue?: () => void;
  fetch?: typeof fetch;
}

interface OptionsRequete {
  methode?: 'GET' | 'POST' | 'PATCH';
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
    if (reponse.status === 204 || reponse.status === 202) return undefined as T;
    const texte = await reponse.text();
    const donnees = texte ? JSON.parse(texte) : {};
    if (!reponse.ok) {
      throw new ErreurApi(
        reponse.status,
        donnees.code ?? 'erreur',
        donnees.message ?? `Erreur ${reponse.status}`,
        donnees.details ?? {},
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
    /** Ouvre une session. */
    async connexion(identifiant: string, motDePasse: string): Promise<Jetons> {
      return memoriser(
        await brute<Jetons>('/api/v1/auth/connexion/', {
          methode: 'POST',
          corps: { identifiant, mot_de_passe: motDePasse, client: options.client },
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
    requete,
    estConnecte: () => acces !== null,
  };
}

export type ClientApi = ReturnType<typeof creerClient>;
