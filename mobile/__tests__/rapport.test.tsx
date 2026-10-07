import type { ClientApi, Rapport, VisiteProgramme } from '@innov/api-client';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { ExecutionVisite } from '../src/Execution';
import i18n from '../src/i18n';
import { FormulaireRapport, manquantsDe } from '../src/Rapport';
import { ContexteSession, type Session } from '../src/session';

// RPT-001, RPT-002, RPT-008 (0.5.1) : le rapport de la visite effectuée, socle commun et
// champs du pays ; soumis seulement une fois complet.

const mockMemoire = new Map<string, { valeur: unknown; maj: string }>();
jest.mock('../src/baseLocale', () => ({
  lire: jest.fn(async (cle: string) => mockMemoire.get(cle) ?? null),
  ecrire: jest.fn(async (cle: string, valeur: unknown) =>
    mockMemoire.set(cle, { valeur, maj: '2026-10-13T06:30:00.000Z' }),
  ),
  oublier: jest.fn(async (cle: string) => mockMemoire.delete(cle)),
  effacer: jest.fn(),
}));
const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('expo-location', () => ({}));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'envoi-1' }));

const BROUILLON: Rapport = {
  id: 'r1',
  visite: 'v1',
  statut: 'brouillon',
  objectif_prevu: 'Présenter la nouvelle forme sirop',
  est_imprevue: false,
  justification: '',
  produits: [],
  resultat_obtenu: '',
  resultat: null,
  resume: '',
  prochaine_action: '',
  champs: {},
  definitions: [
    {
      code: 'patients',
      libelle: 'Patients par semaine',
      type: 'nombre',
      options: [],
      obligatoire: true,
    },
  ],
  soumis_le: null,
  manquants: ['produits', 'resultat', 'resume', 'prochaine_action', 'patients'],
  produits_proposes: [
    { id: 'pa', libelle: 'Produit Alpha' },
    { id: 'pb', libelle: 'Produit Beta' },
  ],
  resultats_proposes: [{ id: 'ok', libelle: 'Objectif atteint' }],
};

function rendre(visites: Record<string, jest.Mock>) {
  const session = {
    etat: { statut: 'connecte' },
    client: { visites } as unknown as ClientApi,
  } as unknown as Session;
  return render(
    <ContexteSession.Provider value={session}>
      <FormulaireRapport id="v1" />
    </ContexteSession.Provider>,
  );
}

beforeEach(async () => {
  mockMemoire.clear();
  await i18n.changeLanguage('fr');
});

test('RPT-002 CA1 : le calcul local des manquants suit le socle puis les champs du pays', () => {
  const saisie = {
    produits: ['pa'],
    resultat: 'ok',
    resultat_obtenu: '',
    resume: ' ',
    prochaine_action: 'Relancer',
    champs: {},
  };
  expect(manquantsDe(saisie, BROUILLON.definitions)).toEqual(['resume', 'patients']);
  expect(
    manquantsDe(
      { ...saisie, resume: 'Bon accueil', champs: { patients: 0 } },
      BROUILLON.definitions,
    ),
  ).toEqual([]);
});

test('RPT-002 : incomplet, le rapport ne se soumet pas et dit ce qui manque', async () => {
  const soumettreRapport = jest.fn();
  await rendre({ rapport: jest.fn(async () => BROUILLON), soumettreRapport });
  expect(
    await screen.findByText(
      'À compléter avant de soumettre : produits présentés, résultat, résumé, prochaine action, Patients par semaine.',
    ),
  ).toBeTruthy();
  await fireEvent.press(screen.getByText('Soumettre le rapport'));
  expect(soumettreRapport).not.toHaveBeenCalled();
});

