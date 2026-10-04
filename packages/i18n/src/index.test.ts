import { describe, expect, it } from 'vitest';
import { choisirLangue, ressources } from './index';

function cles(objet: object, prefixe = ''): string[] {
  return Object.entries(objet).flatMap(([cle, valeur]) =>
    typeof valeur === 'object' && valeur !== null
      ? cles(valeur, `${prefixe}${cle}.`)
      : [`${prefixe}${cle}`],
  );
}

describe('catalogues', () => {
  it('le français et l’anglais ont exactement les mêmes clés', () => {
    expect(cles(ressources.en.translation).sort()).toEqual(cles(ressources.fr.translation).sort());
  });

  it('aucune traduction n’est vide', () => {
    for (const langue of ['fr', 'en'] as const) {
      const valeurs = cles(ressources[langue].translation).map((cle) =>
        cle
          .split('.')
          .reduce<unknown>(
            (o, k) => (o as Record<string, unknown>)[k],
            ressources[langue].translation,
          ),
      );
      expect(valeurs.every((v) => typeof v === 'string' && v.trim() !== '')).toBe(true);
    }
  });
});

describe('choisirLangue', () => {
  it('reconnaît les variantes régionales', () => {
    expect(choisirLangue(['en-GB'])).toBe('en');
    expect(choisirLangue(['fr_SN'])).toBe('fr');
  });
  it('revient au français par défaut', () => {
    expect(choisirLangue(['wo', 'ar'])).toBe('fr');
    expect(choisirLangue([])).toBe('fr');
  });
});
