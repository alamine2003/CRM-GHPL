import type { ClientApi, Programme, VisiteProgramme } from '@innov/api-client';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { type ReactNode, useState } from 'react';
import { lireAttente } from '../src/Brouillons';
import type { TypeEcart } from '../src/Execution';
import i18n from '../src/i18n';
import { ContexteSession, type Session } from '../src/session';
import { type Annonce, TourneeTelephone, useTournee } from '../src/Tournee';
import { AnnonceVisite, EcartVisite, EcranVisite } from '../src/Visite';

// VIS-006 (0.4.6) : annuler une visite, avec un motif ; VIS-009 : une visite restée prévue après
// sa journée est « à justifier » (CA1) et se justifie « non réalisée », avec un motif. Depuis
// 1.4.1, les écarts s'ouvrent depuis l'écran de la visite, chacun avec ses motifs à cocher.

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
const mockRetour = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPousser, back: mockRetour, canGoBack: () => true }),
}));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'envoi-1' }));
jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
  Accuracy: { High: 4 },
}));
// Le gabarit (onglets, rail) est testé ailleurs : ici, le titre, le contenu et les boutons du bas.
jest.mock('../src/Ecran', () => ({
  Ecran: ({
    titre,
    surTitre,
    children,
    pied,
  }: {
    titre: string;
    surTitre?: string;
    children: ReactNode;
    pied?: ReactNode;
  }) => {
    const { Text } = jest.requireActual('react-native');
    return (
      <>
        <Text>{titre}</Text>
        <Text>{surTitre}</Text>
        {children}
        {pied}
      </>
    );
  },
}));

const VISITE: VisiteProgramme = {
  id: 'v1',
  version: 1,
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
};

const MOTIF = { id: 'm-absent', libelle: 'Absent du cabinet' };

const PROGRAMME: Programme = {
  semaine: '2026-10-12',
  aujourdhui: '2026-10-13',
  fuseau: 'UTC',
  etat: 'approuve',
  planning: null,
  version: 1,
  prochaine: 'v1',
  geolocalisation: true,
  attente_gps_secondes: 60,
  verrouillage_minutes: 15,
  delai_hors_ligne_jours: 7,
  motifs_ecart: [{ id: 'm-absent', libelle: 'Absent du cabinet' }],
  a_justifier: [],
  a_corriger: [],
  jours: [{ date: '2026-10-13', ferie: null, visites: [VISITE], activites: [] }],
};

const HIER: VisiteProgramme = {
  ...VISITE,
  id: 'v0',
  date: '2026-10-12',
  heure: '15:00',
  prospect: { ...VISITE.prospect!, id: 'p0', prenom: 'Moussa', nom: 'EXEMPLE' },
};

const sansReseau = () => Promise.reject(new TypeError('Network request failed'));

function session(visites: Record<string, unknown>, aJustifier: VisiteProgramme[] = []) {
  return {
    etat: { statut: 'connecte' },
    client: {
      plannings: {
        programme: jest.fn(async () => ({ ...PROGRAMME, a_justifier: aJustifier })),
        semaine: jest.fn(sansReseau),
      },
      visites: { demarrer: jest.fn(), detail: jest.fn(sansReseau), ...visites },
    } as unknown as ClientApi,
  } as unknown as Session;
}

function garder(programme: Programme = PROGRAMME) {
  mockMemoire.set('programme.courant', { valeur: programme, maj: '2026-10-13T06:30:00.000Z' });
}

async function rendreEcart(
  visites: Record<string, unknown>,
  type: TypeEcart,
  visite = VISITE,
  programme = PROGRAMME,
) {
  garder(programme);
  const surFin = jest.fn();
  await render(
    <ContexteSession.Provider value={session(visites)}>
      <AnnonceVisite id={visite.id} />
      <EcartVisite visite={visite} programme={programme} type={type} surFin={surFin} />
    </ContexteSession.Provider>,
  );
  return surFin;
}

async function ouvrir(id: string, jour: string, programme = PROGRAMME) {
  garder(programme);
  await render(
    <ContexteSession.Provider value={session({})}>
      <EcranVisite id={id} jour={jour} />
    </ContexteSession.Provider>,
  );
}

/** La Tournée du téléphone, telle que l'écran d'accueil la compose (1.4.0). */
function Tournee() {
  const etat = useTournee();
  const [annonce, setAnnonce] = useState<Annonce | null>(null);
  return etat ? <TourneeTelephone etat={etat} annonce={annonce} surAnnonce={setAnnonce} /> : null;
}

