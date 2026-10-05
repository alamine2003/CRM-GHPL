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
