import {
  Button,
  Chip,
  Pagination,
  Stack,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import { useTranslation } from 'react-i18next';

export interface Puce {
  cle: string;
  libelle: string;
}

/** Filtres actifs, chacun retirable d'un clic ; « Tout effacer » au bout. */
export function PucesFiltres({
  puces,
  retirer,
  effacer,
}: {
  puces: Puce[];
  retirer: (cle: string) => void;
  effacer: () => void;
}) {
  const { t } = useTranslation();
  if (puces.length === 0) return null;
  return (
    <Stack direction="row" sx={{ gap: 0.75, flexWrap: 'wrap', alignItems: 'center' }}>
      {puces.map((p) => (
        <Chip
          key={p.cle}
          size="small"
          color="primary"
          variant="outlined"
          label={p.libelle}
          onDelete={() => retirer(p.cle)}
        />
      ))}
      <Button size="small" color="inherit" onClick={effacer}>
        {t('recherche.toutEffacer')}
      </Button>
    </Stack>
  );
}

/** « 21–40 sur 425 » et les numéros de page (PRP-005 CA3). */
export function BarrePagination({
  total,
  page,
  taille,
  changer,
}: {
  total: number;
  page: number;
  taille: number;
  changer: (page: number) => void;
}) {
  const { t, i18n } = useTranslation();
  // Sur petit écran, moins de numéros : la flèche « suivante » ne passe plus à la ligne.
  const etroit = !useMediaQuery(useTheme().breakpoints.up('sm'));
  const pages = Math.max(1, Math.ceil(total / taille));
  const debut = total === 0 ? 0 : (page - 1) * taille + 1;
  const fin = Math.min(total, page * taille);
  const nombre = (n: number) => n.toLocaleString(i18n.language);
  if (total === 0) return null;
  return (
    <Stack
      direction={{ xs: 'column', sm: 'row' }}
      spacing={1}
      sx={{ justifyContent: 'space-between', alignItems: 'center' }}
    >
      <Typography variant="body2" sx={{ color: 'text.secondary' }}>
        {t('recherche.plage', { debut: nombre(debut), fin: nombre(fin), total: nombre(total) })}
      </Typography>
      {pages > 1 && (
        <Pagination
          count={pages}
          page={Math.min(page, pages)}
          onChange={(_, p) => changer(p)}
          shape="rounded"
          color="primary"
          siblingCount={etroit ? 0 : 1}
          boundaryCount={1}
          size={etroit ? 'small' : 'medium'}
          getItemAriaLabel={(type, numero) =>
            type === 'page'
              ? t('recherche.page', { numero })
              : t(
                  `recherche.${type === 'next' ? 'suivante' : type === 'previous' ? 'precedente' : type === 'first' ? 'premiere' : 'derniere'}`,
                )
          }
        />
      )}
    </Stack>
  );
}
