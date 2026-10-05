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
export type Activite = Schemas['Activite'];
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
export type Semaine = Schemas['Semaine'];
export type JourSemaine = Schemas['JourSemaine'];
// Visites planifiées (PLN-002).
export type Visite = Schemas['Visite'];
export type StatutVisite = Schemas['VisiteStatutEnum'];
export type SaisieVisite = Schemas['SaisieVisite'];
export type ModificationVisite = Schemas['PatchedModificationVisite'];
// Passages et absences (PLN-003, PLN-009).
export type Passage = Schemas['Passage'];
export type Absence = Schemas['Absence'];
export type TypeAbsence = Schemas['TypeAbsenceEnum'];
export type PeriodeAbsence = Schemas['PeriodeAbsenceEnum'];
export type SaisieAbsence = Schemas['SaisieAbsence'];
export type ModificationAbsence = Schemas['PatchedModificationAbsence'];
// Contrôles du planning (PLN-004).
export type ControlePlanning = Schemas['ControlePlanning'];
export type CodeControle = Schemas['CodeControleEnum'];
export type Controles = Schemas['Controles'];
export type ObjectifJour = Schemas['Objectif'];
export type DecisionDoublon = Schemas['DecisionDoublon']['decision'];
export type Fusion = Schemas['Fusion'];
export type ChangementFiche = Schemas['ChangementFiche'];
export type Proposition = Schemas['Proposition'];
export type SaisieProposition = Schemas['SaisieProposition'];
