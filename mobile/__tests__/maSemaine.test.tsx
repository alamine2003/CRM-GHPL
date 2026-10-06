import type { ClientApi, Semaine } from '@innov/api-client';
import { fireEvent, render, screen } from '@testing-library/react-native';
import i18n from '../src/i18n';
import { MaSemaine } from '../src/MaSemaine';
import { ContexteSession, type Session } from '../src/session';

const mockPousser = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPousser }) }));

const BASE = {
  courante: true,
  fuseau: 'Africa/Dakar',
  jours: [],
  peut_creer: false,
  modifiable: false,
  passages: [],
  activites: [],
  controles: null,
  kilometrage: null,
  reprenables: 0,
  fermee: false,
  demande_envoyee: false,
  reseaux: [],
  approbation: null,
  conformite: [],
} satisfies Partial<Semaine>;

const PLANNING = {
  id: 'pl1',
  cree_le: '',
  soumis_le: null,
  en_retard: false,
  echeance: '2099-10-08T18:00:00Z',
  decision: null,
  numero_version: null,
  motif_version: null,
  ferme: false,
  reouvert_le: null,
};

const COURANTE: Semaine = {
  ...BASE,
  semaine: '2026-10-05',
  precedente: '2026-09-28',
  suivante: '2026-10-12',
  planning: { ...PLANNING, semaine: '2026-10-05', statut: 'soumis', soumis_le: '2026-09-30' },
  visites: [],
};
const SUIVANTE: Semaine = {
  ...BASE,
  courante: false,
  modifiable: true,
  semaine: '2026-10-12',
  precedente: '2026-10-05',
  suivante: '2026-10-19',
  planning: { ...PLANNING, semaine: '2026-10-12', statut: 'brouillon' },
  visites: [],
};

test('PLN-006 : l’accueil dit où en sont cette semaine et la suivante', async () => {
  await i18n.changeLanguage('fr');
  const semaine = jest.fn(async (jour?: string) => (jour ? SUIVANTE : COURANTE));
  const session = {
    etat: { statut: 'connecte' },
    client: { plannings: { semaine } } as unknown as ClientApi,
  } as unknown as Session;
  await render(
    <ContexteSession.Provider value={session}>
      <MaSemaine />
    </ContexteSession.Provider>,
  );
  expect(await screen.findByText('Soumis au superviseur · 0 visite')).toBeTruthy();
  expect(screen.getByText('En préparation · 0 visite')).toBeTruthy();
  expect(screen.getByText(/^À soumettre avant le /)).toBeTruthy();
  expect(semaine).toHaveBeenCalledWith('2026-10-12');
  await fireEvent.press(screen.getByText('Semaine prochaine'));
  expect(mockPousser).toHaveBeenCalledWith({
    pathname: '/semaine',
    params: { jour: '2026-10-12' },
  });
});
