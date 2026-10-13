import type {
  ClientApi,
  DetailVisite,
  Programme,
  Semaine,
  VisiteProgramme,
} from '@innov/api-client';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import i18n from '../src/i18n';
import { ContexteSession, type Session } from '../src/session';
import { EcranVisite } from '../src/Visite';

// 1.4.1 : l'écran de la visite selon la maquette — le prospect et le lieu, les fiches, la
// dernière visite chez ce prospect, les actions du moment ; sur la tablette, les visites du jour
// à gauche, les chiffres de la visite, et l'écart en fenêtre sur la journée.

const mockMemoire = new Map<string, { valeur: unknown; maj: string }>();
jest.mock('../src/baseLocale', () => ({
  lire: jest.fn(async (cle: string) => mockMemoire.get(cle) ?? null),
  ecrire: jest.fn(async (cle: string, valeur: unknown) =>
    mockMemoire.set(cle, { valeur, maj: '2026-10-13T06:30:00.000Z' }),
  ),
  oublier: jest.fn(async (cle: string) => mockMemoire.delete(cle)),
  effacer: jest.fn(),
}));
const mockPousser = jest.fn();
const mockRemplacer = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPousser, replace: mockRemplacer, navigate: mockPousser }),
}));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'envoi-1' }));
jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
  Accuracy: { High: 4 },
}));
const mockTablette = { valeur: false };
jest.mock('../src/disposition', () => ({ useTablette: () => mockTablette.valeur }));
// Le gabarit : son titre, son action, le volet de gauche, le contenu et les boutons du bas.
jest.mock('../src/Ecran', () => ({
  Ecran: ({
    titre,
    surTitre,
    action,
    enteteTablette,
    gauche,
    children,
    pied,
  }: {
    titre: string;
    surTitre?: string;
    action?: ReactNode;
    enteteTablette?: { titre?: string; surTitre?: string; action?: ReactNode };
    gauche?: ReactNode;
    children: ReactNode;
    pied?: ReactNode;
  }) => {
    const { Text } = jest.requireActual('react-native');
    const { useTablette } = jest.requireMock('../src/disposition');
    return useTablette() ? (
      <>
        <Text>{enteteTablette?.titre ?? titre}</Text>
        <Text>{enteteTablette?.surTitre ?? surTitre}</Text>
        {enteteTablette?.action ?? action}
        {gauche}
        {children}
      </>
    ) : (
      <>
        <Text>{titre}</Text>
        <Text>{surTitre}</Text>
        {action}
        {children}
        {pied}
      </>
    );
  },
}));

function visite(id: string, champs: Partial<VisiteProgramme> = {}): VisiteProgramme {
  return {
    id,
    version: 1,
    date: '2026-10-13',
    heure: '11:00',
    prospect: {
      id: `p-${id}`,
      civilite: 'dr',
      prenom: 'Mariama',
      nom: `FICTIF ${id.toUpperCase()}`,
      specialite_libelle: 'Gynécologie',
      type_libelle: 'Médecin',
      potentiel: 'A',
    },
    etablissement: { id: 'e1', nom: 'Hôpital Fictif' },
    reseau: { id: 'r1', libelle: 'GYN' },
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
    ...champs,
  };
}

const FAITE = visite('v0', { heure: '08:30', statut: 'effectuee', rapport_statut: 'attendu' });
const PROCHAINE = visite('v1');
const MOTIF = { id: 'm-ferme', libelle: 'Cabinet fermé' };

const PROGRAMME: Programme = {
  semaine: '2026-10-12',
  aujourdhui: '2026-10-13',
  fuseau: 'UTC',
  etat: 'approuve',
  planning: null,
  version: 2,
  prochaine: 'v1',
  geolocalisation: true,
  attente_gps_secondes: 60,
  verrouillage_minutes: 15,
  delai_hors_ligne_jours: 7,
  motifs_ecart: [{ id: 'm-absent', libelle: 'Prospect absent' }, MOTIF],
  a_justifier: [],
  a_corriger: [],
  jours: [{ date: '2026-10-13', ferie: null, visites: [FAITE, PROCHAINE], activites: [] }],
};

