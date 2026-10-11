import type { ChampRapport, ClientApi } from '@innov/api-client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ContexteNotifications } from '../contexteNotifications';
import { ContexteSession, type Session } from '../contexteSession';
import i18n from '../i18n';
import ChampsRapport from './ChampsRapport';

const PATIENTS: ChampRapport = {
  id: 'c1',
  code: 'patients_par_semaine',
  libelle: 'Patients par semaine',
  type: 'nombre',
  options: [],
  obligatoire: true,
  ordre: 1,
};
const notifier = vi.fn();

function rendre(rapports: Partial<ClientApi['rapports']>, modifier = true) {
  const session = {
    etat: { statut: 'chargement' },
    client: {
      rapports: { champs: vi.fn(async () => [PATIENTS]), ...rapports },
    } as unknown as ClientApi,
  } as unknown as Session;
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <ContexteSession.Provider value={session}>
        <ContexteNotifications.Provider value={notifier}>
          <ChampsRapport pays="SN" modifier={modifier} />
        </ContexteNotifications.Provider>
      </ContexteSession.Provider>
    </QueryClientProvider>,
  );
}

beforeEach(async () => {
  await i18n.changeLanguage('fr');
  notifier.mockClear();
});

describe('RPT-008 : champs du rapport par pays', () => {
  it('liste les champs du pays ; en lecture seule, sans bouton', async () => {
    rendre({}, false);
    expect(await screen.findByText('Patients par semaine')).toBeTruthy();
    expect(screen.getByText('Obligatoire')).toBeTruthy();
    expect(screen.getByText('Nombre')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Ajouter un champ' })).toBeNull();
  });

  it('une liste exige au moins deux choix, puis le champ se crée', async () => {
    const creerChamp = vi.fn(async () => PATIENTS);
    rendre({ creerChamp });
    fireEvent.click(await screen.findByRole('button', { name: 'Ajouter un champ' }));
    fireEvent.change(screen.getByLabelText('Libellé'), { target: { value: 'Échantillons' } });
    fireEvent.mouseDown(screen.getByLabelText('Type de réponse'));
    fireEvent.click(await screen.findByRole('option', { name: 'Liste de choix' }));
    fireEvent.change(screen.getByLabelText('Choix proposés'), { target: { value: 'Oui' } });
    const enregistrer = screen.getByRole('button', { name: 'Enregistrer' });
    expect(enregistrer).toHaveProperty('disabled', true);
    fireEvent.change(screen.getByLabelText('Choix proposés'), {
      target: { value: 'Remis\n\nNon remis ' },
    });
    fireEvent.click(enregistrer);
    await waitFor(() =>
      expect(creerChamp).toHaveBeenCalledWith({
        libelle: 'Échantillons',
        type: 'liste',
        options: ['Remis', 'Non remis'],
        obligatoire: false,
      }),
    );
  });

  it('retire un champ des prochains rapports', async () => {
    const archiverChamp = vi.fn(async () => PATIENTS);
    rendre({ archiverChamp });
    fireEvent.click(await screen.findByRole('button', { name: 'Retirer' }));
    await waitFor(() => expect(archiverChamp).toHaveBeenCalledWith('c1'));
    expect(notifier).toHaveBeenCalledWith(
      '« Patients par semaine » retiré des prochains rapports.',
    );
  });
});
