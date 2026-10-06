import type {
  ClientApi,
  ConsultationPlanning as Consultation,
  PlanningEnAttente,
  Visite,
} from '@innov/api-client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import axe from 'axe-core';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ContexteNotifications } from '../contexteNotifications';
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
  debut_le: null,
  sans_gps: false,
  distance_debut_m: null,
  fin_le: null,
  fin_sans_gps: false,
  distance_fin_m: null,
  motif_ecart: null,
  commentaire_ecart: '',
  ecart_le: null,
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
    decision: null,
    numero_version: null,
    motif_version: null,
    ferme: false,
    reouvert_le: null,
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
  fermee: false,
  demande_envoyee: false,
  reseaux: [{ id: 'r1', libelle: 'Cardio' }],
  approbation: null,
  delegue: { id: 'u1', prenom: 'Aminata', nom: 'FICTIVE' },
  remplace: null,
  escalade: null,
  postes: ['VM Plateau'],
};

function ligne(id: string, prenom: string): PlanningEnAttente {
  return {
    planning: { ...CONSULTATION.planning!, id },
    fuseau: 'Africa/Dakar',
    delegue: { id: `u-${id}`, prenom, nom: 'FICTIF' },
    remplace: null,
    escalade: null,
    postes: [],
    visites: 0,
    signalements: [],
    activites: [],
  };
}

function rendreAvec(plannings: Record<string, unknown> = {}) {
  const session = {
    etat: { statut: 'chargement' },
    client: {
      plannings: {
        consulter: vi.fn(async () => CONSULTATION),
        approuver: vi.fn(),
        reviser: vi.fn(),
        aValider: vi.fn(async () => [ligne('pl1', 'Aminata'), ligne('pl2', 'Moussa')]),
        ...plannings,
      },
    } as unknown as ClientApi,
  } as unknown as Session;
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <ContexteSession.Provider value={session}>
        <ContexteNotifications.Provider value={mockNotifier}>
          <MemoryRouter>
            <ConsultationPlanning id="pl1" />
          </MemoryRouter>
        </ContexteNotifications.Provider>
      </ContexteSession.Provider>
    </QueryClientProvider>,
  );
}

function rendre(
  consulter = vi.fn(async () => CONSULTATION),
  approuver = vi.fn(async () => ({ ...CONSULTATION.planning!, statut: 'approuve' as const })),
) {
  return rendreAvec({ consulter, approuver });
}

const mockNotifier = vi.fn();