const SEMAINE = {
  semaine: '2026-10-12',
  jours: [],
  planning: { statut: 'approuve', numero_version: 2, decision: null },
  modifiable: false,
  approbation: null,
  visites: [FAITE, PROCHAINE],
  passages: [],
  activites: [],
  kilometrage: {
    total_km: 4.2,
    sans_coordonnees: 0,
    jours: [
      {
        date: '2026-10-13',
        km: 4.2,
        sans_coordonnees: 0,
        etapes: [
          { visite: 'v0', km: null },
          { visite: 'v1', km: 4.2 },
        ],
      },
    ],
  },
  controles: {
    bloquants: [],
    signalements: [],
    objectifs: [{ date: '2026-10-13', min: 6, max: 8 }],
  },
} as unknown as Semaine;

const DETAIL = {
  visite: PROCHAINE,
  prospect: { telephone_mobile: '', telephone_pro: '', courriel: '' },
  lieu: {
    id: 'e1',
    nom: 'Hôpital Fictif',
    adresse: 'Avenue Fictive',
    localite: 'Dakar',
    telephone: '',
    latitude: null,
    longitude: null,
  },
  historique: [
    {
      id: 'h1',
      date: '2026-09-29',
      heure: '10:00',
      statut: 'effectuee',
      objectif: '',
      etablissement: 'Hôpital Fictif',
      resultat: 'Intéressée',
      produits: ['Produit Alpha', 'Produit Beta'],
    },
  ],
  action_precedente: {
    date: '2026-09-29',
    type: 'Relance',
    texte: 'Apporter l’étude clinique',
    echeance: null,
    visite_proposee: false,
  },
  preparation: null,
} as DetailVisite;

async function ouvrir(visites: Record<string, unknown> = {}) {
  mockMemoire.set('programme.courant', { valeur: PROGRAMME, maj: '2026-10-13T06:30:00.000Z' });
  const session = {
    etat: { statut: 'connecte' },
    client: {
      plannings: { semaine: jest.fn(async () => SEMAINE) },
      visites: { detail: jest.fn(async () => DETAIL), ...visites },
    } as unknown as ClientApi,
  } as unknown as Session;
  await render(
    <ContexteSession.Provider value={session}>
      <EcranVisite id="v1" jour="2026-10-13" />
    </ContexteSession.Provider>,
  );
}

beforeEach(async () => {
  mockMemoire.clear();
  mockPousser.mockClear();
  mockRemplacer.mockClear();
  mockTablette.valeur = false;
  await i18n.changeLanguage('fr');
});

test('téléphone : le prospect, le lieu, la dernière visite et les actions en bas', async () => {
  await ouvrir();
  expect(await screen.findByText('Intéressée')).toBeTruthy();
  expect(screen.getByText('Visite')).toBeTruthy();
  expect(screen.getByText('Mardi 13 octobre · 11:00')).toBeTruthy();
  expect(screen.getByText('Prochaine')).toBeTruthy();
  expect(screen.getByText('Dr Mariama FICTIF V1')).toBeTruthy();
  expect(screen.getByText('Gynécologie · Réseau GYN')).toBeTruthy();
  expect(screen.getByText('Avenue Fictive, Dakar')).toBeTruthy();
  // La distance est celle de l'arrêt précédent, estimée (PLN-010) : jamais la position du délégué.
  expect(screen.getByLabelText("4,2 km depuis l'arrêt précédent")).toBeTruthy();
  expect(screen.getByText('Dernière visite · 29 septembre')).toBeTruthy();
  expect(screen.getByText('Apporter l’étude clinique')).toBeTruthy();
  expect(screen.getByText(/enregistre votre position une seule fois/)).toBeTruthy();
  expect(screen.getByText('Prospect absent')).toBeTruthy();
  expect(screen.getByText('Démarrer la visite')).toBeTruthy();
  // Les écarts plus rares restent à portée, en liens.
  expect(screen.getByText('Reporter')).toBeTruthy();
  expect(screen.getByText('Annuler la visite')).toBeTruthy();
  await fireEvent.press(screen.getByText('Fiche du prospect'));
  expect(mockPousser).toHaveBeenCalledWith('/fiche/p-v1');
  await fireEvent.press(screen.getByText('Reporter'));
  expect(mockPousser).toHaveBeenLastCalledWith({
    pathname: '/ecart/[id]',
    params: { id: 'v1', type: 'reporter' },
  });
});

