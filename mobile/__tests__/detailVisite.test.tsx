import type { ClientApi, DetailVisite } from '@innov/api-client';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Linking } from 'react-native';
import { CoordonneesEtHistorique } from '../src/DetailVisite';
import i18n from '../src/i18n';
import { ContexteSession, type Session } from '../src/session';

// VIS-002 (0.4.2) : coordonnées du prospect et du lieu, trois dernières visites du délégué ;
// le détail se lit sans réseau.

const mockMemoire = new Map<string, { valeur: unknown; maj: string }>();
jest.mock('../src/baseLocale', () => ({
  lire: jest.fn(async (cle: string) => mockMemoire.get(cle) ?? null),
  ecrire: jest.fn(async (cle: string, valeur: unknown) =>
    mockMemoire.set(cle, { valeur, maj: '2026-10-13T06:30:00.000Z' }),
  ),
  oublier: jest.fn(),
  effacer: jest.fn(),
}));

const DETAIL = {
  visite: {} as DetailVisite['visite'],
  prospect: { telephone_mobile: '+221 70 000 00 00', telephone_pro: '', courriel: '' },
  lieu: {
    id: 'e1',
    nom: 'Clinique Fictive',
    adresse: 'Rue fictive 1',
    localite: 'Plateau',
    telephone: '',
    latitude: '14.700000',
    longitude: '-17.400000',
  },
  historique: [
    {
      id: 'h1',
      date: '2026-10-01',
      heure: '09:00',
      statut: 'prevue',
      objectif: 'Présenter le produit du mois',
      etablissement: 'Clinique Fictive',
    },
    {
      id: 'h2',
      date: '2026-09-24',
      heure: '10:30',
      statut: 'prevue',
      objectif: 'Rappel posologie',
      etablissement: 'Clinique Fictive',
    },
  ],
} satisfies DetailVisite;

async function rendre(detail: jest.Mock) {
  const session = {
    etat: { statut: 'connecte' },
    client: { visites: { detail } } as unknown as ClientApi,
  } as unknown as Session;
  await render(
    <ContexteSession.Provider value={session}>
      <CoordonneesEtHistorique id="v1" />
    </ContexteSession.Provider>,
  );
}

beforeEach(async () => {
  mockMemoire.clear();
  await i18n.changeLanguage('fr');
});

test('VIS-002 : coordonnées et trois dernières visites, de la plus récente', async () => {
  const appel = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
  await rendre(jest.fn(async () => DETAIL));
  expect(await screen.findByText('Coordonnées')).toBeTruthy();
  expect(screen.getByText('Rue fictive 1, Plateau')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Appeler +221 70 000 00 00'));
  expect(appel).toHaveBeenCalledWith('tel:+221700000000');
  expect(screen.getByText('Dernières visites')).toBeTruthy();
  const objectifs = ['Présenter le produit du mois', 'Rappel posologie'];
  expect(objectifs.map((o) => !!screen.getByText(o))).toEqual([true, true]);
  expect(screen.getByText('jeu. 1 oct. · 09:00')).toBeTruthy();
  expect(mockMemoire.get('visite.v1')?.valeur).toEqual(DETAIL);
});

test('VIS-002 : sans réseau, le détail gardé s’affiche', async () => {
  mockMemoire.set('visite.v1', { valeur: DETAIL, maj: '2026-10-13T06:30:00.000Z' });
  await rendre(
    jest.fn(async () => {
      throw new TypeError('Network request failed');
    }),
  );
  expect(await screen.findByText(/^Hors ligne : coordonnées et historique/)).toBeTruthy();
  expect(screen.getByText('Rappel posologie')).toBeTruthy();
});

test('sans historique ni coordonnées, le détail le dit', async () => {
  await rendre(
    jest.fn(async () => ({
      ...DETAIL,
      prospect: { telephone_mobile: '', telephone_pro: '', courriel: '' },
      lieu: { ...DETAIL.lieu, adresse: '', localite: null },
      historique: [],
    })),
  );
  expect(await screen.findByText('Aucune coordonnée enregistrée.')).toBeTruthy();
  expect(screen.getByText('Aucune visite précédente chez ce prospect.')).toBeTruthy();
});
