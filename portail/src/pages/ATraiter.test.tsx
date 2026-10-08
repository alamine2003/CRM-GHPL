import type { ATraiter as DonneesATraiter, ClientApi } from '@innov/api-client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ContexteSession, type Session } from '../contexteSession';
import i18n from '../i18n';
import ATraiter from './ATraiter';

// RPT-012 : la file de travail du superviseur, ses journées à traiter par délégué.

const JOURNEE = {
  planning: '11111111-1111-1111-1111-111111111111',
  visites: 3,
  effectuees: 3,
  rapports_a_valider: 2,
  rapports_attendus: 1,
  rapports_en_retard: 0,
  horodatages_douteux: 0,
  rapports_a_corriger: 0,
  rapports_rouverts: 0,
  escalade: false,
  eligible_lot: false,
};

const FILE: DonneesATraiter = {
  plannings_a_valider: 1,
  delegues: [
    {
      delegue: { id: 'd1', prenom: 'Aminata', nom: 'TOURE' },
      journees: [
        { ...JOURNEE, date: '2026-10-05', classement: 'conforme', ecarts: [] },
        {
          ...JOURNEE,
          date: '2026-10-06',
          classement: 'a_verifier',
          rapports_en_retard: 1,
          ecarts: [
            {
              code: 'distance',
              visite: 'v1',
              prospect: 'Awa NDIAYE',
              heure: '10:30',
              distance_m: 350,
              seuil_m: 100,
            },
          ],
        },
      ],
    },
  ],
};

function rendre(file: DonneesATraiter) {
  const validerLot = vi.fn(async () => ({ journees: 1, rapports: 2 }));
  const session = {
    etat: { statut: 'chargement' },
    client: {
      rapports: { aTraiter: vi.fn(async () => file), validerLot },
    } as unknown as ClientApi,
  } as unknown as Session;
  render(
    <MemoryRouter>
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <ContexteSession.Provider value={session}>
          <ATraiter />
        </ContexteSession.Provider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
  return { validerLot };
}

beforeEach(async () => {
  await i18n.changeLanguage('fr');
});

describe('RPT-012 : file « À traiter » du superviseur', () => {
  it('RPT-012 CA1 : chaque journée dit « conforme » ou « à vérifier », avec ses écarts', async () => {
    rendre(FILE);
    const carte = (await screen.findByRole('heading', { name: 'Aminata TOURE' })).closest(
      'section',
    ) as HTMLElement;
    expect(within(carte).getByText('2 journées · dont 1 à vérifier')).toBeInTheDocument();
    const lignes = within(carte).getAllByRole('listitem');
    expect(within(lignes[0]!).getByText('Conforme')).toBeInTheDocument();
    expect(
      within(lignes[0]!).getByText('3 visites · 2 rapports à valider · 1 rapport attendu'),
    ).toBeInTheDocument();
    expect(within(lignes[1]!).getByText('À vérifier · 1 écart')).toBeInTheDocument();
    expect(
      within(lignes[1]!).getByText('10:30 · Awa NDIAYE : pointée à 350 m du lieu (seuil 100 m)'),
    ).toBeInTheDocument();
    expect(within(lignes[1]!).getByText(/1 en retard/)).toBeInTheDocument();
    expect(within(lignes[1]!).getByRole('link', { name: 'Ouvrir la journée' })).toHaveAttribute(
      'href',
      '/a-traiter/d1/2026-10-06',
    );
  });

  it('RPT-012 : les chiffres du jour, dont les plannings à valider', async () => {
    rendre(FILE);
    expect(await screen.findByText('Journées à vérifier')).toBeInTheDocument();
    expect(screen.getByText('1 planning attend votre décision.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Voir les plannings' })).toHaveAttribute(
      'href',
      '/validation',
    );
  });

  it('RPT-012 : rien à traiter, la page le dit', async () => {
    rendre({ plannings_a_valider: 0, delegues: [] });
    expect(await screen.findByText('Rien à traiter')).toBeInTheDocument();
    expect(screen.queryByText('Voir les plannings')).toBeNull();
  });

  it('RPT-013 CA1, 23.A : « Valider les n conformes » n’envoie que les journées éligibles', async () => {
    const [premier] = FILE.delegues;
    const file = {
      ...FILE,
      delegues: [
        {
          ...premier!,
          journees: premier!.journees.map((j, i) => ({ ...j, eligible_lot: i === 0 })),
        },
      ],
    };
    const { validerLot } = rendre(file);
    fireEvent.click(await screen.findByRole('button', { name: 'Valider la journée conforme' }));
    const dialogue = await screen.findByRole('dialog');
    fireEvent.click(within(dialogue).getByRole('button', { name: 'Valider la journée conforme' }));
    await waitFor(() =>
      expect(validerLot).toHaveBeenCalledWith([{ delegue: 'd1', date: '2026-10-05' }]),
    );
  });

  it('RPT-016 : un rapport rouvert se compte à part des rapports attendus', async () => {
    const [premier] = FILE.delegues;
    const file = {
      ...FILE,
      delegues: [
        {
          ...premier!,
          journees: [{ ...premier!.journees[0]!, rapports_attendus: 1, rapports_rouverts: 1 }],
        },
      ],
    };
    rendre(file);
    expect(
      await screen.findByText('3 visites · 2 rapports à valider · 1 rapport rouvert'),
    ).toBeInTheDocument();
  });

  it('23.A : sans journée éligible, pas de bouton de lot', async () => {
    rendre(FILE);
    await screen.findByText('Journées à vérifier');
    expect(screen.queryByRole('button', { name: /Valider les/ })).toBeNull();
  });
});
