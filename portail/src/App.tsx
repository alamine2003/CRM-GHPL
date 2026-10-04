import { LANGUES, type Langue } from '@innov/i18n';
import {
  AppBar,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Container,
  MenuItem,
  Stack,
  TextField,
  Toolbar,
  Typography,
} from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { lireInformations } from './api';

const VERSION_CLIENT = __INNOV_VERSION__;

function Ligne({ libelle, valeur }: { libelle: string; valeur: string }) {
  return (
    <Stack direction="row" spacing={2} sx={{ justifyContent: 'space-between' }}>
      <Typography sx={{ color: 'text.secondary' }}>{libelle}</Typography>
      <Typography sx={{ fontWeight: 600 }}>{valeur}</Typography>
    </Stack>
  );
}

export default function App() {
  const { t, i18n } = useTranslation();
  const langue = i18n.language as Langue;
  const informations = useQuery({
    queryKey: ['informations', langue],
    queryFn: () => lireInformations(langue),
    retry: false,
  });

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <AppBar position="static" color="primary" elevation={0}>
        <Toolbar sx={{ gap: 2 }}>
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
            }}
          >
            IC
          </Box>
          <Box sx={{ flexGrow: 1 }}>
            <Typography variant="h6" component="p" sx={{ lineHeight: 1.1 }}>
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
            label={t('commun.langue')}
            value={langue}
            onChange={(e) => void i18n.changeLanguage(e.target.value)}
            sx={{
              minWidth: 130,
              '& .MuiInputBase-root, & .MuiInputLabel-root, & .MuiSvgIcon-root': {
                color: 'inherit',
              },
              '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,.4)' },
            }}
          >
            {LANGUES.map((code) => (
              <MenuItem key={code} value={code}>
                {t(`commun.langues.${code}`)}
              </MenuItem>
            ))}
          </TextField>
        </Toolbar>
      </AppBar>

      <Container maxWidth="sm" sx={{ py: { xs: 3, sm: 6 } }}>
        <Typography variant="h4" component="h1" gutterBottom>
          {t('accueil.titre')}
        </Typography>
        <Typography sx={{ color: 'text.secondary', mb: 3 }}>{t('accueil.introduction')}</Typography>

        <Card variant="outlined">
          <CardContent>
            <Stack spacing={1.5}>
              <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="h6" component="h2">
                  {t('accueil.etatServeur')}
                </Typography>
                {informations.isPending ? (
                  <Chip label={t('accueil.verification')} />
                ) : informations.isSuccess ? (
                  <Chip color="success" label={t('accueil.serveurDisponible')} />
                ) : (
                  <Chip color="error" label={t('accueil.serveurIndisponible')} />
                )}
              </Stack>
              {informations.isSuccess && (
                <Typography data-testid="message-serveur">{informations.data.message}</Typography>
              )}
              <Ligne libelle={t('accueil.versionClient')} valeur={VERSION_CLIENT} />
              {informations.isSuccess && (
                <>
                  <Ligne libelle={t('accueil.versionServeur')} valeur={informations.data.version} />
                  <Ligne
                    libelle={t('accueil.environnement')}
                    valeur={informations.data.environnement}
                  />
                </>
              )}
              {informations.isError && (
                <Button variant="outlined" onClick={() => void informations.refetch()}>
                  {t('accueil.reessayer')}
                </Button>
              )}
            </Stack>
          </CardContent>
        </Card>
      </Container>
    </Box>
  );
}
