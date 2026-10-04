import { marque, typographie } from '@innov/design';
import { Box } from '@mui/material';

/** Monogramme de la marque, identique dans toutes les langues. */
const MONOGRAMME = 'IC';

/** Marque « IC » : monogramme blanc sur orange plein, sans dégradé. */
export default function Logo({ taille = 28 }: { taille?: number }) {
  return (
    <Box
      aria-hidden
      sx={{
        width: taille,
        height: taille,
        flex: 'none',
        borderRadius: '6px',
        bgcolor: marque.orange,
        display: 'grid',
        placeItems: 'center',
        color: '#FFFFFF',
        fontFamily: typographie.titres,
        fontWeight: 700,
        fontSize: taille * 0.42,
        letterSpacing: '-0.02em',
      }}
    >
      {MONOGRAMME}
    </Box>
  );
}
