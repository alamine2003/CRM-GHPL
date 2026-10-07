import type { ClientApi, Rapport, VisiteProgramme } from '@innov/api-client';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { lireAttente } from '../src/Brouillons';
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
  presentations: [],
  remises: [],
  resultat_obtenu: '',
  resultat: null,
  resume: '',
  prochaine_action: '',
  prochaine_action_type: null,
  prochaine_action_echeance: null,
  visite_proposee: false,
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
  produit_autre_autorise: false,
  articles_proposes: [{ id: 'stylo', libelle: 'Stylo' }],
  types_action_proposes: [
    { id: 'etude', libelle: 'Présenter une étude' },
    { id: 'autre', libelle: 'Autre' },
  ],
  action_precedente: null,
  pieces_jointes: [],
  produits_proposes: [
    { id: 'pa', libelle: 'Produit Alpha' },
    { id: 'pb', libelle: 'Produit Beta' },
  ],
  resultats_proposes: [{ id: 'ok', libelle: 'Objectif atteint' }],
};

const saisieVide = {
  presentations: [],
  remises: [],
  resultat: null,
  resultat_obtenu: '',
  resume: '',
  prochaine_action: '',
  prochaine_action_type: null,
  prochaine_action_echeance: null,
  visite_proposee: false,
  champs: {},
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
  // La visite du rapport, gardée avec le programme : les échéances partent de son jour.
  mockMemoire.set('programme.courant', {
    valeur: {
      fuseau: 'UTC',
      jours: [{ date: '2026-10-13', visites: [{ id: 'v1', date: '2026-10-13', heure: '09:00' }] }],
      a_justifier: [],
    },
    maj: '2026-10-13T06:30:00.000Z',
  });
  await i18n.changeLanguage('fr');
});

