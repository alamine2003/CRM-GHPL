import { describe, expect, it } from 'vitest';
import { avancement } from './version';

describe('avancement de la feuille de route', () => {
  it('situe une version dans son cycle', () => {
    expect(avancement('0.0.3')).toMatchObject({
      cycle: 0,
      codeCycle: 'fondations',
      etape: 3,
      livrees: 3,
      total: 90,
      stable: false,
    });
    expect(avancement('0.4.9')).toMatchObject({ codeCycle: 'visites', etape: 9, livrees: 45 });
    expect(avancement('0.9.9')).toMatchObject({ codeCycle: 'production', livrees: 90 });
  });

  it('reconnaît la version stable', () => {
    expect(avancement('1.0.0')).toMatchObject({ stable: true, cycle: null, livrees: 90 });
  });

  it('refuse les versions hors convention', () => {
    expect(() => avancement('0.1.0')).toThrow();
    expect(() => avancement('0.10.1')).toThrow();
    expect(() => avancement('v0.0.3')).toThrow();
  });
});
