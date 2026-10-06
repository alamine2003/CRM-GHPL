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
  ChangementFiche,
  DetailVersion,
  VersionPlanning,
  CandidatsRemplacement,
  CreationRemplacement,
  Remplacement,
  Revision,
  Notification,
  ResumeNotifications,
  ConsultationPlanning,
  JourFerie,
  Planning,
  PlanningEnAttente,
  SemaineFermee,
  Programme,
  DetailVisite,
  Demarrage,
  Terminaison,
  Ecart,
  Report,
  Imprevue,
  Rapport,
  SaisieRapport,
  ChampRapport,
  SaisieChamp,
  ModificationChamp,
  Qualite,
  Semaine,
  Reprise,
  Activite,
  ModificationActivite,
  Passage,
  SaisieActivite,
  ModificationVisite,
  SaisieVisite,
  Visite,
  DecisionDoublon,
  DoublonProbable,
  Fusion,
  Proposition,
  ProspectCree,
  Ressemblante,
  SaisieProposition,
  Cible,
  ListeCible,
  PosteCible,
  ProspectCible,
  ResultatAjoutCibles,
  ActiviteExercice,
  Exercice,
  DetailLot,
  Localite,
  LotImport,
  SecteurSaisie,
  ActiviteCompte,
  Affectation,
  Appareil,
  DescriptionAppareil,
  Division,
  Etablissement,
  EtatDoubleAuth,
  EtatExploitation,
  InitialisationDoubleAuth,
  Informations,
  Civilite,
  Jetons,
  ListeEtablissements,
  ListeProspects,
  ListeReferentiel,
  Moi,
  MonOrganisation,
  Occupation,
  Parametre,
  Pays,
  Perimetre,
  Portefeuille,
  Poste,
  Potentiel,
  Produit,
  Prospect,
  Rattachement,
  Reseau,
  RoleAttribue,
  Secteur,
  SessionOuverte,
  StatutFiche,
  StatutPays,
  SyntheseEtablissements,
  SyntheseOrganisation,
  SyntheseProspects,
  Transfert,
  TypeClient,
  TypePoste,
  Utilisateur,
  ValeurReferentiel,
  Zone,
} from '@innov/api-types';

