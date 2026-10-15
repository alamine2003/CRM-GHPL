import type { ClientApi, Etablissement, Exercice, ListeCible, Prospect } from '@innov/api-client';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Linking } from 'react-native';
import { ecrire, lire } from '../src/baseLocale';
import { VisitesPrecedentes } from '../src/Chronologie';
import { FicheEtablissement, FicheProspect } from '../src/Fiches';
import i18n from '../src/i18n';
import { ContexteSession, type Session } from '../src/session';

const mockPousser = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPousser }) }));
jest.mock('../src/baseLocale', () => ({
  lire: jest.fn(async () => null),
  ecrire: jest.fn(async () => undefined),
  effacer: jest.fn(async () => undefined),
}));

const PROSPECT = {
  id: 'p1',
  civilite: 'dr',
  prenom: 'Aïssatou',
  nom: 'NDIAYE',
  type_libelle: 'Médecin',
  specialite_libelle: 'Cardiologie',
  grade_libelle: 'Docteur',
  numero_ordre: 'DEMO-SN-00001',
  telephone_mobile: '+221 77 000 00 01',
  telephone_pro: '',
  courriel: 'cabinet@demo.invalid',
  potentiel: 'A',
  activite: 'prive',
  statut: 'actif',
  secteur: { id: 's1', libelle: 'Plateau' },
  localite: null,
  lieu_principal: { id: 'e1', libelle: 'Clinique du Cap' },
} as unknown as Prospect;

const EXERCICE = {
  id: 'x1',
  prospect: { id: 'p1', civilite: 'dr', prenom: 'Aïssatou', nom: 'NDIAYE', type_libelle: 'Médecin',
    specialite_libelle: 'Cardiologie', potentiel: 'A' }, // prettier-ignore
  etablissement: { id: 'e1', nom: 'Clinique du Cap', type_code: 'clinique',
    type_libelle: 'Clinique', secteur: 'Plateau', localite: null, a_coordonnees: true }, // prettier-ignore
  debut: '2026-01-01',
  fin: null,
  actif: true,
  principal: true,
  presence: 'Lundi et jeudi matin',
} as unknown as Exercice;

const LISTE = {
  poste: { id: 'po1' },
  cibles: [
    {
      id: 'c1',
      frequence: 2,
      prospect: {
        id: 'p1',
        civilite: 'dr',
        prenom: 'Aïssatou',
        nom: 'NDIAYE',
        type_libelle: 'Médecin',
        specialite_libelle: 'Cardiologie',
        potentiel: 'A',
        lieu_principal: { id: 'e1', libelle: 'Clinique du Cap' },
        secteur: 'Plateau',
        telephone_mobile: '+221 77 000 00 01',
        telephone_pro: '',
      },
    },
  ],
} as unknown as ListeCible;

function rendre(client: Partial<ClientApi>, element: React.ReactElement, actions: string[] = []) {
  const etat = actions.length
    ? { statut: 'connecte', perimetre: { actions } }
    : { statut: 'chargement' };
  const session = { etat, client: client as ClientApi } as unknown as Session;
  return render(<ContexteSession.Provider value={session}>{element}</ContexteSession.Provider>);
}

beforeEach(async () => {
  await i18n.changeLanguage('fr');
  jest
    .mocked(lire)
    .mockReset()
    .mockImplementation(async (cle: string) =>
      cle === 'ciblage.moi' ? { valeur: [LISTE], maj: '2026-10-04T08:00:00Z' } : null,
    );
  jest.mocked(ecrire).mockReset().mockResolvedValue(undefined);
  mockPousser.mockClear();
  jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
});

test("la fiche réunit métier, appel, courriel et lieux d'exercice (PRP-002, PRP-004)", async () => {
  await rendre(
    {
      prospects: { detail: jest.fn(async () => PROSPECT), rapports: jest.fn(async () => []) },
      exercices: { duProspect: jest.fn(async () => [EXERCICE]) },
    } as unknown as Partial<ClientApi>,
    <FicheProspect id="p1" />,
  );
  expect(await screen.findByText('Dr Aïssatou NDIAYE')).toBeTruthy();
  expect(screen.getByText('Cardiologie · Docteur · Plateau')).toBeTruthy();
  expect(await screen.findByText('Dans ma liste · 2 visites par cycle')).toBeTruthy();
  expect(screen.getByText('principal')).toBeTruthy();
  expect(screen.getByText('Clinique · Plateau · Lundi et jeudi matin')).toBeTruthy();
  expect(screen.getByText('DEMO-SN-00001')).toBeTruthy();
  expect(screen.getByText('+221 77 000 00 01')).toBeTruthy();
  expect(screen.getByText("Lieux d'exercice")).toBeTruthy();
  await fireEvent.press(screen.getByText('Appeler'));
  expect(Linking.openURL).toHaveBeenCalledWith('tel:+221770000001');
  // Écrire : le courriel connu.
  await fireEvent.press(screen.getByText('Écrire'));
  expect(Linking.openURL).toHaveBeenCalledWith('mailto:cabinet@demo.invalid');
  await fireEvent.press(screen.getByText('Clinique du Cap'));
  expect(mockPousser).toHaveBeenCalledWith('/lieu/e1');
});

