import { type ClientApi, ErreurApi, type Semaine, type Visite } from '@innov/api-client';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import EcranSemaine from '../app/semaine';
import i18n from '../src/i18n';
import { ContexteSession, type Session } from '../src/session';
import { VueDetail, VueJour } from '../src/Itineraire';
import { lireHeure } from '../src/Visites';

// La base chiffrée (SQLCipher) n'existe que sur le téléphone : une mémoire la remplace ici.
const mockMemoire = new Map<string, { valeur: unknown; maj: string }>();
jest.mock('../src/baseLocale', () => ({
  lire: jest.fn(async (cle: string) => mockMemoire.get(cle) ?? null),
  ecrire: jest.fn(async (cle: string, valeur: unknown) =>
    mockMemoire.set(cle, { valeur, maj: '2026-10-26T08:00:00.000Z' }),
  ),
  oublier: jest.fn(async (cle: string) => mockMemoire.delete(cle)),
  effacer: jest.fn(async () => mockMemoire.clear()),
}));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'uuid-du-telephone' }));

const mockPousser = jest.fn();
const mockParametres: { jour?: string; modifier?: string } = {};
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPousser, navigate: mockPousser }),
  useLocalSearchParams: () => mockParametres,
}));

// Le gabarit (en-tête, onglets) est testé ailleurs : ici, le contenu de la semaine.
jest.mock('../src/Ecran', () => ({
  Ecran: ({ children, surTitre }: { children: ReactNode; surTitre?: string }) => {
    const { Text } = jest.requireActual('react-native');
    return (
      <>
        <Text>{surTitre}</Text>
        {children}
      </>
    );
  },
}));

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
  planning: null,
  peut_creer: true,
  modifiable: false,
  visites: [],
  passages: [],
  absences: [],
  controles: null,
  kilometrage: null,
  reprenables: 0,
  reseaux: [{ id: 'r1', libelle: 'Cardio' }],
};

const PLANNING = {
  id: 'pl1',
  semaine: '2026-10-26',
  statut: 'brouillon' as const,
  cree_le: '',
  soumis_le: null as string | null,
  en_retard: false,
  echeance: '2026-10-22T18:00:00Z',
};

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

/** Un confrère vu au même lieu le même jour, à heure fixe. */
const CONFRERE: Visite = {
  ...VISITE,
  id: 'v2',
  heure: '10:00',
  prospect: { ...VISITE.prospect!, id: 'p2', prenom: 'Moussa', nom: 'EXEMPLE' },
  objectif: 'Échantillons',
  manquants: [],
  ordre: 2,
};

const EN_PREPARATION: Semaine = {
  ...SEMAINE,
  peut_creer: false,
  modifiable: true,
  planning: PLANNING,
  visites: [VISITE],
};

async function rendre(
  plannings: Partial<ClientApi['plannings']>,
  autres: Partial<Record<keyof ClientApi, unknown>> = {},
) {
  const session = {
    etat: { statut: 'chargement' },
    client: { plannings, ...autres } as unknown as ClientApi,
  } as Session;
  return render(
    <ContexteSession.Provider value={session}>
      <EcranSemaine />
    </ContexteSession.Provider>,
  );
}

beforeEach(async () => {
  mockMemoire.clear();
  await i18n.changeLanguage('fr');
});

test('PLN-001 CA2 : la semaine affiche ses jours ouvrés et le jour férié, non planifiable', async () => {
  await rendre({ semaine: jest.fn(async () => SEMAINE) });
  expect(await screen.findByText('Férié · Fête fictive')).toBeTruthy();
  expect(screen.getByText('Lundi 26 oct.')).toBeTruthy();
  expect(screen.getByText(/Le jour férié ne se planifie pas/)).toBeTruthy();
  expect(screen.getByText('Du 26 oct. au 30 oct.')).toBeTruthy();
});

test('PLN-001 CA1 : le délégué prépare sa semaine, une seule fois', async () => {
  const semaine = jest
    .fn()
    .mockResolvedValueOnce(SEMAINE)
    .mockResolvedValue({
      ...SEMAINE,
      peut_creer: false,
      modifiable: true,
      planning: PLANNING,
    });
  const creer = jest.fn(async () => ({}));
  await rendre({ semaine, creer } as unknown as Partial<ClientApi['plannings']>);
  await fireEvent.press(await screen.findByText('Préparer cette semaine'));
  expect(creer).toHaveBeenCalledWith('2026-10-26');
  expect(await screen.findByText('En préparation')).toBeTruthy();
  expect(screen.queryByText('Préparer cette semaine')).toBeNull();
});

test('les flèches mènent à la semaine voisine', async () => {
  const semaine = jest.fn(async () => SEMAINE);
  await rendre({ semaine });
  await fireEvent.press(await screen.findByLabelText('Semaine suivante'));
  expect(semaine).toHaveBeenLastCalledWith('2026-11-02');
  await fireEvent.press(screen.getByLabelText('Semaine précédente'));
  expect(semaine).toHaveBeenLastCalledWith('2026-10-19');
});

