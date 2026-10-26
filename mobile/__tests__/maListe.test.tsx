import type { ClientApi, ListeCible } from '@innov/api-client';
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { ecrire, lire } from '../src/baseLocale';
import i18n from '../src/i18n';
import { EcranProspects } from '../src/Prospects';
import { ContexteSession, type Session } from '../src/session';

// 1.4.4 : l'onglet Prospects de la maquette — ma liste cible (PRP-011), toutes les fiches
// (PRP-005) et, sur la tablette, le tableau.

const mockPousser = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPousser }) }));
jest.mock('expo-location', () => ({}));

// La base chiffrée (SQLCipher) n'existe que sur le téléphone : on la remplace ici.
jest.mock('../src/baseLocale', () => ({
  lire: jest.fn(async () => null),
  ecrire: jest.fn(async () => undefined),
  effacer: jest.fn(async () => undefined),
}));
jest.mock('../src/MesPropositions', () => ({ MesPropositions: () => null }));
jest.mock('../src/Synchronisation', () => ({ StatutSynchro: () => null }));
const mockTablette = { valeur: false };
jest.mock('../src/disposition', () => ({ useTablette: () => mockTablette.valeur }));
// Le gabarit (en-tête, onglets) est testé ailleurs : ici, son contexte, ses actions, le contenu.
jest.mock('../src/Ecran', () => ({
  Ecran: ({
    surTitre,
    action,
    enteteTablette,
    children,
  }: {
    surTitre?: string;
    action?: ReactNode;
    enteteTablette?: { surTitre?: string; action?: ReactNode };
    children: ReactNode;
  }) => {
    const { Text } = jest.requireActual('react-native');
    const { useTablette } = jest.requireMock('../src/disposition');
    const tablette = useTablette();
    return (
      <>
        <Text>{tablette ? enteteTablette?.surTitre : surTitre}</Text>
        {tablette ? enteteTablette?.action : action}
        {children}
      </>
    );
  },
}));

const LISTE: ListeCible = {
  poste: {
    id: 'po1',
    libelle: 'VM Plateau',
    type_poste: 'vm',
    occupant: 'Awa Diallo',
    secteurs: [{ id: 's1', libelle: 'Plateau' }],
    reseaux: ['Réseau un'],
    gerable: false,
    synthese: {
      total: 1,
      potentiels: { A: 1, B: 0, C: 0 },
      visites_par_cycle: 2,
      visites_par_jour: 0.1,
      cycle_semaines: 4,
      seuil_min: 6,
      seuil_max: 10,
    },
  },
  cibles: [
    {
      id: 'c1',
      poste: 'po1',
      prospect: {
        id: 'p1',
        civilite: 'dr',
        prenom: 'Aïssatou',
        nom: 'NDIAYE',
        type_libelle: 'Médecin',
        specialite_libelle: 'Cardiologie',
        potentiel: 'A',
        statut: 'actif',
        lieu_principal: { id: 'e1', libelle: 'Clinique du Cap' },
        secteur: 'Plateau',
        telephone_mobile: '+221 77 000 00 01',
        telephone_pro: '',
      },
      frequence: 2,
      debut: '2026-10-01',
      fin: null,
      en_cours: true,
      hors_secteur: false,
      visites_cycle: 1,
    },
  ],
};

const PREMIERE = LISTE.cibles[0]!;
const AUTRE: ListeCible['cibles'][number] = {
  ...PREMIERE,
  id: 'c2',
  prospect: {
    ...PREMIERE.prospect,
    id: 'p2',
    civilite: '' as const,
    prenom: 'Moussa',
    nom: 'FALL',
    specialite_libelle: 'Pédiatrie',
    potentiel: 'B' as const,
    lieu_principal: { id: 'e2', libelle: 'Centre de santé Fann' },
    secteur: 'Fann',
    telephone_mobile: '',
  },
  frequence: 3,
  visites_cycle: 2,
};

function rendre(
  mesListes: () => Promise<ListeCible[]>,
  prospects: Partial<ClientApi['prospects']> = {},
) {
  const session = {
    etat: {
      statut: 'connecte',
      perimetre: { actions: ['prospects.creer'], pays_actif: { code: 'SN', nom: 'Sénégal' } },
    },
    client: { ciblage: { mesListes }, prospects } as unknown as ClientApi,
  } as unknown as Session;
  return render(
    <ContexteSession.Provider value={session}>
      <EcranProspects />
    </ContexteSession.Provider>,
  );
}

beforeEach(async () => {
  await i18n.changeLanguage('fr');
  jest.mocked(lire).mockReset().mockResolvedValue(null);
  jest.mocked(ecrire).mockClear();
  mockPousser.mockClear();
  mockTablette.valeur = false;
});

