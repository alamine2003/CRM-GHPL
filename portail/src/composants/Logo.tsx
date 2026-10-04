import { degradeLogo, typographie } from '@innov/design';
import { Box } from '@mui/material';

/** Monogramme de la marque, identique dans toutes les langues. */
const MONOGRAMME = 'IC';

/** Marque « IC » de la maquette : carré arrondi au dégradé orange. */
export default function Logo({ taille = 34 }: { taille?: number }) {
  return (
    <Box
      aria-hidden
      sx={{
        width: taille,
        height: taille,
        flex: 'none',
        borderRadius: `${Math.round(taille * 0.27)}px`,
        background: `linear-gradient(135deg, ${degradeLogo[0]}, ${degradeLogo[1]})`,
        display: 'grid',
        placeItems: 'center',
        color: '#FFFFFF',
        fontFamily: typographie.titres,
        fontWeight: 800,
        fontSize: taille * 0.4,
      }}
    >
      {MONOGRAMME}
    </Box>
  );
}
