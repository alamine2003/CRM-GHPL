import type { ClientApi, Perimetre } from '@innov/api-client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ContexteSession, type Session } from '../contexteSession';
import i18n from '../i18n';
import Prospects from './Prospects';

// DC-58 : le mobile personnel d'un prescripteur ne se montre qu'avec son accord, saisi au portail.

const PERIMETRE = {
  pays_actif: { code: 'SN', nom: 'Sénégal' },
  actions: ['prospects.creer', 'prospects.gerer'],
  roles: ['admin_pays'],
} as unknown as Perimetre;

function rendre() {
  const creer = vi.fn(async () => ({ id: 'p1', doublon: 'aucun' }));
  const session = {
    etat: { statut: 'chargement' },
    client: {
      referentiel: {
        valeurs: vi.fn(async () => [
          { id: 't1', liste: 'type_prospect', libelle: 'Médecin', archive: false, parent: null },
        ]),
      },
      etablissements: { secteurs: vi.fn(async () => []) },
      ciblage: { postes: vi.fn(async () => []) },
      prospects: {
        liste: vi.fn(async () => ({ resultats: [], total: 0, page: 1, taille: 20 })),
        synthese: vi.fn(() => new Promise(() => undefined)),
        ressemblants: vi.fn(async () => []),
        // La fiche ouverte après l'enregistrement n'importe pas ici.
        detail: vi.fn(() => new Promise(() => undefined)),
        creer,
      },
    } as unknown as ClientApi,
  } as unknown as Session;
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <ContexteSession.Provider value={session}>
        <MemoryRouter>
          <Prospects perimetre={PERIMETRE} />
        </MemoryRouter>
      </ContexteSession.Provider>
    </QueryClientProvider>,
  );
  return { creer };
}

beforeEach(async () => {
  await i18n.changeLanguage('fr');
});

describe('DC-58 : accord du prescripteur pour son mobile', () => {
  it.each([
    [true, 'cochée'],
    [false, 'laissée vide'],
  ])(
    'DC-58 : la case « accepte d’être contacté sur ce numéro » part à l’enregistrement (%s, %s)',
    async (accepte) => {
      const { creer } = rendre();
      fireEvent.click(await screen.findByRole('button', { name: 'Nouveau prospect' }));
      fireEvent.change(await screen.findByRole('textbox', { name: /^Nom/ }), {
        target: { value: 'FICTIF' },
      });
      fireEvent.change(screen.getByLabelText(/Téléphone mobile/), {
        target: { value: '+221 77 000 00 09' },
      });
      const accord = screen.getByLabelText("Le prescripteur accepte d'être contacté sur ce numéro");
      expect(accord).not.toBeChecked();
      if (accepte) fireEvent.click(accord);
      fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
      await waitFor(() =>
        expect(creer).toHaveBeenCalledWith(
          expect.objectContaining({
            nom: 'FICTIF',
            telephone_mobile: '+221 77 000 00 09',
            contact_mobile_accepte: accepte,
          }),
        ),
      );
    },
  );
});
