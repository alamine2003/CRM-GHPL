/**
 * 0.8.4 : OFF-004, conflits sans perte silencieuse (RG-050 à RG-053) ; le délégué voit les deux
 * versions et choisit ; une décision du superviseur n'est jamais écrasée.
 */
import { type ClientApi, ErreurApi, type Rapport } from '@innov/api-client';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { CarteAttente } from '../src/Attente';
import { lireBrouillonRapport } from '../src/BrouillonRapport';
import { envoyerAttente, garderMaVersion, lireAttente, mettreEnAttente } from '../src/Brouillons';
import i18n from '../src/i18n';
import { FormulaireRapport } from '../src/Rapport';
import { ContexteSession, type Session } from '../src/session';
import type { ReactNode } from 'react';

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
jest.mock('expo-location', () => ({}));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'envoi-1' }));
// Le gabarit (en-tête, onglets) est testé ailleurs : ici, son titre, son statut, le contenu et
// les boutons collés en bas.
jest.mock('../src/Ecran', () => ({
  Ecran: ({
    surTitre,
    action,
    children,
    pied,
  }: {
    surTitre?: string;
    action?: ReactNode;
    children: ReactNode;
    pied?: ReactNode;
  }) => {
    const { Text } = jest.requireActual('react-native');
    return (
      <>
        <Text>{surTitre}</Text>
        {action}
        {children}
        {pied}
      </>
    );
  },
}));

const SERVEUR: Rapport = {
  id: 'r1',
  version: 3,
  visite: 'v1',
  statut: 'brouillon',
  correction: null,
  reouverture: null,
  objectif_prevu: 'Présenter',
  est_imprevue: false,
  justification: '',
  presentations: [],
  remises: [],
  resultat_obtenu: '',
  resultat: null,
  resume: 'Écrit sur un autre appareil',
  prochaine_action: '',
  prochaine_action_type: null,
  prochaine_action_echeance: null,
  visite_proposee: false,
  champs: {},
  definitions: [],
  soumis_le: null,
  echeance: '2099-01-01T00:00:00Z',
  en_retard: false,
  horodatage_douteux: false,
  manquants: [],
  produit_autre_autorise: false,
  articles_proposes: [],
  types_action_proposes: [],
  action_precedente: null,
  pieces_jointes: [],
  produits_proposes: [],
  resultats_proposes: [],
};

const SAISIE_TELEPHONE = {
  presentations: [],
  remises: [],
  resultat: null,
  resultat_obtenu: '',
  resume: 'Écrit sans réseau',
  prochaine_action: '',
  prochaine_action_type: null,
  prochaine_action_echeance: null,
  visite_proposee: false,
  champs: {},
};

/** Une saisie restée sur le téléphone, écrite à partir de la version 1 du rapport. */
function saisieRestee() {
  mockMemoire.set('rapport.v1', {
    valeur: {
      rapport: { ...SERVEUR, version: 1, resume: '' },
      saisie: SAISIE_TELEPHONE,
      modifie_le: '2026-10-13T09:00:00Z',
      envoye: false,
      base_version: 1,
    },
    maj: '',
  });
}

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
  mockMemoire.set('programme.courant', {
    valeur: {
      fuseau: 'UTC',
      jours: [{ date: '2026-10-13', visites: [{ id: 'v1', date: '2026-10-13', heure: '09:00' }] }],
      a_justifier: [],
      a_corriger: [],
    },
    maj: '',
  });
  await i18n.changeLanguage('fr');
});

test('OFF-004 CA2 : le rapport changé ailleurs montre les deux versions ; le délégué garde la sienne', async () => {
  saisieRestee();
  const enregistrerRapport = jest.fn(async () => ({ ...SERVEUR, version: 4 }));
  await rendre({ rapport: jest.fn(async () => SERVEUR), enregistrerRapport });
  expect(await screen.findByText('Ce rapport a changé ailleurs')).toBeTruthy();
  expect(screen.getByText(/: Écrit sans réseau$/)).toBeTruthy();
  expect(screen.getByText(/: Écrit sur un autre appareil$/)).toBeTruthy();
  // Rien n'est parti en silence.
  expect(enregistrerRapport).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByText('Garder ma version'));
  // RG-053 : elle repart de la version 3, celle que le délégué vient de voir.
  await waitFor(
    () =>
      expect(enregistrerRapport).toHaveBeenCalledWith(
        'v1',
        expect.objectContaining({ resume: 'Écrit sans réseau', version: 3 }),
      ),
    { timeout: 3000 },
  );
});

test('RG-053 : garder la version du serveur abandonne la saisie et ses envois', async () => {
  saisieRestee();
  await mettreEnAttente({ id: 'e1', type: 'brouillon_rapport', visite: 'v1', resume: 'Rapport' });
  await rendre({ rapport: jest.fn(async () => SERVEUR), enregistrerRapport: jest.fn() });
  await fireEvent.press(await screen.findByText('Garder la version du serveur'));
  expect(await screen.findByDisplayValue('Écrit sur un autre appareil')).toBeTruthy();
  expect(await lireAttente()).toEqual([]);
  expect((await lireBrouillonRapport('v1'))?.saisie).toBeNull();
});

