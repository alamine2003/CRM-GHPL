import type { ClientApi, OptionsVentes, Perimetre, SyntheseVentes } from '@innov/api-client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ContexteSession, type Session } from '../contexteSession';
import i18n from '../i18n';
import Ventes from './Ventes';

// Suivi des ventes (1.6.0, prd.md §14.84) : cumul de l'année face à l'an passé, ventes
// mensuelles, ventes éclatées et filtres ; l'administrateur pays saisit et importe.

const MOIS = Array.from({ length: 12 }, (_, i) => ({
  mois: `2025-${String(i + 1).padStart(2, '0')}`,
  montant_ttc: i < 3 ? '1000.00' : '0.00',
  quantite: i < 3 ? 10 : 0,
  precedent_montant_ttc: i === 0 ? '500.00' : '0.00',
  precedent_quantite: i === 0 ? 5 : 0,
}));

const SYNTHESE: SyntheseVentes = {
  devise: 'XOF',
  annee: 2025,
  mois_fin: 3,
  par: 'produit',
  ytd: {
    montant_ttc: '3000.00',
    quantite: 30,
    precedent_montant_ttc: '500.00',
    precedent_quantite: 5,
    lignes: 4,
    evolution: 500,
  },
  mensuel: MOIS,
  ventilation: [
    {
      id: 'p1',
      cle: 'p1',
      libelle: 'Cardiol 10 mg',
      montant_ttc: '2400.00',
      quantite: 24,
      part: 80,
      precedent_montant_ttc: '500.00',
      evolution: 380,
    },
    {
      id: null,
      cle: '',
      libelle: 'Sans réseau',
      montant_ttc: '600.00',
      quantite: 6,
      part: 20,
      precedent_montant_ttc: '0.00',
      evolution: null,
    },
  ],
};

const OPTIONS: OptionsVentes = {
  annees: [2025, 2024],
  aujourdhui_annee: 2025,
  aujourdhui_mois: 3,
  delegues: [{ id: 'd1', nom: 'Gabriel Sn' }],
  produits: [{ id: 'p1', libelle: 'Cardiol 10 mg' }],
  classes: [],
  reseaux: [{ id: 'r1', libelle: 'Cardio' }],
  zones: [{ id: 'z1', libelle: 'Dakar' }],
  types_client: [
    { valeur: 'pharmacie', libelle: 'Pharmacie' },
    { valeur: 'parapharmacie', libelle: 'Parapharmacie' },
    { valeur: 'grossiste', libelle: 'Grossiste' },
  ],
};

function perimetre(actions: string[], roles = ['admin_pays']): Perimetre {
  return {
    pays_actif: { code: 'SN', nom: 'Sénégal', fuseau: 'Africa/Dakar' },
    vue_consolidee: false,
    roles,
    actions,
    pays_accessibles: [],
  };
}

function rendre(p: Perimetre, synthese: SyntheseVentes = SYNTHESE) {
  const syntheseFn = vi.fn(async () => synthese);
  const saisir = vi.fn(async () => ({}));
  const session = {
    etat: { statut: 'chargement' },
    client: {
      ventes: {
        synthese: syntheseFn,
        options: vi.fn(async () => OPTIONS),
        lignes: vi.fn(async () => ({ total: 0, page: 1, taille: 20, resultats: [] })),
        clients: vi.fn(async () => []),
        saisir,
      },
      utilisateurs: vi.fn(async () => [
        { id: 'd1', prenom: 'Gabriel', nom: 'Sn', roles: ['delegue'] },
      ]),
      referentiel: { produits: vi.fn(async () => [{ id: 'p1', libelle: 'Cardiol 10 mg' }]) },
      organisation: { zones: vi.fn(async () => []) },
    } as unknown as ClientApi,
  } as unknown as Session;
  render(
    <MemoryRouter>
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <ContexteSession.Provider value={session}>
          <Ventes perimetre={p} />
        </ContexteSession.Provider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
  return { syntheseFn, saisir };
}

describe('Ventes', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr');
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('affiche le cumul de l’année face à l’an passé, avec le signe de l’évolution', async () => {
    rendre(perimetre(['ventes.lire']));
    expect(await screen.findByText(/Cumul de l'année à fin mars/)).toBeTruthy();
    expect(screen.getByText(/\+500 % face à 2024/)).toBeTruthy();
    expect(screen.getByText(/Même période en 2024/)).toBeTruthy();
    // Le graphique a son équivalent en tableau.
    expect(screen.getByRole('img', { name: /Ventes mensuelles 2025/ })).toBeTruthy();
    expect(screen.getByRole('table', { name: 'Détail mensuel 2025' })).toBeTruthy();
  });

  it('éclate les ventes et filtre d’un clic sur une ligne', async () => {
    const { syntheseFn } = rendre(perimetre(['ventes.lire']));
    const tableau = await screen.findByRole('table', { name: 'Ventes éclatées' });
    expect(within(tableau).getByText('Sans réseau')).toBeTruthy();
    // Un groupe sans identifiant (« Sans réseau ») n'est pas un filtre.
    expect(within(tableau).queryByRole('button', { name: /Sans réseau/ })).toBeNull();
    fireEvent.click(within(tableau).getByRole('button', { name: 'Cardiol 10 mg' }));
    await waitFor(() =>
      expect(syntheseFn).toHaveBeenLastCalledWith(
        expect.objectContaining({ par: 'produit', produit: 'p1' }),
      ),
    );
    expect(await screen.findByRole('button', { name: /Réinitialiser \(1 filtre\)/ })).toBeTruthy();
  });

  it('une lecture seule ne propose ni saisie ni import', async () => {
    rendre(perimetre(['ventes.lire'], ['df']));
    await screen.findByText(/Cumul de l'année/);
    expect(screen.queryByRole('button', { name: 'Saisir une vente' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Importer un fichier' })).toBeNull();
  });

  it('l’administrateur pays saisit une vente', async () => {
    const { saisir } = rendre(perimetre(['ventes.lire', 'ventes.gerer']));
    fireEvent.click(await screen.findByRole('button', { name: 'Saisir une vente' }));
    const dialogue = await screen.findByRole('dialog');
    expect(
      within(dialogue).getByText(/Un total par mois, délégué, produit et client/),
    ).toBeTruthy();
    // Sans client, le bouton n'envoie rien.
    fireEvent.click(within(dialogue).getByRole('button', { name: 'Enregistrer la vente' }));
    expect(saisir).not.toHaveBeenCalled();
  });

  it('sans ventes, dit comment en obtenir', async () => {
    const vide: SyntheseVentes = {
      ...SYNTHESE,
      ytd: { ...SYNTHESE.ytd, lignes: 0, precedent_montant_ttc: '0.00', montant_ttc: '0.00' },
      ventilation: [],
    };
    rendre(perimetre(['ventes.lire', 'ventes.gerer']), vide);
    expect(await screen.findByText('Aucune vente sur cette période')).toBeTruthy();
    expect(screen.getByText(/Importez un fichier Excel de ventes/)).toBeTruthy();
  });

  it('sans pays choisi, invite à en choisir un', () => {
    const sans = { ...perimetre(['ventes.lire']), pays_actif: null };
    rendre(sans);
    expect(screen.getByText(/Choisissez d'abord un pays/)).toBeTruthy();
  });
});
