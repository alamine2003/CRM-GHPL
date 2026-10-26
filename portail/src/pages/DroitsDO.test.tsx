import type { ClientApi, CompteDO } from '@innov/api-client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ContexteNotifications } from '../contexteNotifications';
import { ContexteSession, type Session } from '../contexteSession';
import i18n from '../i18n';
import DroitsDO from './DroitsDO';

// Réglage des droits du DO par le siège (1.6.1, prd.md §14.85).

const OUVERT = { ventes: true, pilotage: true, rapports: true, prospects: true };
const COMPTES: CompteDO[] = [
  {
    id: 'c1',
    identifiant: 'omar.sn',
    prenom: 'Omar',
    nom: 'Sn',
    pays: { code: 'SN', nom: 'Sénégal', fuseau: 'Africa/Dakar' },
    droits: OUVERT,
  },
  {
    id: 'c2',
    identifiant: 'omar.tg',
    prenom: 'Omar',
    nom: 'Tg',
    pays: { code: 'TG', nom: 'Togo', fuseau: 'Africa/Lome' },
    droits: { ...OUVERT, ventes: false },
  },
];

function rendre(comptes: CompteDO[] = COMPTES) {
  const regler = vi.fn(async (id: string, droits: object) => {
    const compte = comptes.find((c) => c.id === id)!;
    return { ...compte, droits: { ...compte.droits, ...droits } };
  });
  const session = {
    etat: { statut: 'chargement' },
    client: {
      droitsDo: { liste: vi.fn(async () => comptes), regler },
    } as unknown as ClientApi,
  } as unknown as Session;
  render(
    <MemoryRouter>
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <ContexteNotifications.Provider value={vi.fn()}>
          <ContexteSession.Provider value={session}>
            <DroitsDO
              perimetre={{
                pays_actif: null,
                vue_consolidee: true,
                roles: ['admin_siege'],
                actions: ['droits_do.regler'],
                pays_accessibles: [],
              }}
            />
          </ContexteSession.Provider>
        </ContexteNotifications.Provider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
  return { regler };
}

describe('DroitsDO', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr');
  });

  it('montre chaque compte DF avec ses quatre groupes de droits', async () => {
    rendre();
    expect(await screen.findByText('Omar Sn')).toBeTruthy();
    expect(screen.getByText(/omar\.tg · Togo/)).toBeTruthy();
    const ventesTg = screen.getByRole('switch', { name: 'Omar Tg : Ventes' });
    expect((ventesTg as HTMLInputElement).checked).toBe(false);
    const ventesSn = screen.getByRole('switch', { name: 'Omar Sn : Ventes' });
    expect((ventesSn as HTMLInputElement).checked).toBe(true);
    expect(screen.getAllByRole('switch')).toHaveLength(8);
  });

  it('un clic ferme ou rouvre un seul groupe', async () => {
    const { regler } = rendre();
    fireEvent.click(await screen.findByRole('switch', { name: 'Omar Sn : Pilotage et objectifs' }));
    await waitFor(() => expect(regler).toHaveBeenCalledWith('c1', { pilotage: false }));
    fireEvent.click(screen.getByRole('switch', { name: 'Omar Tg : Ventes' }));
    await waitFor(() => expect(regler).toHaveBeenCalledWith('c2', { ventes: true }));
  });

  it('dit que seul le siège règle, et que tout est ouvert par défaut', async () => {
    rendre();
    expect(await screen.findByText(/Seul le siège ouvre ou ferme ses droits/)).toBeTruthy();
  });

  it('sans compte DF, explique où ils apparaissent', async () => {
    rendre([]);
    expect(await screen.findByText('Aucun compte DF')).toBeTruthy();
    expect(within(document.body).queryAllByRole('switch')).toHaveLength(0);
  });
});