test('OFF-004 CA1 : une décision du superviseur l’emporte ; la version locale se lit, puis s’abandonne', async () => {
  saisieRestee();
  const enregistrerRapport = jest.fn();
  await rendre({
    rapport: jest.fn(async () => ({ ...SERVEUR, statut: 'valide' as const })),
    enregistrerRapport,
  });
  expect(await screen.findByText(/Votre superviseur a validé ce rapport/)).toBeTruthy();
  expect(screen.getByText(/: Écrit sans réseau$/)).toBeTruthy();
  expect(screen.queryByText('Garder ma version')).toBeNull();
  await fireEvent.press(screen.getByText("J'ai lu : abandonner ma version"));
  await waitFor(async () => expect((await lireBrouillonRapport('v1'))?.saisie).toBeNull());
  expect(enregistrerRapport).not.toHaveBeenCalled();
});

test('RG-052 : sans changement ailleurs, la saisie du téléphone est reprise, sans conflit', async () => {
  saisieRestee();
  await rendre({
    rapport: jest.fn(async () => ({ ...SERVEUR, version: 1, resume: '' })),
    enregistrerRapport: jest.fn(),
  });
  expect(await screen.findByDisplayValue('Écrit sans réseau')).toBeTruthy();
  expect(screen.queryByText('Ce rapport a changé ailleurs')).toBeNull();
});

test('OFF-004 CA2 : une visite changée des deux côtés attend le choix du délégué', async () => {
  const conflit = new ErreurApi(409, 'conflit_version', 'Cette visite a changé ailleurs.', {
    champs: ['heure'],
    serveur: { heure: '10:00:00' },
  });
  const modifier = jest.fn().mockRejectedValueOnce(conflit).mockResolvedValueOnce({ id: 'v1' });
  const client = { visites: { modifier } } as unknown as ClientApi;
  await mettreEnAttente({
    id: 'e1',
    type: 'modif_visite',
    visite: 'v1',
    saisie: { heure: '11:00', avant: { heure: '09:00' } },
    resume: 'Mardi · Dr Diallo',
  });
  await envoyerAttente(client);
  const [envoi] = await lireAttente();
  expect(envoi).toMatchObject({ conflit: { champs: ['heure'] } });
  const abandonner = jest.fn();
  const garder = jest.fn();
  await render(
    <CarteAttente
      envois={[envoi!]}
      envoi={false}
      surEnvoyer={jest.fn()}
      surAbandonner={abandonner}
      surGarderMienne={garder}
    />,
  );
  expect(screen.getByText('Sur ce téléphone : 11:00')).toBeTruthy();
  expect(screen.getByText('Sur le serveur : 10:00')).toBeTruthy();
  await fireEvent.press(screen.getByText('Garder ma version'));
  expect(garder).toHaveBeenCalledWith('e1');
  // Garder sa version : elle repart de la valeur du serveur, et passe.
  await garderMaVersion('e1');
  await envoyerAttente(client);
  expect(modifier).toHaveBeenLastCalledWith('v1', { heure: '11:00', avant: { heure: '10:00:00' } });
  expect(await lireAttente()).toEqual([]);
});

test('1.0.2 : un envoi refusé s’abandonne d’un geste, avec son message', async () => {
  await i18n.changeLanguage('fr');
  const surAbandonner = jest.fn();
  const refuse = {
    id: 'e1',
    type: 'proposition',
    saisie: { id: 'p1' },
    resume: 'Dr Diallo',
    erreur: 'Cette fiche a été fusionnée.',
  } as unknown as Parameters<typeof CarteAttente>[0]['envois'][number];
  await render(
    <CarteAttente
      envois={[refuse]}
      envoi={false}
      surEnvoyer={jest.fn()}
      surAbandonner={surAbandonner}
    />,
  );
  expect(screen.getByText('Cette fiche a été fusionnée.')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText(/Dr Diallo/));
  expect(surAbandonner).toHaveBeenCalledWith('e1');
});

test('1.0.2 : les champs propres au pays entrent dans la comparaison des deux versions', async () => {
  await i18n.changeLanguage('fr');
  const { differencesRapport } =
    jest.requireActual<typeof import('../src/Conflits')>('../src/Conflits');
  const rapport = {
    ...SERVEUR,
    resume: 'Écrit sans réseau',
    definitions: [
      { code: 'patients', libelle: 'Patients vus' },
      { code: 'stock', libelle: 'Stock constaté' },
      { code: 'egal', libelle: 'Inchangé' },
    ],
    champs: { patients: 12, stock: '', egal: 'oui' },
  } as unknown as Rapport;
  const lignes = differencesRapport(
    { ...SAISIE_TELEPHONE, champs: { patients: '', stock: 'faible', egal: 'oui' } },
    rapport,
    i18n.t.bind(i18n),
  );
  expect(lignes).toEqual([
    { libelle: 'Patients vus', telephone: i18n.t('conflits.vide'), serveur: '12' },
    { libelle: 'Stock constaté', telephone: 'faible', serveur: i18n.t('conflits.vide') },
  ]);
});
