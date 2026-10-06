import type { ClientApi, Notification } from '@innov/api-client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ContexteSession, type Session } from '../contexteSession';
import i18n from '../i18n';
import Notifications from './Notifications';

const NOTIFICATIONS: Notification[] = [
  {
    id: 'n1',
    type: 'escalade',
    donnees: {
      planning: 'pl1',
      semaine: '2026-10-12',
      numero_semaine: 42,
      nom: 'Awa FICTIVE',
      heures: 24,
    },
    cree_le: '2026-10-12T17:00:00Z',
    lue_le: null,
  },
  {
    id: 'n2',
    type: 'rappel_planning',
    donnees: {
      semaine: '2026-10-19',
      numero_semaine: 43,
      echeance: '2026-10-15T18:00:00Z',
    },
    cree_le: '2026-10-14T09:00:00Z',
    lue_le: null,
  },
  {
    id: 'n3',
    type: 'plannings_non_approuves',
    donnees: { semaine: '2026-10-12', numero_semaine: 42, nombre: 3 },
    cree_le: '2026-10-12T09:00:00Z',
    lue_le: '2026-10-12T10:00:00Z',
  },
];

function rendre() {
  const lue = vi.fn(async () => NOTIFICATIONS[0]!);
  const session = {
    etat: { statut: 'chargement' },
    client: {
      notifications: {
        centre: vi.fn(async () => ({ non_lues: 2, notifications: NOTIFICATIONS })),
        liste: vi.fn(async () => ({ non_lues: 2, notifications: NOTIFICATIONS })),
        lue,
        toutesLues: vi.fn(),
      },
    } as unknown as ClientApi,
  } as unknown as Session;
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <ContexteSession.Provider value={session}>
        <MemoryRouter initialEntries={['/notifications']}>
          <Routes>
            <Route path="/notifications" element={<Notifications fuseau="Africa/Dakar" />} />
            <Route path="/validation/:id" element={<p>Consultation du planning</p>} />
          </Routes>
        </MemoryRouter>
      </ContexteSession.Provider>
    </QueryClientProvider>,
  );
  return lue;
}

beforeEach(async () => {
  await i18n.changeLanguage('fr');
});

describe('NOT-001 : centre de notifications', () => {
  it('lues et non lues, avec leur texte : escalade, rappel, alerte du lundi', async () => {
    rendre();
    expect(
      await screen.findByText(
        'Escalade : le planning de Awa FICTIVE (semaine 42) attend une décision depuis 24 h ouvrées',
      ),
    ).toBeTruthy();
    // NOT-006 CA1 : l'échéance à l'heure du pays.
    expect(
      screen.getByText(
        "Votre planning de la semaine 43 n'est pas encore soumis : à soumettre avant le jeudi 15 octobre à 18:00",
      ),
    ).toBeTruthy();
    expect(
      screen.getByText('3 plannings de la semaine 42 ne sont pas approuvés dans vos réseaux'),
    ).toBeTruthy();
    expect(screen.getAllByText(/· Non lue/)).toHaveLength(2);
  });

  it('CA1 : une notification ouvre l’écran de l’action attendue et passe en lue', async () => {
    const lue = rendre();
    fireEvent.click(await screen.findByText(/^Escalade : le planning/));
    await waitFor(() => expect(lue).toHaveBeenCalledWith('n1'));
    expect(await screen.findByText('Consultation du planning')).toBeTruthy();
  });
});
