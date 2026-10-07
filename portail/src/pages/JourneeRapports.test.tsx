import type { ClientApi, Journee } from '@innov/api-client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ContexteSession, type Session } from '../contexteSession';
import i18n from '../i18n';
import JourneeRapports from './JourneeRapports';

// 0.6.2 : le superviseur lit une journée, ses visites et leurs rapports soumis.

const RAPPORT = {
  id: 'r1',
  statut: 'soumis',
  soumis_le: '2026-10-13T20:00:00Z',
  en_retard: true,
  horodatage_douteux: true,
  heure_telephone: '2026-10-13T20:00:00Z',
  recu_le: '2026-10-13T20:40:00Z',
  versions: 1,
  objectif_prevu: 'Présenter Cardiol',
  resultat: 'Objectif atteint',
  resultat_obtenu: 'Essai sur 5 patients',
  presentations: [{ produit: 'p1', libelle: 'Cardiol', retour: 'prescrit' }],
  remises: [{ type: 'echantillon', produit: 'p1', article: null, libelle: 'Cardiol', quantite: 2 }],
  resume: 'Intérêt pour la nouvelle forme',
  prochaine_action_type: 'Revisiter le prescripteur',
  prochaine_action: 'Revenir avec l’étude',
  prochaine_action_echeance: '2026-10-27',
  visite_proposee: true,
  champs: [{ libelle: 'Patients concernés par semaine', type: 'nombre', valeur: 12 }],
  pieces_jointes: [
    {
      id: 'pj1',
      nom: 'fiche-produit.pdf',
      type_mime: 'application/pdf',
      taille: 10,
      prise_le: '2026-10-13T10:00:00Z',
    },
  ],
} as const;

const VISITE = {
  objectif: '',
  est_imprevue: false,
  justification: '',
  motif_ecart: null,
  commentaire_ecart: '',
  debut_le: null,
  fin_le: null,
  distance_debut_m: null,
  distance_fin_m: null,
  sans_gps: false,
  etablissement: 'Clinique du Cap',
  rapport: null,
};

const JOURNEE = {
  delegue: { id: 'd1', prenom: 'Aminata', nom: 'TOURE' },
  date: '2026-10-13',
  planning: 'pl1',
  classement: 'a_verifier',
  fige: false,
  ecarts: [
    {
      code: 'distance',
      visite: 'v1',
      prospect: 'Awa NDIAYE',
      heure: '09:00',
      distance_m: 350,
      seuil_m: 100,
    },
  ],
  activites: [],
  visites: [
    {
      ...VISITE,
      id: 'v1',
      heure: '09:00',
      prospect: 'Awa NDIAYE',
      statut: 'effectuee',
      debut_le: '2026-10-13T09:02:00Z',
      fin_le: '2026-10-13T09:30:00Z',
      distance_debut_m: 350,
      distance_fin_m: 40,
      rapport_statut: 'soumis',
      rapport: RAPPORT,
    },
    {
      ...VISITE,
      id: 'v2',
      heure: '11:00',
      prospect: 'Ibou SARR',
      statut: 'effectuee',
      rapport_statut: 'brouillon',
    },
    {
      ...VISITE,
      id: 'v3',
      heure: '15:00',
      prospect: 'Malick BA',
      statut: 'prospect_absent',
      motif_ecart: 'Cabinet fermé',
      commentaire_ecart: 'Revenir jeudi',
      rapport_statut: null,
    },
  ],
} as unknown as Journee;

function rendre() {
  const piece = vi.fn(async () => new Blob(['%PDF'], { type: 'application/pdf' }));
  const session = {
    etat: { statut: 'chargement' },
    client: {
      rapports: { journee: vi.fn(async () => JOURNEE), piece },
    } as unknown as ClientApi,
  } as unknown as Session;
  render(
    <MemoryRouter>
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <ContexteSession.Provider value={session}>
          <JourneeRapports cle="d1/2026-10-13" />
        </ContexteSession.Provider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
  return { piece };
}

beforeEach(async () => {
  await i18n.changeLanguage('fr');
});

describe('0.6.2 : consultation d’une journée par le superviseur', () => {
  it('0.6.2 : les contrôles de la journée, avec leurs écarts', async () => {
    rendre();
    expect(await screen.findByRole('heading', { name: 'Aminata TOURE' })).toBeInTheDocument();
    const controles = screen.getByRole('region', { name: /Contrôles de la journée/ });
    expect(within(controles).getByText('À vérifier · 1 écart')).toBeInTheDocument();
    expect(
      within(controles).getByText('09:00 · Awa NDIAYE : pointée à 350 m du lieu (seuil 100 m)'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Consulter la semaine' })).toHaveAttribute(
      'href',
      '/validation/pl1',
    );
  });

  it('RPT-010 CA1 : le rapport soumis se lit en entier, horodatage douteux compris', async () => {
    rendre();
    const visite = await screen.findByRole('article', { name: '09:00 · Awa NDIAYE' });
    for (const texte of [
      'Cardiol — Prescrit',
      'Échantillon : Cardiol × 2',
      'Objectif atteint — Essai sur 5 patients',
      'Intérêt pour la nouvelle forme',
      'Patients concernés par semaine',
      '12',
      'Horodatage douteux',
    ]) {
      expect(within(visite).getByText(texte)).toBeInTheDocument();
    }
    expect(
      within(visite).getByText(/Revisiter le prescripteur — Revenir avec l’étude/),
    ).toBeInTheDocument();
    expect(within(visite).getByText(/Nouvelle visite proposée/)).toBeInTheDocument();
  });

  it('RPT-007 CA2 : la pièce jointe du rapport soumis s’ouvre pour le superviseur', async () => {
    const { piece } = rendre();
    const ouvrir = vi.spyOn(window, 'open').mockReturnValue(null);
    URL.createObjectURL = vi.fn(() => 'blob:pj1');
    fireEvent.click(await screen.findByRole('button', { name: 'fiche-produit.pdf' }));
    await waitFor(() => expect(piece).toHaveBeenCalledWith('pj1'));
    ouvrir.mockRestore();
  });

  it('0.6.2 : un brouillon reste au délégué ; un écart montre son motif', async () => {
    rendre();
    const brouillon = await screen.findByRole('article', { name: '11:00 · Ibou SARR' });
    expect(
      within(brouillon).getByText(
        /Rapport en brouillon : il reste au délégué tant qu.il n.est pas soumis/,
      ),
    ).toBeInTheDocument();
    const absent = screen.getByRole('article', { name: '15:00 · Malick BA' });
    expect(within(absent).getByText('Prospect absent')).toBeInTheDocument();
    expect(within(absent).getByText('Motif : Cabinet fermé — Revenir jeudi')).toBeInTheDocument();
  });
});
