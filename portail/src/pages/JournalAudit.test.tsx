import type { ClientApi, Journal, Perimetre } from '@innov/api-client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ContexteSession, type Session } from '../contexteSession';
import i18n from '../i18n';
import JournalAudit from './JournalAudit';

// AUD-002 (0.9.2) : consultation et filtrage du journal d'audit.

const JOURNAL: Journal = {
  total: 2,
  page: 1,
  taille: 30,
  familles: ['connexion', 'rapport'],
  resultats: [
    {
      id: 'e1',
      le: '2026-10-07T22:30:00Z',
      action: 'connexion.echec',
      famille: 'connexion',
      resultat: 'echec',
      acteur: 'awa.fictive',
      acteur_nom: 'Awa FICTIVE',
      roles: ['delegue'],
      pays: 'SN',
      objet_type: 'identite.utilisateur',
      objet_id: 'u1',
      details: { motif: 'mot de passe incorrect' },
      client: 'mobile',
      adresse: '41.82.x.x',
      reference: 'abc123',
    },
    {
      id: 'e2',
      le: '2026-10-05T10:00:00Z',
      action: 'rapport.validation',
      famille: 'rapport',
      resultat: 'succes',
      acteur: '',
      acteur_nom: '',
      roles: [],
      pays: 'SN',
      objet_type: '',
      objet_id: '',
      details: {},
      client: null,
      adresse: null,
      reference: null,
    },
  ],
};

const PERIMETRE = {
  pays_actif: { code: 'SN', nom: 'Sénégal' },
  vue_consolidee: false,
  actions: ['audit.lire'],
  roles: ['admin_pays'],
} as unknown as Perimetre;

function rendre(journal: Journal = JOURNAL) {
  const lire = vi.fn(async () => journal);
  const session = {
    etat: { statut: 'chargement' },
    client: { audit: { journal: lire } } as unknown as ClientApi,
  } as unknown as Session;
  render(
    <MemoryRouter>
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <ContexteSession.Provider value={session}>
          <JournalAudit perimetre={PERIMETRE} />
        </ContexteSession.Provider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
  return lire;
}

beforeEach(async () => {
  await i18n.changeLanguage('fr');
});

describe('AUD-002 : journal d’audit', () => {
  it('AUD-002 : les événements du pays, du plus récent au plus ancien, avec leur résultat', async () => {
    rendre();
    expect(await screen.findByText('connexion.echec')).toBeInTheDocument();
    expect(screen.getByText('Échec')).toBeInTheDocument();
    expect(screen.getByText('Réussi')).toBeInTheDocument();
    // Sans auteur, l'événement vient du système (tâche périodique).
    expect(screen.getByText('Système')).toBeInTheDocument();
    expect(screen.getByText('Connexions')).toBeInTheDocument();
  });

  it('AUD-002 : les filtres partent au serveur et ramènent à la première page', async () => {
    const lire = rendre();
    await screen.findByText('connexion.echec');
    fireEvent.mouseDown(screen.getByLabelText('Résultat'));
    fireEvent.click(await screen.findByRole('option', { name: 'Échec' }));
    await waitFor(() =>
      expect(lire).toHaveBeenLastCalledWith(
        expect.objectContaining({ resultat: 'echec', page: 1 }),
      ),
    );
    fireEvent.change(screen.getByLabelText('Du'), { target: { value: '2026-10-01' } });
    await waitFor(() =>
      expect(lire).toHaveBeenLastCalledWith(expect.objectContaining({ du: '2026-10-01' })),
    );
  });

  it('AUD-002 : le détail d’un événement, adresse masquée et détails', async () => {
    rendre();
    fireEvent.click(await screen.findByText('connexion.echec'));
    const detail = await screen.findByRole('presentation');
    expect(within(detail).getByText('41.82.x.x')).toBeInTheDocument();
    expect(within(detail).getByText('mot de passe incorrect')).toBeInTheDocument();
    expect(within(detail).getByText(/immuable/)).toBeInTheDocument();
  });

  it('AUD-002 : rien ne correspond, la page le dit', async () => {
    rendre({ ...JOURNAL, total: 0, resultats: [] });
    expect(await screen.findByText('Aucun événement')).toBeInTheDocument();
  });
});