beforeEach(async () => {
  await i18n.changeLanguage('fr');
  mockNotifier.mockClear();
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

describe('PLN-012 : approbation par le responsable du poste', () => {
  it('« Approuver » demande confirmation, approuve, puis dit le succès', async () => {
    const approuver = vi.fn(async () => ({
      ...CONSULTATION.planning!,
      statut: 'approuve' as const,
    }));
    rendre(undefined, approuver);
    expect(await screen.findByText('En attente de votre décision')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Approuver' }));
    const dialogue = await screen.findByRole('dialog');
    expect(within(dialogue).getByText(/devient la référence de ses visites/)).toBeTruthy();
    expect(within(dialogue).getByText('2 points signalés restent à « À vérifier ».')).toBeTruthy();
    fireEvent.click(within(dialogue).getByRole('button', { name: 'Approuver le planning' }));
    await waitFor(() => expect(approuver).toHaveBeenCalledWith('pl1'));
    await waitFor(() =>
      expect(mockNotifier).toHaveBeenCalledWith('Planning de Aminata FICTIVE approuvé.'),
    );
  });

  it('CA1 : un planning décidé dit qui l’a approuvé, quand et quelle version', async () => {
    const approuve: Consultation = {
      ...CONSULTATION,
      planning: {
        ...CONSULTATION.planning!,
        statut: 'approuve',
        decision: {
          numero: 1,
          decision: 'approuve',
          decide_le: '2026-10-07T10:30:00Z',
          par: 'Kossi GUEYE',
          mode: 'direct',
          commentaire: '',
          remarques: [],
        },
      },
    };
    rendre(vi.fn(async () => approuve));
    expect(
      await screen.findByText('Approuvé le mercredi 7 octobre à 10:30 par Kossi GUEYE · version 1'),
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Approuver' })).toBeNull();
  });
});

describe('PLN-013 : révision motivée', () => {
  it('CA1 : la demande exige un commentaire ; une remarque sur une visite suffit', async () => {
    const reviser = vi.fn(async () => ({
      ...CONSULTATION.planning!,
      statut: 'a_reviser' as const,
    }));
    rendreAvec({ reviser });
    fireEvent.click(await screen.findByRole('button', { name: 'Demander une révision' }));
    let dialogue = await screen.findByRole('dialog');
    const envoyer = within(dialogue).getByRole('button', { name: 'Envoyer la demande' });
    expect((envoyer as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(within(dialogue).getByRole('button', { name: 'Annuler' }));
    // Une remarque écrite sur la visite, puis la demande.
    fireEvent.click(await screen.findByRole('button', { name: /Dr Awa FICTIF/ }));
    const detail = await screen.findByRole('dialog');
    fireEvent.change(within(detail).getByLabelText('Remarque pour la révision'), {
      target: { value: 'Prévoir 10 h plutôt.' },
    });
    fireEvent.click(within(detail).getByRole('button', { name: 'Fermer' }));
    expect(await screen.findByText('Prévoir 10 h plutôt.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Demander une révision' }));
    dialogue = await screen.findByRole('dialog');
    expect(within(dialogue).getByText('1 remarque sur une visite sera jointe.')).toBeTruthy();
    fireEvent.click(within(dialogue).getByRole('button', { name: 'Envoyer la demande' }));
    await waitFor(() =>
      expect(reviser).toHaveBeenCalledWith('pl1', {
        commentaire: '',
        remarques: [{ visite: 'v1', commentaire: 'Prévoir 10 h plutôt.' }],
      }),
    );
    await waitFor(() =>
      expect(mockNotifier).toHaveBeenCalledWith('Révision demandée à Aminata FICTIVE.'),
    );
  });
});

describe('PLN-014 : version suivante après révision', () => {
  it('le responsable retrouve ce qu’il avait demandé, visite par visite', async () => {
    const version2: Consultation = {
      ...CONSULTATION,
      planning: {
        ...CONSULTATION.planning!,
        numero_version: 2,
        decision: {
          numero: 1,
          decision: 'a_reviser',
          decide_le: '2026-10-08T10:30:00Z',
          par: 'Kossi GUEYE',
          mode: 'direct',
          commentaire: 'Ajoutez des visites.',
          remarques: [
            { visite: 'v1', commentaire: 'Prévoir 10 h plutôt.' },
            { visite: 'vx', commentaire: 'Hors secteur.' },
          ],
        },
      },
    };
    rendre(vi.fn(async () => version2));
    expect(
      await screen.findByText(
        'Révision demandée sur la version 1, le jeudi 8 octobre par Kossi GUEYE',
      ),
    ).toBeTruthy();
    expect(screen.getByText('Ajoutez des visites.')).toBeTruthy();
    expect(screen.getByText('Awa FICTIF · mar. 13 09:00')).toBeTruthy();
    expect(screen.getByText('visite retirée depuis')).toBeTruthy();
    expect(screen.getByText(/Version 2 · après révision/)).toBeTruthy();
    // La décision reste à prendre sur la version 2.
    expect(screen.getByRole('button', { name: 'Approuver' })).toBeTruthy();
  });
});

describe('PLN-015 : modification après approbation', () => {
  it('CA1 : les heures changées depuis l’approbation se lisent, le planning reste approuvé', async () => {
    const approuve: Consultation = {
      ...CONSULTATION,
      planning: {
        ...CONSULTATION.planning!,
        statut: 'approuve',
        numero_version: 1,
        motif_version: 'soumission',
        ferme: false,
        reouvert_le: null,
      },
      approbation: {
        reference: 1,
        modifiable: true,
        en_attente: [],
        retraits: [],
        mineures: [
          {
            visite: 'v1',
            prospect: 'Awa FICTIF',
            date: '2026-10-13',
            avant: '09:00',
            apres: '10:30',
            le: '2026-10-12T08:00:00Z',
          },
        ],
      },
    };
    rendre(vi.fn(async () => approuve));
    expect(await screen.findByText("Heure changée depuis l'approbation")).toBeTruthy();
    expect(screen.getByText('Awa FICTIF · mar. 13 : 09:00 → 10:30')).toBeTruthy();
  });

  it('CA2 : la modification soumise dit ce qui attend, le reste reste prévu', async () => {
    const modifie: Consultation = {
      ...CONSULTATION,
      planning: { ...CONSULTATION.planning!, numero_version: 2, motif_version: 'modification' },
      approbation: {
        reference: 1,
        modifiable: false,
        en_attente: ['v1'],
        retraits: [],
        mineures: [],
      },
    };
    rendre(vi.fn(async () => modifie));
    expect(await screen.findByText(/Version 2 · modification après approbation/)).toBeTruthy();
    expect(
      screen.getByText('Les visites non concernées restent prévues selon la version 1 approuvée.'),
    ).toBeTruthy();
    expect(screen.getByText('À décider : mar. 13 09:00 · Dr Awa FICTIF')).toBeTruthy();
    const mardi = screen.getByLabelText('mardi 13');
    expect(within(mardi).getByText('En attente')).toBeTruthy();
  });
});

describe('0.3.9 : planning fermé le lundi 0 h', () => {
  it('la décision cède la place à la réouverture, après confirmation', async () => {
    const rouvrir = vi.fn(async () => ({ ...CONSULTATION.planning!, ferme: false }));
    rendreAvec({
      consulter: vi.fn(async () => ({
        ...CONSULTATION,
        planning: { ...CONSULTATION.planning!, ferme: true },
      })),
      rouvrir,
    });
    expect(await screen.findByText(/ne se décide plus/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Approuver' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Rouvrir la rédaction' }));
    fireEvent.click(screen.getByRole('button', { name: 'Oui, rouvrir' }));
    await waitFor(() =>
      expect(rouvrir).toHaveBeenCalledWith(CONSULTATION.delegue.id, CONSULTATION.semaine),
    );
    expect(mockNotifier).toHaveBeenCalledWith(
      'Rédaction rouverte : Aminata FICTIVE en est prévenu.',
    );
  });
});
