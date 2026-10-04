import { marque } from '@innov/design';
import { Box, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { useDemonstration } from './demonstration';

/** Masqué à l'écran, lu par les lecteurs d'écran. */
const masque = {
  position: 'absolute',
  // En pixels : dans `sx`, la valeur 1 vaut 100 % et ferait déborder la page.
  width: '1px',
  height: '1px',
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
} as const;

/** Filet orange de 3 px en haut de l'écran : visible sur toute capture, sans occuper la page. */
export function FiletDemonstration() {
  return (
    <Box
      aria-hidden
      sx={{ position: 'fixed', top: 0, left: 0, right: 0, height: 3, zIndex: 1300, bgcolor: marque.orange }}
    />
  );
}

/**
 * Mention « Démonstration » de la barre du haut : discrète mais permanente. La phrase
 * d'explication s'affiche sur grand écran et reste lue par les lecteurs d'écran ailleurs.
 */
export function MentionDemonstration() {
  const { t } = useTranslation();
  return (
    <Typography
      role="note"
      variant="caption"
      noWrap
      sx={{ color: 'secondary.main', fontWeight: 600, minWidth: 0 }}
    >
      {t('demonstration.bandeau')}
      <Box
        component="span"
        sx={{ display: { xs: 'none', lg: 'inline' }, color: 'text.secondary', fontWeight: 400 }}
      >
        {' · '}
        {t('demonstration.texte')}
      </Box>
      <Box component="span" sx={{ ...masque, display: { lg: 'none' } }}>
        {t('demonstration.texte')}
      </Box>
    </Typography>
  );
}

/** Pages publiques : filet en haut d'écran et mention sous le formulaire. */
export default function BandeauDemonstration() {
  const { t } = useTranslation();
  if (!useDemonstration()) return null;
  return (
    <>
      <FiletDemonstration />
      <Typography role="note" variant="caption" component="p" sx={{ color: 'text.secondary' }}>
        <Box component="span" sx={{ color: 'secondary.main', fontWeight: 600 }}>
          {t('demonstration.bandeau')}
        </Box>
        {' · '}
        {t('demonstration.texte')}
      </Typography>
    </>
  );
}
