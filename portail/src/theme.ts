import { marque, ombres, paletteClaire, paletteSombre, rayon, typographie } from '@innov/design';
import { alpha, createTheme } from '@mui/material/styles';

/** Thème MUI construit uniquement à partir des jetons de @innov/design (maquette INNOV CRM). */
export function creerTheme(mode: 'light' | 'dark') {
  const p = mode === 'dark' ? paletteSombre : paletteClaire;
  const ombre = mode === 'dark' ? ombres.carteSombre : ombres.carte;
  return createTheme({
    palette: {
      mode,
      primary:
        mode === 'dark'
          ? { main: marque.bleuClair, contrastText: marque.bleuMarine3 }
          : { main: marque.bleuMarine, contrastText: '#FFFFFF' },
      secondary: { main: marque.orange, contrastText: '#FFFFFF' },
      success: { main: p.succes, light: p.succesDoux },
      warning: { main: p.attention, light: p.attentionDoux },
      error: { main: p.erreur, light: p.erreurDoux },
      info: { main: p.info, light: p.infoDoux },
      background: { default: p.fond, paper: p.surface },
      text: { primary: p.texte, secondary: p.texteSecondaire, disabled: p.texteDiscret },
      divider: p.ligne,
    },
    shape: { borderRadius: rayon },
    typography: {
      fontFamily: typographie.texte,
      fontSize: 14,
      h1: { fontFamily: typographie.titres, fontWeight: 800 },
      h2: { fontFamily: typographie.titres, fontWeight: 800 },
      h3: { fontFamily: typographie.titres, fontWeight: 700 },
      h4: { fontFamily: typographie.titres, fontWeight: 700, fontSize: '1.75rem' },
      h5: { fontFamily: typographie.titres, fontWeight: 700, fontSize: '1.4rem' },
      h6: { fontFamily: typographie.titres, fontWeight: 700, fontSize: '1rem' },
      subtitle2: { fontWeight: 600 },
      overline: { fontWeight: 600, letterSpacing: '.06em', lineHeight: 1.6 },
      button: { textTransform: 'none', fontWeight: 600 },
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          body: { fontVariantNumeric: 'tabular-nums' },
          ':focus-visible': { outline: `2px solid ${marque.orange}`, outlineOffset: 2 },
        },
      },
      MuiCard: {
        defaultProps: { elevation: 0 },
        styleOverrides: {
          root: { border: `1px solid ${p.ligne}`, boxShadow: ombre, borderRadius: rayon },
        },
      },
      MuiPaper: { styleOverrides: { root: { backgroundImage: 'none' } } },
      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: {
          root: { borderRadius: 8, paddingInline: 16 },
          sizeLarge: { paddingBlock: 11 },
          outlined: { borderColor: p.ligne },
        },
      },
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            borderRadius: 8,
            backgroundColor: p.surface2,
            '& .MuiOutlinedInput-notchedOutline': { borderColor: p.ligne },
          },
        },
      },
      MuiChip: {
        styleOverrides: {
          root: { fontWeight: 600, borderRadius: 999 },
          sizeSmall: { fontSize: 12, height: 24 },
        },
      },
      MuiAlert: { styleOverrides: { root: { borderRadius: 8, alignItems: 'center' } } },
      MuiLinearProgress: {
        styleOverrides: {
          root: { height: 8, borderRadius: 999, backgroundColor: alpha(p.ligne, 0.9) },
          bar: { borderRadius: 999 },
        },
      },
      MuiListItemButton: { styleOverrides: { root: { borderRadius: 8 } } },
      MuiTooltip: { defaultProps: { arrow: true } },
    },
  });
}
