import { LANGUES } from '@innov/i18n';
import { MenuItem, TextField } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { useSession } from '../contexteSession';

/** Sélecteur de langue compact (codes FR / EN, libellé complet dans la liste). */
export default function ChoixLangue({ surFonce = false }: { surFonce?: boolean }) {
  const { t, i18n } = useTranslation();
  const { changerLangue } = useSession();
  return (
    <TextField
      select
      size="small"
      value={i18n.language}
      onChange={(e) => void changerLangue(e.target.value)}
      slotProps={{
        htmlInput: { 'aria-label': t('commun.langue') },
        select: { renderValue: (v) => String(v).toUpperCase() },
      }}
      sx={{
        minWidth: 76,
        ...(surFonce && {
          '& .MuiOutlinedInput-root': { bgcolor: 'transparent', color: '#FFFFFF' },
          '& .MuiSvgIcon-root': { color: '#FFFFFF' },
          '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,.35)' },
        }),
      }}
    >
      {LANGUES.map((code) => (
        <MenuItem key={code} value={code}>
          {t(`commun.langues.${code}`)}
        </MenuItem>
      ))}
    </TextField>
  );
}
