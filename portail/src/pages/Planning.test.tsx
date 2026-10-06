import type { ClientApi, Semaine, Visite } from '@innov/api-client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import axe from 'axe-core';
import { createEvent, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ContexteNotifications } from '../contexteNotifications';
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
  debut_le: null,
  sans_gps: false,
  distance_debut_m: null,
};

const SEMAINE: Semaine = {
  semaine: '2026-10-26',
  precedente: '2026-10-19',
  suivante: '2026-11-02',
  courante: false,
  fuseau: 'Africa/Dakar',
  jours: [
    { date: '2026-10-26', ferie: null, planifiable: true },
    { date: '2026-10-27', ferie: null, planifiable: true },
    { date: '2026-10-28', ferie: null, planifiable: true },
    { date: '2026-10-29', ferie: null, planifiable: true },
    { date: '2026-10-30', ferie: 'Fête fictive', planifiable: false },
  ],
  planning: {
    id: 'pl1',
    semaine: '2026-10-26',
    statut: 'brouillon',
    cree_le: '',
    soumis_le: null,
    en_retard: false,
    echeance: '2026-10-22T18:00:00Z',
    decision: null,
    numero_version: null,
    motif_version: null,
    ferme: false,
    reouvert_le: null,
  },
  peut_creer: false,
  modifiable: true,
  visites: [VISITE],
  passages: [],
  activites: [],
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
  fermee: false,
  demande_envoyee: false,
  reseaux: [{ id: 'r1', libelle: 'Cardio' }],
  approbation: null,
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

/** Les notifications passent par le cadre de l'application : ici, on les relève. */
const notifier = vi.fn();

function rendre(client: Partial<Record<keyof ClientApi, unknown>>) {
  const session = { etat: { statut: 'chargement' }, client } as unknown as Session;
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <ContexteNotifications.Provider value={notifier}>
        <ContexteSession.Provider value={session}>
          <MemoryRouter>
            <Planning />
          </MemoryRouter>
        </ContexteSession.Provider>
      </ContexteNotifications.Provider>
    </QueryClientProvider>,
  );
}

