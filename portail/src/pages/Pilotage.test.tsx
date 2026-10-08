import type {
  ClientApi,
  IndicateursPeriode,
  Perimetre,
  TableauEquipe,
  TableauSiege,
} from '@innov/api-client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ContexteSession, type Session } from '../contexteSession';
import i18n from '../i18n';
import Pilotage from './Pilotage';

// DSH-002, DSH-012 (0.7.2) : les délégués de l'équipe côte à côte, sans classement ; sans
// visite, « Aucune activité ».

const TAUX_VIDES = {
  realisation: null,
  ecarts_justifies: null,
  geolocalisation: null,
  rapports_dans_delai: null,
  couverture: null,
  couverture_ab: null,
  frequence_ab: null,
  part_planifiee: null,
};

const periode = (
  visites: Partial<IndicateursPeriode['visites']>,
  taux: Partial<IndicateursPeriode['taux']>,
  activite = true,
): IndicateursPeriode => ({
  activite,
  visites: {
    prevues: 0,
    echues: 0,
    a_venir: 0,
    effectuees_prevues: 0,
    ecarts: 0,
    ecarts_justifies: 0,
    a_justifier: 0,
    imprevues: 0,
    effectuees: 0,
    geolocalisees: 0,
    ...visites,
  },
  rapports: { soumis: 1, dans_delai: 1, valides: 0, a_soumettre: 1, en_retard: 1 },
  couverture: { cibles: 50, visitees: 6, cibles_ab: 44, visitees_ab: 2, frequence_ab: 2 },
  taux: { ...TAUX_VIDES, ...taux },
});

const DELAIS: TableauEquipe['delais'] = {
  cible_heures: 24,
  plannings: { decisions: 12, mediane: 5.4, dans_cible: 11 },
  rapports: { decisions: 3, mediane: 36, dans_cible: 1 },
};
const SANS_DELAI: TableauEquipe['delais'] = {
  cible_heures: 24,
  plannings: { decisions: 0, mediane: null, dans_cible: 0 },
  rapports: { decisions: 0, mediane: null, dans_cible: 0 },
};

const TABLEAU: TableauEquipe = {
  aujourdhui: '2026-10-08',
  calcule_le: '2026-10-08T12:00:00Z',
  debut: '2026-10-05',
  fin: '2026-10-11',
  periode: 'semaine',
  cycle: { debut: '2026-09-14', fin: '2026-10-11', semaines: 4 },
  par: 'delegue',
  options: {
    zones: [{ id: 'z1', libelle: 'Dakar' }],
    secteurs: [],
    divisions: [],
    reseaux: [
      { id: 'r1', libelle: 'Cardio' },
      { id: 'r2', libelle: 'Gastro' },
    ],
    superviseurs: [],
    delegues: [
      { id: 'd1', libelle: 'Aminata TOURE' },
      { id: 'd2', libelle: 'Moussa SARR' },
    ],
  },
  delais: DELAIS,
  groupes: [],
  delegues: [
    {
      delegue: { id: 'd1', prenom: 'Aminata', nom: 'TOURE' },
      poste: { id: 'p1', libelle: 'VM Plateau' },
      semaine: periode(
        { echues: 5, effectuees_prevues: 4, effectuees: 5, imprevues: 1, a_justifier: 1 },
        { realisation: 0.8, rapports_dans_delai: 0.5 },
      ),
      cycle: periode({}, { couverture: 0.12 }),
    },
    {
      delegue: { id: 'd2', prenom: 'Moussa', nom: 'SARR' },
      poste: { id: 'p2', libelle: 'VM Médina' },
      semaine: periode({}, {}, false),
      cycle: periode({}, { couverture: 0 }),
    },
  ],
  total: {
    semaine: periode({ echues: 5, effectuees_prevues: 4, effectuees: 5 }, { realisation: 0.8 }),
    cycle: periode({}, { couverture: 0.06 }),
  },
};

const PAYS = { code: 'SN', nom: 'Sénégal', fuseau: 'Africa/Dakar' };
const SUPERVISEUR: Perimetre = {
  pays_actif: PAYS,
  vue_consolidee: false,
  roles: ['superviseur'],
  actions: ['pilotage.lire'],
  pays_accessibles: [PAYS],
};

