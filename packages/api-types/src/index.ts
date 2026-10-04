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