test('RPT-002 CA1 : le calcul local des manquants suit le socle puis les champs du pays', () => {
  const saisie = {
    presentations: [{ produit: 'pa', libelle: 'Produit Alpha', retour: 'peu' as const }],
    remises: [],
    resultat: 'ok',
    resultat_obtenu: '',
    resume: ' ',
    prochaine_action: 'Relancer',
    prochaine_action_type: 'etude',
    prochaine_action_echeance: null,
    visite_proposee: false,
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
      'À compléter avant de soumettre : produits présentés, résultat, résumé, type de prochaine action, prochaine action, Patients par semaine.',
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
    presentations: [
      { produit: 'pb', libelle: 'Produit Beta', retour: 'tres_bien' as const },
      { produit: 'pa', libelle: 'Produit Alpha', retour: 'peu' as const },
    ],
    remises: [
      {
        type: 'echantillon' as const,
        produit: 'pb',
        article: null,
        libelle: 'Produit Beta',
        quantite: 2,
      },
    ],
    resultat: 'ok',
    resultat_obtenu: 'Essai sur 5 patients',
    resume: 'Bon accueil',
    prochaine_action: 'Apporter l’étude',
    prochaine_action_type: 'etude',
    prochaine_action_echeance: '2026-10-20',
    visite_proposee: true,
    champs: { patients: 40 },
  }));
  await rendre({ rapport: jest.fn(async () => BROUILLON), enregistrerRapport, soumettreRapport });
  await fireEvent.press(await screen.findByText('Produit Beta'));
  await fireEvent.press(screen.getByText('Produit Alpha'));
  // Le rang de présentation s'affiche sur la pastille.
  expect(screen.getAllByText('1. Produit Beta')).toHaveLength(2);
  expect(screen.getAllByText('2. Produit Alpha')).toHaveLength(2);
  // RPT-004 : le retour du prescripteur, produit par produit ; sans lui, pas de soumission.
  expect(screen.getByText(/retour du prescripteur sur chaque produit/)).toBeTruthy();
  await fireEvent.press(screen.getAllByLabelText('Prescrit très bien')[0]!);
  await fireEvent.press(screen.getAllByLabelText('Prescrit peu')[1]!);
  // RPT-005 : deux échantillons du premier produit présenté.
  await fireEvent.press(screen.getByText('+ Produit Beta'));
  await fireEvent.press(screen.getByLabelText('Une unité de plus pour Produit Beta'));
  await fireEvent.press(screen.getByText('Objectif atteint'));
  await fireEvent.changeText(
    screen.getByLabelText('Précisez ce qui a été obtenu (facultatif)'),
    'Essai sur 5 patients',
  );
  await fireEvent.changeText(screen.getByLabelText("Résumé de l'échange"), 'Bon accueil');
  // RPT-006 : type, précision, échéance (une semaine après la visite), nouvelle visite.
  await fireEvent.press(screen.getByText('Présenter une étude'));
  await fireEvent.changeText(screen.getByLabelText("Précisez l'action"), 'Apporter l’étude');
  await fireEvent.press(screen.getByText('Dans 1 semaine'));
  await fireEvent(screen.getByLabelText('Proposer une nouvelle visite'), 'valueChange', true);
  await fireEvent.changeText(screen.getByLabelText('Patients par semaine'), '40');
  await fireEvent.press(screen.getByText('Soumettre le rapport'));
  expect(enregistrerRapport).toHaveBeenCalledWith('v1', {
    presentations: [
      { produit: 'pb', libelle: 'Produit Beta', retour: 'tres_bien' },
      { produit: 'pa', libelle: 'Produit Alpha', retour: 'peu' },
    ],
    remises: [
      { type: 'echantillon', produit: 'pb', article: null, libelle: 'Produit Beta', quantite: 2 },
    ],
    resultat: 'ok',
    resultat_obtenu: 'Essai sur 5 patients',
    resume: 'Bon accueil',
    prochaine_action: 'Apporter l’étude',
    prochaine_action_type: 'etude',
    prochaine_action_echeance: '2026-10-20',
    visite_proposee: true,
    champs: { patients: 40 },
  });
  expect(soumettreRapport).toHaveBeenCalledWith('v1', expect.any(String));
  expect(await screen.findByText('Rapport soumis à votre superviseur.')).toBeTruthy();
  // Soumis, il se lit sans se modifier.
  expect(screen.queryByText('Soumettre le rapport')).toBeNull();
  expect(
    screen.getByText('1. Produit Beta — Prescrit très bien\n2. Produit Alpha — Prescrit peu'),
  ).toBeTruthy();
  expect(screen.getByText('Échantillon · Produit Beta × 2')).toBeTruthy();
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

test('RPT-004 CA2 : sans autorisation du pays, pas de produit « autre »', async () => {
  await rendre({ rapport: jest.fn(async () => BROUILLON) });
  await screen.findByText('Produit Alpha');
  expect(screen.queryByLabelText('Autre produit présenté')).toBeNull();
});

