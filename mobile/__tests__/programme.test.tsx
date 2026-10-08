import type { ClientApi, Programme, VisiteProgramme } from '@innov/api-client';
import { fireEvent, render, screen } from '@testing-library/react-native';
import i18n from '../src/i18n';
import { ProgrammeDuJour } from '../src/Programme';
import { ContexteSession, type Session } from '../src/session';

// VIS-001 (0.4.1) : le programme du jour, ordonné, la prochaine visite en tête ; CA1 : en mode
// avion, le programme du jour et de la semaine s'affiche.

const mockMemoire = new Map<string, { valeur: unknown; maj: string }>();
jest.mock('../src/baseLocale', () => ({
  lire: jest.fn(async (cle: string) => mockMemoire.get(cle) ?? null),
  ecrire: jest.fn(async (cle: string, valeur: unknown) =>
    mockMemoire.set(cle, { valeur, maj: '2026-10-13T06:30:00.000Z' }),
  ),
  oublier: jest.fn(),
  effacer: jest.fn(),
}));
const mockPousser = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPousser }) }));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'indispo-1' }));

const visite = (id: string, heure: string, nom: string, date = '2026-10-13'): VisiteProgramme => ({
  id,
  date,
  heure,
  prospect: {
    id: `p-${id}`,
    civilite: 'dr',
    prenom: 'Awa',
    nom,
    specialite_libelle: 'Cardiologie',
    type_libelle: 'Médecin',
    potentiel: 'A',
  },
  etablissement: { id: 'e1', nom: 'Clinique Fictive' },
  reseau: null,
  objectif: 'Présenter le produit du mois',
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
  reportee_de: null,
  report: null,
  est_imprevue: false,
  rapport_statut: null,
  justification: '',
  modification_en_attente: false,
});

const PROGRAMME: Programme = {
  semaine: '2026-10-12',
  aujourdhui: '2026-10-13',
  fuseau: 'Africa/Dakar',
  etat: 'approuve',
  planning: null,
  version: 1,
  prochaine: 'v1',
  geolocalisation: true,
  attente_gps_secondes: 60,
  verrouillage_minutes: 15,
  motifs_ecart: [{ id: 'm-absent', libelle: 'Absent du cabinet' }],
  a_justifier: [],
  a_corriger: [],
  jours: [
    { date: '2026-10-12', ferie: null, visites: [], activites: [] },
    {
      date: '2026-10-13',
      ferie: null,
      visites: [visite('v1', '09:00', 'PREMIER'), visite('v2', '11:00', 'SECOND')],
      activites: [],
    },
    {
      date: '2026-10-14',
      ferie: null,
      visites: [
        { ...visite('v3', '10:00', 'TROISIEME', '2026-10-14'), modification_en_attente: true },
      ],
      activites: [],
    },
    { date: '2026-10-15', ferie: 'Fête fictive', visites: [], activites: [] },
    {
      date: '2026-10-16',
      ferie: null,
      visites: [],
      activites: [
        {
          id: 'a1',
          date: '2026-10-16',
          periode: 'journee',
          type: 'formation',
          commentaire: '',
          demande_superviseur: false,
          avec_visites: false,
        },
      ],
    },
  ],
};

async function rendre(programme: jest.Mock) {
  const session = {
    etat: { statut: 'connecte' },
    client: {
      plannings: { programme, semaine: jest.fn(async () => ({})) },
    } as unknown as ClientApi,
  } as unknown as Session;
  await render(
    <ContexteSession.Provider value={session}>
      <ProgrammeDuJour />
    </ContexteSession.Provider>,
  );
}

beforeEach(async () => {
  mockMemoire.clear();
  mockPousser.mockClear();
  await i18n.changeLanguage('fr');
});

test('VIS-001 : le programme du jour, la prochaine visite en tête, puis la semaine', async () => {
  await rendre(jest.fn(async () => PROGRAMME));
  expect(await screen.findByText('Prochaine visite')).toBeTruthy();
  expect(screen.getByText("2 visites aujourd'hui · Selon la version 1 approuvée")).toBeTruthy();
  const noms = screen.getAllByText(/^Dr Awa /).map((n) => n.props.children);
  expect(noms).toEqual(['Dr Awa PREMIER', 'Dr Awa SECOND']);
  expect(screen.getByText('Présenter le produit du mois')).toBeTruthy();
  // Le reste de la semaine : les visites, le jour férié, la formation.
  expect(screen.getByText('Mercredi 14')).toBeTruthy();
  expect(screen.getByText('1 visite')).toBeTruthy();
  expect(screen.getByText('Férié · Fête fictive')).toBeTruthy();
  expect(screen.getByText('Aucune visite · Formation')).toBeTruthy();
  // Gardé sur le téléphone pour le mode avion (CA1).
  expect(mockMemoire.get('programme.courant')?.valeur).toEqual(PROGRAMME);
  await fireEvent.press(screen.getByText('Dr Awa PREMIER'));
  expect(mockPousser).toHaveBeenCalledWith({
    pathname: '/visite/[id]',
    params: { id: 'v1', jour: '2026-10-13' },
  });
});