test('RPT-001 : produits dans l’ordre de présentation, puis soumission', async () => {
  const enregistrerRapport = jest.fn(async (_id: string, s: object) => ({ ...BROUILLON, ...s }));
  const soumettreRapport = jest.fn(async () => ({
    ...BROUILLON,
    statut: 'soumis',
    produits: ['pb', 'pa'],
    resultat: 'ok',
    resultat_obtenu: 'Essai sur 5 patients',
    resume: 'Bon accueil',
    prochaine_action: 'Apporter l’étude',
    champs: { patients: 40 },
  }));
  await rendre({ rapport: jest.fn(async () => BROUILLON), enregistrerRapport, soumettreRapport });
  await fireEvent.press(await screen.findByText('Produit Beta'));
  await fireEvent.press(screen.getByText('Produit Alpha'));
  // Le rang de présentation s'affiche sur la pastille.
  expect(screen.getByText('1. Produit Beta')).toBeTruthy();
  expect(screen.getByText('2. Produit Alpha')).toBeTruthy();
  await fireEvent.press(screen.getByText('Objectif atteint'));
  await fireEvent.changeText(
    screen.getByLabelText('Précisez ce qui a été obtenu (facultatif)'),
    'Essai sur 5 patients',
  );
  await fireEvent.changeText(screen.getByLabelText("Résumé de l'échange"), 'Bon accueil');
  await fireEvent.changeText(screen.getByLabelText('Prochaine action'), 'Apporter l’étude');
  await fireEvent.changeText(screen.getByLabelText('Patients par semaine'), '40');
  await fireEvent.press(screen.getByText('Soumettre le rapport'));
  expect(enregistrerRapport).toHaveBeenCalledWith('v1', {
    produits: ['pb', 'pa'],
    resultat: 'ok',
    resultat_obtenu: 'Essai sur 5 patients',
    resume: 'Bon accueil',
    prochaine_action: 'Apporter l’étude',
    champs: { patients: 40 },
  });
  expect(soumettreRapport).toHaveBeenCalledWith('v1', expect.any(String));
  expect(await screen.findByText('Rapport soumis à votre superviseur.')).toBeTruthy();
  // Soumis, il se lit sans se modifier.
  expect(screen.queryByText('Soumettre le rapport')).toBeNull();
  expect(screen.getByText('1. Produit Beta\n2. Produit Alpha')).toBeTruthy();
  expect(screen.getByText('Objectif atteint\nEssai sur 5 patients')).toBeTruthy();
});

test('RPT-003 CA1 : l’objectif prévu en tête du rapport', async () => {
  await rendre({ rapport: jest.fn(async () => BROUILLON) });
  expect(await screen.findByText('Objectif prévu')).toBeTruthy();
  expect(screen.getByText('Présenter la nouvelle forme sirop')).toBeTruthy();
  expect(screen.getByText("Au regard de l'objectif prévu.")).toBeTruthy();
});

test('RPT-003 : une visite imprévue rappelle sa justification à la place', async () => {
  const imprevue = {
    ...BROUILLON,
    objectif_prevu: '',
    est_imprevue: true,
    justification: 'Croisé à la pharmacie',
  };
  await rendre({ rapport: jest.fn(async () => imprevue) });
  expect(await screen.findByText('Visite imprévue — justification')).toBeTruthy();
  expect(screen.getByText('Croisé à la pharmacie')).toBeTruthy();
});

test('Sans réseau, le rapport ne s’ouvre pas et le dit', async () => {
  await rendre({
    rapport: jest.fn(async () => {
      throw new TypeError('Network request failed');
    }),
  });
  expect(await screen.findByText(/Le rapport s'écrit avec du réseau/)).toBeTruthy();
  expect(screen.getByText('Réessayer')).toBeTruthy();
});

const EFFECTUEE = {
  id: 'v1',
  date: '2026-10-13',
  heure: '09:00',
  prospect: null,
  etablissement: null,
  statut: 'effectuee',
  debut_le: '2026-10-13T09:02:00Z',
  fin_le: '2026-10-13T09:20:00Z',
  fin_sans_gps: false,
  motif_ecart: null,
  report: null,
} as unknown as VisiteProgramme;

test.each([
  ['attendu', 'Rédiger le rapport'],
  ['brouillon', 'Reprendre le rapport'],
  ['soumis', 'Voir le rapport'],
] as const)('RPT-001 : visite effectuée, rapport %s → « %s »', async (statut, libelle) => {
  mockPush.mockClear();
  await render(
    <ContexteSession.Provider value={{ client: {} } as unknown as Session}>
      <ExecutionVisite
        visite={{ ...EFFECTUEE, rapport_statut: statut }}
        aujourdhui="2026-10-13"
        geolocalisation={false}
        fuseau="UTC"
      />
    </ContexteSession.Provider>,
  );
  await fireEvent.press(screen.getByText(libelle));
  expect(mockPush).toHaveBeenCalledWith({ pathname: '/rapport/[id]', params: { id: 'v1' } });
});
