import type { ListeCible } from '@innov/api-client';
import { useEffect, useState } from 'react';
import { ecrire, lire } from './baseLocale';
import { useSession } from './session';

const CLE = 'ciblage.moi';

export type CibleDeListe = ListeCible['cibles'][number];

export function normaliser(texte: string) {
  return texte.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/**
 * Liste cible du délégué (PRP-011) : lue sur le serveur et gardée dans la base locale
 * chiffrée, pour rester disponible sans réseau (CA2).
 */
export function useMaListe() {
  const { client } = useSession();
  const [listes, setListes] = useState<ListeCible[] | null>(null);
  const [horsLigneDepuis, setHorsLigneDepuis] = useState<string | null>(null);
  const [indisponible, setIndisponible] = useState(false);

  useEffect(() => {
    let actif = true;
    // Promesse d'abord : une erreur, même immédiate, passe par la liste enregistrée.
    void Promise.resolve()
      .then(() => client.ciblage.mesListes())
      .then(async (fraiches) => {
        if (!actif) return;
        setListes(fraiches);
        setHorsLigneDepuis(null);
        await ecrire(CLE, fraiches).catch(() => undefined);
      })
      .catch(async () => {
        const memoire = await lire<ListeCible[]>(CLE).catch(() => null);
        if (!actif) return;
        if (memoire) {
          setListes(memoire.valeur);
          setHorsLigneDepuis(memoire.maj);
        } else {
          setIndisponible(true);
        }
      });
    return () => {
      actif = false;
    };
  }, [client]);

  return { listes, horsLigneDepuis, indisponible };
}

/**
 * Les cibles de tous les postes occupés, une ligne par prospect : la plus forte fréquence,
 * les visites du cycle et le réseau du poste qui la porte.
 */
export function ciblesDe(listes: ListeCible[]) {
  const parProspect = new Map<string, CibleDeListe & { reseau: string | null }>();
  for (const { poste, cibles } of listes) {
    for (const c of cibles) {
      const avant = parProspect.get(c.prospect.id);
      if (!avant || c.frequence > avant.frequence) {
        parProspect.set(c.prospect.id, { ...c, reseau: poste.reseaux?.join(', ') || null });
      }
    }
  }
  return [...parProspect.values()];
}

/**
 * Recherche instantanée, même hors ligne, sur le nom, la spécialité, le lieu, le secteur et le
 * téléphone. Le prénom figure avant et après le nom : « ndiaye aissatou » trouve « Aïssatou
 * NDIAYE ».
 */
export function correspond({ prospect: f }: CibleDeListe, saisie: string) {
  const filtre = normaliser(saisie.trim());
  if (!filtre) return true;
  const chiffres = filtre.replace(/\D/g, '');
  return (
    normaliser(
      [
        f.prenom,
        f.nom,
        f.prenom,
        f.specialite_libelle,
        f.type_libelle,
        f.lieu_principal?.libelle,
        f.secteur,
      ].join(' '),
    ).includes(filtre) ||
    (chiffres.length >= 3 &&
      [f.telephone_mobile, f.telephone_pro].some((n) =>
        (n ?? '').replace(/\D/g, '').includes(chiffres),
      ))
  );
}

/** La cible de ma liste enregistrée sur le téléphone, pour la fiche et le mode hors ligne. */
export async function cibleEnregistree(id: string) {
  const memoire = await lire<ListeCible[]>(CLE).catch(() => null);
  return ciblesDe(memoire?.valeur ?? []).find((c) => c.prospect.id === id) ?? null;
}
