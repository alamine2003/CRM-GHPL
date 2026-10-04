import DarkModeRounded from '@mui/icons-material/DarkModeRounded';
import LightModeRounded from '@mui/icons-material/LightModeRounded';
import { IconButton, ToggleButton, ToggleButtonGroup, Tooltip } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { type ModeApparence, useApparence } from '../preferences';

const MODES: ModeApparence[] = ['clair', 'sombre', 'systeme'];

/** Choix complet (Mon profil) : clair, sombre ou réglage du système. */
export function ChoixApparence() {
  const { t } = useTranslation();
  const { mode, changer } = useApparence();
  return (
    <ToggleButtonGroup
      exclusive
      size="small"
      value={mode}
      onChange={(_, valeur: ModeApparence | null) => valeur && changer(valeur)}
      aria-label={t('apparence.titre')}
    >
      {MODES.map((m) => (
        <ToggleButton key={m} value={m} sx={{ px: 1.5 }}>
          {t(`apparence.${m}`)}
        </ToggleButton>
      ))}
    </ToggleButtonGroup>
  );
}

/** Bascule rapide de la barre supérieure : passe du clair au sombre et inversement. */
export function BasculeApparence() {
  const { t } = useTranslation();
  const { sombre, changer } = useApparence();
  return (
    <Tooltip title={t('apparence.basculer')}>
      <IconButton
        aria-label={t('apparence.basculer')}
        onClick={() => changer(sombre ? 'clair' : 'sombre')}
        size="small"
      >
        {sombre ? <LightModeRounded fontSize="small" /> : <DarkModeRounded fontSize="small" />}
      </IconButton>
    </Tooltip>
  );
}
