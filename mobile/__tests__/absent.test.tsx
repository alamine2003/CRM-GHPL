import type { ClientApi, Programme, VisiteProgramme } from '@innov/api-client';
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { lireAttente } from '../src/Brouillons';
import type { TypeEcart } from '../src/Execution';
import i18n from '../src/i18n';
import { ContexteSession, type Session } from '../src/session';
import { AnnonceVisite, EcartVisite, EcranEcart, EcranVisite } from '../src/Visite';

// VIS-005 (0.4.5) : prospect absent, avec un motif de la liste du pays ; CA1 : impossible sans motif.
// Sans réseau, la déclaration attend dans la file comme les autres envois. Depuis 1.4.1, selon la
// maquette : « Prospect absent » en bas de l'écran de la visite ouvre l'écran « Le prospect est
// absent » (motifs à cocher, commentaire facultatif, Retour / Confirmer l'absence).

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

const sansReseau = () => Promise.reject(new TypeError('Network request failed'));

function session(visites: Record<string, unknown>) {
  return {
    etat: { statut: 'connecte' },
    client: {
      plannings: { semaine: jest.fn(sansReseau) },
      visites: { detail: jest.fn(sansReseau), ...visites },
    } as unknown as ClientApi,
  } as unknown as Session;
}

function garder(visite = VISITE) {
  mockMemoire.set('programme.courant', {
    valeur: { ...PROGRAMME, jours: [{ ...PROGRAMME.jours[0]!, visites: [visite] }] },
    maj: '2026-10-13T06:30:00.000Z',
  });
}

/** L'écart seul, tel que la fenêtre de la tablette l'affiche, avec l'annonce qu'il laisse. */
async function rendreEcart(visites: Record<string, unknown>, type: TypeEcart = 'absent') {
  garder();
  const surFin = jest.fn();
  await render(
    <ContexteSession.Provider value={session(visites)}>
      <AnnonceVisite id="v1" />
      <EcartVisite visite={VISITE} programme={PROGRAMME} type={type} surFin={surFin} />
    </ContexteSession.Provider>,
  );
  return surFin;
}

beforeEach(async () => {
  mockMemoire.clear();
  mockPousser.mockClear();
  mockRetour.mockClear();
  await i18n.changeLanguage('fr');
});

test('VIS-005 : « Prospect absent » en bas de la visite ouvre l’écran de l’absence', async () => {
  garder();
  await render(
    <ContexteSession.Provider value={session({})}>
      <EcranVisite id="v1" jour="2026-10-13" />
    </ContexteSession.Provider>,
  );
  expect(await screen.findByText('Démarrer la visite')).toBeTruthy();
  await fireEvent.press(screen.getByText('Prospect absent'));
  expect(mockPousser).toHaveBeenCalledWith({
    pathname: '/ecart/[id]',
    params: { id: 'v1', type: 'absent' },
  });
});

test('VIS-005 CA1 : sans motif, l’absence ne se confirme pas', async () => {
  const absent = jest.fn();
  const surFin = await rendreEcart({ absent });
  expect(screen.getByText('Le prospect est absent')).toBeTruthy();
  expect(screen.getByText('Dr Awa FICTIF · 09:00')).toBeTruthy();
  expect(screen.getByText('Motif (obligatoire)')).toBeTruthy();
  await fireEvent.press(screen.getByText("Confirmer l'absence"));
  expect(absent).not.toHaveBeenCalled();
  // Retour ferme l'écart sans rien envoyer.
  await fireEvent.press(screen.getByText('Retour'));
  expect(surFin).toHaveBeenCalled();
  expect(absent).not.toHaveBeenCalled();
});

test('VIS-005 : avec un motif coché, la visite passe « prospect absent » et l’écran l’annonce', async () => {
  const absent = jest.fn(async (_id: string, s: { le: string; commentaire: string }) => ({
    ...VISITE,
    statut: 'prospect_absent',
    motif_ecart: MOTIF,
    commentaire_ecart: s.commentaire,
    ecart_le: s.le,
  }));
  const surFin = await rendreEcart({ absent });
  const motif = screen.getByRole('radio', { name: 'Absent du cabinet' });
  expect(motif.props.accessibilityState).toEqual({ checked: false });
  await fireEvent.press(motif);
  expect(screen.getByRole('radio', { name: 'Absent du cabinet' }).props.accessibilityState).toEqual(
    { checked: true },
  );
  expect(screen.getByPlaceholderText('Précisions pour votre superviseur')).toBeTruthy();
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
  expect(surFin).toHaveBeenCalled();
  // Le programme gardé sur le téléphone le sait déjà.
  const garde = mockMemoire.get('programme.courant')?.valeur as Programme;
  expect(garde.jours[0]!.visites[0]).toMatchObject({
    statut: 'prospect_absent',
    motif_ecart: MOTIF,
  });
  expect(await lireAttente()).toEqual([]);
});

test('VIS-005 : une visite en cours peut aussi finir « prospect absent »', async () => {
  const enCours = { ...VISITE, statut: 'en_cours' as const, debut_le: '2026-10-13T09:02:00.000Z' };
  garder(enCours);
  await render(
    <ContexteSession.Provider value={session({})}>
      <EcranVisite id="v1" jour="2026-10-13" />
    </ContexteSession.Provider>,
  );
  expect(await screen.findByText('Terminer la visite')).toBeTruthy();
  await fireEvent.press(screen.getByText('Prospect absent'));
  expect(mockPousser).toHaveBeenCalledWith({
    pathname: '/ecart/[id]',
    params: { id: 'v1', type: 'absent' },
  });
});

test('VIS-005 : sur le téléphone, l’absence a son écran et revient à la visite', async () => {
  garder();
  const absent = jest.fn(async () => ({
    ...VISITE,
    statut: 'prospect_absent',
    motif_ecart: MOTIF,
  }));
  await render(
    <ContexteSession.Provider value={session({ absent })}>
      <EcranEcart id="v1" type="absent" />
    </ContexteSession.Provider>,
  );
  expect(await screen.findByText('Le prospect est absent')).toBeTruthy();
  expect(screen.getByText('Dr Awa FICTIF · 09:00')).toBeTruthy();
  await fireEvent.press(screen.getByText('Absent du cabinet'));
  await fireEvent.press(screen.getByText("Confirmer l'absence"));
  expect(absent).toHaveBeenCalledTimes(1);
  expect(mockRetour).toHaveBeenCalled();
});

test('VIS-005 : sans réseau, la déclaration attend dans la file et la visite change déjà', async () => {
  await rendreEcart({ absent: jest.fn(sansReseau) });
  await fireEvent.press(screen.getByText('Absent du cabinet'));
  await fireEvent.press(screen.getByText("Confirmer l'absence"));
  expect(await screen.findByText(/Sans réseau : l'envoi partira/)).toBeTruthy();
  const [envoi] = await lireAttente();
  expect(envoi).toMatchObject({
    type: 'absent_visite',
    visite: 'v1',
    saisie: { motif: 'm-absent', commentaire: '' },
  });
  const garde = mockMemoire.get('programme.courant')?.valeur as Programme;
  expect(garde.jours[0]!.visites[0]!.statut).toBe('prospect_absent');
});
