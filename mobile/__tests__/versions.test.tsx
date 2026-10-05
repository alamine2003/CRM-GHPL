import type { ClientApi, DetailVersion, VersionPlanning } from '@innov/api-client';
import { fireEvent, render, screen } from '@testing-library/react-native';
import i18n from '../src/i18n';
import { ContexteSession, type Session } from '../src/session';
import { VueVersions } from '../src/Versions';

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
  changements: { ajoutees: 1, retirees: 0, deplacees: 0, modifiees: 0 },
};

test('PLN-014 : le délégué relit ses versions et ce qui a changé', async () => {
  await i18n.changeLanguage('fr');
  const detail: DetailVersion = {
    ...V2,
    contenu_visites: [],
    contenu_activites: [],
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
      <VueVersions planning="pl1" fuseau="Africa/Dakar" />
    </ContexteSession.Provider>,
  );
  expect(await screen.findByText('Version 2')).toBeTruthy();
  expect(screen.getByText('1 ajoutée')).toBeTruthy();
  fireEvent.press(screen.getByText('Version 2'));
  expect(await screen.findByText('1 visite ajoutée')).toBeTruthy();
  expect(screen.getByText('ven. 16 15:00 · Binta FICTIVE')).toBeTruthy();
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
  fireEvent.press(await screen.findByText('Version 1'));
  expect(
    await screen.findByText(
      'Révision demandée le jeudi 8 octobre à 10:30 par Kossi FICTIF · en remplacement',
    ),
  ).toBeTruthy();
  expect(screen.getByText('Ajoutez des visites.')).toBeTruthy();
});
