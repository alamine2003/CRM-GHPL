import type { ClientApi, Perimetre, TauxDeLAnnee, VentesTousPays } from '@innov/api-client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ContexteSession, type Session } from '../contexteSession';
import i18n from '../i18n';
import Ventes from '../pages/Ventes';

// Vue de tous les pays du siège (1.9.0, prd.md §14.90) : montants convertis en XOF à taux
// constant ; un pays sans taux reste dans sa monnaie, hors des totaux ; l'administrateur du siège
// fixe les taux, la direction les lit.

const MOIS = Array.from({ length: 12 }, (_, i) => ({
  mois: `2025-${String(i + 1).padStart(2, '0')}`,
  montant_ttc: i < 3 ? '1000.00' : '0.00',
  quantite: i < 3 ? 10 : 0,
  precedent_montant_ttc: i === 0 ? '500.00' : '0.00',
  precedent_quantite: i === 0 ? 5 : 0,
}));

const DONNEES: VentesTousPays = {
  devise: 'XOF',
  annee: 2025,
  mois_fin: 3,
  par: 'produit',
  total: {
    montant_ttc: '10600.00',
    precedent_montant_ttc: '4000.00',
    evolution: 165,
    objectif_cible: '96000.00',
    taux_cible: 10.4,
    taux_attendu: 41.7,
  },
  devises_sans_taux: ['MGA'],
  pays: [
    {
      code: 'TG',
      nom: 'Togo',
      devise: 'GNF',
      taux: '0.070000',
      montant_ttc: '100000.00',
      precedent_montant_ttc: '50000.00',
      evolution: 100,
      montant_converti: '7000.00',
      precedent_converti: '3500.00',
      part: 66,
      objectif_cible: '1200000.00',
      objectif_cible_converti: '84000.00',
      taux_cible: 8.3,
      taux_attendu: 33.3,
    },
    {
      code: 'SN',
      nom: 'Sénégal',
      devise: 'XOF',
      taux: '1.000000',
      montant_ttc: '3600.00',
      precedent_montant_ttc: '500.00',
      evolution: 620,
      montant_converti: '3600.00',
      precedent_converti: '500.00',
      part: 34,
      objectif_cible: null,
      objectif_cible_converti: null,
      taux_cible: null,
      taux_attendu: null,
    },
    {
      code: 'MG',
      nom: 'Madagascar',
      devise: 'MGA',
      taux: null,
      montant_ttc: '500000.00',
      precedent_montant_ttc: '0.00',
      evolution: null,
      montant_converti: null,
      precedent_converti: null,
      part: null,
      objectif_cible: null,
      objectif_cible_converti: null,
      taux_cible: null,
      taux_attendu: null,
    },
  ],
  mensuel: MOIS,
  classement: Array.from({ length: 12 }, (_, i) => ({
    libelle: `Produit ${i + 1}`,
    montant_ttc: String(1000 - i * 10),
    quantite: 10,
    part: 9,
    precedent_montant_ttc: '0.00',
    evolution: null,
    pays: 2,
  })),
};

const TAUX: TauxDeLAnnee = {
  annee: 2025,
  devise_reference: 'XOF',
  devises: [
    { devise: 'GNF', pays: ['Togo'], taux: '0.070000', modifie_le: '2025-03-01T10:00:00Z' },
    { devise: 'MGA', pays: ['Madagascar'], taux: null, modifie_le: null },
  ],
};

function perimetre(roles: string[], actions: string[]): Perimetre {
  return {
    pays_actif: null,
    vue_consolidee: true,
    roles,
    actions: ['ventes.lire', 'ventes.tous_pays', ...actions],
    pays_accessibles: [],
  };
}

