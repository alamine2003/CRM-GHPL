import type { Perimetre } from '@innov/api-client';
import { MenuItem, TextField } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { useSession } from '../contexteSession';

const TOUS = '__tous__';

/**
 * Pays actif (architecture §11.4). Visible si l'utilisateur a plusieurs pays, ou pour le
 * siège, qui peut aussi revenir à la vue consolidée de tous les pays.
 */
export default function SelecteurPays({ perimetre }: { perimetre: Perimetre }) {
  const { t } = useTranslation();
  const { choisirPays } = useSession();
  const siege = perimetre.roles.some((r) => r === 'admin_siege' || r === 'direction_siege');
  if (!siege && perimetre.pays_accessibles.length < 2) return null;
  const valeur = perimetre.pays_actif?.code ?? TOUS;

  return (
    <TextField
      select
      size="small"
      value={valeur}
      onChange={(e) => void choisirPays(e.target.value === TOUS ? null : e.target.value)}
      slotProps={{
        htmlInput: { 'aria-label': t('pays.choix') },
      }}
      sx={{
        minWidth: { xs: 0, sm: 160 },
        maxWidth: { xs: 140, sm: 'none' },
        '& .MuiInputBase-root': { height: 32, fontSize: 13 },
      }}
    >
      {siege && <MenuItem value={TOUS}>{t('pays.tous')}</MenuItem>}
      {perimetre.pays_accessibles.map((pays) => (
        <MenuItem key={pays.code} value={pays.code}>
          {pays.nom}
        </MenuItem>
      ))}
    </TextField>
  );
}