function rendre(
  adresse = '/pilotage',
  donnees: TableauEquipe = TABLEAU,
  perimetre: Perimetre = SUPERVISEUR,
  siege?: TableauSiege,
) {
  const equipe = vi.fn(async () => donnees);
  const exporter = vi.fn(async () => new Blob(['x']));
  const choisirPays = vi.fn(async () => undefined);
  const session = {
    etat: { statut: 'chargement' },
    choisirPays,
    client: {
      pilotage: { equipe, exporter, siege: vi.fn(async () => siege) },
    } as unknown as ClientApi,
  } as unknown as Session;
  render(
    <MemoryRouter initialEntries={[adresse]}>
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <ContexteSession.Provider value={session}>
          <Pilotage perimetre={perimetre} />
        </ContexteSession.Provider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
  return { equipe, exporter, choisirPays };
}

describe('Pilotage', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr');
  });

  it("DSH-012 : les délégués côte à côte, le total de l'équipe, sans classement", async () => {
    rendre();
    const tableau = await screen.findByRole('table', {
      name: 'Indicateurs de la semaine par délégué',
    });
    const lignes = within(tableau).getAllByRole('row');
    // En-tête, deux délégués dans l'ordre reçu (alphabétique), le total.
    expect(lignes).toHaveLength(4);
    const [, aminata, moussa, equipe] = lignes as [
      HTMLElement,
      HTMLElement,
      HTMLElement,
      HTMLElement,
    ];
    expect(within(aminata).getByText('Aminata TOURE')).toBeTruthy();
    expect(within(aminata).getByText('80 %')).toBeTruthy();
    expect(within(aminata).getByText('4 sur 5')).toBeTruthy();
    expect(within(aminata).getByText('dont 1 imprévue')).toBeTruthy();
    expect(within(aminata).getByText('1 visite à justifier')).toBeTruthy();
    // DSH-012 CA2 : sans visite, « Aucune activité ».
    expect(within(moussa).getByText('Aucune activité cette semaine')).toBeTruthy();
    expect(within(equipe).getByText('Équipe')).toBeTruthy();
    expect(within(equipe).getByText('2 délégués')).toBeTruthy();
    expect(screen.queryByText(/rang|score|meilleur/i)).toBeNull();
    expect(screen.getAllByText('Semaine du 5 octobre au 11 octobre').length).toBeGreaterThan(0);
  });

  it("DSH-007 : délais de validation, médiane en heures ouvrées, part en moins d'un jour", async () => {
    rendre();
    const delais = await screen.findByRole('region', { name: 'Délais de validation' });
    expect(within(delais).getByText('5 h ouvrées')).toBeTruthy();
    expect(within(delais).getByText("11 sur 12 décisions en moins d'un jour ouvré")).toBeTruthy();
    expect(within(delais).getByText('1,5 jour ouvré')).toBeTruthy();
    expect(within(delais).getByText("1 sur 3 décisions en moins d'un jour ouvré")).toBeTruthy();
  });

  it('une semaine passée, puis le retour à la semaine en cours', async () => {
    const { equipe } = rendre();
    await screen.findByRole('table');
    expect(screen.getByRole('button', { name: 'Semaine suivante' })).toHaveProperty(
      'disabled',
      true,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Semaine précédente' }));
    expect(equipe).toHaveBeenLastCalledWith({ semaine: '2026-09-28' });
  });

  it('DSH-003 : par réseau, une ligne de total par réseau, dépliable sur ses délégués', async () => {
    const parReseau: TableauEquipe = {
      ...TABLEAU,
      par: 'reseau',
      groupes: [
        { id: 'r1', libelle: 'Cardio', delegues: ['d1'], total: TABLEAU.total },
        { id: 'r2', libelle: 'Gastro', delegues: ['d1', 'd2'], total: TABLEAU.total },
      ],
    };
    const { equipe } = rendre('/pilotage?par=reseau', parReseau);
    const tableau = await screen.findByRole('table');
    expect(equipe).toHaveBeenLastCalledWith({ par: 'reseau' });
    // En-tête, deux réseaux repliés, l'ensemble.
    expect(within(tableau).getAllByRole('row')).toHaveLength(4);
    expect(within(tableau).getByText('Réseau')).toBeTruthy();
    expect(within(tableau).getByText('Ensemble')).toBeTruthy();
    expect(within(tableau).queryByText('Moussa SARR')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Afficher les délégués de Gastro' }));
    expect(within(tableau).getAllByRole('row')).toHaveLength(6);
    expect(within(tableau).getByText('Moussa SARR')).toBeTruthy();
    expect(
      screen
        .getByRole('button', { name: 'Masquer les délégués de Gastro' })
        .getAttribute('aria-expanded'),
    ).toBe('true');
  });

  it("DSH-004 : le siège voit les pays sans aucun nom, et descend au nominatif d'un pays", async () => {
    const siege: TableauSiege = {
      calcule_le: '2026-10-08T12:00:00Z',
      periode: 'semaine',
      debut: '2026-10-05',
      fin: '2026-10-11',
      delegues: 2,
      pays: [
        {
          pays: { code: 'SN', nom: 'Sénégal' },
          delegues: 2,
          cycle_semaines: 4,
          total: TABLEAU.total,
          delais: DELAIS,
        },
        {
          pays: { code: 'TG', nom: 'Togo' },
          delegues: 0,
          cycle_semaines: 4,
          total: TABLEAU.total,
          delais: SANS_DELAI,
        },
      ],
      total: TABLEAU.total,
      delais: DELAIS,
    };
    const consolide: Perimetre = {
      pays_actif: null,
      vue_consolidee: true,
      roles: ['direction_siege'],
      actions: ['pilotage.lire'],
      pays_accessibles: [PAYS],
    };
    const { choisirPays } = rendre('/pilotage', TABLEAU, consolide, siege);
    const tableau = await screen.findByRole('table', {
      name: 'Indicateurs de la semaine par pays',
    });
    expect(within(tableau).getByText('Sénégal')).toBeTruthy();
    expect(within(tableau).getByText('Tous les pays')).toBeTruthy();
    expect(within(tableau).queryByText('Aminata TOURE')).toBeNull();
    // Le Togo n'a aucun délégué : pas de descente.
    expect(within(tableau).getAllByRole('button', { name: 'Voir les délégués' })).toHaveLength(1);
    fireEvent.click(within(tableau).getByRole('button', { name: 'Voir les délégués' }));
    expect(choisirPays).toHaveBeenCalledWith('SN');
    // DSH-007 : les délais par pays, puis tous les pays.
    const delais = screen.getByRole('table', { name: 'Délais de validation' });
    const [, senegal, togo, tous] = within(delais).getAllByRole('row') as HTMLElement[];
    expect(within(senegal!).getByText('5 h ouvrées')).toBeTruthy();
    expect(within(togo!).getAllByText('Aucune décision sur la période')).toHaveLength(2);
    expect(within(tous!).getByText('Tous les pays')).toBeTruthy();
  });

  it("DSH-004 CA1 : en descente nominative, le siège est prévenu de l'audit", async () => {
    const { choisirPays } = rendre('/pilotage', TABLEAU, {
      ...SUPERVISEUR,
      roles: ['admin_siege'],
    });
    expect(await screen.findByText(/inscrite au journal d'audit/)).toBeTruthy();
    expect(screen.getByText('Aminata TOURE')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Tous les pays' }));
    expect(choisirPays).toHaveBeenCalledWith(null);
  });

  it('DSH-005 : la période et les filtres du périmètre passent au serveur', async () => {
    const { equipe } = rendre('/pilotage?periode=30j&reseau=r2&statut=actif', {
      ...TABLEAU,
      periode: '30j',
      debut: '2026-09-09',
      fin: '2026-10-08',
    });
    await screen.findByRole('table');
    expect(equipe).toHaveBeenLastCalledWith({ periode: '30j', reseau: 'r2', statut: 'actif' });
    expect(screen.getAllByText('Du 9 septembre au 8 octobre').length).toBeGreaterThan(0);
    // Hors semaine, pas de flèches de semaine.
    expect(screen.queryByRole('button', { name: 'Semaine précédente' })).toBeNull();
    // Une liste n'apparaît que si elle offre un choix : une seule zone, pas de liste « Zone ».
    expect(screen.queryByLabelText('Zone')).toBeNull();
    expect(screen.getByLabelText('Réseau')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Effacer les filtres' }));
    expect(equipe).toHaveBeenLastCalledWith({});
  });

  it('RPT-019 : exporter le tableau ou les rapports, avec la période et les filtres', async () => {
    URL.createObjectURL = vi.fn(() => 'blob:export');
    URL.revokeObjectURL = vi.fn();
    const { exporter } = rendre('/pilotage?periode=30j&reseau=r2&par=reseau', {
      ...TABLEAU,
      periode: '30j',
      debut: '2026-09-09',
      fin: '2026-10-08',
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Exporter' }));
    const menu = await screen.findByRole('menu');
    const choix = within(menu).getAllByRole('menuitem');
    expect(choix.map((x) => x.textContent)).toEqual([
      'Indicateurs par déléguéClasseur Excel',
      'Indicateurs par déléguéFichier CSV',
      'Rapports de visiteClasseur Excel',
      'Rapports de visiteFichier CSV',
    ]);
    fireEvent.click(choix[3]!);
    // Le regroupement ne change pas l'export ; la période et les filtres, si.
    await waitFor(() =>
      expect(exporter).toHaveBeenCalledWith({
        periode: '30j',
        reseau: 'r2',
        contenu: 'rapports',
        fichier: 'csv',
      }),
    );
  });
});