test('VIS-001 CA1 : en mode avion, le dernier programme lu s’affiche', async () => {
  // Le programme lu la veille au réseau est resté sur le téléphone.
  mockMemoire.set('programme.courant', { valeur: PROGRAMME, maj: '2026-10-13T06:30:00.000Z' });
  const horsReseau = jest.fn(async () => {
    throw new TypeError('Network request failed');
  });
  await rendre(horsReseau);
  expect(await screen.findByText(/^Hors ligne : programme tel qu'au /)).toBeTruthy();
  expect(screen.getByText('Dr Awa PREMIER')).toBeTruthy();
  expect(screen.getByText('Mercredi 14')).toBeTruthy();
});

test('sans version approuvée, le programme le dit', async () => {
  await rendre(jest.fn(async () => ({ ...PROGRAMME, etat: 'non_approuve', prochaine: null })));
  expect(await screen.findByText(/pas encore approuvé : pas de programme/)).toBeTruthy();
  expect(screen.queryByText('Prochaine visite')).toBeNull();
});

test('toutes les visites du jour faites : plus de prochaine', async () => {
  const faites = PROGRAMME.jours.map((j) => ({
    ...j,
    visites: j.visites.map((v) => ({ ...v, statut: 'effectuee' as const })),
  }));
  await rendre(jest.fn(async () => ({ ...PROGRAMME, prochaine: null, jours: faites })));
  expect(await screen.findByText("Plus de visite à faire aujourd'hui.")).toBeTruthy();
  expect(screen.getAllByText('Effectuée')).toHaveLength(2);
});

test('RG-032 : un rapport de la veille non soumis remonte en tête, « en retard »', async () => {
  const hier = {
    ...visite('v0', '15:00', 'VEILLE', '2026-10-12'),
    statut: 'effectuee' as const,
    rapport_statut: 'brouillon' as const,
  };
  const soumis = { ...hier, id: 'v00', rapport_statut: 'soumis' as const };
  const jours = PROGRAMME.jours.map((j) =>
    j.date === '2026-10-12' ? { ...j, visites: [hier, soumis] } : j,
  );
  await rendre(jest.fn(async () => ({ ...PROGRAMME, jours })));
  expect(await screen.findByText('Rapports en retard (1)')).toBeTruthy();
  await fireEvent.press(screen.getByText(/VEILLE/));
  expect(mockPousser).toHaveBeenCalledWith({ pathname: '/rapport/[id]', params: { id: 'v0' } });
});

test('RPT-014, 29.A : les rapports à corriger, même d’une semaine passée, ont leur liste', async () => {
  const aCorriger = {
    ...visite('v01', '16:00', 'REVOIR', '2026-09-21'),
    statut: 'effectuee' as const,
    rapport_statut: 'a_corriger' as const,
  };
  // Déjà resoumis (sur ce téléphone) : il sort de la liste.
  const resoumis = { ...aCorriger, id: 'v02', rapport_statut: 'soumis' as const };
  await rendre(jest.fn(async () => ({ ...PROGRAMME, a_corriger: [aCorriger, resoumis] })));
  expect(await screen.findByText('Rapports à corriger (1)')).toBeTruthy();
  expect(screen.queryByText('Rapports en retard (1)')).toBeNull();
  expect(screen.getByText(/lundi 21 septembre/i)).toBeTruthy();
  await fireEvent.press(screen.getByText(/REVOIR/));
  expect(mockPousser).toHaveBeenCalledWith({ pathname: '/rapport/[id]', params: { id: 'v01' } });
});

test('DC-51 : « Je suis indisponible aujourd’hui » justifie la journée sans motif', async () => {
  const declarerIndisponibilite = jest.fn(async (s: { id: string; periode: string }) => ({
    id: s.id,
    date: '2026-10-13',
    periode: s.periode,
    type: 'indisponibilite',
    commentaire: '',
    demande_superviseur: false,
    avec_visites: false,
  }));
  mockMemoire.set('programme.courant', { valeur: PROGRAMME, maj: '2026-10-13T06:30:00.000Z' });
  const session = {
    etat: { statut: 'connecte' },
    client: {
      plannings: {
        programme: jest.fn(async () => PROGRAMME),
        semaine: jest.fn(async () => ({})),
        declarerIndisponibilite,
      },
    } as unknown as ClientApi,
  } as unknown as Session;
  await render(
    <ContexteSession.Provider value={session}>
      <ProgrammeDuJour />
    </ContexteSession.Provider>,
  );
  expect(await screen.findByText('Prochaine visite')).toBeTruthy();
  await fireEvent.press(screen.getByText(/Je suis indisponible aujourd.hui/));
  expect(screen.getByText(/Aucun motif n'est demandé/)).toBeTruthy();
  await fireEvent.press(screen.getByText(/Déclarer l.indisponibilité/));
  expect(declarerIndisponibilite).toHaveBeenCalledWith(
    expect.objectContaining({ periode: 'journee' }),
  );
  expect(await screen.findByText(/Indisponibilité déclarée/)).toBeTruthy();
  expect(screen.queryByText('Prochaine visite')).toBeNull();
});

test.each([
  ['attendu', 'Rapport à rédiger', 'Rapport en brouillon'],
  ['brouillon', 'Rapport en brouillon', 'Rapport à rédiger'],
] as const)(
  'RPT-001 CA1 : sous une visite effectuée du jour, rapport %s → « %s »',
  async (statut, libelle, absent) => {
    const faite = { ...visite('v1', '09:00', 'PREMIER'), statut: 'effectuee' as const };
    const jours = PROGRAMME.jours.map((j) =>
      j.date === '2026-10-13'
        ? { ...j, visites: [{ ...faite, rapport_statut: statut }, visite('v2', '11:00', 'SECOND')] }
        : j,
    );
    await rendre(jest.fn(async () => ({ ...PROGRAMME, prochaine: 'v2', jours })));
    expect(await screen.findByText(libelle)).toBeTruthy();
    expect(screen.queryByText(absent)).toBeNull();
  },
);

test('RPT-001 CA1 : soumis, le rapport ne s’affiche plus sous la visite effectuée', async () => {
  const faite = {
    ...visite('v1', '09:00', 'PREMIER'),
    statut: 'effectuee' as const,
    rapport_statut: 'soumis' as const,
  };
  const jours = PROGRAMME.jours.map((j) =>
    j.date === '2026-10-13' ? { ...j, visites: [faite, visite('v2', '11:00', 'SECOND')] } : j,
  );
  await rendre(jest.fn(async () => ({ ...PROGRAMME, prochaine: 'v2', jours })));
  expect(await screen.findByText('Dr Awa PREMIER')).toBeTruthy();
  expect(screen.queryByText('Rapport à rédiger')).toBeNull();
  expect(screen.queryByText('Rapport en brouillon')).toBeNull();
});

test('DC-51 : sans réseau, l’indisponibilité déclarée attend dans la file', async () => {
  const declarerIndisponibilite = jest.fn(async () => {
    throw new TypeError('Network request failed');
  });
  // Une visite le matin, une l'après-midi.
  const jours = PROGRAMME.jours.map((j) =>
    j.date === '2026-10-13'
      ? { ...j, visites: [visite('v1', '09:00', 'PREMIER'), visite('v2', '15:00', 'SECOND')] }
      : j,
  );
  const programme = { ...PROGRAMME, jours };
  mockMemoire.set('programme.courant', { valeur: programme, maj: '2026-10-13T06:30:00.000Z' });
  const session = {
    etat: { statut: 'connecte' },
    client: {
      plannings: {
        programme: jest.fn(async () => programme),
        semaine: jest.fn(async () => ({})),
        declarerIndisponibilite,
      },
    } as unknown as ClientApi,
  } as unknown as Session;
  await render(
    <ContexteSession.Provider value={session}>
      <ProgrammeDuJour />
    </ContexteSession.Provider>,
  );
  expect(await screen.findByText('Prochaine visite')).toBeTruthy();
  expect(screen.getByLabelText(/^Prochaine visite : .*PREMIER/)).toBeTruthy();
  await fireEvent.press(screen.getByText(/Je suis indisponible aujourd.hui/));
  await fireEvent.press(screen.getByText('Le matin'));
  await fireEvent.press(screen.getByText(/Déclarer l.indisponibilité/));
  expect(await screen.findByText(/l'indisponibilité est gardée sur le téléphone/)).toBeTruthy();
  const file = mockMemoire.get('planning.attente')?.valeur as {
    type: string;
    saisie: { id: string; periode: string };
  }[];
  expect(file).toEqual([
    expect.objectContaining({
      type: 'indisponibilite',
      saisie: { id: 'indispo-1', periode: 'matin' },
    }),
  ]);
  // La visite du matin est justifiée sur le téléphone : la prochaine passe à celle de l'après-midi.
  expect(screen.getByLabelText(/^Prochaine visite : .*SECOND/)).toBeTruthy();
  expect(screen.queryByLabelText(/^Prochaine visite : .*PREMIER/)).toBeNull();
});
