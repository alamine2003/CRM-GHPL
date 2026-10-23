import type { ClientApi, Programme, Rapport, VisiteProgramme } from '@innov/api-client';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { lireAttente } from '../src/Brouillons';
import i18n from '../src/i18n';
import { FormulaireRapport, manquantsDe } from '../src/Rapport';
import { ContexteSession, type Session } from '../src/session';
import { ActionsVisite } from '../src/Visite';
import type { ReactNode } from 'react';

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
// Le gabarit (en-tête, onglets) est testé ailleurs : ici, son titre, son statut, le contenu et
// les boutons collés en bas.
const mockTablette = { valeur: false };
jest.mock('../src/disposition', () => ({ useTablette: () => mockTablette.valeur }));
jest.mock('../src/Ecran', () => ({
  Ecran: ({
    surTitre,
    action,
    enteteTablette,
    children,
    pied,
    droite,
  }: {
    surTitre?: string;
    action?: ReactNode;
    enteteTablette?: { surTitre?: string; action?: ReactNode };
    children: ReactNode;
    pied?: ReactNode;
    droite?: ReactNode;
  }) => {
    const { Text } = jest.requireActual('react-native');
    const { useTablette } = jest.requireMock('../src/disposition');
    return useTablette() ? (
      <>
        <Text>{enteteTablette?.surTitre}</Text>
        {enteteTablette?.action}
        {children}
        {droite}
      </>
    ) : (
      <>
        <Text>{surTitre}</Text>
        {action}
        {children}
        {pied}
      </>
    );
  },
}));

const BROUILLON: Rapport = {
  id: 'r1',
  version: 1,
  visite: 'v1',
  statut: 'brouillon',
  correction: null,
  reouverture: null,
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
  echeance: '2099-01-01T00:00:00Z',
  en_retard: false,
  horodatage_douteux: false,
  modifie_le: '2026-10-12T10:40:00.000Z',
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
  mockTablette.valeur = false;
  mockMemoire.clear();
  // La visite du rapport, gardée avec le programme : les échéances partent de son jour.
  mockMemoire.set('programme.courant', {
    valeur: {
      fuseau: 'UTC',
      jours: [{ date: '2026-10-13', visites: [{ id: 'v1', date: '2026-10-13', heure: '09:00' }] }],
      a_justifier: [],
      a_corriger: [],
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
  // Le rang de présentation s'affiche sur la pastille (carré orange), puis sur la ligne du retour.
  expect(screen.getByLabelText('1. Produit Beta')).toBeTruthy();
  expect(screen.getByLabelText('2. Produit Alpha')).toBeTruthy();
  expect(screen.getByText('1. Produit Beta')).toBeTruthy();
  expect(screen.getByText('2. Produit Alpha')).toBeTruthy();
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
    // RG-052 : la version du rapport sur laquelle la saisie s'appuie.
    version: 1,
  });
  expect(soumettreRapport).toHaveBeenCalledWith('v1', expect.any(String));
  expect(await screen.findByText('Rapport soumis à votre superviseur.')).toBeTruthy();
  // Soumis, il se lit sans se modifier.
  expect(screen.queryByText('Soumettre le rapport')).toBeNull();
  // Des cartes de lignes : chaque produit et son retour, chaque remise et sa quantité.
  expect(screen.getByText('1. Produit Beta')).toBeTruthy();
  expect(screen.getByText('Prescrit très bien')).toBeTruthy();
  expect(screen.getByText('2. Produit Alpha')).toBeTruthy();
  expect(screen.getByText('Prescrit peu')).toBeTruthy();
  expect(screen.getByText('Échantillon · Produit Beta')).toBeTruthy();
  expect(screen.getByText('× 2')).toBeTruthy();
  expect(screen.getByText('Objectif atteint · Essai sur 5 patients')).toBeTruthy();
});

