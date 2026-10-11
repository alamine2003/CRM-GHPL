import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router';

/**
 * Filtres d'une liste gardés dans l'adresse de la page (PRP-005) : un lien partagé ou un
 * retour arrière rouvre la même recherche. Changer un filtre ramène à la première page.
 */
export function useFiltresUrl<C extends string>(cles: readonly C[]) {
  const [params, setParams] = useSearchParams();
  const valeurs = useMemo(
    () => Object.fromEntries(cles.map((c) => [c, params.get(c) ?? ''])) as Record<C, string>,
    [params, cles],
  );
  const changer = useCallback(
    (modifs: Partial<Record<C | 'page', string>>) => {
      setParams(
        (avant) => {
          const suivant = new URLSearchParams(avant);
          for (const [cle, valeur] of Object.entries(modifs) as [string, string | undefined][]) {
            if (valeur) suivant.set(cle, valeur);
            else suivant.delete(cle);
          }
          if (!('page' in modifs)) suivant.delete('page');
          return suivant;
        },
        { replace: true },
      );
    },
    [setParams],
  );
  const effacer = useCallback(
    (garder: readonly string[] = []) =>
      setParams(
        (avant) => {
          const suivant = new URLSearchParams();
          for (const cle of garder) {
            const valeur = avant.get(cle);
            if (valeur) suivant.set(cle, valeur);
          }
          return suivant;
        },
        { replace: true },
      ),
    [setParams],
  );
  const page = Math.max(1, Number(params.get('page')) || 1);
  return { valeurs, changer, effacer, page };
}
