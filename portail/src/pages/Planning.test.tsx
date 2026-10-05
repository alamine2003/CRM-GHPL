import type { ClientApi, Semaine, Visite } from '@innov/api-client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createEvent, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ContexteSession, type Session } from '../contexteSession';
import i18n from '../i18n';
import Planning from './Planning';

const VISITE: Visite = {
  id: 'v1',
  date: '2026-10-27',
  heure: null,
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
  objectif: '',
  note: '',
  statut: 'prevue',
  manquants: ['heure', 'objectif'],
  passage: null,
  ordre: 1,
};

const SEMAINE: Semaine = {
  semaine: '2026-10-26',
  precedente: '2026-10-19',
  suivante: '2026-11-02',
  courante: false,
  jours: [
    { date: '2026-10-26', ferie: null, planifiable: true },
    { date: '2026-10-27', ferie: null, planifiable: true },
    { date: '2026-10-28', ferie: null, planifiable: true },
    { date: '2026-10-29', ferie: null, planifiable: true },
    { date: '2026-10-30', ferie: 'Fête fictive', planifiable: false },
  ],
  planning: { id: 'pl1', semaine: '2026-10-26', statut: 'brouillon', cree_le: '' },
  peut_creer: false,
  modifiable: true,
  visites: [VISITE],
  passages: [],
  absences: [],
  controles: {
    bloquants: [
      {
        code: 'incomplete',
        gravite: 'bloquant',
        date: '2026-10-27',
        visites: ['v1'],
        manquants: ['heure', 'objectif'],
      },
    ],
    signalements: [],
    objectifs: [{ date: '2026-10-27', visites: 1, min: 6, max: 10 }],
  },
  kilometrage: { total_km: 12.5, sans_coordonnees: 0, jours: [] },
  reprenables: 0,
  reseaux: [{ id: 'r1', libelle: 'Cardio' }],
};

const LISTES = [
  {
    poste: { id: 'po1', libelle: 'Poste fictif' },
    cibles: [
      {
        id: 'c2',
        poste: 'po1',
        frequence: 1,
        debut: '2026-01-01',
        prospect: {
          id: 'p2',
          civilite: 'dr',
          prenom: 'Moussa',
          nom: 'EXEMPLE',
          type_libelle: 'Médecin',
          specialite_libelle: 'Cardiologie',
          potentiel: 'B',
          lieu_principal: null,
        },
      },
    ],
  },
];

function rendre(client: Partial<Record<keyof ClientApi, unknown>>) {
  const session = { etat: { statut: 'chargement' }, client } as unknown as Session;
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <ContexteSession.Provider value={session}>
        <Planning />
      </ContexteSession.Provider>
    </QueryClientProvider>,
  );
}

/** Glisser-déposer simulé : jsdom n'a pas de DataTransfer. */
function deposer(source: HTMLElement, cible: HTMLElement) {
  const donnees: Record<string, string> = {};
  const transfert = {
    setData: (f: string, v: string) => (donnees[f] = v),
    getData: (f: string) => donnees[f] ?? '',
    get types() {
      return Object.keys(donnees);
    },
    dropEffect: 'none',
    effectAllowed: 'all',
  };
  fireEvent.dragStart(source, { dataTransfer: transfert });
  fireEvent.dragOver(cible, { dataTransfer: transfert });
  const evenement = createEvent.drop(cible, { dataTransfer: transfert });
  fireEvent(cible, evenement);
}

beforeEach(async () => {
  await i18n.changeLanguage('fr');
});

describe('PLN-006 : vue semaine du portail', () => {
  it('CA1 : chaque jour montre son nombre de visites ; le statut et les kilomètres sont dits', async () => {
    rendre({
      plannings: { semaine: vi.fn(async () => SEMAINE) },
      ciblage: { mesListes: vi.fn(async () => LISTES) },
    });
    expect(await screen.findByText('En préparation')).toBeTruthy();
    expect(screen.getByLabelText('1 visite, objectif 6 à 10')).toBeTruthy();
    expect(screen.getByText("≈ 12,5 km estimés, à vol d'oiseau")).toBeTruthy();
    expect(screen.getByText('Férié · Fête fictive')).toBeTruthy();
    // Contrôles : la visite à compléter est dite.
    expect(screen.getByText('mar. 27 : visite à compléter (Heure, Objectif)')).toBeTruthy();
  });

  it('PLN-005 CA1 : un prospect glissé sur un jour devient une visite', async () => {
    const poser = vi.fn(async () => []);
    rendre({
      plannings: { semaine: vi.fn(async () => SEMAINE), poser },
      ciblage: { mesListes: vi.fn(async () => LISTES) },
    });
    const prospect = await screen.findByText('Dr Moussa EXEMPLE');
    const jeudi = screen.getByLabelText('jeudi 29');
    deposer(prospect.closest('[draggable="true"]') as HTMLElement, jeudi);
    await waitFor(() => expect(poser).toHaveBeenCalledWith('pl1', '2026-10-29', ['p2']));
  });

  it('une visite glissée sur un autre jour y est déplacée ; le jour férié la refuse', async () => {
    const modifier = vi.fn(async () => VISITE);
    rendre({
      plannings: { semaine: vi.fn(async () => SEMAINE) },
      visites: { modifier },
      ciblage: { mesListes: vi.fn(async () => LISTES) },
    });
    const carte = (await screen.findByText('Dr Awa FICTIF')).closest('button')!;
    deposer(carte, screen.getByLabelText('vendredi 30'));
    expect(modifier).not.toHaveBeenCalled();
    deposer(carte, screen.getByLabelText('mercredi 28'));
    await waitFor(() => expect(modifier).toHaveBeenCalledWith('v1', { date: '2026-10-28' }));
  });

  it('au clavier, « Poser » propose les jours planifiables', async () => {
    const poser = vi.fn(async () => []);
    rendre({
      plannings: { semaine: vi.fn(async () => SEMAINE), poser },
      ciblage: { mesListes: vi.fn(async () => LISTES) },
    });
    fireEvent.click(await screen.findByLabelText('Poser Dr Moussa EXEMPLE sur un jour'));
    const menu = await screen.findByRole('menu');
    expect(within(menu).queryByText('ven. 30')).toBeNull();
    fireEvent.click(within(menu).getByText('lun. 26'));
    await waitFor(() => expect(poser).toHaveBeenCalledWith('pl1', '2026-10-26', ['p2']));
  });
});
