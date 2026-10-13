import type { ClientApi, Programme, VisiteProgramme } from '@innov/api-client';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { useState } from 'react';
import i18n from '../src/i18n';
import { ContexteSession, type Session } from '../src/session';
import { type Annonce, TourneeTablette, TourneeTelephone, useTournee } from '../src/Tournee';

// 1.4.0 : la Tournée selon la maquette — avancement, bandeau « Prochaine visite », frise ;
// rapports à corriger ou en retard en tête ; chiffres du jour et « À traiter » sur la tablette.

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
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPousser }) }));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'envoi-1' }));
jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
  Accuracy: { High: 4 },
}));

function visite(id: string, champs: Partial<VisiteProgramme> = {}): VisiteProgramme {
  return {
    id,
    version: 1,
    date: '2026-10-13',
    heure: '09:00',
    prospect: {
      id: `p-${id}`,
      civilite: 'dr',
      prenom: 'Awa',
      nom: `FICTIF ${id}`,
      specialite_libelle: 'Cardiologie',
      type_libelle: 'Médecin',
      potentiel: 'A',
    },
    etablissement: { id: 'e1', nom: 'Clinique Fictive' },
    reseau: null,
    objectif: '',
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

const FAITE = visite('v1', { heure: '08:30', statut: 'effectuee', rapport_statut: 'attendu' });
const PREVUE = visite('v2', { heure: '11:00' });

function programme(champs: Partial<Programme> = {}): Programme {
  return {
    semaine: '2026-10-12',
    aujourdhui: '2026-10-13',
    fuseau: 'UTC',
    etat: 'approuve',
    planning: null,
    version: 2,
    prochaine: 'v2',
    geolocalisation: false,
    attente_gps_secondes: 60,
    verrouillage_minutes: 15,
    delai_hors_ligne_jours: 7,
    motifs_ecart: [],
    a_justifier: [],
    a_corriger: [],
    jours: [{ date: '2026-10-13', ferie: null, visites: [FAITE, PREVUE], activites: [] }],
    ...champs,
  };
}

function Ecran({ tablette }: { tablette?: boolean }) {
  const etat = useTournee();
  const [annonce, setAnnonce] = useState<Annonce | null>(null);
  if (!etat) return null;
  return tablette ? (
    <TourneeTablette etat={etat} annonce={annonce} surAnnonce={setAnnonce} />
  ) : (
    <TourneeTelephone etat={etat} annonce={annonce} surAnnonce={setAnnonce} />
  );
}

async function rendre(lu: Programme, tablette = false, demarrer = jest.fn()) {
  const session = {
    etat: { statut: 'connecte' },
    client: {
      plannings: {
        programme: jest.fn(async () => lu),
        semaine: jest.fn(async () => ({ kilometrage: null })),
      },
      visites: {
        demarrer,
        detail: jest.fn(async () => Promise.reject(new TypeError('x'))),
      },
      synchro: { envoyer: jest.fn() },
    } as unknown as ClientApi,
  } as unknown as Session;
  await render(
    <ContexteSession.Provider value={session}>
      <Ecran tablette={tablette} />
    </ContexteSession.Provider>,
  );
}

beforeEach(async () => {
  mockMemoire.clear();
  mockPousser.mockClear();
  await i18n.changeLanguage('fr');
});

test('téléphone : avancement, bandeau de la prochaine visite et frise du jour', async () => {
  await rendre(programme());
  expect(await screen.findByText('Programme du jour')).toBeTruthy();
  expect(screen.getByText(/faites sur 2/)).toBeTruthy();
  expect(screen.getByText('Démarrer la visite')).toBeTruthy();
  // La frise : la faite attend son rapport, la suivante est « Prochaine visite ».
  expect(screen.getByText('Rapport à rédiger')).toBeTruthy();
  expect(screen.getAllByText('Prochaine visite').length).toBeGreaterThan(0);
  expect(screen.getAllByText('Dr Awa FICTIF v2').length).toBe(2);
});

test('téléphone : une visite restée prévue la veille s’annonce « À justifier »', async () => {
  await rendre(programme({ a_justifier: [visite('v0', { date: '2026-10-12' })] }));
  expect(await screen.findByText(/1 visite restée prévue après sa journée/)).toBeTruthy();
  fireEvent.press(screen.getByText(/1 visite restée prévue après sa journée/));
  expect(mockPousser).toHaveBeenCalledWith({
    pathname: '/visite/[id]',
    params: { id: 'v0', jour: '2026-10-12' },
  });
});

test('avec des rapports à corriger ou en retard, ils passent en tête et le programme se résume', async () => {
  const veille = visite('v9', {
    date: '2026-10-12',
    statut: 'effectuee',
    rapport_statut: 'brouillon',
  });
  await rendre(
    programme({
      a_corriger: [
        visite('v8', { date: '2026-10-09', statut: 'effectuee', rapport_statut: 'a_corriger' }),
      ],
      jours: [
        { date: '2026-10-12', ferie: null, visites: [veille], activites: [] },
        { date: '2026-10-13', ferie: null, visites: [FAITE, PREVUE], activites: [] },
      ],
    }),
  );
  expect(await screen.findByText('Rapports à corriger (1)')).toBeTruthy();
  expect(screen.getByText('Rapports en retard (1)')).toBeTruthy();
  expect(screen.getByText('Rapport en brouillon')).toBeTruthy();
  expect(screen.getByText('LUNDI')).toBeTruthy();
  expect(screen.getByText(/^2 visites aujourd.hui · Selon la version 2 approuvée$/)).toBeTruthy();
  expect(screen.queryByText('Démarrer la visite')).toBeNull();
  fireEvent.press(screen.getByText('Programme du jour'));
  expect(mockPousser).toHaveBeenCalledWith({
    pathname: '/jour/[date]',
    params: { date: '2026-10-13' },
  });
});

test('tablette : chiffres du jour, bandeau élargi et ce qui reste à traiter', async () => {
  await rendre(programme(), true);
  expect(await screen.findByText('Visites aujourd’hui')).toBeTruthy();
  // Visites du jour et de la semaine : une faite sur deux.
  expect(screen.getAllByText('1 / 2')).toHaveLength(2);
  expect(screen.getByText('Itinéraire')).toBeTruthy();
  expect(screen.getByText('Fiche du prospect')).toBeTruthy();
  expect(screen.getByText('À traiter')).toBeTruthy();
  fireEvent.press(screen.getByText('Rédiger'));
  expect(mockPousser).toHaveBeenCalledWith({ pathname: '/rapport/[id]', params: { id: 'v1' } });
});

test('« Démarrer la visite » démarre la prochaine visite (VIS-003)', async () => {
  const demarrer = jest.fn(async () => ({
    ...PREVUE,
    statut: 'en_cours',
    debut_le: '2026-10-13T10:55:00Z',
  }));
  await rendre(programme(), false, demarrer);
  fireEvent.press(await screen.findByText('Démarrer la visite'));
  await waitFor(() => expect(demarrer).toHaveBeenCalled());
  expect((demarrer.mock.calls[0] as unknown[])[0]).toBe('v2');
});
