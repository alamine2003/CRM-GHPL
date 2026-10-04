import { barreLaterale, marque } from '@innov/design';
import { Box, Card, CardContent, Stack, Typography } from '@mui/material';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import ChoixLangue from './ChoixLangue';
import Logo from './Logo';
import BandeauDemonstration from './BandeauDemonstration';

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
          bgcolor: marque.bleuMarine,
          color: '#FFFFFF',
          px: { xs: 2, md: 6 },
          py: { xs: 1.5, md: 5 },
          display: 'flex',
          flexDirection: 'column',
          gap: { xs: 0, md: 5 },
        }}
      >
        <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
          <Logo taille={32} />
          <Box sx={{ flexGrow: 1 }}>
            <Typography variant="h6" component="p" sx={{ color: '#FFFFFF', lineHeight: 1.2 }}>
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
              fontSize: { md: 28, lg: 32 },
              lineHeight: 1.25,
              mb: 4,
              maxWidth: 440,
            }}
          >
            {t('marque.accroche')}
          </Typography>
          <Box component="ol" sx={{ m: 0, p: 0, listStyle: 'none', maxWidth: 400 }}>
            {ATOUTS.map((cle, i) => (
              <Box
                component="li"
                key={cle}
                sx={{
                  display: 'flex',
                  gap: 2,
                  py: 1.25,
                  borderTop: `1px solid ${barreLaterale.separateur}`,
                }}
              >
                <Typography sx={{ color: marque.orange, fontWeight: 700, minWidth: 16 }}>
                  {i + 1}
                </Typography>
                <Typography sx={{ color: barreLaterale.texte }}>
                  {t(`marque.atouts.${cle}`)}
                </Typography>
              </Box>
            ))}
          </Box>
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
        <Box sx={{ width: '100%', maxWidth: 400 }}>
          <Card>
            <CardContent
              sx={{ p: { xs: 2, sm: 3.5 }, '&:last-child': { pb: { xs: 2.5, sm: 3.5 } } }}
            >
              <Typography variant="h4" component="h1" sx={{ mb: 2.5 }}>
                {titre}
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>{children}</Box>
            </CardContent>
          </Card>
          <Box sx={{ mt: 1.5, px: 0.5 }}>
            <BandeauDemonstration />
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
