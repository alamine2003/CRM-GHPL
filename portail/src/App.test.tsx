import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import i18n from './i18n';

function rendre() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <App />
    </QueryClientProvider>,
  );
}

function reponseInformations(langue: string) {
  return {
    produit: 'INNOV CRM',
    version: '0.0.1',
    environnement: 'test',
    langue,
    message: langue === 'en' ? 'Welcome to INNOV CRM.' : 'Bienvenue dans INNOV CRM.',
    langues: [],
  };
}

describe('premier écran', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr');
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        const langue = (init.headers as Record<string, string>)['Accept-Language'] ?? 'fr';
        return new Response(JSON.stringify(reponseInformations(langue)), { status: 200 });
      }),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it('affiche la version de l’application et l’état du service en français', async () => {
    rendre();
    expect(screen.getByRole('heading', { name: 'Bienvenue' })).toBeInTheDocument();
    expect(screen.getByText(__INNOV_VERSION__)).toBeInTheDocument();
    expect(await screen.findByText('Service disponible')).toBeInTheDocument();
    expect(screen.getByTestId('message-serveur')).toHaveTextContent('Bienvenue dans INNOV CRM.');
  });

  it('bascule en anglais, y compris le message du service', async () => {
    rendre();
    await screen.findByText('Service disponible');
    await act(() => i18n.changeLanguage('en'));
    expect(screen.getByRole('heading', { name: 'Welcome' })).toBeInTheDocument();
    expect(await screen.findByText('Welcome to INNOV CRM.')).toBeInTheDocument();
  });

  it('signale un service injoignable et propose de réessayer', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 503 })),
    );
    rendre();
    expect(await screen.findByText('Service injoignable')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(within(document.body).getByText('Service injoignable')).toBeInTheDocument();
  });
});
