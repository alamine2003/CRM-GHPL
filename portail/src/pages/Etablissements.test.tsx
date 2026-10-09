import type { ClientApi, Etablissement, Perimetre } from '@innov/api-client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ContexteSession, type Session } from '../contexteSession';
import i18n from '../i18n';
import Etablissements from './Etablissements';

// Leaflet ne s'affiche pas sous jsdom : une carte factice liste ses points et simule un clic.
vi.mock('../composants/Carte', () => ({
  default: ({
    points,
    surClic,
  }: {
    points: { id: string; libelle: string }[];
    surClic?: (latitude: number, longitude: number) => void;
  }) => (
    <div>
      {points.map((p) => (
        <span key={p.id}>{p.libelle}</span>
      ))}
      {surClic && <button onClick={() => surClic(14.7011, -17.4002)}>clic-carte</button>}
    </div>
  ),
}));

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

const PROPOSEE = {
  latitude: 14.7002,
  longitude: -17.4002,
  ecart_max_m: 22,
  pointages: [
    { latitude: 14.7, longitude: -17.4, precision_m: 12, le: '2026-09-01T09:00:00Z' },
    { latitude: 14.7004, longitude: -17.4002, precision_m: 9, le: '2026-09-02T09:00:00Z' },
    { latitude: 14.7002, longitude: -17.4003, precision_m: null, le: '2026-09-05T09:00:00Z' },
  ],
  utilisables: 4,
  personnes: 2,
  seuil_m: 100,
};

function rendre(
  fiche: Etablissement,
  modifier = vi.fn(async () => fiche),
  { proposee = PROPOSEE as unknown, aValider = 0 } = {},
) {
  const validerPosition = vi.fn(async () => ({ ...fiche, a_coordonnees: true }));
  const liste = vi.fn(async () => ({ resultats: [fiche], total: 1, page: 1, taille: 20 }));
  const etablissements = {
    secteurs: vi.fn(async () => [{ id: 's1', libelle: 'Plateau', zone: 'Dakar', localites: [] }]),
    liste,
    synthese: vi.fn(async () => ({
      actifs: 1,
      a_valider: 0,
      mes_a_valider: 0,
      sans_coordonnees: 1,
      positions_proposees: aValider,
      secteurs_couverts: 1,
    })),
    detail: vi.fn(async () => fiche),
    historique: vi.fn(async () => []),
    positionProposee: vi.fn(async () => proposee),
    validerPosition,
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
  return { modifier, validerPosition, liste };
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

describe('DC-52 : position de référence proposée', () => {
  it('DC-52 : l’administrateur voit le point médian et le valide tel quel', async () => {
    const { validerPosition } = rendre(FICHE);
    fireEvent.click(await screen.findByText('Hôpital Fictif'));
    expect(await screen.findByText('Position proposée')).toBeInTheDocument();
    expect(
      screen.getByText(/Point médian de 3 pointages de démarrage, faits par 2 personnes/),
    ).toBeInTheDocument();
    expect(screen.getByText(/Pointage du 1 septembre · ± 12 m/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Valider cette position' }));
    await waitFor(() => expect(validerPosition).toHaveBeenCalledWith('e1', undefined));
  });

  it('DC-52 : un clic sur la carte déplace le point, qui part à la validation', async () => {
    const { validerPosition } = rendre(FICHE);
    fireEvent.click(await screen.findByText('Hôpital Fictif'));
    fireEvent.click(await screen.findByRole('button', { name: 'clic-carte' }));
    expect(await screen.findByText(/Point déplacé de 100 m/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Valider cette position' }));
    await waitFor(() =>
      expect(validerPosition).toHaveBeenCalledWith('e1', {
        latitude: 14.7011,
        longitude: -17.4002,
      }),
    );
  });

  it('DC-52 : sans deux personnes, rien n’est proposé et la fiche dit pourquoi', async () => {
    rendre(FICHE, undefined, {
      proposee: { ...PROPOSEE, latitude: null, longitude: null, utilisables: 2, personnes: 1 },
    });
    fireEvent.click(await screen.findByText('Hôpital Fictif'));
    expect(
      await screen.findByText(/2 pointages utilisables, de 1 personne\(s\)/),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Valider cette position' })).toBeNull();
  });

  it('DC-52 : un bandeau compte les positions à valider et filtre la liste', async () => {
    const { liste } = rendre(FICHE, undefined, { aValider: 2 });
    expect(
      await screen.findByText('2 positions proposées attendent votre validation.'),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Les afficher' }));
    await waitFor(() =>
      expect(liste).toHaveBeenLastCalledWith(expect.objectContaining({ position_proposee: '1' })),
    );
    expect(await screen.findByRole('button', { name: 'Tout afficher' })).toBeInTheDocument();
  });
});
