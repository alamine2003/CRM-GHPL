import config from '../app.config';
import eas from '../eas.json';

/** 1.0.0 (prd.md §21.2 condition 7, O-06) : les deux distributions sont prêtes. */
describe('publication des applications', () => {
  it('le profil des magasins et celui du pilote visent la production', () => {
    for (const profil of [eas.build.production, eas.build.pilote]) {
      expect(profil.environment).toBe('production');
      expect(profil.channel).toBe('production');
    }
    expect(eas.build.production.distribution).toBe('store');
    // Pilote : installation directe sur les téléphones enregistrés, sans relecture des magasins.
    expect(eas.build.pilote.distribution).toBe('internal');
  });

  it('les mises à jour à distance ne visent que la même version de l’application', () => {
    expect(config.runtimeVersion).toEqual({ policy: 'appVersion' });
    expect(config.plugins).toContain('expo-updates');
  });

  it('l’application connaît l’adresse de la politique de confidentialité', () => {
    expect(config.extra?.portailUrl).toEqual(expect.stringMatching(/^https?:\/\//));
  });
});
