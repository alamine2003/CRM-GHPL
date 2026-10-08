/**
 * Synchronisation descendante (OFF-001, 0.8.1) : en une passe, le téléphone garde dans sa base
 * locale chiffrée (SEC-005) tout ce qu'il faut pour travailler une semaine sans réseau, sous les
 * clés que chaque écran relit déjà quand le réseau manque :
 *
 * - le programme de la semaine, et le détail de chaque visite de la semaine et de la suivante ;
 * - la semaine en cours et la suivante (planning, jours, activités) ;
 * - la liste cible (fiches, établissements, exercices) ;
 * - les trois derniers rapports de chaque prospect de la liste (« Préparer ma visite ») ;
 * - les visites proposées dans ses rapports, et « Mes chiffres » de la semaine.
 *
 * Une partie qui échoue n'efface rien de ce qui était gardé ; elle est comptée et la passe
 * continue. Les envois (rapports, visites créées sans réseau) restent dans la file d'attente.
 */
import type { ClientApi } from '@innov/api-client';
import { ecrire, lire } from './baseLocale';
import { garderDetail } from './DetailVisite';
import { CLE_PROGRAMME } from './Execution';
import { CLE_CHIFFRES } from './MesChiffres';
import { garderSemaine } from './semaineLocale';

export const CLE_SYNCHRO = 'synchro.derniere';
/** Au-delà, la synchronisation repart d'elle-même au retour dans l'application. */
export const FRAICHEUR_MS = 30 * 60 * 1000;

export interface EtatSynchro {
  /** Fin de la dernière synchronisation réussie, au moins en partie. */
  le: string;
  visites: number;
  prospects: number;
  historiques: number;
  /** Parties qui n'ont pas pu être lues (gardées telles qu'avant). */
  echecs: number;
}

/** Au plus `n` lectures à la fois : un réseau faible ne s'engorge pas. */
async function parLots<T>(elements: T[], n: number, faire: (x: T) => Promise<unknown>) {
  let echecs = 0;
  for (let i = 0; i < elements.length; i += n) {
    const lot = await Promise.allSettled(elements.slice(i, i + n).map(faire));
    echecs += lot.filter((x) => x.status === 'rejected').length;
  }
  return echecs;
}

let enCours: Promise<EtatSynchro> | null = null;

/** Lance une synchronisation, ou rejoint celle qui tourne déjà. */
export function synchroniser(client: ClientApi): Promise<EtatSynchro> {
  enCours ??= passe(client).finally(() => {
    enCours = null;
  });
  return enCours;
}

async function passe(client: ClientApi): Promise<EtatSynchro> {
  let echecs = 0;
  const essayer = async <T>(lire: () => Promise<T>): Promise<T | null> => {
    try {
      return await lire();
    } catch {
      echecs += 1;
      return null;
    }
  };

  const programme = await essayer(() => client.plannings.programme());
  if (programme) await ecrire(CLE_PROGRAMME, programme);
  const courante = await essayer(() => client.plannings.semaine());
  if (courante) garderSemaine(courante);
  const suivante = courante
    ? await essayer(() => client.plannings.semaine(courante.suivante))
    : null;
  if (suivante) garderSemaine(suivante, courante?.suivante);

  const visites = new Set<string>();
  for (const j of programme?.jours ?? []) for (const v of j.visites) visites.add(v.id);
  for (const s of [courante, suivante]) for (const v of s?.visites ?? []) visites.add(v.id);
  echecs += await parLots([...visites], 4, (id) => garderDetail(client, id));

  const listes = await essayer(() => client.ciblage.mesListes());
  if (listes) await ecrire('ciblage.moi', listes);
  const prospects = new Set(listes?.flatMap((l) => l.cibles.map((c) => c.prospect.id)) ?? []);

  const historique = await essayer(() => client.rapports.historique());
  for (const h of historique?.prospects ?? [])
    await ecrire(`chronologie.${h.prospect}`, h.rapports);

  const proposees = await essayer(() => client.rapports.visitesProposees());
  if (proposees) await ecrire('visites.proposees', proposees);
  const chiffres = await essayer(() => client.pilotage.mesChiffres());
  if (chiffres) await ecrire(CLE_CHIFFRES, chiffres);

  const precedent = (await lire<EtatSynchro>(CLE_SYNCHRO).catch(() => null))?.valeur;
  const reussi = programme || courante || listes || historique;
  const etat: EtatSynchro = reussi
    ? {
        le: new Date().toISOString(),
        visites: visites.size,
        prospects: prospects.size,
        historiques: historique?.prospects.length ?? 0,
        echecs,
      }
    : { ...(precedent ?? { le: '', visites: 0, prospects: 0, historiques: 0 }), echecs };
  if (reussi) await ecrire(CLE_SYNCHRO, etat);
  if (!reussi) throw new Error('synchronisation impossible');
  return etat;
}

/** La dernière synchronisation réussie, ou `null` si le téléphone n'en a jamais fait. */
export async function derniereSynchro(): Promise<EtatSynchro | null> {
  const m = await lire<EtatSynchro>(CLE_SYNCHRO).catch(() => null);
  return m?.valeur.le ? m.valeur : null;
}

/** Faut-il resynchroniser (jamais fait, ou plus vieux que `FRAICHEUR_MS`) ? */
export function aRafraichir(etat: EtatSynchro | null, maintenant = Date.now()) {
  return !etat || maintenant - new Date(etat.le).getTime() > FRAICHEUR_MS;
}
