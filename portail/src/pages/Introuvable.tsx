import TravelExploreRounded from '@mui/icons-material/TravelExploreRounded';
import { Box, Button, Card, Stack, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { Link as LienRouteur } from 'react-router';
import { PastilleIcone } from '../composants/Elements';

export default function Introuvable() {
  const { t } = useTranslation();
  return (
    <Box sx={{ display: 'grid', placeItems: 'center', minHeight: '55vh' }}>
      <Card sx={{ maxWidth: 460, p: 4, textAlign: 'center' }}>
        <Stack spacing={2} sx={{ alignItems: 'center' }}>
          <PastilleIcone icone={<TravelExploreRounded />} ton="secondary" taille={64} />
          <Typography variant="overline" sx={{ color: 'secondary.main', fontSize: 14 }}>
            404
          </Typography>
          <Typography variant="h5" component="h1">
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
