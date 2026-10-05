import { describe, expect, it } from 'vitest';
import { peutPasser, STATUTS_PLANNING, transitionsPlanning } from './etats';

describe('machine à états du planning (prd.md §17.1, ADR-011)', () => {
  it('connaît les sept statuts', () => {
    expect(STATUTS_PLANNING).toEqual([
      'brouillon',
      'soumis',
      'a_reviser',
      'approuve',
      'en_cours',
      'termine',
      'annule',
    ]);
  });

  it('autorise seulement les transitions du PRD', () => {
    expect(peutPasser('brouillon', 'soumis')).toBe(true);
    expect(peutPasser('brouillon', 'approuve')).toBe(false);
    expect(peutPasser('soumis', 'a_reviser')).toBe(true);
    expect(peutPasser('approuve', 'annule')).toBe(true);
    expect(transitionsPlanning('termine')).toEqual([]);
    expect(transitionsPlanning('annule')).toEqual([]);
  });
});
