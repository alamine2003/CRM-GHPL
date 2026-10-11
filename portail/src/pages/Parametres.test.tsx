import type { ClientApi, Parametre, Perimetre } from '@innov/api-client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ContexteSession, type Session } from '../contexteSession';
import i18n from '../i18n';
import Parametres from './Parametres';

// DC-59 : le délai de verrouillage du téléphone se règle par pays (5 à 30 minutes, 15 par défaut).

const VERROUILLAGE: Parametre = {
  cle: 'verrouillage_minutes',
  description: 'Délai après lequel le téléphone se verrouille en arrière-plan.',
  valeur: 15,
  defaut: 15,
  personnalise: false,
  hypothese: false,
};

// 0.9.8 : le délai hors ligne du téléphone (OFF-007, DC-54), dans la même carte.
const HORS_LIGNE: Parametre = {
  cle: 'delai_hors_ligne_jours',
  description: 'Au-delà, le téléphone masque ses données jusqu’à la prochaine synchronisation.',
  valeur: 7,
  defaut: 7,
  personnalise: false,
  hypothese: false,
};

function rendre(actions: string[]) {
  const modifierParametre = vi.fn(async () => ({ ...VERROUILLAGE, valeur: 20 }));
  const session = {
    etat: { statut: 'chargement' },
    client: {
      pays: { parametres: vi.fn(async () => [VERROUILLAGE, HORS_LIGNE]), modifierParametre },
      rapports: { champs: vi.fn(async () => []) },
    } as unknown as ClientApi,
  } as unknown as Session;
  const perimetre = {
    pays_actif: { code: 'SN', nom: 'Sénégal' },
    actions,
    roles: ['admin_pays'],
  } as unknown as Perimetre;
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <ContexteSession.Provider value={session}>
        <Parametres perimetre={perimetre} />
      </ContexteSession.Provider>
    </QueryClientProvider>,
  );
  return { modifierParametre };
}

beforeEach(async () => {
  await i18n.changeLanguage('fr');
});

describe('DC-59 : carte « Téléphone » des paramètres du pays', () => {
  it('DC-59 : la carte « Téléphone » affiche le délai de verrouillage', async () => {
    rendre([]);
    const titre = await screen.findByText('Téléphone');
    const carte = titre.closest('.MuiCard-root') as HTMLElement;
    expect(within(carte).getByText('Verrouillage du téléphone (minutes)')).toBeInTheDocument();
    expect(within(carte).getByText('15 minutes')).toBeInTheDocument();
    expect(within(carte).getByText('Masquage des données hors ligne (jours)')).toBeInTheDocument();
    expect(within(carte).getByText('7 jours')).toBeInTheDocument();
    // Sans le droit de modifier, rien ne se règle.
    expect(within(carte).queryByRole('button', { name: 'Modifier' })).toBeNull();
  });

  it('DC-59 : le délai de verrouillage se règle et s’enregistre pour le pays', async () => {
    const { modifierParametre } = rendre(['parametres.modifier']);
    const titre = await screen.findByText('Téléphone');
    const carte = titre.closest('.MuiCard-root') as HTMLElement;
    // Le premier « Modifier » de la carte : le délai de verrouillage.
    const [modifier] = within(carte).getAllByRole('button', { name: 'Modifier' });
    fireEvent.click(modifier as HTMLElement);
    const champ = await screen.findByLabelText('Valeur');
    expect(champ).toHaveValue(15);
    fireEvent.change(champ, { target: { value: '20' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() =>
      expect(modifierParametre).toHaveBeenCalledWith('SN', 'verrouillage_minutes', 20),
    );
  });
});
