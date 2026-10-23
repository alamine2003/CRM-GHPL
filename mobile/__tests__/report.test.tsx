import type { ClientApi, Programme, VisiteProgramme } from '@innov/api-client';
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { lireAttente } from '../src/Brouillons';
import i18n from '../src/i18n';
import { ContexteSession, type Session } from '../src/session';
import { AnnonceVisite, EcartVisite, EcranVisite } from '../src/Visite';

// VIS-007 (0.4.7) : reporter une visite, avec un motif, à un nouveau jour ; la nouvelle visite
// est liée à l'originale (CA1) et, dans la semaine approuvée, attend l'accord du superviseur (CA2).

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
jest.mock('../src/Ecran', () => ({
  Ecran: ({ children, pied }: { children: ReactNode; pied?: ReactNode }) => (
    <>
      {children}
      {pied}
    </>
  ),
}));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'envoi-1' }));
jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
  Accuracy: { High: 4 },
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

const sansReseau = () => Promise.reject(new TypeError('Network request failed'));

function session(reporter: jest.Mock) {
  return {
    etat: { statut: 'connecte' },
    client: {
      plannings: { semaine: jest.fn(sansReseau) },
      visites: { reporter, detail: jest.fn(sansReseau) },
    } as unknown as ClientApi,
  } as unknown as Session;
}

const PROGRAMME = {
  semaine: '2026-10-12',
  aujourdhui: '2026-10-13',
  fuseau: 'UTC',
  etat: 'approuve',
  prochaine: 'v1',
  geolocalisation: true,
  attente_gps_secondes: 60,
  motifs_ecart: [MOTIF],
  a_justifier: [],
  a_corriger: [],
  jours: ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16'].map((date) => ({
    date,
    ferie: null,
    visites: date === VISITE.date ? [VISITE] : [],
    activites: [],
  })),
} as unknown as Programme;

/** « Reporter » ouvre cet écart : motif, nouveau jour, heure, commentaire. */
async function rendre(reporter: jest.Mock) {
  mockMemoire.set('programme.courant', { valeur: PROGRAMME, maj: '2026-10-13T06:30:00.000Z' });
  await render(
    <ContexteSession.Provider value={session(reporter)}>
      <AnnonceVisite id="v1" />
      <EcartVisite visite={VISITE} programme={PROGRAMME} type="reporter" surFin={jest.fn()} />
    </ContexteSession.Provider>,
  );
}

beforeEach(async () => {
  mockMemoire.clear();
  await i18n.changeLanguage('fr');
});

test('VIS-007 : reportée à un nouveau jour, avec son motif ; la semaine approuvée attend le superviseur', async () => {
  const reporter = jest.fn(async (_id: string, s: { id: string; date: string; heure: string }) => ({
    ...VISITE,
    statut: 'reportee',
    motif_ecart: MOTIF,
    report: { id: s.id, date: s.date, heure: s.heure },
    est_imprevue: false,
    justification: '',
  }));
  await rendre(reporter);
  expect(screen.getByText('Reporter cette visite')).toBeTruthy();
  // Sans motif ni jour, rien ne part.
  await fireEvent.press(screen.getByText('Confirmer le report'));
  await fireEvent.press(screen.getByText('Absent du cabinet'));
  await fireEvent.press(screen.getByText('Confirmer le report'));
  expect(reporter).not.toHaveBeenCalled();
  // Les jours proposés suivent le jour prévu ; l'heure prévue est reprise.
  expect(screen.queryByText(/13 oct/)).toBeNull();
  await fireEvent.press(screen.getByText(/15 oct/));
  await fireEvent.press(screen.getByText('Confirmer le report'));
  expect(reporter).toHaveBeenCalledWith(
    'v1',
    expect.objectContaining({
      motif: 'm-absent',
      date: '2026-10-15',
      heure: '09:00',
      id: 'envoi-1',
    }),
  );
  expect(
    await screen.findByText(
      /reportée au jeudi 15 octobre · 09:00 : Absent du cabinet\. Le nouveau jour attend l'accord de votre superviseur\./,
    ),
  ).toBeTruthy();
});

test('VIS-007 CA1 : la visite reportée dit son motif et son nouveau jour', async () => {
  const reportee = {
    ...VISITE,
    statut: 'reportee' as const,
    motif_ecart: MOTIF,
    report: { id: 'v2', date: '2026-10-15', heure: '10:00' },
  };
  mockMemoire.set('programme.courant', {
    valeur: {
      ...PROGRAMME,
      jours: PROGRAMME.jours.map((j) =>
        j.date === VISITE.date ? { ...j, visites: [reportee] } : j,
      ),
    },
    maj: '2026-10-13T06:30:00.000Z',
  });
  await render(
    <ContexteSession.Provider value={session(jest.fn())}>
      <EcranVisite id="v1" jour="2026-10-13" />
    </ContexteSession.Provider>,
  );
  expect(await screen.findByText('Motif du report')).toBeTruthy();
  expect(screen.getByText('Reportée au jeudi 15 octobre · 10:00')).toBeTruthy();
});

test('VIS-007 : une heure mal écrite ne part pas', async () => {
  const reporter = jest.fn();
  await rendre(reporter);
  await fireEvent.press(screen.getByText('Absent du cabinet'));
  await fireEvent.press(screen.getByText(/15 oct/));
  await fireEvent.changeText(screen.getByLabelText('Heure (obligatoire, HH:MM)'), '9h');
  await fireEvent.press(screen.getByText('Confirmer le report'));
  expect(reporter).not.toHaveBeenCalled();
});

test('VIS-007 : sans réseau, le report attend dans la file avec son nouveau jour', async () => {
  await rendre(
    jest.fn(async () => {
      throw new TypeError('Network request failed');
    }),
  );
  await fireEvent.press(screen.getByText('Absent du cabinet'));
  await fireEvent.press(screen.getByText(/19 oct/));
  await fireEvent.press(screen.getByText('Confirmer le report'));
  expect(await screen.findByText(/Sans réseau : l'envoi partira/)).toBeTruthy();
  const [envoi] = await lireAttente();
  expect(envoi).toMatchObject({
    type: 'reporter_visite',
    visite: 'v1',
    saisie: { date: '2026-10-19', heure: '09:00', motif: 'm-absent' },
  });
});
