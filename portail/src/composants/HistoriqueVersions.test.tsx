import type { ClientApi, DetailVersion, VersionPlanning } from '@innov/api-client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ContexteSession, type Session } from '../contexteSession';
import i18n from '../i18n';
import { HistoriqueVersions } from './HistoriqueVersions';

const BASE = {
  en_retard: false,
  decide_le: null,
  par: null,
  mode: null,
  commentaire: '',
  remarques: [],
  visites: 2,
  motif: 'soumission' as const,
  mineures: 0,
};
const VERSIONS: VersionPlanning[] = [
  {
    ...BASE,
    numero: 2,
    soumis_le: '2026-10-09T15:00:00Z',
    decision: null,
    changements: { ajoutees: 1, retirees: 1, deplacees: 1, modifiees: 0 },
  },
  {
    ...BASE,
    numero: 1,
    soumis_le: '2026-10-07T09:00:00Z',
    decision: 'a_reviser',
    decide_le: '2026-10-08T10:30:00Z',
    par: 'Kossi FICTIF',
    commentaire: 'Ajoutez des visites.',
    remarques: [{ visite: 'b', commentaire: 'Hors secteur.' }],
    changements: null,
  },
];
const visite = (id: string, date: string, heure: string, nom: string) => ({
  id,
  date,
  heure,
  ordre: 1,
  debut_le: null,
  sans_gps: false,
  distance_debut_m: null,
  fin_le: null,
  fin_sans_gps: false,
  distance_fin_m: null,
  motif_ecart: null,
  commentaire_ecart: '',
  ecart_le: null,
  reportee_de: null,
  report: null,
  prospect: { id: `p-${id}`, nom },
  etablissement: { id: 'e1', nom: 'Clinique Fictive' },
  objectif: '',
  note: '',
  passage: null,
});
const DETAIL: DetailVersion = {
  ...VERSIONS[0]!,
  contenu_visites: [
    visite('a', '2026-10-15', '10:00', 'Awa FICTIF'),
    visite('c', '2026-10-16', '15:00', 'Binta FICTIVE'),
  ],
  contenu_activites: [],
  modifications: [],
  comparaison: {
    ajoutees: [visite('c', '2026-10-16', '15:00', 'Binta FICTIVE')],
    retirees: [visite('b', '2026-10-14', '11:00', 'Moussa FICTIF')],
    deplacees: [
      {
        visite: visite('a', '2026-10-15', '10:00', 'Awa FICTIF'),
        avant: { date: '2026-10-13', heure: '09:00' },
      },
    ],
    modifiees: [],
  },
};

function rendre() {
  const version = vi.fn(async () => DETAIL);
  const session = {
    etat: { statut: 'chargement' },
    client: {
      plannings: { versions: vi.fn(async () => VERSIONS), version },
    } as unknown as ClientApi,
  } as unknown as Session;
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <ContexteSession.Provider value={session}>
        <HistoriqueVersions planning="pl1" fuseau="Africa/Dakar" />
      </ContexteSession.Provider>
    </QueryClientProvider>,
  );
  return version;
}

beforeEach(async () => {
  await i18n.changeLanguage('fr');
});

describe('PLN-014 : historique et comparaison des versions', () => {
  it('CA2 : chaque version se lit, avec sa décision et ses changements', async () => {
    rendre();
    expect(await screen.findByText('2 versions')).toBeTruthy();
    expect(screen.getByText('Révision demandée')).toBeTruthy();
    expect(screen.getByText('En attente')).toBeTruthy();
    expect(screen.getByText(/1 ajoutée · 1 retirée · 1 déplacée/)).toBeTruthy();
    expect(screen.getByText(/Première version/)).toBeTruthy();
  });

  it('CA1 : la comparaison montre les visites ajoutées, retirées, déplacées', async () => {
    const version = rendre();
    fireEvent.click(await screen.findByRole('button', { name: 'Voir la version 2' }));
    const dialogue = await screen.findByRole('dialog');
    expect(version).toHaveBeenCalledWith('pl1', 2);
    expect(await within(dialogue).findByText('Depuis la version 1')).toBeTruthy();
    expect(within(dialogue).getByText('1 visite ajoutée')).toBeTruthy();
    expect(within(dialogue).getByText('ven. 16 15:00 · Binta FICTIVE')).toBeTruthy();
    expect(within(dialogue).getByText('mer. 14 11:00 · Moussa FICTIF')).toBeTruthy();
    expect(within(dialogue).getByText('Awa FICTIF : mar. 13 09:00 → jeu. 15 10:00')).toBeTruthy();
  });

  it('CA2 : la version décidée dit qui, quand et pourquoi', async () => {
    rendre();
    fireEvent.click(await screen.findByRole('button', { name: 'Voir la version 1' }));
    const dialogue = await screen.findByRole('dialog');
    expect(
      within(dialogue).getByText('Révision demandée le jeudi 8 octobre à 10:30 par Kossi FICTIF'),
    ).toBeTruthy();
    expect(within(dialogue).getByText('Ajoutez des visites.')).toBeTruthy();
    expect(within(dialogue).getByText('1 remarque sur une visite')).toBeTruthy();
  });
});
