import type { ClientApi, Programme, VisiteProgramme } from '@innov/api-client';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { lireAttente } from '../src/Brouillons';
import i18n from '../src/i18n';
import { ProgrammeDuJour } from '../src/Programme';
import { ContexteSession, type Session } from '../src/session';

// VIS-005 (0.4.5) : prospect absent, avec un motif de la liste du pays ; CA1 : impossible sans motif.
// Sans réseau, la déclaration attend dans la file comme les autres envois.

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
  verrouillage_minutes: 15,
  delai_hors_ligne_jours: 7,
  motifs_ecart: [{ id: 'm-absent', libelle: 'Absent du cabinet' }],
  a_justifier: [],
  a_corriger: [],
  jours: [{ date: '2026-10-13', ferie: null, visites: [VISITE], activites: [] }],
};

async function rendre(absent: jest.Mock, visite = VISITE) {
  const session = {
    etat: { statut: 'connecte' },
    client: {
      plannings: {
        programme: jest.fn(async () => ({
          ...PROGRAMME,
          jours: [{ ...PROGRAMME.jours[0]!, visites: [visite] }],
        })),
        semaine: jest.fn(async () => ({})),
      },
      visites: {
        absent,
        demarrer: jest.fn(),
        detail: jest.fn(async () => Promise.reject(new TypeError('x'))),
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

test('VIS-005 CA1 : sans motif, l’absence ne se confirme pas', async () => {
  const absent = jest.fn();
  await rendre(absent);
  await fireEvent.press(await screen.findByText('Prospect absent'));
  expect(screen.getByText('Le prospect est absent')).toBeTruthy();
  await fireEvent.press(screen.getByText("Confirmer l'absence"));
  expect(absent).not.toHaveBeenCalled();
  // Annuler rend les boutons de la visite.
  await fireEvent.press(screen.getByText('Retour'));
  expect(screen.getByText('Démarrer la visite')).toBeTruthy();
});

test('VIS-005 : avec un motif, la visite passe « prospect absent » et le programme l’annonce', async () => {
  const absent = jest.fn(async (_id: string, s: { le: string; commentaire: string }) => ({
    ...VISITE,
    statut: 'prospect_absent',
    motif_ecart: MOTIF,
    commentaire_ecart: s.commentaire,
    ecart_le: s.le,
    reportee_de: null,
    report: null,
    est_imprevue: false,
    justification: '',
  }));
  await rendre(absent);
  await fireEvent.press(await screen.findByText('Prospect absent'));
  await fireEvent.press(screen.getByText('Absent du cabinet'));
  await fireEvent.changeText(screen.getByLabelText('Commentaire (facultatif)'), ' En congrès ');
  await fireEvent.press(screen.getByText("Confirmer l'absence"));
  expect(absent).toHaveBeenCalledWith('v1', {
    le: expect.any(String),
    motif: 'm-absent',
    commentaire: 'En congrès',
  });
  expect(
    await screen.findByText('Prospect absent noté pour Dr Awa FICTIF : Absent du cabinet.'),
  ).toBeTruthy();
  expect(screen.getByText("Plus de visite à faire aujourd'hui.")).toBeTruthy();
  // Dans la liste du jour, le motif suit le statut.
  expect(screen.getByText('Prospect absent · Absent du cabinet')).toBeTruthy();
  expect(await lireAttente()).toEqual([]);
});

test('VIS-005 : une visite en cours peut aussi finir « prospect absent »', async () => {
  const absent = jest.fn(async () => ({
    ...VISITE,
    statut: 'prospect_absent',
    motif_ecart: MOTIF,
  }));
  await rendre(absent, { ...VISITE, statut: 'en_cours', debut_le: '2026-10-13T09:02:00.000Z' });
  expect(await screen.findByText('Terminer la visite')).toBeTruthy();
  await fireEvent.press(screen.getByText('Prospect absent'));
  await fireEvent.press(screen.getByText('Absent du cabinet'));
  await fireEvent.press(screen.getByText("Confirmer l'absence"));
  expect(absent).toHaveBeenCalledTimes(1);
});

test('VIS-005 : sans réseau, la déclaration attend dans la file et la visite change déjà', async () => {
  await rendre(
    jest.fn(async () => {
      throw new TypeError('Network request failed');
    }),
  );
  await fireEvent.press(await screen.findByText('Prospect absent'));
  await fireEvent.press(screen.getByText('Absent du cabinet'));
  await fireEvent.press(screen.getByText("Confirmer l'absence"));
  expect(await screen.findByText(/Sans réseau : l'envoi partira/)).toBeTruthy();
  const [envoi] = await lireAttente();
  expect(envoi).toMatchObject({
    type: 'absent_visite',
    visite: 'v1',
    saisie: { motif: 'm-absent', commentaire: '' },
  });
  expect(screen.queryByText('Démarrer la visite')).toBeNull();
});