test('RPT-003 CA1 : l’objectif prévu en tête du rapport', async () => {
  await rendre({ rapport: jest.fn(async () => BROUILLON) });
  expect(await screen.findByText('Objectif prévu')).toBeTruthy();
  expect(screen.getByText('Présenter la nouvelle forme sirop')).toBeTruthy();
  // Le résultat se choisit en segments, sous l'objectif.
  expect(screen.getByRole('radio', { name: 'Objectif atteint' })).toBeTruthy();
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

test('RPT-003 : une visite planifiée sans objectif le dit en tête du rapport', async () => {
  await rendre({ rapport: jest.fn(async () => ({ ...BROUILLON, objectif_prevu: '' })) });
  expect(await screen.findByText('Objectif prévu')).toBeTruthy();
  expect(screen.getByText("Aucun objectif n'était prévu pour cette visite.")).toBeTruthy();
  expect(screen.queryByText('Visite imprévue — justification')).toBeNull();
});

test('Sans réseau, le rapport ne s’ouvre pas et le dit', async () => {
  await rendre({
    rapport: jest.fn(async () => {
      throw new TypeError('Network request failed');
    }),
  });
  expect(await screen.findByText(/pas encore sur le téléphone. Synchronisez/)).toBeTruthy();
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
      <ActionsVisite
        visite={{ ...EFFECTUEE, rapport_statut: statut }}
        programme={
          {
            aujourdhui: '2026-10-13',
            geolocalisation: false,
            fuseau: 'UTC',
            attente_gps_secondes: 60,
          } as Programme
        }
        surEcart={jest.fn()}
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

const COMPLET: Rapport = {
  ...BROUILLON,
  presentations: [{ produit: 'pa', libelle: 'Produit Alpha', retour: 'prescrit' }],
  resultat: 'ok',
  resume: 'Bon accueil',
  prochaine_action: 'Revenir avec l’étude',
  prochaine_action_type: 'etude',
  champs: { patients: 4 },
  manquants: [],
};

describe('RPT-010 : soumission et retard', () => {
  test('à l’heure, le délai du jour s’affiche', async () => {
    await rendre({ rapport: jest.fn(async () => COMPLET) });
    expect(await screen.findByText(/^À rendre avant /)).toBeTruthy();
  });

  test('RG-032 : passé minuit, le rapport non soumis est signalé en retard', async () => {
    await rendre({
      rapport: jest.fn(async () => ({ ...COMPLET, echeance: '2020-01-01T00:00:00Z' })),
    });
    expect(await screen.findByText(/En retard : ce rapport était attendu/)).toBeTruthy();
  });

  test('soumis en retard, il le dit', async () => {
    await rendre({
      rapport: jest.fn(async () => ({
        ...COMPLET,
        statut: 'soumis' as const,
        soumis_le: '2026-10-14T08:00:00Z',
        en_retard: true,
      })),
    });
    expect(
      await screen.findByText('Rapport soumis en retard : il ne se modifie plus.'),
    ).toBeTruthy();
  });

  test('CA1 : sans réseau, la soumission attend dans la file avec l’heure du geste', async () => {
    const horsReseau = jest.fn(async () => {
      throw new TypeError('Network request failed');
    });
    await rendre({
      rapport: jest.fn(async () => COMPLET),
      enregistrerRapport: horsReseau,
      soumettreRapport: horsReseau,
    });
    await fireEvent.press(await screen.findByText('Soumettre le rapport'));
    expect(await screen.findByText(/Soumis sur le téléphone à/)).toBeTruthy();
    expect(screen.queryByText('Soumettre le rapport')).toBeNull();
    const [envoi] = await lireAttente();
    expect(envoi).toMatchObject({ type: 'soumission_rapport', visite: 'v1' });
    const soumisLe = (envoi as { soumis_le: string }).soumis_le;
    expect(mockMemoire.get('rapport.v1')?.valeur).toMatchObject({ soumis_le: soumisLe });
  });

  test('CA1 : rouvert avant l’envoi, le rapport reste soumis sur le téléphone', async () => {
    mockMemoire.set('rapport.v1', {
      valeur: {
        rapport: COMPLET,
        saisie: { ...saisieVide, resume: 'Bon accueil' },
        modifie_le: '2026-10-13T21:50:00Z',
        envoye: false,
        soumis_le: '2026-10-13T22:00:00Z',
      },
      maj: '2026-10-13T22:00:00Z',
    });
    await rendre({ rapport: jest.fn(async () => COMPLET) });
    expect(await screen.findByText(/Soumis sur le téléphone à/)).toBeTruthy();
    expect(screen.queryByText('Soumettre le rapport')).toBeNull();
  });
});

test('RPT-016 : le rapport rouvert dit qui l’a rouvert et pourquoi', async () => {
  const rouvert = {
    ...BROUILLON,
    statut: 'rouvert' as const,
    soumis_le: '2026-10-13T18:00:00Z',
    echeance: '2026-10-13T23:59:59Z',
    reouverture: {
      le: '2026-10-20T08:00:00Z',
      par: 'Kossi GUEYE',
      motif: 'Le résultat ne correspond pas à l’échange.',
    },
  };
  await rendre({ rapport: jest.fn(async () => rouvert) });
  expect(await screen.findByText(/Rouvert le .* par Kossi GUEYE/)).toBeTruthy();
  expect(screen.getByText(/« Le résultat ne correspond pas à l’échange. »/)).toBeTruthy();
  expect(screen.queryByText(/En retard : ce rapport/)).toBeNull();
});

test('RPT-014 : le rapport à corriger dit qui demande quoi et les parties à revoir', async () => {
  const aCorriger = {
    ...BROUILLON,
    statut: 'a_corriger' as const,
    soumis_le: '2026-10-13T18:00:00Z',
    echeance: '2026-10-13T23:59:59Z',
    correction: {
      le: '2026-10-14T08:00:00Z',
      par: 'Kossi GUEYE',
      commentaire: 'Précisez le résumé.',
      champs: ['resume', 'presentations'],
    },
  };
  await rendre({ rapport: jest.fn(async () => aCorriger) });
  expect(await screen.findByText(/Correction demandée le .* par Kossi GUEYE/)).toBeTruthy();
  expect(screen.getByText(/« Précisez le résumé. »/)).toBeTruthy();
  expect(screen.getByText(/À revoir : Résumé de l'échange, Produits présentés/)).toBeTruthy();
  // Soumis à l'heure la première fois : l'échéance passée ne le rend pas « en retard ».
  expect(screen.queryByText(/En retard : ce rapport/)).toBeNull();
});

describe('1.4.2 : les écrans du rapport selon la maquette', () => {
  test('téléphone : l’avancement, l’échéance, et « Enregistrer » sans attendre', async () => {
    const enregistrerRapport = jest.fn(async (_id: string, s: object) => ({ ...BROUILLON, ...s }));
    await rendre({ rapport: jest.fn(async () => BROUILLON), enregistrerRapport });
    // Six parties du socle et un champ obligatoire du pays ; seul « retours » est acquis.
    expect(await screen.findByText('1 champ sur 7 rempli')).toBeTruthy();
    expect(screen.getByText(/^À rendre avant /)).toBeTruthy();
    expect(screen.getByText('Brouillon')).toBeTruthy();
    // Rien de changé : rien à envoyer.
    await fireEvent.press(screen.getByText('Enregistrer'));
    expect(screen.getByText('Rien de nouveau : le rapport est déjà enregistré.')).toBeTruthy();
    expect(enregistrerRapport).not.toHaveBeenCalled();
    // Une saisie : « Enregistrer » l'envoie aussitôt.
    await fireEvent.changeText(screen.getByLabelText("Résumé de l'échange"), 'Bon accueil');
    await fireEvent.press(screen.getByText('Enregistrer'));
    await waitFor(() => expect(enregistrerRapport).toHaveBeenCalledTimes(1));
    expect(enregistrerRapport.mock.calls[0]![1]).toMatchObject({ resume: 'Bon accueil' });
    expect(await screen.findByText('2 champs sur 7 remplis')).toBeTruthy();
  });

  test('RPT-015 : à corriger, seules les parties demandées s’écrivent ; le reste se lit', async () => {
    const aCorriger = {
      ...BROUILLON,
      statut: 'a_corriger' as const,
      soumis_le: '2026-10-13T18:00:00Z',
      resultat: 'ok',
      resume: 'Présentation du produit.',
      presentations: [{ produit: 'pa', libelle: 'Produit Alpha', retour: 'peu' as const }],
      correction: {
        le: '2026-10-14T08:00:00Z',
        par: 'Kossi GUEYE',
        commentaire: 'Le résumé ne dit pas l’objection.',
        champs: ['resume'],
      },
    };
    await rendre({ rapport: jest.fn(async () => aCorriger) });
    expect(await screen.findByText(/Correction demandée le mercredi 14 octobre/)).toBeTruthy();
    expect(screen.getByText('À corriger')).toBeTruthy();
    // Le résumé à revoir s'écrit ; produits et résultat ne se touchent pas.
    expect(screen.getByDisplayValue('Présentation du produit.')).toBeTruthy();
    expect(screen.queryByText(/Touchez les produits/)).toBeNull();
    expect(screen.queryByRole('radio', { name: 'Objectif atteint' })).toBeNull();
    expect(screen.getByText('Reste inchangé')).toBeTruthy();
    expect(screen.getByText('Objectif atteint')).toBeTruthy();
    expect(screen.getByText('Produit Alpha')).toBeTruthy();
    expect(screen.getByText('Prescrit peu')).toBeTruthy();
  });

  test('tablette : « Avant de soumettre » coche ce qui est fait et dit ce qui manque', async () => {
    mockTablette.valeur = true;
    await rendre({ rapport: jest.fn(async () => BROUILLON) });
    expect(await screen.findByText('Avant de soumettre')).toBeTruthy();
    expect(screen.getByText('Rapport en brouillon')).toBeTruthy();
    expect(screen.getByText('Retour sur chaque produit')).toBeTruthy();
    expect(screen.getAllByText('Fait')).toHaveLength(1);
    expect(screen.getAllByText('Manquant')).toHaveLength(6);
    expect(screen.getByText(/produits présentés, résultat, résumé/)).toBeTruthy();
    expect(screen.getByText(/Une fois soumis, il ne se modifie plus/)).toBeTruthy();
    expect(screen.getByText('Enregistrer')).toBeTruthy();
  });

  test('tablette : soumis, le rapport se lit et sa synthèse est à droite', async () => {
    mockTablette.valeur = true;
    const soumis = {
      ...BROUILLON,
      statut: 'soumis' as const,
      soumis_le: '2026-10-13T10:32:00Z',
      resultat: 'ok',
      resume: 'Intéressé par la nouvelle présentation.',
      prochaine_action: 'Revisiter le prescripteur',
      prochaine_action_echeance: '2026-10-26',
    };
    await rendre({ rapport: jest.fn(async () => soumis) });
    expect(await screen.findByText('Soumis à 10:32')).toBeTruthy();
    expect(screen.getByText('Intéressé par la nouvelle présentation.')).toBeTruthy();
    expect(screen.getByText('Revisiter le prescripteur')).toBeTruthy();
    expect(screen.getByText("d'ici le 26 octobre")).toBeTruthy();
    expect(screen.getByText(/Une correction demandée par votre superviseur/)).toBeTruthy();
    expect(screen.queryByText('Soumettre le rapport')).toBeNull();
  });
});
