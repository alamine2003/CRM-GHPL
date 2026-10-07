import type { Semaine } from '@innov/api-client';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import i18n from '../i18n';
import { CarteConformite } from './Conformite';

const journee = (imprecises?: number) =>
  ({
    conformite: [
      {
        date: '2026-10-13',
        classement: 'a_verifier',
        fige: false,
        terminee: true,
        ecarts: [
          {
            code: 'sans_gps',
            visite: null,
            prospect: null,
            heure: null,
            nombre: 3,
            tolerees: 1,
            ...(imprecises === undefined ? {} : { imprecises }),
          },
        ],
      },
    ],
  }) as unknown as Semaine;

beforeEach(async () => {
  await i18n.changeLanguage('fr');
});

describe('DC-55 : positions trop imprécises dans la conformité', () => {
  it('DC-55 : les visites sans GPS disent « dont n à la position trop imprécise »', () => {
    render(<CarteConformite semaine={journee(2)} jourLong={(iso) => iso} />);
    expect(
      screen.getByText('3 visites sans GPS (tolérance : 1) dont 2 à la position trop imprécise'),
    ).toBeInTheDocument();
  });

  it('DC-55 : sans position imprécise, la mention ne s’affiche pas', () => {
    render(<CarteConformite semaine={journee(0)} jourLong={(iso) => iso} />);
    expect(screen.getByText('3 visites sans GPS (tolérance : 1)')).toBeInTheDocument();
    expect(screen.queryByText(/trop imprécise/)).toBeNull();
  });
});
