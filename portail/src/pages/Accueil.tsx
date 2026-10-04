import type { Moi, Perimetre } from '@innov/api-client';
import { avancement } from '@innov/domaine';
import CloudDoneRounded from '@mui/icons-material/CloudDoneRounded';
import CloudOffRounded from '@mui/icons-material/CloudOffRounded';
import RouteRounded from '@mui/icons-material/RouteRounded';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
  LinearProgress,
  Stack,
  Typography,
} from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useSession } from '../contexteSession';

const VERSION_CLIENT = __INNOV_VERSION__;

function EnTeteCarte({ titre, action }: { titre: string; action?: ReactNode }) {
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

function Ligne({ libelle, valeur }: { libelle: string; valeur: ReactNode }) {
  return (
    <Stack direction="row" spacing={2} sx={{ justifyContent: 'space-between', py: 1.1 }}>
      <Typography sx={{ color: 'text.secondary' }}>{libelle}</Typography>
      <Typography component="div" sx={{ fontWeight: 600, textAlign: 'right', minWidth: 0 }}>
        {valeur}
      </Typography>
    </Stack>
  );
}

function FeuilleDeRoute() {
  const { t } = useTranslation();
  const a = avancement(VERSION_CLIENT);
  const pourcentage = Math.round((a.livrees / a.total) * 100);
  return (
    <Card>
      <EnTeteCarte
        titre={t('feuilleRoute.titre')}
        action={<Chip size="small" color="secondary" label={`v${a.version}`} />}
      />
      <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
          <Box
            sx={{
              width: 44,
              height: 44,
              borderRadius: 2.5,
              display: 'grid',
              placeItems: 'center',
              bgcolor: 'secondary.main',
              color: '#FFFFFF',
              flex: 'none',
            }}
          >
            <RouteRounded />
          </Box>
          <Box>
            <Typography sx={{ fontWeight: 700 }}>
              {a.stable
                ? t('feuilleRoute.stable')
                : t('feuilleRoute.cycle', {
                    numero: `0.${a.cycle}`,
                    nom: t(`feuilleRoute.cycles.${a.codeCycle}`),
                  })}
            </Typography>
            {!a.stable && (
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                {t('feuilleRoute.etape', { etape: a.etape })}
              </Typography>
            )}
          </Box>
        </Stack>
        <Box>
          <LinearProgress
            variant="determinate"
            value={pourcentage}
            color="secondary"
            aria-label={t('feuilleRoute.titre')}
          />
          <Typography variant="body2" sx={{ color: 'text.secondary', mt: 1 }}>
            {t('feuilleRoute.livrees', { livrees: a.livrees, total: a.total })}
          </Typography>
        </Box>
      </CardContent>
    </Card>
  );
}

function EtatService() {
  const { t, i18n } = useTranslation();
  const { client } = useSession();
  const informations = useQuery({
    queryKey: ['informations', i18n.language],
    queryFn: () => client.informations(),
    retry: false,
  });
  const pastille = informations.isPending ? (
    <Chip size="small" label={t('accueil.verification')} />
  ) : informations.isSuccess ? (
    <Chip
      size="small"
      color="success"
      icon={<CloudDoneRounded />}
      label={t('accueil.serveurDisponible')}
    />
  ) : (
    <Chip
      size="small"
      color="error"
      icon={<CloudOffRounded />}
      label={t('accueil.serveurIndisponible')}
    />
  );
  return (
    <Card>
      <EnTeteCarte titre={t('accueil.etatServeur')} action={pastille} />
      <CardContent sx={{ py: 0.5 }}>
        <Ligne libelle={t('accueil.versionClient')} valeur={VERSION_CLIENT} />
        <Divider />
        <Ligne
          libelle={t('accueil.versionServeur')}
          valeur={informations.isSuccess ? informations.data.version : '—'}
        />
        <Divider />
        <Ligne
          libelle={t('accueil.environnement')}
          valeur={informations.isSuccess ? informations.data.environnement : '—'}
        />
        {informations.isError && (
          <Button
            variant="outlined"
            fullWidth
            sx={{ my: 1.5 }}
            onClick={() => void informations.refetch()}
          >
            {t('accueil.reessayer')}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function MonCompte({ utilisateur, perimetre }: { utilisateur: Moi; perimetre: Perimetre }) {
  const { t, i18n } = useTranslation();
  return (
    <Card>
      <EnTeteCarte titre={t('profil.titre')} />
      <CardContent sx={{ py: 0.5 }}>
        <Ligne
          libelle={t('roles.titre')}
          valeur={
            perimetre.roles.length ? (
              <Stack
                direction="row"
                sx={{ gap: 0.75, flexWrap: 'wrap', justifyContent: 'flex-end' }}
              >
                {perimetre.roles.map((role) => (
                  <Chip key={role} size="small" color="primary" label={t(`roles.${role}`)} />
                ))}
              </Stack>
            ) : (
              '—'
            )
          }
        />
        <Divider />
        <Ligne libelle={t('profil.identifiant')} valeur={utilisateur.identifiant} />
        <Divider />
        <Ligne
          libelle={t('profil.courriel')}
          valeur={utilisateur.courriel || t('profil.nonRenseigne')}
        />
        <Divider />
        <Ligne
          libelle={t('profil.perimetre')}
          valeur={
            perimetre.pays_actif?.nom ??
            (perimetre.vue_consolidee ? t('pays.consolide') : t('session.siege'))
          }
        />
        <Divider />
        <Ligne libelle={t('profil.langue')} valeur={t(`commun.langues.${i18n.language}`)} />
      </CardContent>
    </Card>
  );
}

export default function Accueil({
  utilisateur,
  perimetre,
}: {
  utilisateur: Moi;
  perimetre: Perimetre;
}) {
  const { t, i18n } = useTranslation();
  const date = new Intl.DateTimeFormat(i18n.language, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: utilisateur.pays_principal?.fuseau,
  }).format(new Date());

  return (
    <Stack spacing={2.5}>
      <Box>
        <Typography variant="h4" component="h1">
          {t('session.bonjour', { prenom: utilisateur.prenom })}
        </Typography>
        <Typography sx={{ color: 'text.secondary', mt: 0.5 }}>
          {date.charAt(0).toUpperCase() + date.slice(1)}
          {' · '}
          {t('accueil.introduction')}
        </Typography>
      </Box>
      {perimetre.roles.length === 0 && (
        <Alert severity="warning" role="alert">
          {t('roles.aucun')}
        </Alert>
      )}
      <Box
        sx={{
          display: 'grid',
          gap: 2,
          gridTemplateColumns: { xs: '1fr', md: '1.4fr 1fr' },
          alignItems: 'start',
        }}
      >
        <Stack spacing={2}>
          <FeuilleDeRoute />
          <EtatService />
        </Stack>
        <MonCompte utilisateur={utilisateur} perimetre={perimetre} />
      </Box>
    </Stack>
  );
}