test('RPT-004 CA2 : un produit « autre » si le pays l’autorise', async () => {
  await rendre({ rapport: jest.fn(async () => ({ ...BROUILLON, produit_autre_autorise: true })) });
  await fireEvent.changeText(
    await screen.findByLabelText('Autre produit présenté'),
    'Concurrent X',
  );
  await fireEvent.press(screen.getByText('Ajouter'));
  expect(screen.getByText('1. Concurrent X')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Retirer Concurrent X'));
  expect(screen.queryByText('1. Concurrent X')).toBeNull();
});

test('RPT-005 CA1 : un cadeau se remet sans stock, la quantité se règle et revient à zéro', async () => {
  await rendre({ rapport: jest.fn(async () => BROUILLON) });
  // Pas d'échantillon sans produit présenté.
  expect(await screen.findByText(/leurs échantillons apparaîtront ici/)).toBeTruthy();
  await fireEvent.press(screen.getByText('Cadeau'));
  await fireEvent.press(screen.getByText('+ Stylo'));
  expect(screen.getByText('Cadeau · Stylo')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Une unité de moins pour Stylo'));
  expect(screen.queryByText('Cadeau · Stylo')).toBeNull();
});

test('RPT-006 CA1 : le rapport rappelle l’action notée à la visite précédente', async () => {
  await rendre({
    rapport: jest.fn(async () => ({
      ...BROUILLON,
      action_precedente: {
        date: '2026-10-06',
        type: 'Revisiter le prescripteur',
        texte: 'Revenir avec les nouvelles données',
        echeance: null,
        visite_proposee: false,
      },
    })),
  });
  expect(await screen.findByText(/Action prévue à la visite du/)).toBeTruthy();
  expect(screen.getByText('Revenir avec les nouvelles données')).toBeTruthy();
});

describe('RPT-009 : brouillon gardé automatiquement', () => {
  test('chaque saisie s’enregistre toute seule, sans bouton', async () => {
    const enregistrerRapport = jest.fn(async (_id: string, s: object) => ({ ...BROUILLON, ...s }));
    await rendre({ rapport: jest.fn(async () => BROUILLON), enregistrerRapport });
    await fireEvent.changeText(await screen.findByLabelText("Résumé de l'échange"), 'Bon accueil');
    await waitFor(() => expect(enregistrerRapport).toHaveBeenCalled(), { timeout: 3000 });
    expect(enregistrerRapport.mock.calls[0]![1]).toMatchObject({ resume: 'Bon accueil' });
    expect(await screen.findByText(/Enregistré automatiquement à/)).toBeTruthy();
    expect(screen.queryByText('Enregistrer le brouillon')).toBeNull();
  });

  test('sans réseau, la saisie reste sur le téléphone et attend dans la file', async () => {
    await rendre({
      rapport: jest.fn(async () => BROUILLON),
      enregistrerRapport: jest.fn(async () => {
        throw new TypeError('Network request failed');
      }),
    });
    await fireEvent.changeText(await screen.findByLabelText("Résumé de l'échange"), 'Hors réseau');
    expect(await screen.findByText(/Gardé sur le téléphone à/, {}, { timeout: 3000 })).toBeTruthy();
    expect(await lireAttente()).toEqual([
      expect.objectContaining({ type: 'brouillon_rapport', visite: 'v1' }),
    ]);
    expect(mockMemoire.get('rapport.v1')?.valeur).toMatchObject({
      envoye: false,
      saisie: { resume: 'Hors réseau' },
    });
  });

  test('CA1 : après un redémarrage, la saisie non envoyée est reprise', async () => {
    // La session précédente a laissé une saisie sur le téléphone, jamais reçue par le serveur.
    mockMemoire.set('rapport.v1', {
      valeur: {
        rapport: BROUILLON,
        saisie: { ...saisieVide, resume: 'Saisi avant la coupure' },
        modifie_le: '2026-10-13T09:50:00Z',
        envoye: false,
      },
      maj: '2026-10-13T09:50:00Z',
    });
    await rendre({ rapport: jest.fn(async () => BROUILLON) });
    expect(await screen.findByText(/Brouillon repris/)).toBeTruthy();
    expect(screen.getByDisplayValue('Saisi avant la coupure')).toBeTruthy();
  });

  test('sans réseau, un rapport déjà ouvert se complète sur le téléphone', async () => {
    mockMemoire.set('rapport.v1', {
      valeur: { rapport: BROUILLON, saisie: null, modifie_le: null, envoye: true },
      maj: '2026-10-13T09:50:00Z',
    });
    await rendre({
      rapport: jest.fn(async () => {
        throw new TypeError('Network request failed');
      }),
    });
    expect(
      await screen.findByText(/vous complétez le rapport gardé sur le téléphone/),
    ).toBeTruthy();
    expect(screen.getByText('Objectif prévu')).toBeTruthy();
  });
});
