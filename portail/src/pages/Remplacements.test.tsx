import type { CandidatsRemplacement, ClientApi, Remplacement } from '@innov/api-client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import axe from 'axe-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ContexteNotifications } from '../contexteNotifications';
import { ContexteSession, type Session } from '../contexteSession';
import i18n from '../i18n';
import Remplacements from './Remplacements';

const MOI = { id: 'u1', identifiant: 'kossi.fictif', prenom: 'Kossi', nom: 'FICTIF' };
const OUSMANE = { id: 'u2', identifiant: 'ousmane.fictif', prenom: 'Ousmane', nom: 'FICTIF' };

const EN_COURS: Remplacement = {
  id: 'r1',
  superviseur: MOI,
  remplacant: OUSMANE,
  debut: '2026-10-12',
  fin: '2026-10-23',
  designe_par: MOI,
  etat: 'en_cours',
  terminable: true,
};

const CANDIDATS: CandidatsRemplacement = { superviseurs: [MOI], remplacants: [MOI, OUSMANE] };
const notifier = vi.fn();

function rendre(remplacements: Partial<ClientApi['remplacements']>) {
  const session = {
    etat: { statut: 'chargement' },
    client: {
      remplacements: {
        liste: vi.fn(async () => [EN_COURS]),
        candidats: vi.fn(async () => CANDIDATS),
        ...remplacements,
      },
    } as unknown as ClientApi,
  } as unknown as Session;
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <ContexteSession.Provider value={session}>
        <ContexteNotifications.Provider value={notifier}>
          <Remplacements />
        </ContexteNotifications.Provider>
      </ContexteSession.Provider>
    </QueryClientProvider>,
  );
}

beforeEach(async () => {
  await i18n.changeLanguage('fr');
  notifier.mockClear();
});

describe('ORG-013 : remplaçant daté', () => {
  it('liste les remplacements et permet d’y mettre fin', async () => {
    const terminer = vi.fn(async () => ({ ...EN_COURS, etat: 'termine' as const }));
    const { container } = rendre({ terminer });
    expect(await screen.findByRole('heading', { name: 'Ousmane FICTIF' })).toBeTruthy();
    expect(screen.getByText('En cours')).toBeTruthy();
    expect(
      screen.getByText(/Pour Kossi FICTIF · Du lun\. 12 octobre au ven\. 23 octobre/),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Terminer' }));
    await waitFor(() => expect(terminer).toHaveBeenCalledWith('r1'));
    await waitFor(() => expect(notifier).toHaveBeenCalledWith('Remplacement terminé.'));
    const resultat = await axe.run(container, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
      rules: { 'color-contrast': { enabled: false } },
    });
    expect(resultat.violations.map((v) => v.id)).toEqual([]);
  });

  it('le superviseur désigne son remplaçant : il est le remplacé, sans avoir à le choisir', async () => {
    const designer = vi.fn(async () => EN_COURS);
    rendre({ liste: vi.fn(async () => []), designer });
    expect(await screen.findByText('Aucun remplacement en cours ou à venir.')).toBeTruthy();
    expect(screen.queryByLabelText('Superviseur remplacé')).toBeNull();
    fireEvent.mouseDown(screen.getByLabelText('Remplaçant'));
    const options = within(await screen.findByRole('listbox')).getAllByRole('option');
    // Il ne se propose pas lui-même.
    expect(options.map((o) => o.textContent)).toEqual(['Ousmane FICTIF']);
    fireEvent.click(options[0]!);
    fireEvent.change(screen.getByLabelText('Du'), { target: { value: '2026-10-12' } });
    fireEvent.change(screen.getByLabelText('Au (inclus)'), { target: { value: '2026-10-23' } });
    fireEvent.click(screen.getByRole('button', { name: 'Désigner un remplaçant' }));
    await waitFor(() =>
      expect(designer).toHaveBeenCalledWith({
        superviseur: 'u1',
        remplacant: 'u2',
        debut: '2026-10-12',
        fin: '2026-10-23',
      }),
    );
    await waitFor(() =>
      expect(notifier).toHaveBeenCalledWith(
        'Ousmane FICTIF remplacera Kossi FICTIF du 12 octobre au 23 octobre.',
      ),
    );
  });
});
