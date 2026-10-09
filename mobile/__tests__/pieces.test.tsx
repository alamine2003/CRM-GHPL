import type { ClientApi, PieceJointe, Rapport } from '@innov/api-client';
import { fireEvent, render, screen } from '@testing-library/react-native';
import * as DocumentPicker from 'expo-document-picker';
import { envoyerAttente, lireAttente, mettreEnAttente } from '../src/Brouillons';
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
  en_attente: false,
};

function rendre(
  rapport: Partial<Rapport>,
  joindrePiece: jest.Mock,
  surRapport = jest.fn(),
  annoncerPiece: jest.Mock = jest.fn(async () => ({ ...RECUE, en_attente: true })),
) {
  const session = {
    etat: { statut: 'connecte' },
    client: {
      visites: { joindrePiece, annoncerPiece, retirerPiece: jest.fn() },
    } as unknown as ClientApi,
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
  const sansReseau = jest.fn(async () => {
    throw new TypeError('Network request failed');
  });
  await rendre({}, sansReseau, jest.fn(), sansReseau);
  await fireEvent.press(screen.getByText('Joindre un PDF'));
  expect(await screen.findByText(/partira toute seule au retour du réseau/)).toBeTruthy();
  expect(screen.getByText(/En attente du réseau/)).toBeTruthy();
  // OFF-005 : l'annonce (nom, taille) attend avant le fichier.
  const [annonce, envoi] = await lireAttente();
  expect(annonce).toMatchObject({
    type: 'annonce_piece',
    saisie: { id: 'piece-1', nom: 'fiche-produit.pdf', taille: 420_000 },
  });
  expect(envoi).toMatchObject({
    type: 'piece_jointe',
    visite: 'v1',
    saisie: { nom: 'fiche-produit.pdf' },
  });
});

test('OFF-005 : annoncée, la pièce attend seulement son fichier ; il part après le reste', async () => {
  const annoncerPiece = jest.fn(async () => ({ ...RECUE, en_attente: true }));
  const joindrePiece = jest.fn(async () => {
    throw new TypeError('Network request failed');
  });
  await rendre({}, joindrePiece, jest.fn(), annoncerPiece);
  await fireEvent.press(screen.getByText('Joindre un PDF'));
  await screen.findByText(/partira toute seule au retour du réseau/);
  expect(annoncerPiece).toHaveBeenCalledWith('v1', expect.objectContaining({ taille: 420_000 }));
  expect((await lireAttente()).map((e) => e.type)).toEqual(['piece_jointe']);
  // Au retour du réseau, la soumission ajoutée ensuite passe avant le fichier.
  await mettreEnAttente({
    id: 's1',
    type: 'soumission_rapport',
    visite: 'v1',
    soumis_le: '2026-10-13T10:00:00Z',
    resume: 'Rapport',
  });
  const ordre: string[] = [];
  const client = {
    visites: {
      soumettreRapport: jest.fn(async () => ordre.push('soumission')),
      joindrePiece: jest.fn(async () => ordre.push('fichier')),
    },
  } as unknown as ClientApi;
  await envoyerAttente(client);
  expect(ordre).toEqual(['soumission', 'fichier']);
});

test('OFF-005 CA1 : une pièce annoncée sans fichier se lit « en attente »', async () => {
  await rendre({ pieces_jointes: [{ ...RECUE, en_attente: true }] }, jest.fn());
  expect(await screen.findByText(/Annoncée, en attente du fichier/)).toBeTruthy();
  expect(screen.queryByText('Retirer')).toBeNull();
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
