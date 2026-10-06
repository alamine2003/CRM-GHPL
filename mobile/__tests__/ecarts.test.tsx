import type { ClientApi, Programme, VisiteProgramme } from '@innov/api-client';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { lireAttente } from '../src/Brouillons';
import { ExecutionVisite } from '../src/Execution';
import i18n from '../src/i18n';
import { ProgrammeDuJour } from '../src/Programme';
import { ContexteSession, type Session } from '../src/session';

// VIS-006 (0.4.6) : annuler une visite, avec un motif ; VIS-009 : une visite restée prévue après
// sa journée est « à justifier » (CA1) et se justifie « non réalisée », avec un motif.

const mockMemoire = new Map<string, { valeur: unknown; maj: string }>();
jest.mock('../src/baseLocale', () => ({
  lire: jest.fn(async (cle: string) => mockMemoire.get(cle) ?? null),
  ecrire: jest.fn(async (cle: string, valeur: unknown) =>
    mockMemoire.set(cle, { valeur, maj: '2026-10-13T06:30:00.000Z' }),
  ),
  oublier: jest.fn(async (cle: string) => mockMemoire.delete(cle)),
  effacer: jest.fn(),
}));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'envoi-1' }));
jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
  Accuracy: { High: 4 },
}));

const VISITE: VisiteProgramme = {
  id: 'v1',
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
  motifs_ecart: [{ id: 'm-absent', libelle: 'Absent du cabinet' }],
  a_justifier: [],
  jours: [{ date: '2026-10-13', ferie: null, visites: [VISITE], activites: [] }],
};

const HIER: VisiteProgramme = {
  ...VISITE,
  id: 'v0',
  date: '2026-10-12',
  heure: '15:00',
  prospect: { ...VISITE.prospect!, id: 'p0', prenom: 'Moussa', nom: 'EXEMPLE' },
};

async function rendre(visites: Record<string, jest.Mock>, aJustifier: VisiteProgramme[] = []) {
  const session = {
    etat: { statut: 'connecte' },
    client: {
      plannings: {
        programme: jest.fn(async () => ({ ...PROGRAMME, a_justifier: aJustifier })),
        semaine: jest.fn(async () => ({})),
      },
      visites: {
        demarrer: jest.fn(),
        detail: jest.fn(async () => Promise.reject(new TypeError('x'))),
        ...visites,
      },
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
  await i18n.changeLanguage('fr');
});

test('VIS-006 : la visite s’annule avec son motif ; sans motif, impossible (CA1)', async () => {
  const annuler = jest.fn(async (_id: string, s: { le: string }) => ({
    ...VISITE,
    statut: 'annulee',
    motif_ecart: MOTIF,
    ecart_le: s.le,
    reportee_de: null,
    report: null,
    est_imprevue: false,
    justification: '',
  }));
  await rendre({ annuler });
  await fireEvent.press(await screen.findByText('Annuler la visite'));
  expect(screen.getByText('Annuler cette visite')).toBeTruthy();
  await fireEvent.press(screen.getByText("Confirmer l'annulation"));
  expect(annuler).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByText('Absent du cabinet'));
  await fireEvent.press(screen.getByText("Confirmer l'annulation"));
  expect(annuler).toHaveBeenCalledWith('v1', expect.objectContaining({ motif: 'm-absent' }));
  expect(
    await screen.findByText('Visite de Dr Awa FICTIF annulée : Absent du cabinet.'),
  ).toBeTruthy();
  expect(screen.getByText('Annulée · Absent du cabinet')).toBeTruthy();
});

test('VIS-009 CA1 : restée prévue après sa journée, la visite est « à justifier »', async () => {
  const nonRealisee = jest.fn(async () => ({
    ...HIER,
    statut: 'non_realisee',
    motif_ecart: MOTIF,
  }));
  await rendre({ nonRealisee }, [HIER]);
  expect(await screen.findByText('À justifier (1)')).toBeTruthy();
  expect(screen.getByText(/Moussa EXEMPLE/)).toBeTruthy();
  expect(screen.getByText(/lundi 12 octobre/i)).toBeTruthy();
});

test('VIS-009 : sans réseau, la non-réalisation attend dans la file', async () => {
  const session = {
    etat: { statut: 'connecte' },
    client: {
      visites: {
        nonRealisee: jest.fn(async () => {
          throw new TypeError('Network request failed');
        }),
      },
    } as unknown as ClientApi,
  } as unknown as Session;
  await render(
    <ContexteSession.Provider value={session}>
      <ExecutionVisite
        visite={HIER}
        aujourdhui="2026-10-13"
        geolocalisation
        fuseau="UTC"
        motifs={[MOTIF]}
      />
    </ContexteSession.Provider>,
  );
  expect(
    screen.getByText("Restée prévue après sa journée : dites ce qui s'est passé."),
  ).toBeTruthy();
  await fireEvent.press(screen.getByText('Justifier : non réalisée'));
  await fireEvent.press(screen.getByText('Absent du cabinet'));
  await fireEvent.press(screen.getByText('Confirmer'));
  expect(await screen.findByText(/Sans réseau : l'envoi partira/)).toBeTruthy();
  const [envoi] = await lireAttente();
  expect(envoi).toMatchObject({ type: 'non_realisee_visite', visite: 'v0' });
});

test('VIS-006 : une visite d’un autre jour ne se démarre pas mais s’annule à l’avance', async () => {
  const session = {
    etat: { statut: 'connecte' },
    client: { visites: {} } as unknown as ClientApi,
  } as unknown as Session;
  await render(
    <ContexteSession.Provider value={session}>
      <ExecutionVisite
        visite={{ ...VISITE, date: '2026-10-15' }}
        aujourdhui="2026-10-13"
        geolocalisation
        fuseau="UTC"
        motifs={[MOTIF]}
      />
    </ContexteSession.Provider>,
  );
  expect(screen.getByText('Annuler la visite')).toBeTruthy();
  expect(screen.queryByText('Démarrer la visite')).toBeNull();
  expect(screen.queryByText('Prospect absent')).toBeNull();
});
