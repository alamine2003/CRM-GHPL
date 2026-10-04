import type { ClientApi, ListeCible } from '@innov/api-client';
import { render, screen } from '@testing-library/react-native';
import { ecrire, lire } from '../src/baseLocale';
import i18n from '../src/i18n';
import { MaListeCible } from '../src/MaListe';
import { ContexteSession, type Session } from '../src/session';

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
      },
      frequence: 2,
      debut: '2026-10-01',
      fin: null,
      en_cours: true,
      hors_secteur: false,
    },
  ],
};

function rendre(mesListes: () => Promise<ListeCible[]>) {
  const session = {
    etat: { statut: 'chargement' },
    client: { ciblage: { mesListes } } as unknown as ClientApi,
  } as Session;
  return render(
    <ContexteSession.Provider value={session}>
      <MaListeCible />
    </ContexteSession.Provider>,
  );
}

beforeEach(async () => {
  await i18n.changeLanguage('fr');
  jest.mocked(lire).mockReset().mockResolvedValue(null);
  jest.mocked(ecrire).mockClear();
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