/** WCAG 2.1 A et AA ; le contraste, que jsdom ne calcule pas, est vérifié dans le thème. */
async function violations(conteneur: Element) {
  const resultat = await axe.run(conteneur, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
    rules: { 'color-contrast': { enabled: false } },
  });
  return resultat.violations.map(
    (v) => `${v.id} : ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`,
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
  notifier.mockClear();
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

  it('PLN-008 : la soumission attend la correction des points bloquants', async () => {
    rendre({
      plannings: { semaine: vi.fn(async () => SEMAINE) },
      ciblage: { mesListes: vi.fn(async () => LISTES) },
    });
    const bouton = await screen.findByRole('button', { name: 'Soumettre le planning' });
    expect((bouton as HTMLButtonElement).disabled).toBe(true);
    expect(
      screen.getByText('Le point bloquant listé dans « À vérifier » empêche la soumission.'),
    ).toBeTruthy();
  });

  it('PLN-008 CA1, RG-016 : après confirmation, le planning part, en retard si l’échéance est passée', async () => {
    const pret = {
      ...SEMAINE,
      planning: { ...SEMAINE.planning!, echeance: '2026-01-01T18:00:00Z' },
      controles: { ...SEMAINE.controles!, bloquants: [] },
    };
    const soumettre = vi.fn(async () => ({
      ...SEMAINE.planning!,
      statut: 'soumis' as const,
      en_retard: true,
    }));
    rendre({
      plannings: { semaine: vi.fn(async () => pret), soumettre },
      ciblage: { mesListes: vi.fn(async () => LISTES) },
    });
    expect(await screen.findByText(/^Échéance passée : /)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Soumettre le planning' }));
    const dialogue = await screen.findByRole('dialog');
    expect(
      within(dialogue).getByText("L'échéance est passée : il sera marqué en retard."),
    ).toBeTruthy();
    expect(soumettre).not.toHaveBeenCalled();
    fireEvent.click(within(dialogue).getByRole('button', { name: 'Oui, soumettre' }));
    await waitFor(() => expect(soumettre).toHaveBeenCalledWith('pl1'));
  });

  it('un planning soumis dit sa date de soumission et son retard', async () => {
    rendre({
      plannings: {
        semaine: vi.fn(async () => ({
          ...SEMAINE,
          modifiable: false,
          controles: null,
          planning: {
            ...SEMAINE.planning!,
            statut: 'soumis' as const,
            soumis_le: '2026-10-23T09:30:00Z',
            en_retard: true,
          },
        })),
      },
    });
    expect(await screen.findByText(/^Soumis le /)).toBeTruthy();
    expect(screen.getByText('En retard')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Soumettre le planning' })).toBeNull();
  });

  it('0.3.9 : la semaine fermée sans planning se fait rouvrir sur demande', async () => {
    const demanderReouverture = vi.fn(async () => ({ destinataires: 1 }));
    const fermee = {
      ...SEMAINE,
      planning: null,
      visites: [],
      controles: null,
      kilometrage: null,
      modifiable: false,
      fermee: true,
    };
    const semaine = vi
      .fn()
      .mockResolvedValueOnce(fermee)
      .mockResolvedValue({ ...fermee, demande_envoyee: true });
    const { container } = rendre({
      plannings: { semaine, demanderReouverture },
      ciblage: { mesListes: vi.fn(async () => LISTES) },
    });
    expect(await screen.findByText(/elle est fermée/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Préparer cette semaine' })).toBeNull();
    expect(await violations(container)).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: 'Demander la réouverture' }));
    await waitFor(() => expect(demanderReouverture).toHaveBeenCalledWith(SEMAINE.semaine));
    expect(notifier).toHaveBeenCalledWith('Demande envoyée à votre superviseur.');
    expect(await screen.findByText(/vous serez prévenu/)).toBeTruthy();
  });

  it('0.3.9 : rouvert par le superviseur, la réouverture reste dite', async () => {
    rendre({
      plannings: {
        semaine: vi.fn(async () => ({
          ...SEMAINE,
          planning: { ...SEMAINE.planning!, reouvert_le: '2026-10-27T09:30:00Z' },
        })),
      },
      ciblage: { mesListes: vi.fn(async () => LISTES) },
    });
    expect(await screen.findByText('Réouverture')).toBeTruthy();
    expect(screen.getByText(/le planning n'a pas été fait à temps/)).toBeTruthy();
  });

  it('accessibilité : la semaine en préparation et la confirmation de soumission (WCAG 2.1 AA)', async () => {
    const pret = { ...SEMAINE, controles: { ...SEMAINE.controles!, bloquants: [] } };
    const { container } = rendre({
      plannings: { semaine: vi.fn(async () => pret) },
      ciblage: { mesListes: vi.fn(async () => LISTES) },
    });
    await screen.findByText('Dr Moussa EXEMPLE');
    expect(await violations(container)).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: 'Soumettre le planning' }));
    expect(await violations(await screen.findByRole('dialog'))).toEqual([]);
  });

  it('PLN-005 CA2 : la reprise dit les visites reprises et les jours sautés', async () => {
    const reprendre = vi.fn(async () => ({
      copiees: 2,
      ignorees: [{ visite: 'x', date: '2026-10-30', raison: 'jour_ferie' as const }],
    }));
    rendre({
      plannings: {
        semaine: vi.fn(async () => ({ ...SEMAINE, visites: [], reprenables: 3 })),
        reprendre,
      },
      ciblage: { mesListes: vi.fn(async () => LISTES) },
    });
    const bouton = await screen.findByRole('button', { name: /Reprendre/ });
    fireEvent.click(bouton);
    await waitFor(() =>
      expect(notifier).toHaveBeenCalledWith(
        '2 visites reprises de la semaine précédente. ' +
          "1 visite non reprise (ven. 30 : jour férié ou d'absence).",
      ),
    );
    expect(reprendre).toHaveBeenCalledTimes(1);
  });

  it('PLN-008 : le message de soumission suit la réponse du serveur, pas l’horloge du navigateur', async () => {
    // Échéance passée pour le navigateur, mais le serveur l'a reçue à temps.
    const pret = {
      ...SEMAINE,
      planning: { ...SEMAINE.planning!, echeance: '2026-01-01T18:00:00Z' },
      controles: { ...SEMAINE.controles!, bloquants: [] },
    };
    const soumettre = vi.fn(async () => ({
      ...SEMAINE.planning!,
      statut: 'soumis' as const,
      en_retard: false,
    }));
    rendre({
      plannings: { semaine: vi.fn(async () => pret), soumettre },
      ciblage: { mesListes: vi.fn(async () => LISTES) },
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Soumettre le planning' }));
    fireEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Oui, soumettre' }),
    );
    await waitFor(() =>
      expect(notifier).toHaveBeenCalledWith('Planning soumis à votre superviseur.'),
    );
  });
});
