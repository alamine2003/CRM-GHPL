/**
 * Types de l'API, générés depuis backend/schema.yaml (ADR-012).
 * Ne jamais écrire ces types à la main : `npm run api:types` régénère schema.d.ts.
 */
import type { components, paths } from './schema';

export type { components, paths };
export type Informations = components['schemas']['Informations'];
export type Langue = components['schemas']['Langue'];