test('PLN-002 CA1 : une visite incomplète montre ce qui reste à compléter', async () => {
  await rendre({ semaine: jest.fn(async () => EN_PREPARATION) });
  expect(await screen.findByText('Dr Awa FICTIF')).toBeTruthy();
  expect(screen.getByText('Clinique Fictive')).toBeTruthy();
  expect(screen.getByText('À compléter : Heure, Objectif')).toBeTruthy();
  expect(screen.getByText('1 visite planifiée, 1 à compléter.')).toBeTruthy();
  // Quatre jours planifiables, aucun ajout sur le jour férié.
  expect(screen.getAllByText('Ajouter une visite')).toHaveLength(4);
});

test('PLN-002 : le délégué ajoute une visite depuis sa liste cible', async () => {
  const semaine = jest.fn(async () => ({ ...EN_PREPARATION, visites: [] }));
  const ajouterVisite = jest.fn(async () => VISITE);
  const mesListes = jest.fn(async () => [
    {
      poste: { id: 'po1', libelle: 'Poste fictif' },
      cibles: [
        {
          id: 'c1',
          prospect: {
            id: 'p1',
            civilite: 'dr',
            prenom: 'Awa',
            nom: 'FICTIF',
            type_libelle: 'Médecin',
            specialite_libelle: 'Cardiologie',
            potentiel: 'A',
            lieu_principal: null,
          },
        },
      ],
    },
  ]);
  const duProspect = jest.fn(async () => [
    {
      id: 'x1',
      actif: true,
      principal: true,
      etablissement: { id: 'e1', nom: 'Clinique Fictive' },
    },
  ]);
  await rendre({ semaine, ajouterVisite } as unknown as Partial<ClientApi['plannings']>, {
    ciblage: { mesListes },
    exercices: { duProspect },
  });
  await fireEvent.press((await screen.findAllByText('Ajouter une visite'))[1]!);
  await fireEvent.press(await screen.findByText('Dr Awa FICTIF'));
  // Un seul lieu d'exercice : il est retenu d'office.
  expect(await screen.findByText('Clinique Fictive')).toBeTruthy();
  await fireEvent.changeText(screen.getByLabelText('Heure'), '9h30');
  await fireEvent(screen.getByLabelText('Heure'), 'blur');
  await fireEvent.changeText(screen.getByLabelText('Objectif'), 'Présenter le produit');
  await fireEvent.press(screen.getByText('Enregistrer'));
  expect(ajouterVisite).toHaveBeenCalledWith('pl1', {
    id: 'uuid-du-telephone',
    date: '2026-10-27',
    heure: '09:30',
    prospect: 'p1',
    etablissement: 'e1',
    reseau: 'r1',
    objectif: 'Présenter le produit',
    note: '',
  });
  expect(await screen.findByText('Visite ajoutée.')).toBeTruthy();
});

test('PLN-002 : une visite se retire tant que le planning est en préparation', async () => {
  const retirer = jest.fn(async () => VISITE);
  await rendre(
    { semaine: jest.fn(async () => EN_PREPARATION) },
    {
      visites: { retirer },
      exercices: { duProspect: jest.fn(async () => []) },
    },
  );
  await fireEvent.press(await screen.findByText('Dr Awa FICTIF'));
  await fireEvent.press(await screen.findByText('Retirer cette visite'));
  expect(retirer).toHaveBeenCalledWith('v1');
  expect(await screen.findByText('Visite retirée.')).toBeTruthy();
});

test('un planning soumis ne propose plus d’ajout ni de modification', async () => {
  await rendre({
    semaine: jest.fn(async () => ({
      ...EN_PREPARATION,
      modifiable: false,
      planning: { ...PLANNING, statut: 'soumis' as const },
    })),
  });
  expect(await screen.findByText('Dr Awa FICTIF')).toBeTruthy();
  expect(screen.queryByText('Ajouter une visite')).toBeNull();
  expect(screen.getByText('Dr Awa FICTIF')).toBeTruthy();
});

test('l’heure se saisit comme on la dit', () => {
  expect(lireHeure('9h30')).toBe('09:30');
  expect(lireHeure('14:00')).toBe('14:00');
  expect(lireHeure('8h')).toBe('08:00');
  expect(lireHeure('1430')).toBe('14:30');
  expect(lireHeure('25:00')).toBeNull();
  expect(lireHeure('midi')).toBeNull();
});

