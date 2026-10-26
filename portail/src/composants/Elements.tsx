import { Box, Card, Stack, Typography } from '@mui/material';
import type { ReactNode } from 'react';

/**
 * Composants de mise en page du portail (docs/design.md) : surfaces plates séparées par des
 * filets, titres sans icône, chiffres sans décoration.
 */

export type Ton = 'neutre' | 'secondary' | 'warning' | 'error' | 'success';

/** En-tête de section : titre à gauche, action éventuelle à droite, filet dessous. */
export function EnTeteCarte({ titre, action }: { titre: string; action?: ReactNode }) {
  return (
    <Box
      sx={{
        px: 2,
        minHeight: 48,
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

/** Ligne « libellé : valeur » d'une section de détails. */
export function Ligne({ libelle, valeur }: { libelle: string; valeur: ReactNode }) {
  return (
    <Stack
      direction="row"
      spacing={2}
      sx={{ justifyContent: 'space-between', alignItems: 'baseline', py: 1, minWidth: 0 }}
    >
      <Typography variant="body2" sx={{ color: 'text.secondary', flex: 'none' }}>
        {libelle}
      </Typography>
      <Typography
        component="div"
        sx={{ fontWeight: 500, textAlign: 'right', minWidth: 0, overflowWrap: 'anywhere' }}
      >
        {valeur}
      </Typography>
    </Stack>
  );
}

const COULEUR_TON: Record<Ton, string> = {
  neutre: 'text.primary',
  secondary: 'secondary.main',
  warning: 'warning.main',
  error: 'error.main',
  success: 'success.main',
};

/**
 * Chiffre clé d'une barre de chiffres. Le ton colore le seul chiffre, et seulement quand il
 * appelle une action (`alerte`) : un zéro reste neutre.
 */
export function Chiffre({
  libelle,
  valeur,
  ton = 'neutre',
  detail,
}: {
  libelle: string;
  valeur: ReactNode;
  ton?: Ton;
  detail?: string;
}) {
  const nul = valeur === 0 || valeur === '0';
  return (
    <Box sx={{ px: 2, py: 1.5, minWidth: 0 }}>
      <Typography
        component="p"
        sx={{
          fontFamily: 'h4.fontFamily',
          fontWeight: 700,
          fontSize: 20,
          lineHeight: '24px',
          color: nul ? 'text.primary' : COULEUR_TON[ton],
        }}
      >
        {valeur}
      </Typography>
      <Typography variant="caption" component="p" sx={{ color: 'text.secondary' }}>
        {libelle}
        {detail && (
          <>
            <Box component="span" sx={{ display: { xs: 'none', md: 'inline' } }}>
              {' · '}
            </Box>
            <Box
              component="span"
              sx={{ color: 'text.disabled', display: { xs: 'none', md: 'inline' } }}
            >
              {detail}
            </Box>
          </>
        )}
      </Typography>
    </Box>
  );
}

/** Barre de chiffres : une seule surface, cellules séparées par des filets. */
export function BarreChiffres({ children }: { children: ReactNode }) {
  return (
    <Card
      component="section"
      sx={{
        display: 'grid',
        // Une seule rangée ; sur téléphone elle défile latéralement plutôt que d'occuper
        // tout le premier écran.
        overflowX: 'auto',
        overflowY: 'hidden',
        gridAutoFlow: 'column',
        gridAutoColumns: { xs: 'minmax(128px, 1fr)', md: 'minmax(0, 1fr)' },
        // Filets internes : chaque cellule porte un filet gauche et haut, masqués au bord.
        '& > *': { borderLeft: 1, borderTop: 1, borderColor: 'divider', ml: '-1px', mt: '-1px' },
      }}
    >
      {children}
    </Card>
  );
}

/** Les chiffres clés : une rangée sur grand écran, deux par deux sur téléphone. */
export function ChiffresCles({ telephone, children }: { telephone: boolean; children: ReactNode }) {
  if (!telephone) return <BarreChiffres>{children}</BarreChiffres>;
  return (
    <Card
      sx={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        '& > *': { borderLeft: 1, borderTop: 1, borderColor: 'divider', ml: '-1px', mt: '-1px' },
      }}
    >
      {children}
    </Card>
  );
}

/** Le filtre « client » : une recherche, car un pays compte des milliers de clients. */
/** Titre de page et actions sur une ligne ; contexte (pays, nombre) en texte discret. */
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
      direction="row"
      sx={{
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        columnGap: 2,
        rowGap: 1,
        minHeight: 36,
      }}
    >
      <Stack
        direction="row"
        sx={{ alignItems: 'baseline', columnGap: 1.5, flexWrap: 'wrap', minWidth: 0 }}
      >
        <Typography variant="h4" component="h1">
          {titre}
        </Typography>
        {sousTitre && (
          <Typography
            variant="body2"
            component="p"
            // Sur téléphone, le titre et l'action principale passent avant le contexte.
            sx={{
              color: 'text.secondary',
              display: { xs: actions ? 'none' : 'block', sm: 'block' },
            }}
          >
            {sousTitre}
          </Typography>
        )}
      </Stack>
      {actions && (
        <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', rowGap: 1 }}>
          {actions}
        </Stack>
      )}
    </Stack>
  );
}

/** État vide : une phrase, une précision et, si utile, une action. */
export function EtatVide({
  titre,
  texte,
  action,
}: {
  titre: string;
  texte?: string;
  action?: ReactNode;
}) {
  return (
    <Stack spacing={0.75} sx={{ alignItems: 'center', textAlign: 'center', py: 4, px: 2 }}>
      <Typography sx={{ fontWeight: 600 }}>{titre}</Typography>
      {texte && (
        <Typography variant="body2" sx={{ color: 'text.secondary', maxWidth: 420 }}>
          {texte}
        </Typography>
      )}
      {action && <Box sx={{ pt: 1 }}>{action}</Box>}
    </Stack>
  );
}

const COULEUR_POTENTIEL: Record<string, string> = {
  A: 'secondary.main',
  B: 'primary.main',
  C: 'text.secondary',
};

/** Potentiel A/B/C : la seule « couleur métier » des listes (A orange, B marine, C gris). */
export function Potentiel({ valeur, libelle }: { valeur: string; libelle?: string }) {
  return (
    <Box
      component="span"
      aria-label={libelle}
      title={libelle}
      sx={{
        display: 'inline-block',
        minWidth: 20,
        textAlign: 'center',
        fontFamily: 'h4.fontFamily',
        fontWeight: 700,
        fontSize: 13,
        lineHeight: '20px',
        borderRadius: '4px',
        border: 1,
        borderColor: 'currentColor',
        color: COULEUR_POTENTIEL[valeur] ?? 'text.secondary',
      }}
    >
      {valeur}
    </Box>
  );
}

/** Section d'un panneau de détail : titre de section, filet, contenu ; sans carte imbriquée. */
export function Section({
  titre,
  action,
  children,
}: {
  titre: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Box component="section">
      <Stack
        direction="row"
        sx={{
          justifyContent: 'space-between',
          alignItems: 'center',
          pb: 0.75,
          mb: 0.5,
          borderBottom: 1,
          borderColor: 'divider',
          minHeight: 32,
        }}
      >
        <Typography variant="h6" component="h3">
          {titre}
        </Typography>
        {action}
      </Stack>
      {children}
    </Box>
  );
}

/** État en texte coloré (« Vacant », « Échec »…) : remplace les pastilles dans les listes. */
export function Etiquette({
  ton = 'neutre',
  children,
}: {
  ton?: Ton | 'info';
  children: ReactNode;
}) {
  return (
    <Typography
      component="span"
      variant="caption"
      sx={{
        fontWeight: 600,
        whiteSpace: 'nowrap',
        color:
          ton === 'info' ? 'info.main' : ton === 'neutre' ? 'text.secondary' : COULEUR_TON[ton],
      }}
    >
      {children}
    </Typography>
  );
}
