import { LinearProgress, Stack, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { evolution } from './formatsVentes';

/** L'évolution face à l'an passé, en toutes lettres par son signe (jamais par la couleur seule). */
export function Evolution({ valeur }: { valeur: number | null }) {
  const { i18n } = useTranslation();
  return (
    <Typography
      component="span"
      variant="body2"
      sx={{
        fontWeight: 600,
        whiteSpace: 'nowrap',
        color:
          valeur === null || valeur === 0
            ? 'text.secondary'
            : valeur > 0
              ? 'success.main'
              : 'error.main',
      }}
    >
      {evolution(valeur, i18n.language)}
    </Typography>
  );
}

/** Une part en pourcentage, avec sa barre ; « — » quand elle ne se calcule pas. */
export function Part({ valeur }: { valeur: number | null }) {
  const { i18n } = useTranslation();
  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
      <LinearProgress
        variant="determinate"
        value={Math.min(100, valeur ?? 0)}
        aria-hidden
        sx={{ flex: 1, height: 6, borderRadius: 3 }}
      />
      <Typography variant="caption" sx={{ minWidth: 40, textAlign: 'right' }}>
        {valeur === null
          ? '—'
          : `${new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 1 }).format(valeur)} %`}
      </Typography>
    </Stack>
  );
}
