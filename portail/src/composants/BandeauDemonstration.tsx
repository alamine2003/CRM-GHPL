import ScienceRounded from '@mui/icons-material/ScienceRounded';
import { Box, Typography } from '@mui/material';
import { marque } from '@innov/design';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useSession } from '../contexteSession';

/**
 * Bandeau des instances de démonstration (DEM-001, RSK-11) : personne ne confond
 * des données fictives avec la production, ni sur une capture d'écran.
 */
export default function BandeauDemonstration() {
  const { t, i18n } = useTranslation();
  const { client } = useSession();
  const informations = useQuery({
    queryKey: ['informations', i18n.language],
    queryFn: () => client.informations(),
    staleTime: 5 * 60 * 1000,
  });
  if (informations.data?.environnement !== 'demonstration') return null;
  return (
    <Box
      role="note"
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 1,
        px: 2,
        py: 0.75,
        bgcolor: marque.orange,
        // Texte bleu marine sur orange : contraste suffisant (WCAG AA).
        color: marque.bleuMarine3,
        backgroundImage:
          'repeating-linear-gradient(135deg, rgba(255,255,255,0.12) 0 12px, transparent 12px 24px)',
      }}
    >
      <ScienceRounded fontSize="small" />
      <Typography variant="body2" sx={{ fontWeight: 700 }}>
        {t('demonstration.bandeau')}
      </Typography>
      <Typography variant="body2" sx={{ display: { xs: 'none', sm: 'block' } }}>
        {t('demonstration.texte')}
      </Typography>
    </Box>
  );
}