test('téléphone : effectuée, la visite propose son rapport', async () => {
  mockMemoire.set('programme.courant', { valeur: PROGRAMME, maj: '' });
  const session = {
    etat: { statut: 'connecte' },
    client: {
      plannings: { semaine: jest.fn(async () => SEMAINE) },
      visites: { detail: jest.fn(async () => DETAIL) },
    } as unknown as ClientApi,
  } as unknown as Session;
  await render(
    <ContexteSession.Provider value={session}>
      <EcranVisite id="v0" jour="2026-10-13" />
    </ContexteSession.Provider>,
  );
  expect(await screen.findByText('Rédiger le rapport')).toBeTruthy();
  expect(screen.getByText('À rédiger')).toBeTruthy();
  expect(screen.queryByText('Démarrer la visite')).toBeNull();
  await fireEvent.press(screen.getByText('Rédiger le rapport'));
  expect(mockPousser).toHaveBeenCalledWith({ pathname: '/rapport/[id]', params: { id: 'v0' } });
});

test('tablette : les visites du jour, les chiffres de la visite et la position', async () => {
  mockTablette.valeur = true;
  await ouvrir();
  expect(await screen.findByText('Produit Alpha, Produit Beta')).toBeTruthy();
  expect(screen.getByText('Mardi 13 octobre')).toBeTruthy();
  expect(screen.getByText('2 visites · objectif 6 à 8')).toBeTruthy();
  expect(screen.getByText('Planning approuvé · version 2')).toBeTruthy();
  // À gauche, la journée ; la visite ouverte est choisie.
  const ouverte = screen.getByLabelText('11:00 · Dr Mariama FICTIF V1 · Prochaine visite');
  expect(ouverte.props.accessibilityState).toEqual({ selected: true });
  await fireEvent.press(screen.getByLabelText('08:30 · Dr Mariama FICTIF V0 · Rapport à rédiger'));
  expect(mockRemplacer).toHaveBeenCalledWith({
    pathname: '/visite/[id]',
    params: { id: 'v0', jour: '2026-10-13' },
  });
  // Les chiffres : quand, statut, distance, dernière visite.
  expect(screen.getByText('Prochaine visite')).toBeTruthy();
  expect(screen.getByText('4,2 km')).toBeTruthy();
  expect(screen.getByText('29 sept.')).toBeTruthy();
  expect(screen.getByText('Position')).toBeTruthy();
  expect(screen.getByText(/enregistrée au début et à la fin de la visite seulement/)).toBeTruthy();
});

test('tablette : « Prospect absent » s’ouvre en fenêtre et se confirme avec son motif', async () => {
  mockTablette.valeur = true;
  const absent = jest.fn(async () => ({
    ...PROCHAINE,
    statut: 'prospect_absent',
    motif_ecart: MOTIF,
  }));
  await ouvrir({ absent });
  await fireEvent.press(await screen.findByText('Prospect absent'));
  expect(screen.getByText('Le prospect est absent')).toBeTruthy();
  expect(screen.getByText('Dr Mariama FICTIF V1 · 11:00 · Hôpital Fictif')).toBeTruthy();
  await fireEvent.press(screen.getByRole('radio', { name: 'Cabinet fermé' }));
  await fireEvent.press(screen.getByText("Confirmer l'absence"));
  expect(absent).toHaveBeenCalledWith('v1', expect.objectContaining({ motif: 'm-ferme' }));
  expect(
    await screen.findByText('Prospect absent noté pour Dr Mariama FICTIF V1 : Cabinet fermé.'),
  ).toBeTruthy();
  await waitFor(() => expect(screen.queryByText('Le prospect est absent')).toBeNull());
  // La visite dit désormais son motif, et n'a plus rien à démarrer.
  expect(screen.getByText("Motif de l'absence")).toBeTruthy();
  expect(screen.queryByText('Démarrer la visite')).toBeNull();
});