test('PRP-011 CA2 : ma liste, enregistrée sur le téléphone, dit le cycle de chaque prospect', async () => {
  await rendre(async () => [LISTE]);
  expect(await screen.findByText('Dr Aïssatou NDIAYE')).toBeTruthy();
  expect(screen.getByText('Ma liste · 1 prospect')).toBeTruthy();
  expect(screen.getByText('Cardiologie · Clinique du Cap')).toBeTruthy();
  expect(screen.getByText('1 / 2')).toBeTruthy();
  expect(screen.getByLabelText('1 sur 2 visites ce cycle')).toBeTruthy();
  expect(ecrire).toHaveBeenCalledWith('ciblage.moi', [LISTE]);
  // « + » ouvre la création d'un prospect.
  await fireEvent.press(screen.getByLabelText('Nouveau prospect'));
  expect(mockPousser).toHaveBeenCalledWith('/prospect/nouveau');
});

test('PRP-011 CA2 : sans réseau, la liste enregistrée reste consultable', async () => {
  jest.mocked(lire).mockResolvedValue({ valeur: [LISTE], maj: '2026-10-04T08:00:00Z' });
  await rendre(async () => {
    throw new Error('réseau');
  });
  expect(await screen.findByText('Dr Aïssatou NDIAYE')).toBeTruthy();
  expect(screen.getByText(/Hors connexion : liste enregistrée sur ce téléphone/)).toBeTruthy();
});

test('sans réseau ni liste enregistrée, le délégué est prévenu', async () => {
  await rendre(async () => {
    throw new Error('réseau');
  });
  expect(await screen.findByText(/Liste cible indisponible/)).toBeTruthy();
});

test("le délégué trouve une fiche par son lieu, son téléphone ou son potentiel et l'ouvre", async () => {
  await rendre(async () => [{ ...LISTE, cibles: [...LISTE.cibles, AUTRE] }]);
  expect(await screen.findByText('Moussa FALL')).toBeTruthy();
  const recherche = screen.getByLabelText('Chercher un prospect');
  // Par le lieu d'exercice, sans accent.
  await fireEvent.changeText(recherche, 'fann');
  expect(screen.queryByText('Dr Aïssatou NDIAYE')).toBeNull();
  expect(screen.getByText('Moussa FALL')).toBeTruthy();
  // Par les chiffres du téléphone, quelle que soit la mise en forme.
  await fireEvent.changeText(recherche, '770000001');
  expect(screen.getByText('Dr Aïssatou NDIAYE')).toBeTruthy();
  expect(screen.queryByText('Moussa FALL')).toBeNull();
  await fireEvent.changeText(recherche, '');
  // La ligne ouvre la fiche.
  await fireEvent.press(screen.getByText('Moussa FALL'));
  expect(mockPousser).toHaveBeenCalledWith('/fiche/p2');
});

test('tablette : le tableau, filtré par potentiel, spécialité et zone', async () => {
  mockTablette.valeur = true;
  await rendre(async () => [{ ...LISTE, cibles: [...LISTE.cibles, AUTRE] }]);
  expect(await screen.findByText('Ma liste · 2 prospects · Sénégal')).toBeTruthy();
  expect(screen.getByText('ÉTABLISSEMENT')).toBeTruthy();
  expect(screen.getByText('Centre de santé Fann')).toBeTruthy();
  expect(screen.getByText('2 / 3')).toBeTruthy();
  await fireEvent.press(screen.getByText('Potentiel B'));
  expect(screen.queryByText('Dr Aïssatou NDIAYE')).toBeNull();
  await fireEvent.press(screen.getByText('Potentiel B'));
  await fireEvent.press(screen.getByText('Zone'));
  await fireEvent.press(screen.getByLabelText('Plateau'));
  expect(screen.queryByText('Moussa FALL')).toBeNull();
  expect(screen.getByText('Dr Aïssatou NDIAYE')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Plateau'));
  await fireEvent.press(screen.getByText('Toutes les zones'));
  await fireEvent.press(screen.getByText('Spécialité'));
  await fireEvent.press(screen.getByLabelText('Pédiatrie'));
  expect(screen.queryByText('Dr Aïssatou NDIAYE')).toBeNull();
  expect(screen.getByText('Moussa FALL')).toBeTruthy();
});

test('absent de ma liste : un toucher relance la recherche dans toutes les fiches', async () => {
  const liste = jest.fn(async () => ({
    total: 1,
    resultats: [
      {
        ...PREMIERE.prospect,
        id: 'p9',
        prenom: 'Ibrahima',
        nom: 'DIOP',
        statut: 'a_valider',
        secteur: { id: 's1', libelle: 'Plateau' },
      },
    ],
  }));
  await rendre(async () => [LISTE], { liste } as unknown as ClientApi['prospects']);
  await fireEvent.changeText(await screen.findByLabelText('Chercher un prospect'), 'Diop');
  expect(screen.getByText('Aucune fiche dans ma liste')).toBeTruthy();
  await fireEvent.press(screen.getByText('Chercher « Diop » dans toutes les fiches'));
  expect(await screen.findByText('Dr Ibrahima DIOP')).toBeTruthy();
  expect(liste).toHaveBeenCalledWith({ q: 'Diop', page: 1, potentiel: undefined });
  expect(screen.getByText('Toutes les fiches · 1 prospect')).toBeTruthy();
  expect(screen.getByText('À valider')).toBeTruthy();
});