test('PLN-003 : deux visites au même lieu proposent un passage, qui se crée', async () => {
  const regrouper = jest.fn(async () => ({}));
  await rendre({
    semaine: jest.fn(async () => ({ ...EN_PREPARATION, visites: [VISITE, CONFRERE] })),
    regrouper,
  } as unknown as Partial<ClientApi['plannings']>);
  await fireEvent.press(
    await screen.findByText('Regrouper les 2 visites à Clinique Fictive en un passage'),
  );
  expect(regrouper).toHaveBeenCalledWith('pl1', ['v1', 'v2']);
  expect(await screen.findByText(/Passage créé/)).toBeTruthy();
});

test('PLN-003 CA1 : un passage s’affiche « Établissement · n prescripteurs »', async () => {
  const dissocier = jest.fn(async () => ({}));
  const passage = {
    id: 'pa1',
    date: '2026-10-27',
    heure: '10:00',
    etablissement: { id: 'e1', nom: 'Clinique Fictive' },
    visites: ['v1', 'v2'],
  };
  await rendre(
    {
      semaine: jest.fn(async () => ({
        ...EN_PREPARATION,
        passages: [passage],
        visites: [
          { ...VISITE, passage: 'pa1', heure: '10:00' },
          { ...CONFRERE, passage: 'pa1' },
        ],
      })),
    },
    { passages: { dissocier } },
  );
  expect(await screen.findByLabelText('Clinique Fictive · 2 prescripteurs')).toBeTruthy();
  expect(screen.getByText('Passage · 2 prescripteurs')).toBeTruthy();
  // CA2 : chaque visite garde son prospect.
  expect(screen.getByText('Dr Awa FICTIF')).toBeTruthy();
  expect(screen.getByText('Dr Moussa EXEMPLE')).toBeTruthy();
  expect(screen.queryByText(/Regrouper/)).toBeNull();
  await fireEvent.press(screen.getByLabelText('Dissocier le passage à Clinique Fictive'));
  expect(dissocier).toHaveBeenCalledWith('pa1');
});

test('PLN-009 : le délégué déclare une demi-journée de formation', async () => {
  const declarerAbsence = jest.fn(async () => ({}));
  await rendre({
    semaine: jest.fn(async () => EN_PREPARATION),
    declarerAbsence,
  } as unknown as Partial<ClientApi['plannings']>);
  await fireEvent.press(await screen.findByLabelText('Déclarer une absence le jeudi 29 octobre'));
  // « Autre » exige un motif ; la formation, non.
  await fireEvent.press(screen.getByText('Autre'));
  expect(screen.getByText('Une absence « Autre » demande un motif.')).toBeTruthy();
  await fireEvent.press(screen.getByText('Formation'));
  await fireEvent.press(screen.getByText('Matin'));
  await fireEvent.press(screen.getByText('Enregistrer'));
  expect(declarerAbsence).toHaveBeenCalledWith('pl1', {
    id: 'uuid-du-telephone',
    date: '2026-10-29',
    type: 'formation',
    periode: 'matin',
    commentaire: '',
  });
  expect(await screen.findByText('Absence déclarée.')).toBeTruthy();
});

test('PLN-009 : une journée entière d’absence ne propose plus d’ajouter une visite', async () => {
  await rendre({
    semaine: jest.fn(async () => ({
      ...EN_PREPARATION,
      visites: [],
      absences: [
        { id: 'a1', date: '2026-10-28', periode: 'journee' as const, type: 'conge' as const },
      ],
    })),
  });
  expect(await screen.findByText('Congé · Journée')).toBeTruthy();
  // Trois jours planifiables restent ouverts aux visites (lundi, mardi, jeudi).
  expect(screen.getAllByText('Ajouter une visite')).toHaveLength(3);
});

test('l’ordre : seules les visites sans heure se déplacent', async () => {
  const ordonner = jest.fn(async () => []);
  await rendre({
    semaine: jest.fn(async () => ({
      ...EN_PREPARATION,
      visites: [CONFRERE, { ...VISITE, ordre: 2 }],
    })),
    ordonner,
  } as unknown as Partial<ClientApi['plannings']>);
  await fireEvent.press(await screen.findByLabelText('Réordonner les visites du mardi 27 octobre'));
  expect(screen.getByText(/Les visites à heure fixe se rangent/)).toBeTruthy();
  // Une seule paire de flèches : la visite à 10 h n'en a pas.
  expect(screen.getAllByLabelText('Monter')).toHaveLength(1);
  await fireEvent.press(screen.getByLabelText('Monter'));
  expect(ordonner).toHaveBeenCalledWith('pl1', '2026-10-27', ['v1', 'v2']);
});

