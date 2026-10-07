import type { ClientApi, PieceJointe, Rapport } from '@innov/api-client';
import { fireEvent, render, screen } from '@testing-library/react-native';
import * as ImagePicker from 'expo-image-picker';
import { lireAttente } from '../src/Brouillons';
import i18n from '../src/i18n';
import { PiecesJointes } from '../src/PiecesJointes';
import { ContexteSession, type Session } from '../src/session';

// RPT-007 (0.5.5) : photos et documents du rapport ; 10 Mo et 3 pièces au plus (CA1) ; sans
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
jest.mock('expo-image-picker', () => ({
  requestCameraPermissionsAsync: jest.fn(),
  requestMediaLibraryPermissionsAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));
jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));
jest.mock('@expo/vector-icons/MaterialIcons', () => 'Icone');

const galerie = ImagePicker.launchImageLibraryAsync as jest.Mock;
const permission = ImagePicker.requestMediaLibraryPermissionsAsync as jest.Mock;

const PHOTO = {
  uri: 'file:///cache/ordonnance.jpg',
  fileName: 'ordonnance.jpg',
  mimeType: 'image/jpeg',
  fileSize: 420_000,
};
const RECUE: PieceJointe = {
  id: 'piece-1',
  nom: 'ordonnance.jpg',
  type_mime: 'image/jpeg',
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
  permission.mockReset().mockResolvedValue({ granted: true });
  galerie.mockReset().mockResolvedValue({ canceled: false, assets: [PHOTO] });
  await i18n.changeLanguage('fr');
});

test('RPT-007 : une photo de la galerie part avec son identifiant et son heure', async () => {
  const joindrePiece = jest.fn(async () => RECUE);
  const surRapport = jest.fn();
  await rendre({}, joindrePiece, surRapport);
  await fireEvent.press(screen.getByText('Galerie'));
  expect(joindrePiece).toHaveBeenCalledWith(
    'v1',
    expect.objectContaining({
      id: 'piece-1',
      nom: 'ordonnance.jpg',
      fichier: { uri: PHOTO.uri, name: 'ordonnance.jpg', type: 'image/jpeg' },
    }),
  );
  expect(surRapport).toHaveBeenCalledWith([RECUE]);
});

test('RPT-007 : sans réseau, la photo attend dans la file et se voit « En attente »', async () => {
  await rendre(
    {},
    jest.fn(async () => {
      throw new TypeError('Network request failed');
    }),
  );
  await fireEvent.press(screen.getByText('Galerie'));
  expect(await screen.findByText(/partira toute seule au retour du réseau/)).toBeTruthy();
  expect(screen.getByText(/En attente du réseau/)).toBeTruthy();
  const [envoi] = await lireAttente();
  expect(envoi).toMatchObject({
    type: 'piece_jointe',
    visite: 'v1',
    saisie: { nom: 'ordonnance.jpg' },
  });
});

test('RPT-007 CA1 : plus de 10 Mo, la photo ne part pas', async () => {
  galerie.mockResolvedValue({ canceled: false, assets: [{ ...PHOTO, fileSize: 11_000_000 }] });
  const joindrePiece = jest.fn();
  await rendre({}, joindrePiece);
  await fireEvent.press(screen.getByText('Galerie'));
  expect(screen.getByText(/dépasse 10 Mo/)).toBeTruthy();
  expect(joindrePiece).not.toHaveBeenCalled();
});

test('RPT-007 CA1 : trois pièces, on ne peut plus en ajouter', async () => {
  const trois = [1, 2, 3].map((n) => ({ ...RECUE, id: `p${n}`, nom: `photo-${n}.jpg` }));
  await rendre({ pieces_jointes: trois }, jest.fn());
  expect(await screen.findByText('photo-3.jpg')).toBeTruthy();
  expect(screen.queryByText('Prendre une photo')).toBeNull();
  expect(screen.getByText(/3 pièces jointes au plus/)).toBeTruthy();
});
