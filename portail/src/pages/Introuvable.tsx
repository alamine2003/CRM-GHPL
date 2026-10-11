import { Box, Button, Card, Stack, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { Link as LienRouteur } from 'react-router';

export default function Introuvable() {
  const { t } = useTranslation();
  return (
    <Box sx={{ display: 'grid', placeItems: 'center', minHeight: '55vh' }}>
      <Card sx={{ maxWidth: 460, p: 3 }}>
        <Stack spacing={1.5} sx={{ alignItems: 'flex-start' }}>
          <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
            404
          </Typography>
          <Typography variant="h4" component="h1">
            {t('erreurs.introuvableTitre')}
          </Typography>
          <Typography sx={{ color: 'text.secondary' }}>{t('erreurs.introuvableTexte')}</Typography>
          <Button component={LienRouteur} to="/" variant="contained">
            {t('erreurs.accueil')}
          </Button>
        </Stack>
      </Card>
    </Box>
  );
}