test('PLN-004 CA1 : deux visites à la même heure sont à corriger avant de soumettre', async () => {
  const semaine = {
    ...EN_PREPARATION,
    visites: [{ ...VISITE, heure: '10:00', manquants: [] }, CONFRERE],
    controles: {
      bloquants: [
        {
          code: 'meme_heure' as const,
          gravite: 'bloquant' as const,
          date: '2026-10-27',
          visites: ['v1', 'v2'],
          heure: '10:00',
        },
      ],
      signalements: [],
      objectifs: [{ date: '2026-10-27', visites: 2, min: 6, max: 10 }],
    },
  };
  await rendre(
    { semaine: jest.fn(async () => semaine) },
    { exercices: { duProspect: jest.fn(async () => []) } },
  );
  expect(await screen.findByText('À corriger avant de soumettre')).toBeTruthy();
  expect(screen.getByText('mar. 27 : 2 visites à 10:00')).toBeTruthy();
  // Chaque visite concernée porte la marque ; le jour montre son objectif.
  expect(screen.getAllByText("Même heure qu'une autre visite")).toHaveLength(2);
  expect(screen.getByLabelText('2 visites, objectif 6 à 10')).toBeTruthy();
  // Toucher le point ouvre la visite à corriger.
  await fireEvent.press(screen.getByText('mar. 27 : 2 visites à 10:00'));
  expect(await screen.findByText('Modifier la visite')).toBeTruthy();
});

test('PLN-004 CA2 : les signalements sont dits, sans rien bloquer', async () => {
  const semaine = {
    ...EN_PREPARATION,
    visites: [{ ...VISITE, heure: '10:00', manquants: [] }],
    controles: {
      bloquants: [],
      signalements: [
        {
          code: 'seuil_bas' as const,
          gravite: 'signalement' as const,
          date: '2026-10-26',
          visites: [],
          nombre: 0,
          min: 6,
          max: 10,
        },
        {
          code: 'seuil_bas' as const,
          gravite: 'signalement' as const,
          date: '2026-10-27',
          visites: [],
          nombre: 1,
          min: 6,
          max: 10,
        },
        {
          code: 'hors_cible' as const,
          gravite: 'signalement' as const,
          date: '2026-10-27',
          visites: ['v1'],
        },
        {
          code: 'a_non_planifie' as const,
          gravite: 'signalement' as const,
          date: '2026-10-30',
          visites: [],
          mois: '2026-10',
          prospects: [
            { id: 'p8', nom: 'Awa UN' },
            { id: 'p9', nom: 'Binta DEUX' },
            { id: 'p10', nom: 'Coumba TROIS' },
            { id: 'p11', nom: 'Dior QUATRE' },
          ],
        },
      ],
      objectifs: [],
    },
  };
  await rendre({ semaine: jest.fn(async () => semaine) });
  expect(await screen.findByText('Signalé à votre superviseur')).toBeTruthy();
  expect(screen.queryByText(/À corriger/)).toBeNull();
  expect(screen.getByText('Sous le minimum de visites : lun. 26, mar. 27')).toBeTruthy();
  expect(screen.getByText('mar. 27 : prospect hors de votre liste cible')).toBeTruthy();
  expect(screen.getByText('Hors liste cible')).toBeTruthy();
  expect(
    screen.getByText(
      '4 prospects A sans visite en octobre : Awa UN, Binta DEUX, Coumba TROIS et 1 autre',
    ),
  ).toBeTruthy();
});

const MES_LISTES = [
  {
    poste: { id: 'po1', libelle: 'Poste fictif' },
    cibles: [
      {
        id: 'c1',
        prospect: {
          ...VISITE.prospect!,
          lieu_principal: { id: 'e1', libelle: 'Clinique Fictive' },
        },
      },
      {
        id: 'c2',
        prospect: { ...CONFRERE.prospect!, lieu_principal: null },
      },
    ],
  },
];

test('PLN-005 CA1 : des prospects de la liste cible se posent sur un jour', async () => {
  const poser = jest.fn(async () => []);
  await rendre(
    {
      semaine: jest.fn(async () => ({ ...EN_PREPARATION, visites: [VISITE] })),
      poser,
    } as unknown as Partial<ClientApi['plannings']>,
    { ciblage: { mesListes: jest.fn(async () => MES_LISTES) } },
  );
  await fireEvent.press(await screen.findByText('Ajouter depuis ma liste cible'));
  // Awa est déjà prévue mardi : masquée tant que « Pas encore prévus » est actif.
  expect(await screen.findByText('Dr Moussa EXEMPLE')).toBeTruthy();
  expect(screen.queryByText('Dr Awa FICTIF')).toBeNull();
  await fireEvent.press(screen.getByText('Pas encore prévus'));
  expect(screen.getByText('Déjà prévu : mar. 27')).toBeTruthy();
  await fireEvent.press(screen.getByText('jeu. 29'));
  await fireEvent.press(screen.getByText('Dr Moussa EXEMPLE'));
  await fireEvent.press(screen.getByText('Dr Awa FICTIF'));
  await fireEvent.press(screen.getByText('Poser 2 visites le jeudi 29'));
  expect(poser).toHaveBeenCalledWith('pl1', '2026-10-29', ['p2', 'p1']);
  expect(await screen.findByText(/2 visites posées le jeudi 29/)).toBeTruthy();
});