export type {
  ChangementFiche,
  JourFerie,
  JourSemaine,
  JourKm,
  Kilometrage,
  Reprise,
  CodeControle,
  ControlePlanning,
  Controles,
  ObjectifJour,
  Activite,
  ModificationActivite,
  Passage,
  PeriodeActivite,
  SaisieActivite,
  TypeActivite,
  ModificationVisite,
  SaisieVisite,
  StatutVisite,
  Visite,
  ConsultationPlanning,
  DecisionPlanning,
  ComparaisonVersions,
  DetailVersion,
  VersionPlanning,
  VisiteFigee,
  CandidatsRemplacement,
  CreationRemplacement,
  Remarque,
  Remplacement,
  Revision,
  Notification,
  ResumeNotifications,
  Planning,
  PlanningEnAttente,
  SemaineFermee,
  Programme,
  VisiteProgramme,
  JourProgramme,
  DetailVisite,
  Demarrage,
  Terminaison,
  Ecart,
  Report,
  Imprevue,
  Rapport,
  StatutRapport,
  StatutRapportVisite,
  SaisieRapport,
  DefinitionChamp,
  TypeChamp,
  ValeursChamps,
  ChampRapport,
  SaisieChamp,
  ModificationChamp,
  Qualite,
  Semaine,
  ComparaisonFiche,
  DecisionDoublon,
  DoublonProbable,
  Fusion,
  Proposition,
  ProspectCree,
  Ressemblante,
  SaisieProposition,
  Cible,
  ListeCible,
  PosteCible,
  ProspectCible,
  ResultatAjoutCibles,
  ActiviteExercice,
  Exercice,
  AnomalieImport,
  DetailLot,
  Lieu,
  Localite,
  LotImport,
  SecteurSaisie,
  ActiviteCompte,
  Affectation,
  Appareil,
  CodeRole,
  DescriptionAppareil,
  Division,
  Etablissement,
  EtatDoubleAuth,
  EtatExploitation,
  InitialisationDoubleAuth,
  Informations,
  Civilite,
  Jetons,
  ListeEtablissements,
  ListeProspects,
  ListeReferentiel,
  Moi,
  MonOrganisation,
  MonPoste,
  Occupation,
  Parametre,
  Pays,
  Perimetre,
  Portefeuille,
  Personne,
  Poste,
  Potentiel,
  Produit,
  Prospect,
  ProduitResume,
  Rattachement,
  Reseau,
  RoleAttribue,
  Secteur,
  SessionOuverte,
  StatutFiche,
  StatutPays,
  SyntheseEtablissements,
  SyntheseOrganisation,
  SyntheseProspects,
  Transfert,
  TypeClient,
  TypePoste,
  Utilisateur,
  ValeurReferentiel,
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
export interface NouvelleValeur {
  liste: ListeReferentiel;
  libelle: string;
  code?: string;
  ordre?: number;
  parent?: string | null;
}

export interface NouveauProduit {
  libelle: string;
  code?: string;
  classe?: string | null;
  reseaux?: string[];
}

/** Pagination commune aux listes (PRP-005 CA3 : 20 par page par défaut). */
export interface Pagination {
  page?: number;
  taille?: number;
  /** « perimetre » par défaut ; « pays » pour chercher hors de son secteur (RG-024). */
  portee?: 'perimetre' | 'pays';
}

export type TriProspects = 'nom' | 'potentiel' | 'specialite' | 'secteur' | 'recents';
export type TriEtablissements = 'nom' | 'type' | 'secteur' | 'recents';

export interface FiltresProspects extends Pagination {
  q?: string;
  statut?: StatutFiche;
  type?: string;
  specialite?: string;
  potentiel?: Potentiel;
  activite?: ActiviteExercice;
  secteur?: string;
  localite?: string;
  /** Liste cible du poste (le délégué qui l'occupe). */
  poste?: string;
  sans_lieu?: '1';
  /** Qualité des données (0.1.9). */
  sans_telephone?: '1';
  sans_specialite?: '1';
  hors_cible?: '1';
  tri?: TriProspects;
}

export interface SaisieProspect {
  civilite?: Civilite | '';
  nom: string;
  prenom?: string;
  type: string | null;
  specialite?: string | null;
  numero_ordre?: string;
  telephone_mobile?: string;
  telephone_pro?: string;
  courriel?: string;
  potentiel: Potentiel;
  activite?: ActiviteExercice | '';
  grade?: string | null;
  secteur?: string | null;
  localite?: string | null;
}

/** Lieu d'exercice d'un prospect (PRP-004). */
export interface SaisieExercice {
  etablissement: string;
  debut?: string;
  principal?: boolean | null;
  presence?: string;
}

export interface FiltresEtablissements extends Pagination {
  q?: string;
  statut?: StatutFiche;
  type?: string;
  secteur?: string;
  localite?: string;
  activite?: ActiviteExercice;
  sans_coordonnees?: '1';
  tri?: TriEtablissements;
}

export interface SaisieEtablissement {
  nom: string;
  type: string | null;
  secteur: string | null;
  adresse?: string;
  localite?: string | null;
  activite?: ActiviteExercice | '';
  latitude?: number | null;
  longitude?: number | null;
  telephone?: string;
}

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
  /** Objet envoyé en JSON, ou formulaire multipart (téléversement de fichier). */
  corps?: unknown;
  /** Réponse lue comme texte brut (rapport CSV). */
  texte?: boolean;
  authentifiee?: boolean;
}

