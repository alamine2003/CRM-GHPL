import type { ClientApi, Etablissement, Perimetre } from '@innov/api-client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ContexteSession, type Session } from '../contexteSession';
import i18n from '../i18n';
import Etablissements from './Etablissements';

// DC-55 : un rayon de pointage propre à l'établissement (grand hôpital, campus), saisi au
// portail ; vide, la distance du pays s'applique.

const FICHE = {
  id: 'e1',
  pays: 'SN',
  nom: 'Hôpital Fictif',
  type: 't1',
  type_code: 'hopital',
  type_libelle: 'Hôpital',
  secteur: { id: 's1', libelle: 'Plateau', zone: 'Dakar' },
  adresse: 'Rue 10',
  localite: null,
  activite: '',
  latitude: null,
  longitude: null,
  a_coordonnees: false,
  rayon_pointage_m: 300,
  telephone: '',
  statut: 'actif',
  cree_par: { id: 'u1', prenom: 'Awa', nom: 'FICTIVE' },
  cree_le: '2026-10-01T08:00:00Z',
  valide_le: null,
  modifiable: true,
} as unknown as Etablissement;

const PERIMETRE = {
  pays_actif: { code: 'SN', nom: 'Sénégal' },
  actions: ['prospects.creer', 'prospects.gerer'],
  roles: ['admin_pays'],
} as unknown as Perimetre;

function rendre(fiche: Etablissement, modifier = vi.fn(async () => fiche)) {
  const etablissements = {
    secteurs: vi.fn(async () => [{ id: 's1', libelle: 'Plateau', zone: 'Dakar', localites: [] }]),
    liste: vi.fn(async () => ({ resultats: [fiche], total: 1, page: 1, taille: 20 })),
    synthese: vi.fn(async () => ({
      actifs: 1,
      a_valider: 0,
      mes_a_valider: 0,
      sans_coordonnees: 1,
      secteurs_couverts: 1,
    })),
    detail: vi.fn(async () => fiche),
    historique: vi.fn(async () => []),
    modifier,
  };
  const session = {
    etat: { statut: 'chargement' },
    client: {
      etablissements,
      referentiel: {
        valeurs: vi.fn(async () => [{ id: 't1', libelle: 'Hôpital', archive: false }]),
      },
      exercices: { deLEtablissement: vi.fn(async () => []) },
    } as unknown as ClientApi,
  } as unknown as Session;
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <ContexteSession.Provider value={session}>
        <MemoryRouter>
          <Etablissements perimetre={PERIMETRE} />
        </MemoryRouter>
      </ContexteSession.Provider>
    </QueryClientProvider>,
  );
  return { modifier };
}

beforeEach(async () => {
  await i18n.changeLanguage('fr');
});

describe('DC-55 : rayon de pointage de l’établissement', () => {
  it.each([
    [300, '300 m'],
    [null, 'Distance du pays'],
  ])('DC-55 : la fiche donne le rayon de pointage (%s → « %s »)', async (rayon, texte) => {
    rendre({ ...FICHE, rayon_pointage_m: rayon });
    fireEvent.click(await screen.findByText('Hôpital Fictif'));
    const libelle = await screen.findByText('Rayon de pointage');
    const ligne = libelle.parentElement!;
    expect(within(ligne).getByText(texte)).toBeInTheDocument();
  });

  it('DC-55 : le rayon de pointage se saisit au formulaire et part à l’enregistrement', async () => {
    const { modifier } = rendre(FICHE);
    fireEvent.click(await screen.findByText('Hôpital Fictif'));
    fireEvent.click(await screen.findByRole('button', { name: 'Positionner' }));
    const champ = await screen.findByLabelText('Rayon de pointage (mètres)');
    expect(champ).toHaveValue('300');
    expect(
      screen.getByText(/Facultatif : pour un grand établissement \(hôpital, campus\)/),
    ).toBeInTheDocument();
    fireEvent.change(champ, { target: { value: '450' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() =>
      expect(modifier).toHaveBeenCalledWith(
        'e1',
        expect.objectContaining({ rayon_pointage_m: 450 }),
      ),
    );
  });

  it('DC-55 : vidé, le rayon part à null (la distance du pays s’applique)', async () => {
    const { modifier } = rendre(FICHE);
    fireEvent.click(await screen.findByText('Hôpital Fictif'));
    fireEvent.click(await screen.findByRole('button', { name: 'Positionner' }));
    fireEvent.change(await screen.findByLabelText('Rayon de pointage (mètres)'), {
      target: { value: '' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() =>
      expect(modifier).toHaveBeenCalledWith(
        'e1',
        expect.objectContaining({ rayon_pointage_m: null }),
      ),
    );
  });
});
