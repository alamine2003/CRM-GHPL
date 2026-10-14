import type { ClientApi, DetailVersion, VersionPlanning } from '@innov/api-client';
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import i18n from '../src/i18n';
import { ContexteSession, type Session } from '../src/session';
import { VueVersions } from '../src/Versions';

// Le gabarit (en-tête, onglets) est testé ailleurs : ici, son titre, son contexte et ses volets.
const mockTablette = { valeur: false };
jest.mock('../src/disposition', () => ({ useTablette: () => mockTablette.valeur }));
jest.mock('../src/Ecran', () => ({
  Ecran: ({
    titre,
    surTitre,
    enteteTablette,
    gauche,
    children,
  }: {
    titre: string;
    surTitre?: string;
    enteteTablette?: { surTitre?: string };
    gauche?: ReactNode;
    children: ReactNode;
  }) => {
    const { Text } = jest.requireActual('react-native');
    const { useTablette } = jest.requireMock('../src/disposition');
    const tablette = useTablette();
    return (
      <>
        <Text>{titre}</Text>
        <Text>{tablette ? enteteTablette?.surTitre : surTitre}</Text>
        {tablette ? gauche : null}
        {children}
      </>
    );
  },
}));

beforeEach(() => {
  mockTablette.valeur = false;
});

const V2: VersionPlanning = {
  numero: 2,
  soumis_le: '2026-10-09T15:00:00Z',
  en_retard: false,
  decision: null,
  decide_le: null,
  par: null,
  mode: null,
  commentaire: '',
  remarques: [],
  visites: 2,
  motif: 'soumission',
  mineures: 0,
  changements: { ajoutees: 1, retirees: 0, deplacees: 0, modifiees: 0 },
};

test('PLN-014 : le délégué relit ses versions et ce qui a changé', async () => {
  await i18n.changeLanguage('fr');
  const detail: DetailVersion = {
    ...V2,
    contenu_visites: [],
    contenu_activites: [],
    modifications: [],
    comparaison: {
      ajoutees: [
        {
          id: 'c',
          date: '2026-10-16',
          heure: '15:00',
          ordre: 1,
          prospect: { id: 'p', nom: 'Binta FICTIVE' },
          etablissement: null,
          objectif: '',
          note: '',
          passage: null,
        },
      ],
      retirees: [],
      deplacees: [],
      modifiees: [],
    },
  };
  const session = {
    etat: { statut: 'connecte' },
    client: {
      plannings: { versions: jest.fn(async () => [V2]), version: jest.fn(async () => detail) },
    } as unknown as ClientApi,
  } as unknown as Session;
  await render(
    <ContexteSession.Provider value={session}>
      <VueVersions planning="pl1" fuseau="Africa/Dakar" semaine="2026-10-12" />
    </ContexteSession.Provider>,
  );
  expect(await screen.findByText('Version 2')).toBeTruthy();
  expect(screen.getByText('Version')).toBeTruthy();
  expect(screen.getByText('Semaine du 12 au 18 octobre')).toBeTruthy();
  expect(screen.getByText('En attente')).toBeTruthy();
  expect(screen.getByText('Soumise le vendredi 9 octobre à 15:00')).toBeTruthy();
  expect(screen.getByText('1 ajoutée')).toBeTruthy();
  // La plus récente est dépliée d'elle-même.
  expect(await screen.findByText('1 visite ajoutée')).toBeTruthy();
  expect(screen.getByText('ven. 16 · 15:00 · Binta FICTIVE')).toBeTruthy();
  await fireEvent.press(screen.getByText('Version 2'));
  expect(screen.queryByText('1 visite ajoutée')).toBeNull();
});

