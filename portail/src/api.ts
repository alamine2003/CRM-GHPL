import type { Informations } from '@innov/api-types';

const BASE = (import.meta.env.VITE_API_URL ?? 'http://localhost:8000').replace(/\/$/, '');

/** Lit les informations publiques du service, dans la langue demandée. */
export async function lireInformations(langue: string): Promise<Informations> {
  const reponse = await fetch(`${BASE}/api/v1/informations/`, {
    headers: { 'Accept-Language': langue, Accept: 'application/json' },
  });
  if (!reponse.ok) throw new Error(`Service indisponible (${reponse.status})`);
  return (await reponse.json()) as Informations;
}
