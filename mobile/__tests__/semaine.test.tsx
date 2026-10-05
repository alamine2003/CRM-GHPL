import type { ClientApi, Semaine, Visite } from '@innov/api-client';
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import EcranSemaine from '../app/semaine';
import i18n from '../src/i18n';
import { ContexteSession, type Session } from '../src/session';
import { lireHeure } from '../src/Visites';

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
  reseaux: [{ id: 'r1', libelle: 'Cardio' }],
};

const PLANNING = { id: 'pl1', semaine: '2026-10-26', statut: 'brouillon' as const, cree_le: '' };

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
