import type {
  ClientApi,
  ConsultationPlanning as Consultation,
  PlanningEnAttente,
  Visite,
} from '@innov/api-client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import axe from 'axe-core';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ContexteSession, type Session } from '../contexteSession';
import i18n from '../i18n';
import ConsultationPlanning from './ConsultationPlanning';

const VISITE: Visite = {
  id: 'v1',
  date: '2026-10-13',
  heure: '09:00',
  prospect: {
    id: 'p1',
    civilite: 'dr',
    prenom: 'Awa',
    nom: 'FICTIF',
    specialite_libelle: 'Cardiologie',
    type_libelle: 'Médecin',
    potentiel: 'A',
  },
  etablissement: { id: 'e1', nom: 'Clinique Fictive' },
  reseau: { id: 'r1', libelle: 'Cardio' },
  objectif: 'Vasculor',
  note: '',
  statut: 'prevue',
  manquants: [],
  passage: null,
  ordre: 1,
};

const CONSULTATION: Consultation = {
  semaine: '2026-10-12',
  precedente: '2026-10-05',
  suivante: '2026-10-19',
  courante: false,
  fuseau: 'Africa/Dakar',
  jours: ['12', '13', '14', '15', '16'].map((j) => ({
    date: `2026-10-${j}`,
    ferie: null,
    planifiable: true,
  })),
  planning: {
    id: 'pl1',
    semaine: '2026-10-12',
    statut: 'soumis',
    cree_le: '',
    soumis_le: '2026-10-06T16:00:00Z',
    en_retard: true,
    echeance: '2026-10-08T18:00:00Z',
  },
  peut_creer: false,
  modifiable: false,
  visites: [VISITE],
  passages: [],
  activites: [
    {
      id: 'a1',
      date: '2026-10-14',
      periode: 'journee',
      type: 'commando',
      commentaire: 'Commando à Mbour, lancement produit',
      demande_superviseur: false,
      avec_visites: true,
    },
  ],
  controles: {
    bloquants: [],
    signalements: [
      { code: 'hors_cible', gravite: 'signalement', date: '2026-10-13', visites: ['v1'] },
      { code: 'seuil_bas', gravite: 'signalement', date: '2026-10-13', visites: [] },
    ],
    objectifs: [{ date: '2026-10-13', visites: 1, min: 6, max: 10 }],
  },
  kilometrage: { total_km: 12.5, sans_coordonnees: 0, jours: [] },
  reprenables: 0,
  reseaux: [{ id: 'r1', libelle: 'Cardio' }],
  delegue: { id: 'u1', prenom: 'Aminata', nom: 'FICTIVE' },
  postes: ['VM Plateau'],
};

function ligne(id: string, prenom: string): PlanningEnAttente {
  return {
    planning: { ...CONSULTATION.planning!, id },
    fuseau: 'Africa/Dakar',
    delegue: { id: `u-${id}`, prenom, nom: 'FICTIF' },
    postes: [],
    visites: 0,
    signalements: [],
    activites: [],
  };
}

function rendre(consulter = vi.fn(async () => CONSULTATION)) {
  const session = {
    etat: { statut: 'chargement' },
    client: {
      plannings: {
        consulter,
        aValider: vi.fn(async () => [ligne('pl1', 'Aminata'), ligne('pl2', 'Moussa')]),
      },
    } as unknown as ClientApi,
  } as unknown as Session;
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <ContexteSession.Provider value={session}>
        <MemoryRouter>
          <ConsultationPlanning id="pl1" />
        </MemoryRouter>
      </ContexteSession.Provider>
    </QueryClientProvider>,
  );
}

beforeEach(async () => {
  await i18n.changeLanguage('fr');
});

describe('0.3.2 : consultation d’un planning soumis', () => {
  it('le superviseur lit la semaine, ses alertes et ses activités, sans rien modifier', async () => {
    const consulter = vi.fn(async () => CONSULTATION);
    const { container } = rendre(consulter);
    expect(await screen.findByRole('heading', { name: 'Aminata FICTIVE' })).toBeTruthy();
    expect(consulter).toHaveBeenCalledWith('pl1');
    expect(screen.getByText('En retard')).toBeTruthy();
    expect(screen.getAllByText('Commando à Mbour, lancement produit').length).toBeGreaterThan(0);
    // PLN-004 CA2 : le seuil bas du mardi lui apparaît.
    expect(screen.getByText(/sous le minimum/i)).toBeTruthy();
    // La visite porte son alerte, sans l'ouvrir.
    const mardi = screen.getByLabelText('mardi 13');
    expect(within(mardi).getByText('1 alerte')).toBeTruthy();
    // Rien à glisser, rien à soumettre, rien à poser.
    expect(screen.queryByRole('button', { name: /soumettre/i })).toBeNull();
    expect(screen.queryByText(/glissez/i)).toBeNull();
    // Le planning suivant de la file est à un clic.
    expect(screen.getByRole('link', { name: 'Suivant : Moussa FICTIF' }).getAttribute('href')).toBe(
      '/validation/pl2',
    );
    const resultat = await axe.run(container, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
      rules: { 'color-contrast': { enabled: false } },
    });
    expect(resultat.violations.map((v) => v.id)).toEqual([]);
  });

  it('le détail d’une visite dit le prospect et ses alertes, sans action', async () => {
    rendre();
    fireEvent.click(await screen.findByRole('button', { name: /Dr Awa FICTIF/ }));
    const detail = await screen.findByRole('dialog');
    expect(within(detail).getByText('Cardiologie · potentiel A')).toBeTruthy();
    expect(within(detail).getByText('mar. 13 : prospect hors liste cible')).toBeTruthy();
    expect(within(detail).queryByRole('button', { name: /retirer/i })).toBeNull();
  });
});