test('PLN-005 CA2 : une semaine vide reprend la précédente', async () => {
  const reprendre = jest.fn(async () => ({
    copiees: 5,
    ignorees: [{ visite: 'x', date: '2026-10-30', raison: 'jour_ferie' as const }],
  }));
  await rendre({
    semaine: jest.fn(async () => ({ ...EN_PREPARATION, visites: [], reprenables: 6 })),
    reprendre,
  } as unknown as Partial<ClientApi['plannings']>);
  await fireEvent.press(await screen.findByText('Reprendre ces 6 visites'));
  expect(screen.getByText(/La semaine précédente comptait 6 visites/)).toBeTruthy();
  expect(reprendre).toHaveBeenCalledWith('pl1');
  expect(
    await screen.findByText(
      "5 visites reprises de la semaine précédente. 1 visite non reprise (ven. 30 : jour férié ou d'absence).",
    ),
  ).toBeTruthy();
});

test('PLN-005 : une visite se copie sur un autre jour', async () => {
  const copier = jest.fn(async () => VISITE);
  await rendre(
    { semaine: jest.fn(async () => EN_PREPARATION) },
    { visites: { copier }, exercices: { duProspect: jest.fn(async () => []) } },
  );
  await fireEvent.press(await screen.findByText('Dr Awa FICTIF'));
  expect(await screen.findByText('Copier vers')).toBeTruthy();
  // La première pilule « jeu. 29 » choisit le jour de la visite ; la seconde copie.
  await fireEvent.press(screen.getAllByText('jeu. 29')[1]!);
  expect(copier).toHaveBeenCalledWith('v1', '2026-10-29');
  expect(await screen.findByText('Visite copiée le jeu. 29.')).toBeTruthy();
});

test('PLN-006 : un planning soumis s’ouvre en détail, pas en saisie', async () => {
  mockPousser.mockClear();
  await rendre({
    semaine: jest.fn(async () => ({
      ...EN_PREPARATION,
      modifiable: false,
      planning: { ...PLANNING, statut: 'soumis' as const },
    })),
  });
  await fireEvent.press(await screen.findByText('Dr Awa FICTIF'));
  expect(mockPousser).toHaveBeenCalledWith({
    pathname: '/visite/[id]',
    params: { id: 'v1', jour: '2026-10-27' },
  });
  // Le jour s'ouvre en vue jour.
  await fireEvent.press(screen.getByText('Mardi'));
  expect(mockPousser).toHaveBeenLastCalledWith('/jour/2026-10-27');
});

const KM = {
  total_km: 63.4,
  sans_coordonnees: 1,
  jours: [
    {
      date: '2026-10-27',
      km: 63.4,
      sans_coordonnees: 1,
      etapes: [
        { visite: 'v2', km: null },
        { visite: 'v1', km: 63.4 },
        { visite: 'v3', km: null },
      ],
    },
  ],
};

async function rendreVue(element: React.ReactElement, semaine: Semaine) {
  const session = {
    etat: { statut: 'chargement' },
    client: { plannings: { semaine: jest.fn(async () => semaine) } } as unknown as ClientApi,
  } as Session;
  return render(<ContexteSession.Provider value={session}>{element}</ContexteSession.Provider>);
}

test('PLN-010 : la semaine donne ses kilomètres estimés, sans montant', async () => {
  await rendre({ semaine: jest.fn(async () => ({ ...EN_PREPARATION, kilometrage: KM })) });
  expect(
    await screen.findByText(
      "≈ 63,4 km estimés cette semaine, à vol d'oiseau. 1 lieu sans coordonnées n'est pas compté.",
    ),
  ).toBeTruthy();
  expect(screen.queryByText(/FCFA|€|\$/)).toBeNull();
});

test('PLN-006 : la vue jour suit l’itinéraire, arrêt par arrêt', async () => {
  const sansLieu = { ...VISITE, id: 'v3', heure: '16:00', etablissement: null, ordre: 3 };
  await rendreVue(<VueJour jour="2026-10-27" />, {
    ...EN_PREPARATION,
    visites: [CONFRERE, { ...VISITE, heure: '11:00', ordre: 2 }, sansLieu],
    kilometrage: KM,
  });
  expect(await screen.findByText('3 visites')).toBeTruthy();
  expect(screen.getByText("≈ 63,4 km estimés, à vol d'oiseau")).toBeTruthy();
  expect(screen.getByText('1')).toBeTruthy();
  expect(screen.getByText('↓ 63,4 km')).toBeTruthy();
  expect(screen.getByText('↓ distance inconnue')).toBeTruthy();
  mockPousser.mockClear();
  await fireEvent.press(screen.getByText('Dr Moussa EXEMPLE'));
  expect(mockPousser).toHaveBeenCalledWith({
    pathname: '/visite/[id]',
    params: { id: 'v2', jour: '2026-10-27' },
  });
});