test("PRP-011 CA2 : sans réseau, la fiche de ma liste permet encore d'appeler", async () => {
  const echec = jest.fn(async () => {
    throw new Error('réseau');
  });
  await rendre(
    {
      prospects: { detail: echec },
      exercices: { duProspect: echec },
    } as unknown as Partial<ClientApi>,
    <FicheProspect id="p1" />,
  );
  expect(await screen.findByText(/Hors connexion : informations de ma liste/)).toBeTruthy();
  expect(screen.getByText('Dr Aïssatou NDIAYE')).toBeTruthy();
  await fireEvent.press(screen.getByText('Appeler'));
  expect(Linking.openURL).toHaveBeenCalledWith('tel:+221770000001');
  // Sans courriel, « Écrire » envoie un message au mobile.
  await fireEvent.press(screen.getByText('Écrire'));
  expect(Linking.openURL).toHaveBeenCalledWith('sms:+221770000001');
  expect(screen.getByText('Clinique du Cap')).toBeTruthy();
});

test("la fiche d'un établissement donne l'itinéraire et qui y exerce (PRP-003)", async () => {
  const etablissement = {
    id: 'e1',
    nom: 'Clinique du Cap',
    type_libelle: 'Clinique',
    adresse: 'Rue 10',
    secteur: { id: 's1', libelle: 'Plateau' },
    localite: null,
    telephone: '33 800 00 00',
    latitude: 14.67,
    longitude: -17.43,
    statut: 'actif',
  } as unknown as Etablissement;
  await rendre(
    {
      etablissements: { detail: jest.fn(async () => etablissement) },
      exercices: { deLEtablissement: jest.fn(async () => [EXERCICE]) },
    } as unknown as Partial<ClientApi>,
    <FicheEtablissement id="e1" />,
  );
  expect(await screen.findByText('Clinique · Rue 10, Plateau')).toBeTruthy();
  await fireEvent.press(screen.getByText('Itinéraire'));
  expect(Linking.openURL).toHaveBeenCalledWith(expect.stringContaining('14.67%2C-17.43'));
  await fireEvent.press(screen.getByText('Dr Aïssatou NDIAYE'));
  expect(mockPousser).toHaveBeenCalledWith('/fiche/p1');
});

test('PRP-014 : le délégué propose une correction ; seuls les champs changés partent', async () => {
  const creer = jest.fn(async () => ({}));
  await rendre(
    {
      prospects: { detail: jest.fn(async () => PROSPECT), rapports: jest.fn(async () => []) },
      exercices: { duProspect: jest.fn(async () => [EXERCICE]) },
      propositions: { creer },
    } as unknown as Partial<ClientApi>,
    <FicheProspect id="p1" />,
    ['propositions.creer'],
  );
  await fireEvent.press(await screen.findByText('Proposer une correction'));
  // Rien de changé : l'envoi reste impossible.
  expect(screen.getByText(/Modifiez au moins un champ/)).toBeTruthy();
  await fireEvent.changeText(screen.getByLabelText('Téléphone mobile'), '+221 77 999 99 99');
  await fireEvent.changeText(screen.getByLabelText('Commentaire (facultatif)'), 'Nouveau numéro');
  await fireEvent.press(screen.getByText('Envoyer la proposition'));
  expect(creer).toHaveBeenCalledWith({
    prospect: 'p1',
    changements: { telephone_mobile: '+221 77 999 99 99' },
    commentaire: 'Nouveau numéro',
  });
  expect(await screen.findByText(/Proposition envoyée/)).toBeTruthy();
});

test('sans le droit de proposer, la fiche ne montre pas le bouton', async () => {
  await rendre(
    {
      prospects: { detail: jest.fn(async () => PROSPECT), rapports: jest.fn(async () => []) },
      exercices: { duProspect: jest.fn(async () => [EXERCICE]) },
    } as unknown as Partial<ClientApi>,
    <FicheProspect id="p1" />,
  );
  expect(await screen.findByText('Dr Aïssatou NDIAYE')).toBeTruthy();
  expect(screen.queryByText('Proposer une correction')).toBeNull();
});

