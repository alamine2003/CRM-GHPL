/**
 * Types de l'API, générés depuis backend/schema.yaml (ADR-012).
 * Ne jamais écrire ces types à la main : `npm run api:types` régénère schema.d.ts.
 */
import type { components, paths } from './schema';

type Schemas = components['schemas'];

export type { components, paths };
export type Informations = Schemas['Informations'];
export type Langue = Schemas['Langue'];
export type Jetons = Schemas['Jetons'];
export type Moi = Schemas['Moi'];
export type TypeClient = Schemas['ClientEnum'];
export type Perimetre = Schemas['Perimetre'];
export type PaysResume = Schemas['PaysResume'];
export type Pays = Schemas['Pays'];
export type Utilisateur = Schemas['Utilisateur'];
export type RoleAttribue = Schemas['Role'];
export type CodeRole = Schemas['RoleEnum'];
export type Division = Schemas['Division'];
export type Reseau = Schemas['Reseau'];
export type Zone = Schemas['Zone'];
export type Secteur = Schemas['Secteur'];
export type Poste = Schemas['Poste'];
export type TypePoste = Schemas['TypePosteEnum'];
export type Personne = Schemas['Personne'];
export type Occupation = Schemas['Occupation'];
export type Rattachement = Schemas['Rattachement'];
export type PerimetreReseau = Schemas['PerimetreReseau'];
export type SyntheseOrganisation = Schemas['Synthese'];
export type MonOrganisation = Schemas['MonOrganisation'];
export type MonPoste = Schemas['MonPoste'];
export type Affectation = Schemas['Affectation'];
export type Transfert = Schemas['Transfert'];
export type Appareil = Schemas['Appareil'];
export type DescriptionAppareil = Schemas['DescriptionAppareil'];
export type Parametre = Schemas['Parametre'];
export type StatutPays = Schemas['StatutEnum'];
export type EtatExploitation = Schemas['EtatExploitation'];
export type EtapeDoubleAuth = Schemas['EtapeDoubleAuth'];
export type EtatDoubleAuth = Schemas['EtatDoubleAuth'];
export type InitialisationDoubleAuth = Schemas['InitialisationDoubleAuth'];
export type SessionOuverte = Schemas['Session'];
export type ActiviteCompte = Schemas['ActiviteCompte'];
export type ValeurReferentiel = Schemas['Valeur'];
export type ListeReferentiel = Schemas['ListeEnum'];
export type Produit = Schemas['Produit'];
export type ProduitResume = Schemas['ProduitResume'];
export type Portefeuille = Schemas['Portefeuille'];
export type Prospect = Schemas['Prospect'];
export type ListeProspects = Schemas['ListeProspects'];
export type SyntheseProspects = Schemas['SyntheseProspects'];
export type Potentiel = Schemas['PotentielEnum'];
export type Civilite = Schemas['CiviliteEnum'];
export type StatutFiche = Schemas['StatutFicheEnum'];
export type Etablissement = Schemas['Etablissement'];
export type ListeEtablissements = Schemas['ListeEtablissements'];
export type SyntheseEtablissements = Schemas['SyntheseEtablissements'];
export type ActiviteExercice = Schemas['ActiviteEnum'];
export type Lieu = Schemas['Lieu'];
export type Localite = Schemas['Localite'];
export type SecteurSaisie = Schemas['SecteurSaisie'];
export type LotImport = Schemas['LotImport'];
export type DetailLot = Schemas['DetailLot'];
export type AnomalieImport = Schemas['Anomalie'];
export type Exercice = Schemas['Exercice'];
export type Cible = Schemas['Cible'];
export type PosteCible = Schemas['PosteCible'];
export type ListeCible = Schemas['ListeCible'];
export type ProspectCible = Schemas['ProspectCible'];
export type ResultatAjoutCibles = Schemas['ResultatAjout'];
// Doublons, fusions, historique, propositions (PRP-007 à PRP-014).
export type ProspectCree = Schemas['ProspectCree'];
export type Ressemblante = Schemas['Ressemblante'];
export type ComparaisonFiche = Schemas['Comparaison'];
export type DoublonProbable = Schemas['Doublon'];
export type Qualite = Schemas['Qualite'];
export type JourFerie = Schemas['JourFerie'];
export type Planning = Schemas['Planning'];
/** Ligne de la file du superviseur (PLN-011). */
export type PlanningEnAttente = Schemas['PlanningEnAttente'];
/** Délégué dont la semaine en cours est fermée le lundi 0 h (décision du 6 octobre 2026). */
export type SemaineFermee = Schemas['SemaineFermee'];
export type ConsultationPlanning = Schemas['Consultation'];
export type DecisionPlanning = Schemas['Decision'];
export type Revision = Schemas['Revision'];
// Historique et comparaison des versions (PLN-014, 0.3.6).
export type VersionPlanning = Schemas['Version'];
export type DetailVersion = Schemas['DetailVersion'];
export type VisiteFigee = Schemas['VisiteFigee'];
export type ComparaisonVersions = Schemas['ComparaisonVersions'];
export type Remarque = Schemas['Remarque'];
// Remplaçant daté d'un superviseur (ORG-013, 0.3.4).
export type Remplacement = Schemas['Remplacement'];
export type CreationRemplacement = Schemas['CreationRemplacement'];
export type CandidatsRemplacement = Schemas['CandidatsRemplacement'];
// Centre de notifications (prd.md §18, 0.3.3).
export type Notification = Schemas['Notification'];
export type ResumeNotifications = Schemas['ResumeNotifications'];
export type Semaine = Schemas['Semaine'];
export type JourSemaine = Schemas['JourSemaine'];
// Visites planifiées (PLN-002).
export type Visite = Schemas['Visite'];
export type StatutVisite = Schemas['VisiteStatutEnum'];
/** Programme de la semaine du délégué, tel qu'approuvé (VIS-001, cycle 0.4). */
export type Programme = Schemas['Programme'];
export type VisiteProgramme = Schemas['VisiteProgramme'];
export type JourProgramme = Schemas['JourProgramme'];
/** Détail d'une visite : coordonnées et historique récent (VIS-002). */
export type DetailVisite = Schemas['DetailVisite'];
export type SaisieVisite = Schemas['SaisieVisite'];
export type ModificationVisite = Schemas['PatchedModificationVisite'];
/** Démarrage d'une visite : heure réelle et position du téléphone (VIS-003). */
export type Demarrage = Schemas['Demarrage'];
/** Fin d'une visite : heure réelle et position du téléphone (VIS-004). */
export type Terminaison = Schemas['Terminaison'];
/** Écart déclaré : moment, motif de la liste du pays, commentaire (VIS-005). */
export type Ecart = Schemas['Ecart'];
export type Report = Schemas['Report'];
export type Imprevue = Schemas['Imprevue'];
/** Rapport de la visite effectuée : socle commun et champs du pays (RPT-001, RPT-008). */
export type Rapport = Schemas['Rapport'];
export type StatutRapport = Schemas['StatutRapportEnum'];
/** Statut du rapport vu depuis la visite : « attendu » tant qu'il n'est pas ouvert. */
export type StatutRapportVisite = Schemas['RapportStatutEnum'];
export type SaisieRapport = Schemas['SaisieRapport'];
/** Produit présenté, à son rang, avec le retour du prescripteur (RPT-004). */
export type Presentation = Schemas['Presentation'];
export type RetourPrescripteur = Schemas['RetourPrescripteurEnum'];
/** Échantillon ou cadeau remis, avec sa quantité (RPT-005). */
export type Remise = Schemas['Remise'];
export type TypeRemise = Schemas['TypeRemiseEnum'];
/** Prochaine action notée à la dernière visite chez ce prospect, rappelée (RPT-006 CA1). */
export type ActionPrecedente = Schemas['ActionPrecedente'];
/** Photo ou document joint au rapport (RPT-007). */
export type PieceJointe = Schemas['PieceJointe'];
export type DefinitionChamp = Schemas['DefinitionChamp'];
export type TypeChamp = Schemas['TypeChampEnum'];
/** Valeurs saisies des champs du pays, par code de champ. */
export type ValeursChamps = Record<string, string | number | boolean | null>;
/** Champ supplémentaire du rapport, propre au pays (RPT-008). */
export type ChampRapport = Schemas['ChampRapport'];
export type SaisieChamp = Schemas['SaisieChamp'];
export type ModificationChamp = Schemas['PatchedModificationChamp'];
// Passages et absences (PLN-003, PLN-009).
export type Passage = Schemas['Passage'];
export type Activite = Schemas['Activite'];
export type TypeActivite = Schemas['TypeActiviteEnum'];
export type PeriodeActivite = Schemas['PeriodeActiviteEnum'];
export type SaisieActivite = Schemas['SaisieActivite'];
export type ModificationActivite = Schemas['PatchedModificationActivite'];
// Contrôles du planning (PLN-004).
export type ControlePlanning = Schemas['ControlePlanning'];
export type CodeControle = Schemas['CodeControleEnum'];
export type Controles = Schemas['Controles'];
export type ObjectifJour = Schemas['Objectif'];
// Copier, reprendre, poser depuis la liste cible (PLN-005).
export type Reprise = Schemas['Reprise'];
// Kilométrage estimé (PLN-010).
export type Kilometrage = Schemas['Kilometrage'];
export type JourKm = Schemas['JourKm'];
export type DecisionDoublon = Schemas['DecisionDoublon']['decision'];
export type Fusion = Schemas['Fusion'];
export type ChangementFiche = Schemas['ChangementFiche'];
export type Proposition = Schemas['Proposition'];
export type SaisieProposition = Schemas['SaisieProposition'];
