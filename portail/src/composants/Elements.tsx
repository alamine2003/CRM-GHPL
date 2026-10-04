import { Box, Card, Stack, Typography } from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import type { ReactNode } from 'react';

export type Ton = 'primary' | 'secondary' | 'success' | 'warning' | 'error' | 'info';

/** En-tête de carte : titre à gauche, action ou pastille à droite. */
export function EnTeteCarte({ titre, action }: { titre: string; action?: ReactNode }) {
  return (
    <Box
      sx={{
        px: 2.25,
        py: 1.75,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 1,
        borderBottom: 1,
        borderColor: 'divider',
      }}
    >
      <Typography variant="h6" component="h2">
        {titre}
      </Typography>
      {action}
    </Box>
  );
}

/** Ligne « libellé : valeur » d'une carte de détails. */
export function Ligne({ libelle, valeur }: { libelle: string; valeur: ReactNode }) {
  return (
    <Stack direction="row" spacing={2} sx={{ justifyContent: 'space-between', py: 1.1 }}>
      <Typography sx={{ color: 'text.secondary' }}>{libelle}</Typography>
      <Typography component="div" sx={{ fontWeight: 600, textAlign: 'right', minWidth: 0 }}>
        {valeur}
      </Typography>
    </Stack>
  );
}

/** Pastille d'icône colorée, fond adouci. */
export function PastilleIcone({
  icone,
  ton = 'primary',
  taille = 40,
}: {
  icone: ReactNode;
  ton?: Ton;
  taille?: number;
}) {
  const theme = useTheme();
  const couleur = theme.palette[ton].main;
  return (
    <Box
      aria-hidden
      sx={{
        width: taille,
        height: taille,
        borderRadius: 2.5,
        display: 'grid',
        placeItems: 'center',
        flex: 'none',
        color: couleur,
        bgcolor: alpha(couleur, theme.palette.mode === 'dark' ? 0.2 : 0.1),
        '& svg': { fontSize: taille * 0.55 },
      }}
    >
      {icone}
    </Box>
  );
}

/** Tuile de chiffre clé (maquette : « stat tiles »). */
export function Tuile({
  libelle,
  valeur,
  icone,
  ton = 'primary',
  detail,
}: {
  libelle: string;
  valeur: ReactNode;
  icone: ReactNode;
  ton?: Ton;
  detail?: string;
}) {
  return (
    <Card
      sx={{
        p: 2,
        display: 'flex',
        flexDirection: { xs: 'column', sm: 'row' },
        gap: { xs: 1.25, sm: 1.75 },
        alignItems: { xs: 'flex-start', sm: 'center' },
        minWidth: 0,
      }}
    >
      <PastilleIcone icone={icone} ton={ton} taille={44} />
      <Box sx={{ minWidth: 0 }}>
        <Typography
          component="p"
          sx={{ fontFamily: 'h4.fontFamily', fontWeight: 800, fontSize: 26, lineHeight: 1.1 }}
        >
          {valeur}
        </Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          {libelle}
        </Typography>
        {detail && (
          <Typography variant="caption" sx={{ color: 'text.disabled' }} component="p">
            {detail}
          </Typography>
        )}
      </Box>
    </Card>
  );
}

/** Grille de tuiles qui passe de 1 à 4 colonnes selon la largeur. */
export function GrilleTuiles({ children }: { children: ReactNode }) {
  return (
    <Box
      sx={{
        display: 'grid',
        gap: 2,
        gridTemplateColumns: { xs: '1fr 1fr', lg: 'repeat(4, minmax(0, 1fr))' },
      }}
    >
      {children}
    </Box>
  );
}

/** Titre de page, sous-titre et actions. */
export function EnTetePage({
  titre,
  sousTitre,
  actions,
}: {
  titre: string;
  sousTitre?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <Stack
      direction={{ xs: 'column', sm: 'row' }}
      spacing={1.5}
      sx={{ justifyContent: 'space-between', alignItems: { sm: 'flex-end' } }}
    >
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="h4" component="h1">
          {titre}
        </Typography>
        {sousTitre && (
          <Typography sx={{ color: 'text.secondary', mt: 0.5 }}>{sousTitre}</Typography>
        )}
      </Box>
      {actions && (
        <Stack direction="row" spacing={1}>
          {actions}
        </Stack>
      )}
    </Stack>
  );
}

/** État vide : icône, message et action éventuelle. */
export function EtatVide({
  icone,
  titre,
  texte,
  action,
}: {
  icone: ReactNode;
  titre: string;
  texte?: string;
  action?: ReactNode;
}) {
  return (
    <Stack spacing={1.25} sx={{ alignItems: 'center', textAlign: 'center', py: 5, px: 2 }}>
      <PastilleIcone icone={icone} ton="secondary" taille={56} />
      <Typography sx={{ fontWeight: 700 }}>{titre}</Typography>
      {texte && (
        <Typography variant="body2" sx={{ color: 'text.secondary', maxWidth: 420 }}>
          {texte}
        </Typography>
      )}
      {action}
    </Stack>
  );
}