test('PLN-006 : le détail d’une visite mène à ses fiches et à sa modification', async () => {
  await rendreVue(<VueDetail id="v1" jour="2026-10-27" />, EN_PREPARATION);
  expect(await screen.findByText('Dr Awa FICTIF')).toBeTruthy();
  expect(screen.getByText('Cardiologie')).toBeTruthy();
  expect(screen.getByText('Prévue')).toBeTruthy();
  expect(screen.getByText('À compléter : Heure, Objectif')).toBeTruthy();
  mockPousser.mockClear();
  await fireEvent.press(screen.getByText('Fiche du lieu'));
  expect(mockPousser).toHaveBeenCalledWith('/lieu/e1');
  await fireEvent.press(screen.getByText('Modifier la visite'));
  expect(mockPousser).toHaveBeenLastCalledWith({
    pathname: '/semaine',
    params: { jour: '2026-10-27', modifier: 'v1' },
  });
});

test('PLN-007 : sans réseau, la visite attend sur le téléphone puis part une seule fois', async () => {
  const semaine = jest
    .fn()
    .mockResolvedValueOnce({ ...EN_PREPARATION, visites: [] })
    .mockRejectedValueOnce(new TypeError('Network request failed'))
    .mockResolvedValue({ ...EN_PREPARATION, visites: [VISITE] });
  // Le réseau manque à l'enregistrement et à la relecture qui suit, puis revient.
  const ajouterVisite = jest
    .fn()
    .mockRejectedValueOnce(new TypeError('Network request failed'))
    .mockRejectedValueOnce(new TypeError('Network request failed'))
    .mockResolvedValue(VISITE);
  await rendre({ semaine, ajouterVisite } as unknown as Partial<ClientApi['plannings']>, {
    ciblage: { mesListes: jest.fn(async () => []) },
  });
  await fireEvent.press((await screen.findAllByText('Ajouter une visite'))[1]!);
  await fireEvent.changeText(screen.getByLabelText('Objectif'), 'Présenter le produit');
  await fireEvent.press(screen.getByText('Enregistrer'));
  // Pas de réseau : la semaine gardée s'affiche, la visite attend.
  expect(await screen.findByText(/Pas de réseau : enregistrée sur le téléphone/)).toBeTruthy();
  expect(screen.getByText(/Hors ligne : semaine telle qu/)).toBeTruthy();
  expect(screen.getByText('1 envoi en attente')).toBeTruthy();
  expect(screen.getByText(/Nouvelle visite · mar\. 27/)).toBeTruthy();
  // Le réseau revient : l'envoi part avec le même identifiant, la file se vide.
  await fireEvent.press(screen.getByText('Envoyer maintenant'));
  await waitFor(() => expect(screen.queryByText('1 envoi en attente')).toBeNull());
  expect(screen.getByText('Réseau retrouvé : 1 envoi est parti.')).toBeTruthy();
  expect(screen.queryByText(/Pas de réseau : enregistrée/)).toBeNull();
  expect(ajouterVisite).toHaveBeenCalledTimes(3);
  expect(new Set(ajouterVisite.mock.calls.map((c) => c[1].id))).toEqual(
    new Set(['uuid-du-telephone']),
  );
});

test('PLN-007 CA1 : la saisie en cours est gardée sur le téléphone', async () => {
  await rendre(
    { semaine: jest.fn(async () => EN_PREPARATION) },
    { ciblage: { mesListes: jest.fn(async () => []) } },
  );
  await fireEvent.press((await screen.findAllByText('Ajouter une visite'))[2]!);
  await fireEvent.changeText(screen.getByLabelText('Objectif'), 'Remettre les échantillons');
  await waitFor(() =>
    expect(
      (mockMemoire.get('planning.brouillon')?.valeur as { champs: { objectif: string } })?.champs
        .objectif,
    ).toBe('Remettre les échantillons'),
  );
  // Annuler oublie le brouillon.
  await fireEvent.press(screen.getByText('Annuler'));
  await waitFor(() => expect(mockMemoire.has('planning.brouillon')).toBe(false));
});

test('PLN-007 CA1 : une saisie interrompue se retrouve à la réouverture', async () => {
  mockMemoire.set('planning.brouillon', {
    valeur: {
      objet: 'visite',
      semaine: '2026-10-26',
      champs: {
        date: '2026-10-28',
        heure: '9h',
        prospect: null,
        lieu: null,
        reseau: 'r1',
        objectif: 'Remettre les échantillons',
        note: '',
      },
    },
    maj: '2026-10-26T08:00:00.000Z',
  });
  await rendre(
    { semaine: jest.fn(async () => EN_PREPARATION) },
    { ciblage: { mesListes: jest.fn(async () => []) } },
  );
  expect(await screen.findByText("Une nouvelle visite n'a pas été enregistrée.")).toBeTruthy();
  await fireEvent.press(screen.getByText('Reprendre la saisie'));
  expect(await screen.findByDisplayValue('Remettre les échantillons')).toBeTruthy();
  expect(screen.getByDisplayValue('9h')).toBeTruthy();
});

