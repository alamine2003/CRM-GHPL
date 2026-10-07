import type { ClientApi, PieceJointe, Rapport } from '@innov/api-client';
import { fireEvent, render, screen } from '@testing-library/react-native';
import * as DocumentPicker from 'expo-document-picker';
import { lireAttente } from '../src/Brouillons';
import i18n from '../src/i18n';
import { PiecesJointes } from '../src/PiecesJointes';
import { ContexteSession, type Session } from '../src/session';

// RPT-007 (0.5.5, PDF seul depuis 0.5.7, DC-48) : documents du rapport ; 10 Mo et 3 pièces au plus (CA1) ; sans
// réseau, la pièce attend dans la file (téléversement différé).

const mockMemoire = new Map<string, { valeur: unknown; maj: string }>();
jest.mock('../src/baseLocale', () => ({
  lire: jest.fn(async (cle: string) => mockMemoire.get(cle) ?? null),
  ecrire: jest.fn(async (cle: string, valeur: unknown) =>
    mockMemoire.set(cle, { valeur, maj: '2026-10-13T06:30:00.000Z' }),
  ),
  oublier: jest.fn(async (cle: string) => mockMemoire.delete(cle)),
  effacer: jest.fn(),
}));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'piece-1' }));
jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));
jest.mock('@expo/vector-icons/MaterialIcons', () => 'Icone');

const choisir = DocumentPicker.getDocumentAsync as jest.Mock;

const PDF = {
  uri: 'file:///cache/fiche-produit.pdf',
  name: 'fiche-produit.pdf',
  mimeType: 'application/pdf',
  size: 420_000,
};
const RECUE: PieceJointe = {
  id: 'piece-1',
  nom: 'fiche-produit.pdf',
  type_mime: 'application/pdf',
  taille: 420_000,
  prise_le: '2026-10-13T09:45:00Z',
};

function rendre(rapport: Partial<Rapport>, joindrePiece: jest.Mock, surRapport = jest.fn()) {
  const session = {
    etat: { statut: 'connecte' },
    client: { visites: { joindrePiece, retirerPiece: jest.fn() } } as unknown as ClientApi,
  } as unknown as Session;
  return render(
    <ContexteSession.Provider value={session}>
      <PiecesJointes
        rapport={{ pieces_jointes: [], ...rapport } as Rapport}
        visite="v1"
        modifiable
        surRapport={surRapport}
      />
    </ContexteSession.Provider>,
  );
}

beforeEach(async () => {
  mockMemoire.clear();
  choisir.mockReset().mockResolvedValue({ canceled: false, assets: [PDF] });
  await i18n.changeLanguage('fr');
});

test('RPT-007 : un PDF part avec son identifiant et son heure', async () => {
  const joindrePiece = jest.fn(async () => RECUE);
  const surRapport = jest.fn();
  await rendre({}, joindrePiece, surRapport);
  await fireEvent.press(screen.getByText('Joindre un PDF'));
  expect(joindrePiece).toHaveBeenCalledWith(
    'v1',
    expect.objectContaining({
      id: 'piece-1',
      nom: 'fiche-produit.pdf',
      fichier: { uri: PDF.uri, name: 'fiche-produit.pdf', type: 'application/pdf' },
    }),
  );
  expect(surRapport).toHaveBeenCalledWith([RECUE]);
});

test('RPT-007 : sans réseau, le PDF attend dans la file et se voit « En attente »', async () => {
  await rendre(
    {},
    jest.fn(async () => {
      throw new TypeError('Network request failed');
    }),
  );
  await fireEvent.press(screen.getByText('Joindre un PDF'));
  expect(await screen.findByText(/partira toute seule au retour du réseau/)).toBeTruthy();
  expect(screen.getByText(/En attente du réseau/)).toBeTruthy();
  const [envoi] = await lireAttente();
  expect(envoi).toMatchObject({
    type: 'piece_jointe',
    visite: 'v1',
    saisie: { nom: 'fiche-produit.pdf' },
  });
});

test('RPT-007 CA1 : plus de 10 Mo, le PDF ne part pas', async () => {
  choisir.mockResolvedValue({ canceled: false, assets: [{ ...PDF, size: 11_000_000 }] });
  const joindrePiece = jest.fn();
  await rendre({}, joindrePiece);
  await fireEvent.press(screen.getByText('Joindre un PDF'));
  expect(screen.getByText(/dépasse 10 Mo/)).toBeTruthy();
  expect(joindrePiece).not.toHaveBeenCalled();
});

test('RPT-007 CA1 : trois pièces, on ne peut plus en ajouter', async () => {
  const trois = [1, 2, 3].map((n) => ({ ...RECUE, id: `p${n}`, nom: `fiche-${n}.pdf` }));
  await rendre({ pieces_jointes: trois }, jest.fn());
  expect(await screen.findByText('fiche-3.pdf')).toBeTruthy();
  expect(screen.queryByText('Joindre un PDF')).toBeNull();
  expect(screen.getByText(/3 pièces jointes au plus/)).toBeTruthy();
});

test('DC-48 : aucune photo, ni appareil photo ni galerie', async () => {
  await rendre({}, jest.fn());
  expect(screen.queryByText('Prendre une photo')).toBeNull();
  expect(screen.queryByText('Galerie')).toBeNull();
  expect(screen.getByText('Joindre un PDF')).toBeTruthy();
});
