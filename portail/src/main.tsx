import { CssBaseline, ThemeProvider, useMediaQuery } from '@mui/material';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import App from './App';
import { LimiteErreur } from './composants/Erreurs';
import FournisseurNotifications from './composants/Notifications';
import './i18n';
import { FournisseurSession } from './session';
import { surveillerErreursGlobales } from './signalement';
import { creerTheme } from './theme';

const clientRequetes = new QueryClient();
surveillerErreursGlobales();

function Racine() {
  const sombre = useMediaQuery('(prefers-color-scheme: dark)');
  const theme = useMemo(() => creerTheme(sombre ? 'dark' : 'light'), [sombre]);
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <QueryClientProvider client={clientRequetes}>
        <BrowserRouter>
          <LimiteErreur>
            <FournisseurNotifications>
              <FournisseurSession>
                <App />
              </FournisseurSession>
            </FournisseurNotifications>
          </LimiteErreur>
        </BrowserRouter>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

const element = document.getElementById('racine');
if (!element) throw new Error('Élément #racine introuvable');
createRoot(element).render(
  <StrictMode>
    <Racine />
  </StrictMode>,
);