test('un refus du serveur reste à l’écran, sans mise en attente', async () => {
  const ajouterVisite = jest.fn(async () => {
    throw new ErreurApi(400, 'jour_ferie', 'Ce jour est férié : il ne se planifie pas.');
  });
  await rendre(
    { semaine: jest.fn(async () => EN_PREPARATION), ajouterVisite } as unknown as Partial<
      ClientApi['plannings']
    >,
    { ciblage: { mesListes: jest.fn(async () => []) } },
  );
  await fireEvent.press((await screen.findAllByText('Ajouter une visite'))[0]!);
  await fireEvent.press(screen.getByText('Enregistrer'));
  expect(await screen.findByText('Ce jour est férié : il ne se planifie pas.')).toBeTruthy();
  expect(mockMemoire.has('planning.attente')).toBe(false);
});

// L'échéance se compare à l'heure du téléphone : une date sûrement à venir, une passée.
const A_VENIR = new Date(Date.now() + 7 * 86_400_000).toISOString();
const PASSEE = '2026-01-01T18:00:00Z';

test('PLN-008 CA1 : soumettre avant l’échéance, après confirmation', async () => {
  const soumis = { ...PLANNING, statut: 'soumis' as const, soumis_le: '2026-10-21T09:30:00Z' };
  const semaine = jest
    .fn()
    .mockResolvedValueOnce({ ...EN_PREPARATION, planning: { ...PLANNING, echeance: A_VENIR } })
    .mockResolvedValue({ ...EN_PREPARATION, modifiable: false, planning: soumis });
  const soumettre = jest.fn(async () => soumis);
  await rendre({ semaine, soumettre });
  expect(await screen.findByText(/^À soumettre avant le /)).toBeTruthy();
  await fireEvent.press(screen.getByText('Soumettre le planning'));
  // Rien ne part sans la confirmation.
  expect(soumettre).not.toHaveBeenCalled();
  expect(screen.getByText(/Vous ne pourrez plus le modifier/)).toBeTruthy();
  await fireEvent.press(screen.getByText('Oui, soumettre'));
  expect(soumettre).toHaveBeenCalledWith('pl1');
  expect(await screen.findByText('Planning soumis à votre superviseur.')).toBeTruthy();
  expect(screen.getByText(/^Soumis le /)).toBeTruthy();
  expect(screen.queryByText('Soumettre le planning')).toBeNull();
  expect(screen.queryByText('En retard')).toBeNull();
});

test('RG-016 : après l’échéance, la soumission reste possible et se dit en retard', async () => {
  const soumis = {
    ...PLANNING,
    statut: 'soumis' as const,
    soumis_le: '2026-10-23T09:30:00Z',
    en_retard: true,
    echeance: PASSEE,
  };
  const semaine = jest
    .fn()
    .mockResolvedValueOnce({ ...EN_PREPARATION, planning: { ...PLANNING, echeance: PASSEE } })
    .mockResolvedValue({ ...EN_PREPARATION, modifiable: false, planning: soumis });
  await rendre({ semaine, soumettre: jest.fn(async () => soumis) });
  expect(await screen.findByText(/^Échéance passée : /)).toBeTruthy();
  await fireEvent.press(screen.getByText('Soumettre le planning'));
  expect(screen.getByText("L'échéance est passée : il sera marqué en retard.")).toBeTruthy();
  await fireEvent.press(screen.getByText('Oui, soumettre'));
  expect(
    await screen.findByText('Planning soumis à votre superviseur, marqué en retard.'),
  ).toBeTruthy();
  expect(screen.getByText('En retard')).toBeTruthy();
});

test('PLN-004 CA1 : un point bloquant remplace le bouton de soumission', async () => {
  await rendre(
    {
      semaine: jest.fn(async () => ({
        ...EN_PREPARATION,
        planning: { ...PLANNING, echeance: A_VENIR },
        controles: {
          bloquants: [
            {
              code: 'incomplete' as const,
              gravite: 'bloquant' as const,
              date: '2026-10-27',
              visites: ['v1'],
              manquants: ['heure'],
            },
          ],
          signalements: [],
          objectifs: [],
        },
      })),
    },
    { exercices: { duProspect: jest.fn(async () => []) } },
  );
  expect(
    await screen.findByText(
      "Corrigez d'abord le point bloquant signalé plus haut : il empêche la soumission.",
    ),
  ).toBeTruthy();
  expect(screen.queryByText('Soumettre le planning')).toBeNull();
  // La visite à corriger s'ouvre d'ici, sans remonter la semaine.
  await fireEvent.press(screen.getByText('Ouvrir la visite à corriger'));
  expect(await screen.findByText('Enregistrer')).toBeTruthy();
});

