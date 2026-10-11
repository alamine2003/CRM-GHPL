import type { ClientApi, Objectifs as DonneesObjectifs } from '@innov/api-client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ContexteSession, type Session } from '../contexteSession';
import i18n from '../i18n';
import Objectifs from './Objectifs';

// DSH-009 (0.7.6) : objectifs par réseau ; CA2 : l'avance ou le retard à ce jour.

const DONNEES: DonneesObjectifs = {
  aujourdhui: '2026-10-15',
  objectifs: [
    {
      id: 'o1',
      reseau: { id: 'r1', libelle: 'Cardio' },
      indicateur: 'visites',
      produit: null,
      debut: '2026-10-12',
      fin: '2026-10-25',
      cible: 10,
      gerable: true,
      suivi: { realise: 1, attendu: 3, etat: 'en_retard', taux: 0.1, delegues: 1 },
    },
    {
      id: 'o2',
      reseau: { id: 'r1', libelle: 'Cardio' },
      indicateur: 'presentations',
      produit: { id: 'p1', libelle: 'Cardiol' },
      debut: '2026-10-01',
      fin: '2026-10-31',
      cible: 20,
      gerable: false,
      suivi: { realise: 20, attendu: 10, etat: 'atteint', taux: 1, delegues: 4 },
    },
  ],
  reseaux_geres: [{ id: 'r1', libelle: 'Cardio' }],
  portefeuilles: [{ reseau: 'r1', produits: [{ id: 'p1', libelle: 'Cardiol' }] }],
};

function rendre(donnees: DonneesObjectifs = DONNEES) {
  const creerObjectif = vi.fn(async () => DONNEES.objectifs[0]);
  const archiverObjectif = vi.fn(async () => undefined);
  const session = {
    etat: { statut: 'chargement' },
    client: {
      pilotage: { objectifs: vi.fn(async () => donnees), creerObjectif, archiverObjectif },
    } as unknown as ClientApi,
  } as unknown as Session;
  render(
    <MemoryRouter>
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <ContexteSession.Provider value={session}>
          <Objectifs />
        </ContexteSession.Provider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
  return { creerObjectif, archiverObjectif };
}

describe('Objectifs', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr');
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("DSH-009 : chaque objectif, son avancement et l'attendu à ce jour", async () => {
    rendre();
    const tableau = await screen.findByRole('table');
    const [, retard, atteint] = within(tableau).getAllByRole('row') as HTMLElement[];
    expect(within(retard!).getByText('10 visites faites')).toBeTruthy();
    expect(within(retard!).getByText('1 sur 10 · 3 attendus à ce jour')).toBeTruthy();
    expect(within(retard!).getByText('En retard')).toBeTruthy();
    expect(within(retard!).getByRole('button', { name: 'Modifier' })).toBeTruthy();
    expect(within(atteint!).getByText('20 présentations de Cardiol')).toBeTruthy();
    expect(within(atteint!).getByText('Atteint')).toBeTruthy();
    // Non gérable : pas d'action.
    expect(within(atteint!).queryByRole('button', { name: 'Modifier' })).toBeNull();
  });

  it('DSH-009 CA1 : un nouvel objectif a une période, un réseau, un indicateur et une cible', async () => {
    const { creerObjectif } = rendre();
    fireEvent.click(await screen.findByRole('button', { name: 'Nouvel objectif' }));
    const dialogue = await screen.findByRole('dialog');
    fireEvent.change(within(dialogue).getByLabelText('Au'), { target: { value: '2026-12-31' } });
    fireEvent.change(within(dialogue).getByLabelText('Cible'), { target: { value: '120' } });
    fireEvent.click(within(dialogue).getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() =>
      expect(creerObjectif).toHaveBeenCalledWith({
        reseau: 'r1',
        indicateur: 'visites',
        produit: null,
        debut: '2026-10-15',
        fin: '2026-12-31',
        cible: 120,
      }),
    );
  });

  it('sans objectif, la page dit qui les fixe', async () => {
    rendre({ ...DONNEES, objectifs: [], reseaux_geres: [], portefeuilles: [] });
    expect(await screen.findByText('Aucun objectif en cours')).toBeTruthy();
    expect(screen.getByText(/Le DM du réseau ou l'administrateur pays/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Nouvel objectif' })).toBeNull();
  });

  it("archiver demande confirmation avant d'agir", async () => {
    const { archiverObjectif } = rendre();
    const tableau = await screen.findByRole('table');
    fireEvent.click(within(tableau).getByRole('button', { name: 'Archiver' }));
    const dialogue = await screen.findByRole('dialog');
    expect(within(dialogue).getByText('Archiver cet objectif ?')).toBeTruthy();
    expect(archiverObjectif).not.toHaveBeenCalled();
    fireEvent.click(within(dialogue).getByRole('button', { name: 'Archiver' }));
    await waitFor(() => expect(archiverObjectif).toHaveBeenCalledWith('o1'));
  });

  it("sur téléphone, une carte par objectif garde l'état visible", async () => {
    vi.stubGlobal('matchMedia', (media: string) => ({
      matches: true,
      media,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
    }));
    rendre();
    expect(await screen.findByText('En retard')).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.getByText('Atteint')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Archiver' })).toHaveLength(1);
  });
});
