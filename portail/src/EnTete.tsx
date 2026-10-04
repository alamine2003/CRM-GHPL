import { LANGUES } from '@innov/i18n';
import Logout from '@mui/icons-material/Logout';
import {
  AppBar,
  Box,
  Button,
  IconButton,
  MenuItem,
  TextField,
  Toolbar,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import { useTranslation } from 'react-i18next';
import { useSession } from './contexteSession';

export default function EnTete() {
  const { t, i18n } = useTranslation();
  const { etat, deconnexion } = useSession();
  const etroit = useMediaQuery(useTheme().breakpoints.down('sm'));

  return (
    <AppBar position="static" color="primary" elevation={0}>
      <Toolbar sx={{ gap: { xs: 1, sm: 2 } }}>
        <Box
          aria-hidden
          sx={{
            width: 34,
            height: 34,
            borderRadius: 2,
            bgcolor: 'secondary.main',
            display: 'grid',
            placeItems: 'center',
            fontWeight: 800,
            flex: 'none',
          }}
        >
          IC
        </Box>
        <Box sx={{ flexGrow: 1, minWidth: 0 }}>
          <Typography variant="h6" component="p" noWrap sx={{ lineHeight: 1.1 }}>
            {t('commun.produit')}
          </Typography>
          <Typography
            variant="caption"
            sx={{ opacity: 0.75, display: { xs: 'none', sm: 'block' } }}
          >
            {t('commun.sousTitre')}
          </Typography>
        </Box>
        <TextField
          select
          size="small"
          label={etroit ? undefined : t('commun.langue')}
          slotProps={{ htmlInput: { 'aria-label': t('commun.langue') } }}
          value={i18n.language}
          onChange={(e) => void i18n.changeLanguage(e.target.value)}
          sx={{
            minWidth: { xs: 0, sm: 120 },
            '& .MuiInputBase-root, & .MuiInputLabel-root, & .MuiSvgIcon-root': {
              color: 'inherit',
            },
            '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,.4)' },
          }}
        >
          {LANGUES.map((code) => (
            <MenuItem key={code} value={code}>
              {etroit ? code.toUpperCase() : t(`commun.langues.${code}`)}
            </MenuItem>
          ))}
        </TextField>
        {etat.statut === 'connecte' &&
          (etroit ? (
            <IconButton
              color="inherit"
              aria-label={t('session.deconnexion')}
              onClick={() => void deconnexion()}
            >
              <Logout />
            </IconButton>
          ) : (
            <Button color="inherit" variant="outlined" onClick={() => void deconnexion()}>
              {t('session.deconnexion')}
            </Button>
          ))}
      </Toolbar>
    </AppBar>
  );
}
