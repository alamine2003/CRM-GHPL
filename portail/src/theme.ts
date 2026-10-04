import {
  echelle,
  marque,
  ombreFlottante,
  paletteClaire,
  paletteSombre,
  rayon,
  rayonPuce,
  typographie,
} from '@innov/design';
import { alpha, createTheme } from '@mui/material/styles';

const px = (n: number) => `${n / 16}rem`;

/**
 * Thème MUI construit uniquement à partir des jetons de @innov/design (direction « registre »,
 * docs/design.md) : surfaces plates séparées par des filets, arrondis de 6 px, aucune ombre
 * hors des éléments flottants.
 */
export function creerTheme(mode: 'light' | 'dark') {
  const p = mode === 'dark' ? paletteSombre : paletteClaire;
  const titre = (e: { taille: number; interligne: number; graisse: number }) => ({
    fontFamily: typographie.titres,
    fontWeight: e.graisse,
    fontSize: px(e.taille),
    lineHeight: `${e.interligne}px`,
    letterSpacing: 0,
  });
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
      h1: titre(echelle.titrePage),
      h2: titre(echelle.titrePage),
      h3: titre(echelle.titrePage),
      h4: titre(echelle.titrePage),
      h5: titre(echelle.titreSection),
      h6: titre(echelle.titreSection),
      subtitle1: { fontWeight: 600, fontSize: px(14), lineHeight: '20px' },
      subtitle2: { fontWeight: 600, fontSize: px(13), lineHeight: '18px' },
      body1: { fontSize: px(14), lineHeight: '20px' },
      body2: { fontSize: px(13), lineHeight: '18px' },
      caption: { fontSize: px(echelle.libelle.taille), lineHeight: '18px' },
      // Réservé aux en-têtes de colonnes et aux groupes de navigation.
      overline: { fontWeight: 600, fontSize: px(11), letterSpacing: '.05em', lineHeight: '16px' },
      button: { textTransform: 'none', fontWeight: 600, fontSize: px(14), letterSpacing: 0 },
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
          root: { border: `1px solid ${p.ligne}`, boxShadow: 'none', borderRadius: rayon },
        },
      },
      MuiCardContent: {
        styleOverrides: { root: { padding: 16, '&:last-child': { paddingBottom: 16 } } },
      },
      MuiPaper: {
        styleOverrides: { root: { backgroundImage: 'none' } },
      },
      MuiPopover: { styleOverrides: { paper: { boxShadow: ombreFlottante } } },
      MuiMenu: {
        styleOverrides: { paper: { boxShadow: ombreFlottante, border: `1px solid ${p.ligne}` } },
      },
      MuiDialog: {
        styleOverrides: { paper: { boxShadow: ombreFlottante, borderRadius: rayon } },
      },
      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: {
          root: { borderRadius: rayon, paddingInline: 14, minHeight: 36 },
          sizeSmall: { minHeight: 30, paddingInline: 10, fontSize: px(13) },
          sizeLarge: { minHeight: 44 },
          outlined: { borderColor: p.ligne },
        },
      },
      MuiIconButton: { styleOverrides: { root: { borderRadius: rayon } } },
      MuiToggleButton: {
        styleOverrides: {
          root: { textTransform: 'none', fontWeight: 500, paddingBlock: 5, whiteSpace: 'nowrap' },
        },
      },
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            borderRadius: rayon,
            backgroundColor: p.surface,
            '& .MuiOutlinedInput-notchedOutline': { borderColor: p.ligne },
          },
        },
      },
      MuiChip: {
        styleOverrides: {
          root: { fontWeight: 500, borderRadius: rayonPuce },
          sizeSmall: { fontSize: px(12), height: 22 },
        },
      },
      MuiAlert: {
        styleOverrides: { root: { borderRadius: rayon, alignItems: 'center', paddingBlock: 2 } },
      },
      MuiLinearProgress: {
        styleOverrides: {
          root: { height: 6, borderRadius: 3, backgroundColor: alpha(p.ligne, 0.9) },
          bar: { borderRadius: 3 },
        },
      },
      MuiListItemButton: { styleOverrides: { root: { borderRadius: rayon } } },
      MuiTableCell: {
        styleOverrides: {
          root: { borderColor: p.ligne, paddingBlock: 10 },
          head: {
            fontSize: px(11),
            fontWeight: 600,
            letterSpacing: '.05em',
            textTransform: 'uppercase',
            color: p.texteSecondaire,
            paddingBlock: 8,
          },
        },
      },
      MuiTab: {
        styleOverrides: { root: { textTransform: 'none', fontWeight: 600, minHeight: 44 } },
      },
      MuiTabs: {
        styleOverrides: {
          root: { minHeight: 44 },
          indicator: { backgroundColor: marque.orange, height: 2 },
        },
      },
      MuiTooltip: { defaultProps: { arrow: true } },
    },
  });
}