const ORG = '/api/v1/organisation';
const REF = '/api/v1/referentiel';

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
    const formulaire = typeof FormData !== 'undefined' && opts.corps instanceof FormData;
    if (opts.corps !== undefined && !formulaire) entetes['Content-Type'] = 'application/json';
    if (portail) entetes['X-Innov-Client'] = 'portail';
    if (paysActif) entetes['X-Pays'] = paysActif;
    if (opts.authentifiee && acces) entetes.Authorization = `Bearer ${acces}`;
    const reponse = await appel(`${base}${chemin}`, {
      method: opts.methode ?? 'GET',
      headers: entetes,
      body:
        opts.corps === undefined
          ? undefined
          : formulaire
            ? (opts.corps as FormData)
            : JSON.stringify(opts.corps),
      credentials: portail ? 'include' : 'omit',
    });
    if (reponse.status === 204) return undefined as T;
    const texte = await reponse.text();
    if (opts.texte && reponse.ok) return texte as T;
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
      /** Renomme un secteur et/ou le rattache à une autre zone (ORG-003). */
      modifierSecteur: (id: string, champs: { libelle?: string; zone?: string }) =>
        requete<Secteur>(`${ORG}/secteurs/${id}/`, { methode: 'PATCH', corps: champs }),
      localites: (secteur?: string) =>
        requete<Localite[]>(`${ORG}/localites/${secteur ? `?secteur=${secteur}` : ''}`),
      creerLocalite: (secteur: string, libelle: string) =>
        requete<Localite>(`${ORG}/localites/`, { methode: 'POST', corps: { secteur, libelle } }),
      archiver: (
        type: 'divisions' | 'reseaux' | 'zones' | 'secteurs' | 'localites' | 'postes',
        id: string,
      ) => requete<unknown>(`${ORG}/${type}/${id}/archiver/`, { methode: 'POST' }),
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
    /** Référentiels du pays (PRP-001) et portefeuilles des réseaux (ORG-004). */
    referentiel: {
      valeurs: (liste?: ListeReferentiel) =>
        requete<ValeurReferentiel[]>(`${REF}/valeurs/${liste ? `?liste=${liste}` : ''}`),
      creerValeur: (valeur: NouvelleValeur) =>
        requete<ValeurReferentiel>(`${REF}/valeurs/`, { methode: 'POST', corps: valeur }),
      modifierValeur: (
        id: string,
        champs: { libelle?: string; ordre?: number; parent?: string | null },
      ) => requete<ValeurReferentiel>(`${REF}/valeurs/${id}/`, { methode: 'PATCH', corps: champs }),
      produits: () => requete<Produit[]>(`${REF}/produits/`),
      creerProduit: (produit: NouveauProduit) =>
        requete<Produit>(`${REF}/produits/`, { methode: 'POST', corps: produit }),
      modifierProduit: (id: string, champs: Partial<NouveauProduit>) =>
        requete<Produit>(`${REF}/produits/${id}/`, { methode: 'PATCH', corps: champs }),
      archiver: (type: 'valeurs' | 'produits', id: string) =>
        requete<unknown>(`${REF}/${type}/${id}/archiver/`, { methode: 'POST' }),
      reactiver: (type: 'valeurs' | 'produits', id: string) =>
        requete<unknown>(`${REF}/${type}/${id}/reactiver/`, { methode: 'POST' }),
      portefeuilles: () => requete<Portefeuille[]>(`${REF}/portefeuilles/`),
      definirPortefeuille: (reseau: string, produits: string[]) =>
        requete<Portefeuille>(`${REF}/portefeuilles/${reseau}/`, {
          methode: 'PUT',
          corps: { produits },
        }),
      monPortefeuille: () => requete<Portefeuille[]>(`${REF}/mon-portefeuille/`),
    },
    /** Fiches prospects (PRP-002, PRP-006). */
    prospects: {
      liste: (filtres: FiltresProspects = {}) => {
        const params = new URLSearchParams(
          Object.entries(filtres)
            .filter(([, v]) => v !== undefined && v !== null && v !== '')
            .map(([k, v]) => [k, String(v)]),
        ).toString();
        return requete<ListeProspects>(`/api/v1/prospects/${params ? `?${params}` : ''}`);
      },
      synthese: () => requete<SyntheseProspects>('/api/v1/prospects/synthese/'),
      detail: (id: string) => requete<Prospect>(`/api/v1/prospects/${id}/`),
      /** PRP-008 : la réponse porte la décision du détecteur (`doublon`). */
      creer: (fiche: SaisieProspect) =>
        requete<ProspectCree>('/api/v1/prospects/', { methode: 'POST', corps: fiche }),
      /** PRP-007 : fiches qui ressemblent à la saisie en cours. */
      ressemblants: (saisie: {
        nom?: string;
        prenom?: string;
        numero_ordre?: string;
        telephone_mobile?: string;
      }) => {
        const params = new URLSearchParams(
          Object.entries(saisie).filter(([, v]) => v) as [string, string][],
        ).toString();
        return requete<Ressemblante[]>(`/api/v1/prospects/ressemblants/?${params}`);
      },
      /** PRP-012 : historique champ par champ. */
      historique: (id: string) => requete<ChangementFiche[]>(`/api/v1/prospects/${id}/historique/`),
      modifier: (id: string, champs: Partial<SaisieProspect>) =>
        requete<Prospect>(`/api/v1/prospects/${id}/`, { methode: 'PATCH', corps: champs }),
      valider: (id: string) =>
        requete<Prospect>(`/api/v1/prospects/${id}/valider/`, { methode: 'POST' }),
      archiver: (id: string, motif = '') =>
        requete<Prospect>(`/api/v1/prospects/${id}/archiver/`, {
          methode: 'POST',
          corps: { motif },
        }),
    },
    /** Calendrier des jours fériés du pays (ORG-012). */
    joursFeries: {
      liste: (annee?: number) =>
        requete<JourFerie[]>(`/api/v1/jours-feries/${annee ? `?annee=${annee}` : ''}`),
      creer: (saisie: { date: string; libelle: string; variable?: boolean }) =>
        requete<JourFerie>('/api/v1/jours-feries/', { methode: 'POST', corps: saisie }),
      modifier: (id: string, champs: { date?: string; libelle?: string; variable?: boolean }) =>
        requete<JourFerie>(`/api/v1/jours-feries/${id}/`, { methode: 'PATCH', corps: champs }),
      retirer: (id: string) =>
        requete<JourFerie>(`/api/v1/jours-feries/${id}/retirer/`, { methode: 'POST' }),
    },
    /** Semaine du délégué et son planning (PLN-001). */
    plannings: {
      /** File du superviseur : plannings soumis de son équipe, du plus ancien (PLN-011). */
      aValider: () => requete<PlanningEnAttente[]>('/api/v1/plannings/a-valider/'),
      /** Délégués supervisés dont la semaine en cours est fermée depuis le lundi 0 h. */
      fermes: () => requete<SemaineFermee[]>('/api/v1/plannings/fermes/'),
      /** Le superviseur rouvre la rédaction d'un planning fermé ; la réouverture est inscrite. */
      rouvrir: (delegue: string, semaine: string) =>
        requete<Planning>('/api/v1/plannings/fermes/rouvrir/', {
          methode: 'POST',
          corps: { delegue, semaine },
        }),
      /** Le délégué demande à son superviseur de rouvrir sa semaine fermée. */
      demanderReouverture: (semaine: string) =>
        requete<{ destinataires: number }>('/api/v1/plannings/semaine/reouverture/', {
          methode: 'POST',
          corps: { semaine },
        }),
      /** Un planning soumis consulté par son superviseur, sans rien y modifier (0.3.2). */
      consulter: (id: string) =>
        requete<ConsultationPlanning>(`/api/v1/plannings/${id}/consultation/`),
      /** Le responsable du poste approuve le planning soumis (PLN-012, PLN-017). */
      approuver: (id: string) =>
        requete<Planning>(`/api/v1/plannings/${id}/approuver/`, { methode: 'POST' }),
      /** Versions figées, de la plus récente à la plus ancienne (PLN-014 CA2). */
      versions: (id: string) => requete<VersionPlanning[]>(`/api/v1/plannings/${id}/versions/`),
      /** Une version et sa comparaison à la précédente (PLN-014 CA1). */
      version: (id: string, numero: number) =>
        requete<DetailVersion>(`/api/v1/plannings/${id}/versions/${numero}/`),
      /** Révision commentée, sur le planning ou des visites précises (PLN-013, RG-017). */
      reviser: (id: string, revision: Revision) =>
        requete<Planning>(`/api/v1/plannings/${id}/reviser/`, { methode: 'POST', corps: revision }),
      /** Programme de la semaine, tel qu'approuvé (VIS-001) : ce que le délégué exécute. */
      programme: (jour?: string) =>
        requete<Programme>(`/api/v1/programme/${jour ? `?semaine=${jour}` : ''}`),
      semaine: (jour?: string) =>
        requete<Semaine>(`/api/v1/plannings/semaine/${jour ? `?semaine=${jour}` : ''}`),
      creer: (semaine: string) =>
        requete<Planning>('/api/v1/plannings/', { methode: 'POST', corps: { semaine } }),
      ajouterVisite: (planning: string, saisie: SaisieVisite) =>
        requete<Visite>(`/api/v1/plannings/${planning}/visites/`, {
          methode: 'POST',
          corps: saisie,
        }),
      /** Ordre de la journée : toutes les visites du jour, dans l'ordre voulu (0.2.3). */
      ordonner: (planning: string, date: string, visites: string[]) =>
        requete<Visite[]>(`/api/v1/plannings/${planning}/ordre/`, {
          methode: 'POST',
          corps: { date, visites },
        }),
      /** Prospects de la liste cible posés sur un jour, visites pré-remplies (PLN-005 CA1). */
      poser: (planning: string, date: string, prospects: string[]) =>
        requete<Visite[]>(`/api/v1/plannings/${planning}/poser/`, {
          methode: 'POST',
          corps: { date, prospects },
        }),
      /** Reprend la semaine précédente sur une semaine vide (PLN-005 CA2). */
      reprendre: (planning: string) =>
        requete<Reprise>(`/api/v1/plannings/${planning}/reprendre/`, { methode: 'POST' }),
      /** Soumet le planning au superviseur, après le contrôle final (PLN-008). */
      soumettre: (planning: string) =>
        requete<Planning>(`/api/v1/plannings/${planning}/soumettre/`, { methode: 'POST' }),
      regrouper: (planning: string, visites: string[]) =>
        requete<Passage>(`/api/v1/plannings/${planning}/passages/`, {
          methode: 'POST',
          corps: { visites },
        }),
      declarerActivite: (planning: string, saisie: SaisieActivite) =>
        requete<Activite>(`/api/v1/plannings/${planning}/activites/`, {
          methode: 'POST',
          corps: saisie,
        }),
    },
    /** Passages : visites d'un même établissement le même jour (PLN-003). */
    passages: {
      dissocier: (id: string) =>
        requete<Passage>(`/api/v1/passages/${id}/dissocier/`, { methode: 'POST' }),
    },
    /** Activites déclarées dans le planning (PLN-009). */
    activites: {
      modifier: (id: string, champs: ModificationActivite) =>
        requete<Activite>(`/api/v1/activites/${id}/`, { methode: 'PATCH', corps: champs }),
      retirer: (id: string) =>
        requete<Activite>(`/api/v1/activites/${id}/retirer/`, { methode: 'POST' }),
    },
    /** Visites d'un planning en préparation (PLN-002). */
    visites: {
      /** Détail : coordonnées du prospect et du lieu, 3 dernières visites du délégué (VIS-002). */
      detail: (id: string) => requete<DetailVisite>(`/api/v1/visites/${id}/detail/`),
      modifier: (id: string, champs: ModificationVisite) =>
        requete<Visite>(`/api/v1/visites/${id}/`, { methode: 'PATCH', corps: champs }),
      retirer: (id: string) =>
        requete<Visite>(`/api/v1/visites/${id}/retirer/`, { methode: 'POST' }),
      /** Démarre la visite (VIS-003) : rejouable sans effet depuis la file du téléphone. */
      demarrer: (id: string, demarrage: Demarrage) =>
        requete<Visite>(`/api/v1/visites/${id}/demarrer/`, { methode: 'POST', corps: demarrage }),
      /** Termine la visite en cours (VIS-004) : rejouable sans effet depuis la file. */
      terminer: (id: string, terminaison: Terminaison) =>
        requete<Visite>(`/api/v1/visites/${id}/terminer/`, {
          methode: 'POST',
          corps: terminaison,
        }),
      /** Prospect absent (VIS-005) : motif obligatoire ; rejouable depuis la file. */
      absent: (id: string, ecart: Ecart) =>
        requete<Visite>(`/api/v1/visites/${id}/absent/`, { methode: 'POST', corps: ecart }),
      /** Annuler (VIS-006) : motif obligatoire ; le jour prévu ou à l'avance. */
      annuler: (id: string, ecart: Ecart) =>
        requete<Visite>(`/api/v1/visites/${id}/annuler/`, { methode: 'POST', corps: ecart }),
      /** Non réalisée (VIS-009) : une visite restée prévue après sa journée, avec un motif. */
      nonRealisee: (id: string, ecart: Ecart) =>
        requete<Visite>(`/api/v1/visites/${id}/non-realisee/`, { methode: 'POST', corps: ecart }),
      /** Visite imprévue (VIS-008) : justifiée, au jour réel ; elle démarre aussitôt. */
      imprevue: (saisie: Imprevue) =>
        requete<Visite>('/api/v1/visites/imprevue/', { methode: 'POST', corps: saisie }),
      /** Reporter (VIS-007) : motif obligatoire ; la nouvelle visite, liée, au jour choisi. */
      reporter: (id: string, report: Report) =>
        requete<Visite>(`/api/v1/visites/${id}/reporter/`, { methode: 'POST', corps: report }),
      copier: (id: string, date: string) =>
        requete<Visite>(`/api/v1/visites/${id}/copier/`, { methode: 'POST', corps: { date } }),
      /** Rapport de la visite effectuée (RPT-001) : ouvert en brouillon à la première lecture. */
      rapport: (id: string) => requete<Rapport>(`/api/v1/visites/${id}/rapport/`),
      enregistrerRapport: (id: string, saisie: SaisieRapport) =>
        requete<Rapport>(`/api/v1/visites/${id}/rapport/`, { methode: 'PUT', corps: saisie }),
      /** Soumission (RPT-002) : refusée tant que le socle ou un champ obligatoire manque. */
      soumettreRapport: (id: string, soumisLe: string) =>
        requete<Rapport>(`/api/v1/visites/${id}/rapport/soumettre/`, {
          methode: 'POST',
          corps: { soumis_le: soumisLe },
        }),
    },
    /** Champs supplémentaires du rapport, par pays (RPT-008). */
    rapports: {
      champs: () => requete<ChampRapport[]>('/api/v1/rapports/champs/'),
      creerChamp: (saisie: SaisieChamp) =>
        requete<ChampRapport>('/api/v1/rapports/champs/', { methode: 'POST', corps: saisie }),
      modifierChamp: (id: string, champs: ModificationChamp) =>
        requete<ChampRapport>(`/api/v1/rapports/champs/${id}/`, {
          methode: 'PATCH',
          corps: champs,
        }),
      archiverChamp: (id: string) =>
        requete<ChampRapport>(`/api/v1/rapports/champs/${id}/archiver/`, { methode: 'POST' }),
    },
    /** Qualité des données du pays actif (0.1.9). */
    qualite: () => requete<Qualite>('/api/v1/qualite/'),
    /** File des doublons probables (PRP-009). */
    doublons: {
      liste: (statut?: string) =>
        requete<DoublonProbable[]>(`/api/v1/doublons/${statut ? `?statut=${statut}` : ''}`),
      trancher: (id: string, decision: DecisionDoublon, conserver?: string) =>
        requete<DoublonProbable>(`/api/v1/doublons/${id}/trancher/`, {
          methode: 'POST',
          corps: { decision, ...(conserver ? { conserver } : {}) },
        }),
    },
    /** Fusions et défusions (PRP-008, PRP-010). */
    fusions: {
      liste: () => requete<Fusion[]>('/api/v1/fusions/'),
      defaire: (id: string) =>
        requete<Fusion>(`/api/v1/fusions/${id}/defaire/`, { methode: 'POST' }),
    },
    /** Propositions de modification des fiches communes (PRP-014). */
    /** Remplaçants datés des superviseurs (ORG-013). */
    remplacements: {
      liste: () => requete<Remplacement[]>('/api/v1/remplacements/'),
      candidats: () => requete<CandidatsRemplacement>('/api/v1/remplacements/candidats/'),
      designer: (saisie: CreationRemplacement) =>
        requete<Remplacement>('/api/v1/remplacements/', { methode: 'POST', corps: saisie }),
      terminer: (id: string) =>
        requete<Remplacement>(`/api/v1/remplacements/${id}/terminer/`, { methode: 'POST' }),
    },
    /** Centre de notifications : les siennes, dans le pays actif (prd.md §18). */
    notifications: {
      liste: () => requete<ResumeNotifications>('/api/v1/notifications/'),
      /** NOT-001 : le centre complet, lues et non lues. */
      centre: () => requete<ResumeNotifications>('/api/v1/notifications/?centre=1'),
      lue: (id: string) =>
        requete<Notification>(`/api/v1/notifications/${id}/lue/`, { methode: 'POST' }),
      toutesLues: () =>
        requete<ResumeNotifications>('/api/v1/notifications/lues/', { methode: 'POST' }),
    },
    propositions: {
      liste: (statut?: string) =>
        requete<Proposition[]>(`/api/v1/propositions/${statut ? `?statut=${statut}` : ''}`),
      creer: (saisie: SaisieProposition) =>
        requete<Proposition>('/api/v1/propositions/', { methode: 'POST', corps: saisie }),
      trancher: (id: string, decision: 'accepter' | 'refuser', motif = '') =>
        requete<Proposition>(`/api/v1/propositions/${id}/trancher/`, {
          methode: 'POST',
          corps: { decision, motif },
        }),
      marquerVues: () => requete<void>('/api/v1/propositions/vues/', { methode: 'POST' }),
    },
    /** Lieux d'exercice datés prospect ↔ établissement (PRP-004). */
    exercices: {
      duProspect: (prospect: string) =>
        requete<Exercice[]>(`/api/v1/prospects/${prospect}/exercices/`),
      deLEtablissement: (etablissement: string) =>
        requete<Exercice[]>(`/api/v1/etablissements/${etablissement}/exercices/`),
      ajouter: (prospect: string, saisie: SaisieExercice) =>
        requete<Exercice>(`/api/v1/prospects/${prospect}/exercices/`, {
          methode: 'POST',
          corps: saisie,
        }),
      modifier: (id: string, champs: { principal?: boolean; presence?: string }) =>
        requete<Exercice>(`/api/v1/exercices/${id}/`, { methode: 'PATCH', corps: champs }),
      terminer: (id: string, fin?: string) =>
        requete<Exercice>(`/api/v1/exercices/${id}/terminer/`, {
          methode: 'POST',
          corps: fin ? { fin } : {},
        }),
    },
    /** Listes cibles par poste et fréquences cibles (PRP-011). */
    ciblage: {
      postes: () => requete<PosteCible[]>('/api/v1/ciblage/postes/'),
      liste: (poste: string, historique = false) =>
        requete<ListeCible>(`/api/v1/ciblage/postes/${poste}/${historique ? '?historique=1' : ''}`),
      candidats: (poste: string, filtres: { q?: string; potentiel?: Potentiel } = {}) => {
        const params = new URLSearchParams(
          Object.entries(filtres)
            .filter(([, v]) => v !== undefined && v !== null && v !== '')
            .map(([k, v]) => [k, String(v)]),
        ).toString();
        return requete<ProspectCible[]>(
          `/api/v1/ciblage/postes/${poste}/candidats/${params ? `?${params}` : ''}`,
        );
      },
      ajouter: (poste: string, prospects: string[], frequence?: number) =>
        requete<ResultatAjoutCibles>(`/api/v1/ciblage/postes/${poste}/`, {
          methode: 'POST',
          corps: { prospects, ...(frequence ? { frequence } : {}) },
        }),
      frequence: (cible: string, frequence: number) =>
        requete<Cible>(`/api/v1/ciblage/cibles/${cible}/`, {
          methode: 'PATCH',
          corps: { frequence },
        }),
      retirer: (cible: string, motif = '') =>
        requete<Cible>(`/api/v1/ciblage/cibles/${cible}/retirer/`, {
          methode: 'POST',
          corps: { motif },
        }),
      mesListes: () => requete<ListeCible[]>('/api/v1/ciblage/moi/'),
    },
    /** Fiches établissements (PRP-003). */
    etablissements: {
      liste: (filtres: FiltresEtablissements = {}) => {
        const params = new URLSearchParams(
          Object.entries(filtres)
            .filter(([, v]) => v !== undefined && v !== null && v !== '')
            .map(([k, v]) => [k, String(v)]),
        ).toString();
        return requete<ListeEtablissements>(`/api/v1/etablissements/${params ? `?${params}` : ''}`);
      },
      synthese: () => requete<SyntheseEtablissements>('/api/v1/etablissements/synthese/'),
      /** Secteurs actifs et leurs localités, pour la saisie d'une fiche. */
      secteurs: () => requete<SecteurSaisie[]>('/api/v1/etablissements/secteurs/'),
      detail: (id: string) => requete<Etablissement>(`/api/v1/etablissements/${id}/`),
      historique: (id: string) =>
        requete<ChangementFiche[]>(`/api/v1/etablissements/${id}/historique/`),
      creer: (fiche: SaisieEtablissement) =>
        requete<Etablissement>('/api/v1/etablissements/', { methode: 'POST', corps: fiche }),
      modifier: (id: string, champs: Partial<SaisieEtablissement>) =>
        requete<Etablissement>(`/api/v1/etablissements/${id}/`, {
          methode: 'PATCH',
          corps: champs,
        }),
      valider: (id: string) =>
        requete<Etablissement>(`/api/v1/etablissements/${id}/valider/`, { methode: 'POST' }),
      archiver: (id: string, motif = '') =>
        requete<Etablissement>(`/api/v1/etablissements/${id}/archiver/`, {
          methode: 'POST',
          corps: { motif },
        }),
    },
    /** Imports contrôlés (PRP-013) : simulation, import, rapport d'anomalies. */
    imports: {
      liste: () => requete<LotImport[]>('/api/v1/imports/'),
      detail: (id: string) => requete<DetailLot>(`/api/v1/imports/${id}/`),
      birdnotes: (fichier: Blob, nom: string, simulation: boolean) => {
        const formulaire = new FormData();
        formulaire.append('fichier', fichier, nom);
        formulaire.append('simulation', simulation ? 'true' : 'false');
        return requete<DetailLot>('/api/v1/imports/birdnotes/', {
          methode: 'POST',
          corps: formulaire,
        });
      },
      /** ORG-014 : fichier d'organisation (classeur Excel). */
      organisation: (fichier: Blob, nom: string, simulation: boolean) => {
        const formulaire = new FormData();
        formulaire.append('fichier', fichier, nom);
        formulaire.append('simulation', simulation ? 'true' : 'false');
        return requete<DetailLot>('/api/v1/imports/organisation/', {
          methode: 'POST',
          corps: formulaire,
        });
      },
      rapport: (id: string) => requete<string>(`/api/v1/imports/${id}/rapport/`, { texte: true }),
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
    activite: () => requete<ActiviteCompte[]>('/api/v1/auth/activite/'),
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
