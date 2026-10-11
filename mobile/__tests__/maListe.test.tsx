import type { ClientApi, ListeCible } from '@innov/api-client';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { ecrire, lire } from '../src/baseLocale';
import i18n from '../src/i18n';
import { MaListeCible } from '../src/MaListe';
import { ContexteSession, type Session } from '../src/session';

const mockPousser = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPousser }) }));
jest.mock('expo-location', () => ({}));

// La base chiffrée (SQLCipher) n'existe que sur le téléphone : on la remplace ici.
jest.mock('../src/baseLocale', () => ({
  lire: jest.fn(async () => null),
  ecrire: jest.fn(async () => undefined),
  effacer: jest.fn(async () => undefined),
}));

const LISTE: ListeCible = {
  poste: {
    id: 'po1',
    libelle: 'VM Plateau',
    type_poste: 'vm',
    occupant: 'Awa Diallo',
    secteurs: [{ id: 's1', libelle: 'Plateau' }],
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
    telephone_mobile: '',
  },
};

function rendre(mesListes: () => Promise<ListeCible[]>, chercherPartout?: (t: string) => void) {
  const session = {
    etat: { statut: 'chargement' },
    client: { ciblage: { mesListes } } as unknown as ClientApi,
  } as Session;
  return render(
    <ContexteSession.Provider value={session}>
      <MaListeCible chercherPartout={chercherPartout} />
    </ContexteSession.Provider>,
  );
}

beforeEach(async () => {
  await i18n.changeLanguage('fr');
  jest.mocked(lire).mockReset().mockResolvedValue(null);
  jest.mocked(ecrire).mockClear();
  mockPousser.mockClear();
});

test('PRP-011 CA2 : la liste du poste est enregistrée sur le téléphone', async () => {
  await rendre(async () => [LISTE]);
  expect(await screen.findByText('Dr Aïssatou NDIAYE')).toBeTruthy();
  expect(screen.getByText('Cardiologie · Clinique du Cap')).toBeTruthy();
  expect(screen.getByText('2 / cycle')).toBeTruthy();
  expect(ecrire).toHaveBeenCalledWith('ciblage.moi', [LISTE]);
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
  const recherche = screen.getByLabelText('Chercher dans ma liste');
  // Par le lieu d'exercice, sans accent.
  await fireEvent.changeText(recherche, 'fann');
  expect(screen.queryByText('Dr Aïssatou NDIAYE')).toBeNull();
  expect(screen.getByText('Moussa FALL')).toBeTruthy();
  // Par les chiffres du téléphone, quelle que soit la mise en forme.
  await fireEvent.changeText(recherche, '770000001');
  expect(screen.getByText('Dr Aïssatou NDIAYE')).toBeTruthy();
  expect(screen.queryByText('Moussa FALL')).toBeNull();
  // Filtre rapide par potentiel.
  await fireEvent.changeText(recherche, '');
  await fireEvent.press(screen.getByText('B · 1'));
  expect(screen.queryByText('Dr Aïssatou NDIAYE')).toBeNull();
  expect(screen.getByText('1 fiche')).toBeTruthy();
  // La ligne ouvre la fiche.
  await fireEvent.press(screen.getByText('Moussa FALL'));
  expect(mockPousser).toHaveBeenCalledWith('/fiche/p2');
});

test('absent de ma liste : un toucher relance la recherche dans toutes les fiches', async () => {
  const partout = jest.fn();
  await rendre(async () => [LISTE], partout);
  await fireEvent.changeText(await screen.findByLabelText('Chercher dans ma liste'), 'Diop');
  expect(screen.getByText('Aucune fiche dans ma liste')).toBeTruthy();
  await fireEvent.press(screen.getByText('Chercher « Diop » dans toutes les fiches'));
  expect(partout).toHaveBeenCalledWith('Diop');
});
