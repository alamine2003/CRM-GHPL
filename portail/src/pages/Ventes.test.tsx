import type {
  ClientApi,
  ObjectifsVentes,
  OptionsVentes,
  Perimetre,
  SyntheseVentes,
} from '@innov/api-client';
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

const OBJECTIFS: ObjectifsVentes = {
  devise: 'XOF',
  annee: 2025,
  mois_fin: 3,
  objectifs: [
    {
      id: 'o1',
      reseau: { id: 'r1', libelle: 'Cardio' },
      produit: null,
      annee: 2025,
      cible: '12000.00',
      attendu: '3000.00',
      realise: '3600.00',
      ecart: '600.00',
      taux_cible: 30,
      taux_attendu: 120,
      etat: 'en_avance',
      mois: Array(12).fill('1000.00'),
      repartition_libre: false,
    },
    {
      id: 'o2',
      reseau: { id: 'r1', libelle: 'Cardio' },
      produit: { id: 'p1', libelle: 'Cardiol 10 mg' },
      annee: 2025,
      cible: '6000.00',
      attendu: '1500.00',
      realise: '900.00',
      ecart: '-600.00',
      taux_cible: 15,
      taux_attendu: 60,
      etat: 'en_retard',
      mois: Array(12).fill('500.00'),
      repartition_libre: false,
    },
  ],
  total: {
    cible: '12000.00',
    attendu: '3000.00',
    realise: '3600.00',
    taux_cible: 30,
    taux_attendu: 120,
  },
  reseaux_gerables: [
    { id: 'r1', libelle: 'Cardio', produits: [{ id: 'p1', libelle: 'Cardiol 10 mg' }] },
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
  const exporter = vi.fn(async () => new Blob(['x']));
  const syntheseFn = vi.fn(async () => synthese);
  const saisir = vi.fn(async () => ({}));
  const fixerObjectif = vi.fn(async () => ({}));
  const objectifs = vi.fn(async () => OBJECTIFS);
  const session = {
    etat: { statut: 'chargement' },
    client: {
      ventes: {
        synthese: syntheseFn,
        options: vi.fn(async () => OPTIONS),
        lignes: vi.fn(async () => ({ total: 0, page: 1, taille: 20, resultats: [] })),
        clients: vi.fn(async () => []),
        saisir,
        exporter,
        objectifs,
        fixerObjectif,
        corrigerObjectif: vi.fn(async () => ({})),
        archiverObjectif: vi.fn(async () => undefined),
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
  return { syntheseFn, saisir, exporter, objectifs, fixerObjectif };
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

  it('l’encadrement exporte ce qui est affiché, avec les mêmes filtres', async () => {
    const creerUrl = vi.fn(() => 'blob:x');
    vi.stubGlobal('URL', { createObjectURL: creerUrl, revokeObjectURL: vi.fn() });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    const { exporter } = rendre(perimetre(['ventes.lire', 'ventes.exporter'], ['df']));
    fireEvent.click(await screen.findByRole('button', { name: 'Exporter' }));
    expect(await screen.findByText(/Chaque export est inscrit au journal d'audit/)).toBeTruthy();
    fireEvent.click(screen.getByRole('menuitem', { name: /Lignes de vente.*Fichier CSV/ }));
    await waitFor(() =>
      expect(exporter).toHaveBeenCalledWith(
        expect.objectContaining({ contenu: 'lignes', fichier: 'csv', annee: 2025, mois_fin: 3 }),
      ),
    );
  });

  it('sans le droit d’exporter, pas de bouton Exporter', async () => {
    rendre(perimetre(['ventes.lire', 'ventes.gerer']));
    await screen.findByText(/Cumul de l'année/);
    expect(screen.queryByRole('button', { name: 'Exporter' })).toBeNull();
  });
  it('le DO lit les objectifs de ventes : cible, attendu, réalisé et état en toutes lettres', async () => {
    const { objectifs } = rendre(perimetre(['ventes.lire', 'ventes.objectifs_lire'], ['df']));
    fireEvent.click(await screen.findByRole('tab', { name: 'Objectifs' }));
    const tableau = await screen.findByRole('table', { name: 'Objectifs de ventes 2025' });
    expect(objectifs).toHaveBeenCalledWith(expect.objectContaining({ annee: 2025, mois_fin: 3 }));
    expect(within(tableau).getByText('En avance')).toBeTruthy();
    expect(within(tableau).getByText('En retard')).toBeTruthy();
    // Le produit s'écrit deux fois : sous le réseau (téléphone) et dans sa colonne (le CSS masque l'un).
    expect(within(tableau).getAllByText('Tout le réseau')).toHaveLength(2);
    expect(within(tableau).getAllByText('Cardiol 10 mg').length).toBeGreaterThan(0);
    // Le total ne compte que l'objectif de réseau ; une lecture seule ne fixe rien.
    expect(screen.getByText('Réalisé / attendu')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Fixer un objectif' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Corriger' })).toBeNull();
  });

  it('sans le droit de lire les objectifs, pas d’onglet Objectifs', async () => {
    rendre(perimetre(['ventes.lire'], ['superviseur']));
    await screen.findByText(/Cumul de l'année/);
    expect(screen.queryByRole('tab', { name: 'Objectifs' })).toBeNull();
  });

  it('l’administrateur pays fixe l’objectif de l’année d’un réseau', async () => {
    const { fixerObjectif } = rendre(
      perimetre(['ventes.lire', 'ventes.objectifs_lire', 'ventes.objectifs_gerer']),
    );
    fireEvent.click(await screen.findByRole('tab', { name: 'Objectifs' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Fixer un objectif' }));
    const dialogue = await screen.findByRole('dialog');
    // Sans réseau ni cible, rien ne part.
    fireEvent.click(within(dialogue).getByRole('button', { name: "Enregistrer l'objectif" }));
    expect(fixerObjectif).not.toHaveBeenCalled();
    fireEvent.mouseDown(within(dialogue).getByRole('combobox', { name: /Réseau/ }));
    fireEvent.click(await screen.findByRole('option', { name: 'Cardio' }));
    fireEvent.change(within(dialogue).getByLabelText(/Cible de l'année/), {
      target: { value: '24000' },
    });
    fireEvent.click(within(dialogue).getByRole('button', { name: "Enregistrer l'objectif" }));
    await waitFor(() =>
      expect(fixerObjectif).toHaveBeenCalledWith({
        reseau: 'r1',
        produit: null,
        annee: 2025,
        cible: '24000',
      }),
    );
  });

  it('la répartition mois par mois part des parts égales et donne la somme', async () => {
    rendre(perimetre(['ventes.lire', 'ventes.objectifs_lire', 'ventes.objectifs_gerer']));
    fireEvent.click(await screen.findByRole('tab', { name: 'Objectifs' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Fixer un objectif' }));
    const dialogue = await screen.findByRole('dialog');
    fireEvent.change(within(dialogue).getByLabelText(/Cible de l'année/), {
      target: { value: '12000' },
    });
    fireEvent.click(within(dialogue).getByRole('switch', { name: 'Répartir mois par mois' }));
    expect(await within(dialogue).findByText(/Somme des mois : .*12/)).toBeTruthy();
    expect(within(dialogue).getAllByRole('spinbutton')).toHaveLength(13); // l'année et les douze mois
  });
});
