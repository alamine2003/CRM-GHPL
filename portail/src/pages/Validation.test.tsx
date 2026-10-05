import type { ClientApi, PlanningEnAttente } from '@innov/api-client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import axe from 'axe-core';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ContexteSession, type Session } from '../contexteSession';
import i18n from '../i18n';
import Validation from './Validation';

const LIGNE: PlanningEnAttente = {
  planning: {
    id: 'pl1',
    semaine: '2026-10-12',
    statut: 'soumis',
    cree_le: '',
    soumis_le: '2026-10-06T16:00:00Z',
    en_retard: true,
    echeance: '2026-10-08T18:00:00Z',
    decision: null,
    numero_version: null,
  },
  fuseau: 'Africa/Dakar',
  delegue: { id: 'u1', prenom: 'Awa', nom: 'FICTIVE' },
  remplace: null,
  postes: ['VM Plateau'],
  visites: 12,
  signalements: [
    { code: 'seuil_bas', nombre: 2 },
    { code: 'hors_secteur', nombre: 1 },
    { code: 'soumis_en_retard', nombre: 1 },
  ],
  activites: [
    {
      id: 'a1',
      date: '2026-10-13',
      periode: 'journee',
      type: 'deplacement',
      commentaire: 'Aide à un collègue à Mbour',
      demande_superviseur: true,
      avec_visites: true,
    },
  ],
};

function rendre(aValider: () => Promise<PlanningEnAttente[]>) {
  const session = {
    etat: { statut: 'chargement' },
    client: { plannings: { aValider } } as unknown as ClientApi,
  } as unknown as Session;
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <ContexteSession.Provider value={session}>
        <MemoryRouter>
          <Validation />
        </MemoryRouter>
      </ContexteSession.Provider>
    </QueryClientProvider>,
  );
}

beforeEach(async () => {
  await i18n.changeLanguage('fr');
});

describe('PLN-011 : file des plannings en attente', () => {
  it('CA1 : chaque planning dit son délégué, sa soumission et ses alertes', async () => {
    // Trois jours après la soumission du 6 octobre, à 16 h : deux jours entiers d'attente.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-09T10:00:00Z'));
    const { container } = rendre(
      vi.fn(async () => [LIGNE, { ...LIGNE, planning: { ...LIGNE.planning, id: 'pl2' } }]),
    );
    expect(
      await screen.findByText('2 plannings en attente, du plus ancien au plus récent'),
    ).toBeTruthy();
    expect(screen.getAllByText('Awa FICTIVE')).toHaveLength(2);
    expect(screen.getAllByText(/^Soumis le mardi 6 octobre à 16:00$/)).toHaveLength(2);
    expect(screen.getAllByText('En retard')).toHaveLength(2);
    expect(screen.getAllByText('En attente depuis 2 jours')).toHaveLength(2);
    expect(screen.getAllByText('Sous le minimum : 2 jours')).toHaveLength(2);
    expect(screen.getAllByText('1 visite hors secteur')).toHaveLength(2);
    // PLN-018 : l'activité connexe, son explication et qui l'a demandée.
    expect(
      screen.getAllByText('mar. 13 · Déplacement · Journée · Demandé par le superviseur'),
    ).toHaveLength(2);
    expect(screen.getAllByText('Aide à un collègue à Mbour')).toHaveLength(2);
    // 0.3.2 : chaque carte ouvre la consultation de son planning.
    const liens = screen.getAllByRole('link').map((a) => a.getAttribute('href'));
    expect(liens).toEqual(['/validation/pl1', '/validation/pl2']);
    const resultat = await axe.run(container, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
      rules: { 'color-contrast': { enabled: false } },
    });
    expect(resultat.violations.map((v) => v.id)).toEqual([]);
    vi.useRealTimers();
  });

  it('sans planning en attente, la file le dit', async () => {
    rendre(vi.fn(async () => []));
    expect(
      await screen.findByText(
        'Aucun planning en attente : tous les plannings soumis de votre équipe ont été traités.',
      ),
    ).toBeTruthy();
  });
});
