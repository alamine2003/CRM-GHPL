import { ErreurApi } from '@innov/api-client';
import ErrorOutlineRounded from '@mui/icons-material/ErrorOutlineRounded';
import ReplayRounded from '@mui/icons-material/ReplayRounded';
import { Alert, Box, Button, Card, Stack, Typography } from '@mui/material';
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { signalerErreur } from '../signalement';
import { PastilleIcone } from './Elements';

/** Écran affiché quand une page plante : message clair, référence, rechargement. */
export function EcranErreur({ reference }: { reference?: string }) {
  const { t } = useTranslation();
  return (
    <Box sx={{ display: 'grid', placeItems: 'center', minHeight: '60vh', p: 3 }}>
      <Card sx={{ maxWidth: 480, p: 4, textAlign: 'center' }}>
        <Stack spacing={2} sx={{ alignItems: 'center' }}>
          <PastilleIcone icone={<ErrorOutlineRounded />} ton="error" taille={64} />
          <Typography variant="h5" component="h1">
            {t('erreurs.titre')}
          </Typography>
          <Typography sx={{ color: 'text.secondary' }}>{t('erreurs.texte')}</Typography>
          {reference && (
            <Typography
              variant="body2"
              sx={{
                fontFamily: 'monospace',
                bgcolor: 'action.hover',
                px: 1.5,
                py: 0.5,
                borderRadius: 1,
              }}
            >
              {t('erreurs.reference', { reference })}
            </Typography>
          )}
          <Stack direction="row" spacing={1}>
            <Button variant="contained" onClick={() => window.location.reload()}>
              {t('erreurs.recharger')}
            </Button>
            <Button href="/">{t('erreurs.accueil')}</Button>
          </Stack>
        </Stack>
      </Card>
    </Box>
  );
}

/** Attrape les erreurs de rendu, les signale et affiche l'écran d'erreur. */
export class LimiteErreur extends Component<{ children: ReactNode }, { reference?: string }> {
  state: { reference?: string } = {};

  static getDerivedStateFromError(): { reference: string } {
    return { reference: Math.random().toString(16).slice(2, 12) };
  }

  componentDidCatch(erreur: Error, _info: ErrorInfo) {
    signalerErreur(erreur, this.state.reference);
  }

  render() {
    if (this.state.reference) return <EcranErreur reference={this.state.reference} />;
    return this.props.children;
  }
}

/** Échec de chargement d'une liste ou d'une page : message, référence et « Réessayer ». */
export function ErreurChargement({
  erreur,
  reessayer,
}: {
  erreur: unknown;
  reessayer?: () => void;
}) {
  const { t } = useTranslation();
  const api = erreur instanceof ErreurApi ? erreur : null;
  return (
    <Alert
      severity="error"
      action={
        reessayer && (
          <Button color="inherit" size="small" startIcon={<ReplayRounded />} onClick={reessayer}>
            {t('erreurs.reessayer')}
          </Button>
        )
      }
    >
      {api?.message ?? t('erreurs.chargement')}
      {api?.reference && (
        <Typography variant="caption" component="p" sx={{ fontFamily: 'monospace', mt: 0.5 }}>
          {t('erreurs.reference', { reference: api.reference })}
        </Typography>
      )}
    </Alert>
  );
}
