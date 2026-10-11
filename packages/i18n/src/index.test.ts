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

describe('clés utilisées par les écrans (USR-004 CA1)', () => {
  it('chaque clé littérale passée à t() existe dans le catalogue', async () => {
    const { readFileSync, readdirSync, statSync } = await import('node:fs');
    const { join } = await import('node:path');
    const racine = join(__dirname, '..', '..', '..');
    const fichiers: string[] = [];
    const parcourir = (dossier: string) => {
      for (const nom of readdirSync(dossier)) {
        const chemin = join(dossier, nom);
        if (nom === 'node_modules' || nom.startsWith('.')) continue;
        if (statSync(chemin).isDirectory()) parcourir(chemin);
        else if (/\.tsx?$/.test(nom) && !/\.test\.tsx?$/.test(nom)) fichiers.push(chemin);
      }
    };
    for (const d of ['portail/src', 'mobile/app', 'mobile/src']) parcourir(join(racine, d));
    const connues = new Set(cles(ressources.fr.translation));
    // Les clés plurielles (_one, _other) s'appellent sans suffixe.
    for (const c of [...connues]) connues.add(c.replace(/_(one|other)$/, ''));
    const manquantes: string[] = [];
    for (const fichier of fichiers) {
      const source = readFileSync(fichier, 'utf8');
      for (const [, cle] of source.matchAll(/\bt\(\s*'([a-zA-Z][\w.]*)'/g)) {
        if (cle && !connues.has(cle))
          manquantes.push(`${fichier.slice(racine.length + 1)} : ${cle}`);
      }
    }
    expect(manquantes).toEqual([]);
    expect(fichiers.length).toBeGreaterThan(20);
  });
});
