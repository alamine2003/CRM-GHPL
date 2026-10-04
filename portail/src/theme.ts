import { marque, paletteClaire, paletteSombre, rayon, typographie } from '@innov/design';
import { createTheme } from '@mui/material/styles';

/** Thème MUI construit uniquement à partir des jetons de @innov/design. */
export function creerTheme(mode: 'light' | 'dark') {
  const p = mode === 'dark' ? paletteSombre : paletteClaire;
  return createTheme({
    palette: {
      mode,
      primary: { main: marque.bleuMarine, contrastText: '#FFFFFF' },
      secondary: { main: marque.orange, contrastText: '#FFFFFF' },
      success: { main: p.succes },
      warning: { main: p.attention },
      error: { main: p.erreur },
      info: { main: p.info },
      background: { default: p.fond, paper: p.surface },
      text: { primary: p.texte, secondary: p.texteSecondaire },
      divider: p.ligne,
    },
    shape: { borderRadius: rayon },
    typography: {
      fontFamily: typographie.texte,
      h1: { fontFamily: typographie.titres, fontWeight: 700 },
      h2: { fontFamily: typographie.titres, fontWeight: 700 },
      h3: { fontFamily: typographie.titres, fontWeight: 700 },
      h4: { fontFamily: typographie.titres, fontWeight: 700 },
      h5: { fontFamily: typographie.titres, fontWeight: 700 },
      h6: { fontFamily: typographie.titres, fontWeight: 700 },
      button: { textTransform: 'none', fontWeight: 600 },
    },
  });
}
