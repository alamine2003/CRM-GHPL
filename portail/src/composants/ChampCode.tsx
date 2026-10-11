import { TextField } from '@mui/material';
import { useTranslation } from 'react-i18next';

/** Code à usage unique : 6 chiffres, grands et espacés ; ou code de secours (texte). */
export default function ChampCode({
  valeur,
  changer,
  secours = false,
  autoFocus = true,
}: {
  valeur: string;
  changer: (v: string) => void;
  secours?: boolean;
  autoFocus?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <TextField
      label={secours ? t('code.champSecours') : t('code.champ')}
      value={valeur}
      onChange={(e) =>
        changer(
          secours
            ? e.target.value.trim().slice(0, 20)
            : e.target.value.replace(/\D/g, '').slice(0, 6),
        )
      }
      autoFocus={autoFocus}
      autoComplete="one-time-code"
      required
      slotProps={{
        htmlInput: {
          inputMode: secours ? 'text' : 'numeric',
          'aria-label': secours ? t('code.champSecours') : t('code.champ'),
          style: secours
            ? { fontFamily: 'monospace', fontSize: 20, letterSpacing: '0.1em', textAlign: 'center' }
            : {
                fontFamily: 'monospace',
                fontSize: 30,
                letterSpacing: '0.5em',
                textAlign: 'center',
                paddingLeft: '0.5em',
              },
        },
      }}
    />
  );
}