beforeEach(async () => {
  mockMemoire.clear();
  mockPousser.mockClear();
  mockRetour.mockClear();
  await i18n.changeLanguage('fr');
});

test('VIS-006 : la visite s’annule avec son motif ; sans motif, impossible (CA1)', async () => {
  const annuler = jest.fn(async (_id: string, s: { le: string }) => ({
    ...VISITE,
    statut: 'annulee',
    motif_ecart: MOTIF,
    ecart_le: s.le,
  }));
  const surFin = await rendreEcart({ annuler }, 'annuler');
  expect(screen.getByText('Annuler cette visite')).toBeTruthy();
  await fireEvent.press(screen.getByText("Confirmer l'annulation"));
  expect(annuler).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByText('Absent du cabinet'));
  await fireEvent.press(screen.getByText("Confirmer l'annulation"));
  expect(annuler).toHaveBeenCalledWith('v1', expect.objectContaining({ motif: 'm-absent' }));
  expect(
    await screen.findByText('Visite de Dr Awa FICTIF annulée : Absent du cabinet.'),
  ).toBeTruthy();
  expect(surFin).toHaveBeenCalled();
});

test('VIS-006 : annulée, la visite dit son motif et n’a plus d’action', async () => {
  const annulee = { ...VISITE, statut: 'annulee' as const, motif_ecart: MOTIF };
  await ouvrir('v1', '2026-10-13', {
    ...PROGRAMME,
    jours: [{ ...PROGRAMME.jours[0]!, visites: [annulee] }],
  });
  expect(await screen.findByText("Motif de l'annulation")).toBeTruthy();
  expect(screen.getByText('Absent du cabinet')).toBeTruthy();
  expect(screen.queryByText('Démarrer la visite')).toBeNull();
  expect(screen.queryByText('Prospect absent')).toBeNull();
});

test('VIS-009 CA1 : restée prévue après sa journée, la visite est « à justifier »', async () => {
  garder();
  await render(
    <ContexteSession.Provider value={session({}, [HIER])}>
      <Tournee />
    </ContexteSession.Provider>,
  );
  await fireEvent.press(await screen.findByText(/1 visite restée prévue après sa journée/));
  expect(mockPousser).toHaveBeenCalledWith({
    pathname: '/visite/[id]',
    params: { id: 'v0', jour: '2026-10-12' },
  });
});

test('VIS-009 : sur sa visite, « Justifier » ouvre la non-réalisation', async () => {
  await ouvrir('v0', '2026-10-12', { ...PROGRAMME, a_justifier: [HIER] });
  expect(
    await screen.findByText("Restée prévue après sa journée : dites ce qui s'est passé."),
  ).toBeTruthy();
  expect(screen.queryByText('Démarrer la visite')).toBeNull();
  await fireEvent.press(screen.getByText('Justifier'));
  expect(mockPousser).toHaveBeenCalledWith({
    pathname: '/ecart/[id]',
    params: { id: 'v0', type: 'non_realisee' },
  });
});

test('VIS-009 : sans réseau, la non-réalisation attend dans la file', async () => {
  await rendreEcart({ nonRealisee: jest.fn(sansReseau) }, 'non_realisee', HIER, {
    ...PROGRAMME,
    a_justifier: [HIER],
  });
  expect(screen.getByText('Visite non réalisée')).toBeTruthy();
  await fireEvent.press(screen.getByText('Absent du cabinet'));
  await fireEvent.press(screen.getByText('Confirmer'));
  expect(await screen.findByText(/Sans réseau : l'envoi partira/)).toBeTruthy();
  const [envoi] = await lireAttente();
  expect(envoi).toMatchObject({ type: 'non_realisee_visite', visite: 'v0' });
});

test('VIS-006 : une visite d’un autre jour ne se démarre pas mais se reporte ou s’annule', async () => {
  const jeudi = { ...VISITE, date: '2026-10-15' };
  await ouvrir('v1', '2026-10-15', {
    ...PROGRAMME,
    jours: [
      { date: '2026-10-13', ferie: null, visites: [], activites: [] },
      { date: '2026-10-15', ferie: null, visites: [jeudi], activites: [] },
    ],
  });
  expect(await screen.findByText('Annuler la visite')).toBeTruthy();
  expect(screen.getByText('Reporter')).toBeTruthy();
  expect(screen.queryByText('Démarrer la visite')).toBeNull();
  expect(screen.queryByText('Prospect absent')).toBeNull();
});