test('PLN-014 : sur la tablette, la liste à gauche et la version choisie à droite', async () => {
  await i18n.changeLanguage('fr');
  mockTablette.valeur = true;
  const V1: VersionPlanning = {
    ...V2,
    numero: 1,
    decision: 'approuve',
    decide_le: '2026-10-08T10:30:00Z',
    par: 'Kossi FICTIF',
    mode: 'direct',
    changements: null,
  };
  const V3: VersionPlanning = {
    ...V2,
    numero: 3,
    motif: 'modification',
    changements: { ajoutees: 0, retirees: 0, deplacees: 1, modifiees: 0 },
  };
  const figee = {
    id: 'd',
    date: '2026-10-14',
    heure: '14:30',
    ordre: 1,
    prospect: null,
    etablissement: { id: 'e', nom: 'Pharmacie FICTIVE' },
    objectif: '',
    note: '',
    passage: null,
  };
  const version = jest.fn(async (_p: string, numero: number) => ({
    ...(numero === 3 ? V3 : V1),
    contenu_visites: [],
    contenu_activites: [],
    modifications: [],
    comparaison:
      numero === 3
        ? {
            ajoutees: [],
            retirees: [],
            modifiees: [],
            deplacees: [{ visite: figee, avant: { date: '2026-10-14', heure: '11:30' } }],
          }
        : null,
  }));
  const session = {
    etat: { statut: 'connecte' },
    client: {
      plannings: { versions: jest.fn(async () => [V1, V3]), version },
    } as unknown as ClientApi,
  } as unknown as Session;
  await render(
    <ContexteSession.Provider value={session}>
      <VueVersions planning="pl1" fuseau="Africa/Dakar" semaine="2026-10-12" />
    </ContexteSession.Provider>,
  );
  expect(
    await screen.findByText(
      'Semaine du 12 au 18 octobre · chaque soumission crée une version figée',
    ),
  ).toBeTruthy();
  expect(screen.getByText('Approuvée le jeu. 8 octobre par Kossi FICTIF')).toBeTruthy();
  expect(
    screen.getByText('Soumise le vendredi 9 octobre à 15:00 · modification après approbation'),
  ).toBeTruthy();
  expect(await screen.findByText('1 visite déplacée')).toBeTruthy();
  expect(screen.getByText('Pharmacie FICTIVE')).toBeTruthy();
  expect(screen.getByText('11:30 → 14:30')).toBeTruthy();
  expect(
    screen.getByText(
      'Une version en attente est examinée par votre superviseur ; la version 1 reste celle à suivre jusque-là.',
    ),
  ).toBeTruthy();
  await fireEvent.press(screen.getAllByText('Version 1')[0]!);
  // La liste et le détail le disent tous deux.
  expect(await screen.findAllByText('Première version')).toHaveLength(2);
  expect(version).toHaveBeenLastCalledWith('pl1', 1);
});

test('PLN-014 CA2 : une version décidée dit qui, quand et pourquoi', async () => {
  await i18n.changeLanguage('fr');
  const v1: VersionPlanning = {
    ...V2,
    numero: 1,
    decision: 'a_reviser',
    decide_le: '2026-10-08T10:30:00Z',
    par: 'Kossi FICTIF',
    mode: 'remplacement',
    commentaire: 'Ajoutez des visites.',
    changements: null,
  };
  const session = {
    etat: { statut: 'connecte' },
    client: {
      plannings: {
        versions: jest.fn(async () => [v1]),
        version: jest.fn(async () => ({
          ...v1,
          contenu_visites: [],
          contenu_activites: [],
          modifications: [],
          comparaison: null,
        })),
      },
    } as unknown as ClientApi,
  } as unknown as Session;
  await render(
    <ContexteSession.Provider value={session}>
      <VueVersions planning="pl1" fuseau="Africa/Dakar" />
    </ContexteSession.Provider>,
  );
  expect(
    await screen.findByText(
      'Soumise le vendredi 9 octobre · révision demandée le jeudi 8 octobre par Kossi FICTIF · en remplacement',
    ),
  ).toBeTruthy();
  expect(screen.getByText('Révision demandée')).toBeTruthy();
  expect(screen.getByText('Ajoutez des visites.')).toBeTruthy();
});
