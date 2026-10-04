import { CssBaseline, ThemeProvider, useMediaQuery } from '@mui/material';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './i18n';
import { creerTheme } from './theme';

const clientRequetes = new QueryClient();

function Racine() {
  const sombre = useMediaQuery('(prefers-color-scheme: dark)');
  const theme = useMemo(() => creerTheme(sombre ? 'dark' : 'light'), [sombre]);
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <QueryClientProvider client={clientRequetes}>
        <App />
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