const RAPPORT = {
  id: 'r1',
  visite: 'v1',
  date: '2026-10-06',
  heure: '10:30',
  etablissement: 'Clinique du Cap',
  delegue_nom: 'Aminata TOURE',
  de_moi: true,
  statut: 'soumis',
  en_retard: true,
  objectif_prevu: '',
  resultat: 'Objectif atteint',
  resultat_obtenu: '',
  presentations: [{ produit: 'pa', libelle: 'Produit Alpha', retour: 'prescrit' }],
  remises: [],
  resume: 'Bon accueil',
  prochaine_action_type: 'Envoyer de la documentation',
  prochaine_action: 'La fiche du produit',
  prochaine_action_echeance: null,
  soumis_le: '2026-10-07T08:00:00Z',
};

test('RPT-011 : les visites précédentes, la plus récente d’abord, puis « voir plus »', async () => {
  const rapports = [1, 2, 3, 4].map((n) => ({ ...RAPPORT, id: `r${n}` }));
  await rendre(
    {
      prospects: { detail: jest.fn(async () => PROSPECT), rapports: jest.fn(async () => rapports) },
      exercices: { duProspect: jest.fn(async () => [EXERCICE]) },
    } as unknown as Partial<ClientApi>,
    <FicheProspect id="p1" />,
  );
  expect(await screen.findByText('Historique des visites')).toBeTruthy();
  expect(screen.getAllByText('Produit Alpha · Objectif atteint')).toHaveLength(3);
  expect(screen.getAllByText('Rapport soumis')).toHaveLength(3);
  // La dernière visite, dans les informations.
  expect(screen.getByText('Dernière visite')).toBeTruthy();
  // Une visite se déplie : retours, retard, suite.
  await fireEvent.press(screen.getAllByText('Produit Alpha · Objectif atteint')[0]!);
  expect(screen.getByText('Produit Alpha — Prescrit')).toBeTruthy();
  expect(screen.getByText('Soumis en retard')).toBeTruthy();
  expect(
    screen.getByText(/Suite : Envoyer de la documentation — La fiche du produit/),
  ).toBeTruthy();
  await fireEvent.press(screen.getByText('Voir la visite plus ancienne'));
  expect(screen.getAllByText('Produit Alpha · Objectif atteint')).toHaveLength(4);
});

test('RPT-011 : sans réseau, la dernière liste lue s’affiche, la plus récente d’abord', async () => {
  // Rendu par le serveur du plus récent au plus ancien : l'écran garde cet ordre.
  const rapports = [
    { ...RAPPORT, id: 'r2', date: '2026-10-13', resume: 'Échantillons laissés' },
    { ...RAPPORT, id: 'r1', date: '2026-10-06', resume: 'Bon accueil' },
  ];
  const memoire = new Map<string, { valeur: unknown; maj: string }>();
  jest.mocked(ecrire).mockImplementation(async (cle: string, valeur: unknown) => {
    memoire.set(cle, { valeur, maj: '2026-10-14T08:00:00Z' });
  });
  jest.mocked(lire).mockImplementation(async (cle: string) => (memoire.get(cle) as never) ?? null);
  const resumes = () =>
    // L'année ne s'écrit que hors de l'année en cours : le test vaut toute année.
    screen
      .getAllByText(/^(13|6) octobre( 2026)?$/)
      .map((n) => String(n.props.children).replace(' 2026', ''));

  // Avec du réseau : la liste est lue, puis gardée sur le téléphone.
  const enLigne = await rendre(
    { prospects: { rapports: jest.fn(async () => rapports) } } as unknown as Partial<ClientApi>,
    <VisitesPrecedentes prospect="p1" />,
  );
  expect(await screen.findByText('Historique des visites')).toBeTruthy();
  expect(resumes()).toEqual(['13 octobre', '6 octobre']);
  expect(memoire.get('chronologie.p1')?.valeur).toEqual(rapports);
  await enLigne.unmount();

  // Sans réseau : la même liste, dans le même ordre, et l'écran le dit.
  const horsReseau = jest.fn(async () => {
    throw new TypeError('Network request failed');
  });
  await rendre(
    { prospects: { rapports: horsReseau } } as unknown as Partial<ClientApi>,
    <VisitesPrecedentes prospect="p1" />,
  );
  expect(await screen.findByText('Sans réseau : la dernière liste lue.')).toBeTruthy();
  expect(horsReseau).toHaveBeenCalledWith('p1');
  expect(resumes()).toEqual(['13 octobre', '6 octobre']);
});
