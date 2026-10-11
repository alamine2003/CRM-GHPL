import { CssBaseline, ThemeProvider, useMediaQuery } from '@mui/material';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import App from './App';
import { LimiteErreur } from './composants/Erreurs';
import FournisseurNotifications from './composants/Notifications';
import './i18n';
import {
  ContexteApparence,
  ecrireApparence,
  lireApparence,
  type ModeApparence,
} from './preferences';
import { FournisseurSession } from './session';
import { surveillerErreursGlobales } from './signalement';
import { creerTheme } from './theme';

const clientRequetes = new QueryClient();
surveillerErreursGlobales();

function Racine() {
  const systemeSombre = useMediaQuery('(prefers-color-scheme: dark)');
  const [mode, setMode] = useState<ModeApparence>(lireApparence);
  const sombre = mode === 'systeme' ? systemeSombre : mode === 'sombre';
  const theme = useMemo(() => creerTheme(sombre ? 'dark' : 'light'), [sombre]);
  const apparence = useMemo(
    () => ({
      mode,
      sombre,
      changer(nouveau: ModeApparence) {
        ecrireApparence(nouveau);
        setMode(nouveau);
      },
    }),
    [mode, sombre],
  );
  return (
    <ContexteApparence.Provider value={apparence}>
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
    </ContexteApparence.Provider>
  );
}

const element = document.getElementById('racine');
if (!element) throw new Error('Élément #racine introuvable');
createRoot(element).render(
  <StrictMode>
    <Racine />
  </StrictMode>,
);
