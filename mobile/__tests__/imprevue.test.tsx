import type { ClientApi, Programme, VisiteProgramme } from '@innov/api-client';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import * as Location from 'expo-location';
import { lireAttente } from '../src/Brouillons';
import i18n from '../src/i18n';
import { ContexteSession, type Session } from '../src/session';
import { EcranImprevue, FormulaireImprevue, VisiteImprevue } from '../src/Imprevue';
import { type Annonce } from '../src/Tournee';

// VIS-008 (0.4.8) : visite imprévue, justifiée (CA1), qui démarre aussitôt au jour réel ;
// marquée « imprévue » (CA2). Sans réseau, elle attend dans la file.

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
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPousser, back: jest.fn(), canGoBack: () => true }),
}));
jest.mock('../src/disposition', () => ({ useTablette: () => false }));
// L'écran est testé sans son cadre : seuls le titre, le jour et les boutons comptent ici.
jest.mock('../src/Ecran', () => ({
  Ecran: ({
    titre,
    surTitre,
    pied,
    children,
  }: {
    titre: string;
    surTitre?: string;
    pied?: ReactNode;
    children: ReactNode;
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
jest.mock('expo-crypto', () => ({ randomUUID: () => 'envoi-1' }));
jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
  Accuracy: { High: 4 },
}));
const permission = Location.requestForegroundPermissionsAsync as jest.Mock;
const position = Location.getCurrentPositionAsync as jest.Mock;

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

const CIBLES = [
  {
    cibles: [
      {
        prospect: {
          id: 'p9',
          civilite: 'dr',
          prenom: 'Fatou',
          nom: 'EXEMPLE',
          potentiel: 'B',
          specialite_libelle: 'Pédiatrie',
          type_libelle: 'Médecin',
          lieu_principal: null,
        },
      },
    ],
  },
];

const annonces: Annonce[] = [];
const fin = jest.fn();

async function rendre(imprevue: jest.Mock) {
  mockMemoire.set('programme.courant', { valeur: PROGRAMME, maj: '' });
  const session = {
    etat: { statut: 'connecte' },
    client: {
      visites: { imprevue },
      ciblage: { mesListes: jest.fn(async () => CIBLES) },
      exercices: {
        duProspect: jest.fn(async () => [
          { actif: true, principal: true, etablissement: { id: 'e9', nom: 'Pharmacie Fictive' } },
        ]),
      },
    } as unknown as ClientApi,
  } as unknown as Session;
  await render(
    <ContexteSession.Provider value={session}>
      <FormulaireImprevue programme={PROGRAMME} surFin={fin} surAnnonce={(a) => annonces.push(a)} />
    </ContexteSession.Provider>,
  );
}

beforeEach(async () => {
  mockMemoire.clear();
  annonces.length = 0;
  fin.mockReset();
  permission.mockReset().mockResolvedValue({ status: 'granted' });
  position
    .mockReset()
    .mockResolvedValue({ coords: { latitude: 14.7, longitude: -17.4, accuracy: 9 } });
  await i18n.changeLanguage('fr');
});

async function remplir(justification = 'Croisé à la pharmacie') {
  // Maquette 1.5.4 : un écran à part, avec le jour auquel la visite sera rattachée.
  expect(screen.getByText('Visite hors du planning')).toBeTruthy();
  expect(screen.getByText('Mardi 13 octobre')).toBeTruthy();
  await fireEvent.press(await screen.findByText('Dr Fatou EXEMPLE'));
  // Un seul lieu d'exercice : il est retenu d'office.
  expect(await screen.findByText('Pharmacie Fictive')).toBeTruthy();
  if (justification)
    await fireEvent.changeText(screen.getByLabelText('Justification (obligatoire)'), justification);
}

test('VIS-008 CA1 : sans justification, la visite imprévue ne démarre pas', async () => {
  const imprevue = jest.fn();
  await rendre(imprevue);
  await remplir('');
  await fireEvent.press(screen.getByText('Démarrer la visite imprévue'));
  expect(imprevue).not.toHaveBeenCalled();
});

test('VIS-008 : justifiée, elle démarre, passe en tête et se lit « Imprévue » (CA2)', async () => {
  const imprevue = jest.fn(async (s: { id: string; le: string }) => ({
    ...VISITE,
    id: s.id,
    heure: '11:40',
    prospect: { ...VISITE.prospect!, id: 'p9', prenom: 'Fatou', nom: 'EXEMPLE' },
    statut: 'en_cours',
    debut_le: s.le,
    est_imprevue: true,
    justification: 'Croisé à la pharmacie',
  }));
  await rendre(imprevue);
  await remplir();
  await fireEvent.press(screen.getByText('Démarrer la visite imprévue'));
  expect(imprevue).toHaveBeenCalledWith(
    expect.objectContaining({
      id: 'envoi-1',
      prospect: 'p9',
      etablissement: 'e9',
      justification: 'Croisé à la pharmacie',
      latitude: 14.7,
    }),
  );
  await waitFor(() => expect(fin).toHaveBeenCalled());
  expect(annonces).toEqual([
    { texte: 'Visite imprévue chez Dr Fatou EXEMPLE démarrée à 11:40.', ton: 'succes' },
  ]);
  // Elle est déjà dans le programme gardé, marquée « imprévue » (CA2).
  const garde = mockMemoire.get('programme.courant')?.valeur as Programme;
  const imprevues = garde.jours.flatMap((j) => j.visites).filter((v) => v.est_imprevue);
  expect(imprevues).toHaveLength(1);
});

test('VIS-008 : sans réseau, la visite imprévue attend dans la file et apparaît déjà', async () => {
  await rendre(
    jest.fn(async () => {
      throw new TypeError('Network request failed');
    }),
  );
  await remplir();
  await fireEvent.press(screen.getByText('Démarrer la visite imprévue'));
  await waitFor(() => expect(fin).toHaveBeenCalled());
  expect(annonces[0]?.texte).toMatch(/Sans réseau : l'envoi partira/);
  expect(annonces[0]?.ton).toBe('info');
  const [envoi] = await lireAttente();
  expect(envoi).toMatchObject({
    type: 'imprevue_visite',
    saisie: { prospect: 'p9', etablissement: 'e9', justification: 'Croisé à la pharmacie' },
  });
});

test('1.5.4 : sur le téléphone, le bouton ouvre l’écran, qui laisse son annonce à la Tournée', async () => {
  mockMemoire.set('programme.courant', { valeur: PROGRAMME, maj: '' });
  const surAnnonce = jest.fn();
  const imprevue = jest.fn(async (s: { id: string; le: string }) => ({
    ...VISITE,
    id: s.id,
    heure: '11:40',
    statut: 'en_cours',
    est_imprevue: true,
  }));
  const session = {
    etat: { statut: 'connecte' },
    client: {
      visites: { imprevue },
      ciblage: { mesListes: jest.fn(async () => CIBLES) },
      exercices: {
        duProspect: jest.fn(async () => [
          { actif: true, principal: true, etablissement: { id: 'e9', nom: 'Pharmacie Fictive' } },
        ]),
      },
    } as unknown as ClientApi,
  } as unknown as Session;
  await render(
    <ContexteSession.Provider value={session}>
      <VisiteImprevue programme={PROGRAMME} surAnnonce={surAnnonce} />
      <EcranImprevue />
    </ContexteSession.Provider>,
  );
  await fireEvent.press(screen.getByText('Visite imprévue'));
  expect(mockPousser).toHaveBeenCalledWith('/imprevue');
  await fireEvent.press(await screen.findByText('Dr Fatou EXEMPLE'));
  await fireEvent.changeText(
    await screen.findByLabelText('Justification (obligatoire)'),
    'Croisé à la pharmacie',
  );
  await fireEvent.press(screen.getByText('Démarrer la visite imprévue'));
  await waitFor(() =>
    expect(surAnnonce).toHaveBeenCalledWith({
      texte: 'Visite imprévue chez Dr Fatou EXEMPLE démarrée à 11:40.',
      ton: 'succes',
    }),
  );
});
