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