test('ORG-007 CA1 : le refus du serveur se lit sur la carte de soumission', async () => {
  const soumettre = jest.fn(async () => {
    throw new ErreurApi(409, 'sans_superviseur', 'Votre poste n’est rattaché à aucun superviseur.');
  });
  await rendre({
    semaine: jest.fn(async () => ({
      ...EN_PREPARATION,
      planning: { ...PLANNING, echeance: A_VENIR },
    })),
    soumettre,
  });
  await fireEvent.press(await screen.findByText('Soumettre le planning'));
  await fireEvent.press(screen.getByText('Oui, soumettre'));
  expect(await screen.findByText('Votre poste n’est rattaché à aucun superviseur.')).toBeTruthy();
  expect(screen.getByText('Oui, soumettre')).toBeTruthy();
});

test('PLN-007 : la saisie d’une visite retirée depuis ne se reprend pas', async () => {
  mockMemoire.set('planning.brouillon', {
    valeur: {
      objet: 'visite',
      semaine: '2026-10-26',
      visite: 'v-retiree',
      champs: {
        date: '2026-10-28',
        heure: '9h',
        prospect: null,
        lieu: null,
        reseau: 'r1',
        objectif: 'Remettre les échantillons',
        note: '',
      },
    },
    maj: '2026-10-26T08:00:00.000Z',
  });
  await rendre({ semaine: jest.fn(async () => EN_PREPARATION) });
  expect(
    await screen.findByText(
      "Ce qu'elle modifiait a été retiré depuis : elle ne peut plus être reprise.",
    ),
  ).toBeTruthy();
  expect(screen.queryByText('Reprendre la saisie')).toBeNull();
  await fireEvent.press(screen.getByText('Abandonner cette saisie'));
  expect(mockMemoire.has('planning.brouillon')).toBe(false);
});

test('PLN-004 : prospect et lieu inactifs ensemble se disent chacun', async () => {
  await rendre({
    semaine: jest.fn(async () => ({
      ...EN_PREPARATION,
      controles: {
        bloquants: (['prospect', 'etablissement'] as const).map((fiche) => ({
          code: 'fiche_inactive' as const,
          gravite: 'bloquant' as const,
          date: '2026-10-27',
          visites: ['v1'],
          fiche,
        })),
        signalements: [],
        objectifs: [],
      },
    })),
  });
  expect(await screen.findByText('Fiche du prospect devenue inactive')).toBeTruthy();
  expect(screen.getByText('Fiche du lieu devenue inactive')).toBeTruthy();
});

test('PLN-007 : sans réseau, la journée et le détail restent lisibles', async () => {
  // La semaine a été lue une fois avec du réseau : elle est gardée sous son lundi.
  mockMemoire.set('semaine.2026-10-26', {
    valeur: { ...EN_PREPARATION, visites: [CONFRERE] },
    maj: '2026-10-26T08:00:00.000Z',
  });
  const horsReseau = {
    etat: { statut: 'chargement' },
    client: {
      plannings: {
        semaine: jest.fn(async () => {
          throw new TypeError('Network request failed');
        }),
      },
    } as unknown as ClientApi,
  } as Session;
  const vue = await render(
    <ContexteSession.Provider value={horsReseau}>
      <VueJour jour="2026-10-27" />
    </ContexteSession.Provider>,
  );
  expect(await screen.findByText(/^Hors ligne : semaine telle qu'au /)).toBeTruthy();
  expect(screen.getByText('Dr Moussa EXEMPLE')).toBeTruthy();
  await vue.rerender(
    <ContexteSession.Provider value={horsReseau}>
      <VueDetail id="v2" jour="2026-10-27" />
    </ContexteSession.Provider>,
  );
  expect(await screen.findByText('Échantillons')).toBeTruthy();
  expect(screen.getByText(/^Hors ligne : semaine telle qu'au /)).toBeTruthy();
});

test('un refus du serveur dans la vue jour n’affiche pas une semaine gardée', async () => {
  mockMemoire.set('semaine.2026-10-26', {
    valeur: EN_PREPARATION,
    maj: '2026-10-26T08:00:00.000Z',
  });
  const session = {
    etat: { statut: 'chargement' },
    client: {
      plannings: {
        semaine: jest.fn(async () => {
          throw new ErreurApi(403, 'sans_poste', 'Vous n’occupez aucun poste cette semaine.');
        }),
      },
    } as unknown as ClientApi,
  } as Session;
  await render(
    <ContexteSession.Provider value={session}>
      <VueJour jour="2026-10-27" />
    </ContexteSession.Provider>,
  );
  expect(await screen.findByText('Vous n’occupez aucun poste cette semaine.')).toBeTruthy();
  expect(screen.queryByText(/^Hors ligne/)).toBeNull();
});
