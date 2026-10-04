import { barreLaterale, marque } from '@innov/design';
import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded';
import { Box, Card, CardContent, Stack, Typography } from '@mui/material';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import ChoixLangue from './ChoixLangue';
import Logo from './Logo';

const ATOUTS = ['planifier', 'visiter', 'valider'] as const;

/** Pages publiques (connexion, récupération d'accès) : panneau de marque et formulaire. */
export default function EcranPublic({ titre, children }: { titre: string; children: ReactNode }) {
  const { t } = useTranslation();
  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', md: 'minmax(360px, 5fr) 7fr' },
        gridTemplateRows: { xs: 'auto 1fr', md: '1fr' },
        bgcolor: 'background.default',
      }}
    >
      <Box
        component="aside"
        sx={{
          bgcolor: marque.bleuMarine3,
          backgroundImage: `radial-gradient(120% 80% at 0% 0%, ${marque.bleuMarine2} 0%, ${marque.bleuMarine3} 60%)`,
          color: '#FFFFFF',
          px: { xs: 2.5, md: 6 },
          py: { xs: 2.5, md: 6 },
          display: 'flex',
          flexDirection: 'column',
          gap: { xs: 0, md: 5 },
        }}
      >
        <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
          <Logo taille={40} />
          <Box sx={{ flexGrow: 1 }}>
            <Typography variant="h6" component="p" sx={{ color: '#FFFFFF', lineHeight: 1.1 }}>
              {t('commun.produit')}
            </Typography>
            <Typography variant="caption" sx={{ color: barreLaterale.texteDiscret }}>
              {t('marque.organisation')}
            </Typography>
          </Box>
          <Box sx={{ display: { md: 'none' } }}>
            <ChoixLangue surFonce />
          </Box>
        </Stack>
        <Box sx={{ display: { xs: 'none', md: 'block' }, my: 'auto' }}>
          <Typography
            variant="h3"
            component="p"
            sx={{
              color: '#FFFFFF',
              fontSize: { md: '2.1rem', lg: '2.5rem' },
              mb: 4,
              maxWidth: 460,
            }}
          >
            {t('marque.accroche')}
          </Typography>
          <Stack spacing={2}>
            {ATOUTS.map((cle) => (
              <Stack key={cle} direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
                <CheckCircleRounded sx={{ color: marque.orange }} />
                <Typography sx={{ color: barreLaterale.texte }}>
                  {t(`marque.atouts.${cle}`)}
                </Typography>
              </Stack>
            ))}
          </Stack>
        </Box>
        <Typography
          variant="caption"
          sx={{ display: { xs: 'none', md: 'block' }, color: barreLaterale.texteDiscret }}
        >
          {t('feuilleRoute.version', { version: __INNOV_VERSION__ })}
        </Typography>
      </Box>

      <Box
        component="main"
        sx={{
          position: 'relative',
          display: 'grid',
          placeItems: { xs: 'start center', md: 'center' },
          px: 2,
          py: { xs: 3, md: 6 },
        }}
      >
        <Box
          sx={{ position: 'absolute', top: 24, right: 24, display: { xs: 'none', md: 'block' } }}
        >
          <ChoixLangue />
        </Box>
        <Card sx={{ width: '100%', maxWidth: 420 }}>
          <CardContent sx={{ p: { xs: 2.5, sm: 4 }, '&:last-child': { pb: { xs: 2.5, sm: 4 } } }}>
            <Typography variant="h5" component="h1" sx={{ mb: 2.5 }}>
              {titre}
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>{children}</Box>
          </CardContent>
        </Card>
      </Box>
    </Box>
  );
}
