import { ErreurApi, type ClientApi, type RapportChronologie } from '@innov/api-client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ContexteSession, type Session } from '../contexteSession';
import i18n from '../i18n';
import RapportsProspect from './RapportsProspect';

const RAPPORT = {
  id: 'r1',
  visite: 'v1',
  date: '2026-10-06',
  heure: '10:30',
  etablissement: 'Clinique du Cap',
  delegue_nom: 'Aminata TOURE',
  de_moi: false,
  statut: 'soumis',
  en_retard: false,
  objectif_prevu: '',
  resultat: 'Objectif atteint',
  resultat_obtenu: 'Essai sur 5 patients',
  presentations: [{ produit: 'pa', libelle: 'Produit Alpha', retour: 'prescrit' }],
  remises: [],
  resume: 'Bon accueil',
  prochaine_action_type: 'Envoyer de la documentation',
  prochaine_action: 'La fiche du produit',
  prochaine_action_echeance: null,
  soumis_le: '2026-10-06T18:00:00Z',
} as unknown as RapportChronologie;

function rendre(rapports: (id: string) => Promise<RapportChronologie[]>) {
  const session = {
    etat: { statut: 'chargement' },
    client: { prospects: { rapports } } as unknown as ClientApi,
  } as unknown as Session;
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <ContexteSession.Provider value={session}>
        <RapportsProspect id="p1" />
      </ContexteSession.Provider>
    </QueryClientProvider>,
  );
}

beforeEach(async () => {
  await i18n.changeLanguage('fr');
});

describe('RPT-011 : rapports de visite du prospect au portail', () => {
  it('RPT-011 : la liste, du plus récent au plus ancien, avec le nom du délégué', async () => {
    const rapports = vi.fn(async () => [
      {
        ...RAPPORT,
        id: 'r2',
        date: '2026-10-13',
        delegue_nom: 'Moussa SARR',
        en_retard: true,
        resume: 'Échantillons laissés',
      },
      RAPPORT,
    ]);
    rendre(rapports);
    expect(await screen.findByText('Bon accueil')).toBeInTheDocument();
    expect(rapports).toHaveBeenCalledWith('p1');
    // L'ordre rendu par le serveur est gardé : le plus récent d'abord.
    const resumes = screen
      .getAllByText(/^(Échantillons laissés|Bon accueil)$/)
      .map((n) => n.textContent);
    expect(resumes).toEqual(['Échantillons laissés', 'Bon accueil']);
    expect(screen.getByText('10:30 · Clinique du Cap · Moussa SARR')).toBeInTheDocument();
    expect(screen.getByText('10:30 · Clinique du Cap · Aminata TOURE')).toBeInTheDocument();
    expect(screen.getAllByText('Objectif atteint — Essai sur 5 patients')).toHaveLength(2);
    expect(screen.getAllByText('Produit Alpha — Prescrit')).toHaveLength(2);
    expect(screen.getAllByText(/Envoyer de la documentation — La fiche du produit/)).toHaveLength(
      2,
    );
    expect(screen.getAllByText('Soumis en retard')).toHaveLength(1);
  });

  it('RPT-011 : sans rapport, la section le dit', async () => {
    rendre(vi.fn(async () => []));
    expect(await screen.findByText("Aucun rapport de visite pour l'instant.")).toBeInTheDocument();
  });

  it('RPT-011 : une erreur de chargement s’affiche, avec « Réessayer »', async () => {
    rendre(
      vi.fn(async () => {
        throw new ErreurApi(403, 'hors_perimetre', 'Ce prospect est hors de votre périmètre.');
      }),
    );
    expect(await screen.findByText('Ce prospect est hors de votre périmètre.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeInTheDocument();
  });
});