function rendre(p: Perimetre) {
  const tousPays = vi.fn(async () => DONNEES);
  const reglerTaux = vi.fn(async () => TAUX);
  const exporterTousPays = vi.fn(async () => new Blob(['x']));
  const session = {
    etat: { statut: 'chargement' },
    client: {
      ventes: { tousPays, taux: vi.fn(async () => TAUX), reglerTaux, exporterTousPays },
    } as unknown as ClientApi,
  } as unknown as Session;
  render(
    <MemoryRouter initialEntries={['/ventes']}>
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <ContexteSession.Provider value={session}>
          <Ventes perimetre={p} />
        </ContexteSession.Provider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
  return { tousPays, reglerTaux, exporterTousPays };
}

describe('Ventes de tous les pays', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr');
  });

  it('additionne les pays convertis et signale celui qui n’a pas de taux', async () => {
    rendre(perimetre(['direction_siege'], []));
    expect(await screen.findByText(/Tous les pays, en francs CFA de l'Ouest/)).toBeTruthy();
    expect(await screen.findByText(/\+165 % face à 2024/)).toBeTruthy();
    expect(screen.getByText(/Pas de taux 2025 pour MGA/)).toBeTruthy();
    const tableau = screen.getByRole('table', { name: 'Par pays' });
    const togo = within(tableau).getByText('Togo').closest('tr')!;
    expect(within(togo).getByText(/1 GNF = 0,07 XOF/)).toBeTruthy();
    const madagascar = within(tableau).getByText('Madagascar').closest('tr')!;
    expect(within(madagascar).getByText('MGA, sans taux')).toBeTruthy();
    // La direction lit les taux sans les fixer.
    expect(screen.queryByRole('button', { name: 'Fixer les taux' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Taux de change' }));
    const dialogue = await screen.findByRole('dialog');
    expect(within(dialogue).getByText(/L'administrateur du siège les fixe/)).toBeTruthy();
    expect(within(dialogue).queryByRole('button', { name: 'Enregistrer' })).toBeNull();
  });

  it('l’administrateur du siège fixe le taux manquant', async () => {
    const { reglerTaux } = rendre(perimetre(['admin_siege'], ['ventes.taux_gerer']));
    fireEvent.click(await screen.findByRole('button', { name: 'Fixer les taux' }));
    const dialogue = await screen.findByRole('dialog');
    const champ = await within(dialogue).findByLabelText('1 MGA en XOF');
    fireEvent.change(champ, { target: { value: '0,13' } });
    fireEvent.click(within(dialogue).getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() =>
      expect(reglerTaux).toHaveBeenCalledWith({
        annee: 2025,
        taux: [{ devise: 'MGA', taux: '0,13' }],
      }),
    );
  });

  it('classe par réseau et n’affiche d’abord que les dix premiers', async () => {
    const { tousPays } = rendre(perimetre(['direction_siege'], []));
    const classement = await screen.findByRole('table', { name: 'Classement, tous pays' });
    expect(within(classement).getAllByRole('row')).toHaveLength(11);
    fireEvent.click(screen.getByRole('button', { name: 'Tout afficher (12)' }));
    expect(within(classement).getAllByRole('row')).toHaveLength(13);
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Classer par' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Réseau' }));
    await waitFor(() =>
      expect(tousPays).toHaveBeenLastCalledWith(expect.objectContaining({ par: 'reseau' })),
    );
  });

  it('exporte le tableau par pays', async () => {
    const urls = { createObjectURL: vi.fn(() => 'blob:x'), revokeObjectURL: vi.fn() };
    Object.assign(URL, urls);
    const { exporterTousPays } = rendre(perimetre(['direction_siege'], []));
    fireEvent.click(await screen.findByRole('button', { name: 'Exporter' }));
    const menu = await screen.findByRole('menu');
    fireEvent.click(within(menu).getAllByText('Ventes par pays')[0]!);
    await waitFor(() =>
      expect(exporterTousPays).toHaveBeenCalledWith(
        expect.objectContaining({ contenu: 'pays', fichier: 'xlsx', annee: 2025, mois_fin: 3 }),
      ),
    );
  });

  it('sans le droit, le siège est invité à choisir un pays', async () => {
    rendre({ ...perimetre(['direction_siege'], []), actions: ['ventes.lire'] });
    expect(await screen.findByText(/Choisissez d'abord un pays/)).toBeTruthy();
  });
});
