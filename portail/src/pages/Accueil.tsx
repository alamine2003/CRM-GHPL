import type { Moi, MonOrganisation, Perimetre } from '@innov/api-client';
import { marque } from '@innov/design';
import { avancement } from '@innov/domaine';
import CloudDoneRounded from '@mui/icons-material/CloudDoneRounded';
import CloudOffRounded from '@mui/icons-material/CloudOffRounded';
import ArrowForwardRounded from '@mui/icons-material/ArrowForwardRounded';
import BadgeRounded from '@mui/icons-material/BadgeRounded';
import MapRounded from '@mui/icons-material/MapRounded';
import PersonOffRounded from '@mui/icons-material/PersonOffRounded';
import RouteRounded from '@mui/icons-material/RouteRounded';
import SupervisorAccountRounded from '@mui/icons-material/SupervisorAccountRounded';
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
import { useTranslation } from 'react-i18next';
import { Link as LienRouteur } from 'react-router';
import { EnTeteCarte, GrilleTuiles, Ligne, PastilleIcone, Tuile } from '../composants/Elements';
import { useSession } from '../contexteSession';

const VERSION_CLIENT = __INNOV_VERSION__;

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

function Bandeau({ utilisateur, perimetre }: { utilisateur: Moi; perimetre: Perimetre }) {
  const { t, i18n } = useTranslation();
  const fuseau = perimetre.pays_actif?.fuseau ?? utilisateur.pays_principal?.fuseau;
  const date = new Intl.DateTimeFormat(i18n.language, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: fuseau,
  }).format(new Date());
  const lieu =
    perimetre.pays_actif?.nom ??
    (perimetre.vue_consolidee ? t('pays.consolide') : t('session.siege'));
  return (
    <Box
      sx={{
        position: 'relative',
        overflow: 'hidden',
        borderRadius: 3,
        color: '#FFFFFF',
        px: { xs: 2.5, md: 3.5 },
        py: { xs: 2.5, md: 3 },
        background: `linear-gradient(120deg, ${marque.bleuMarine3} 0%, ${marque.bleuMarine} 55%, ${marque.bleuMarine2} 100%)`,
        // Motif discret de la maquette : deux disques orange en fond.
        '&::before, &::after': {
          content: '""',
          position: 'absolute',
          borderRadius: '50%',
          background: `radial-gradient(circle, ${marque.orange} 0%, transparent 70%)`,
          opacity: 0.35,
        },
        '&::before': { width: 260, height: 260, right: -60, top: -110 },
        '&::after': { width: 160, height: 160, right: 140, bottom: -110, opacity: 0.18 },
      }}
    >
      <Box sx={{ position: 'relative' }}>
        <Typography variant="overline" sx={{ color: marque.orangeClair }}>
          {date.charAt(0).toUpperCase() + date.slice(1)} · {lieu}
        </Typography>
        <Typography variant="h4" component="h1" sx={{ mt: 0.25 }}>
          {t('session.bonjour', { prenom: utilisateur.prenom })}
        </Typography>
        <Typography sx={{ opacity: 0.8, mt: 0.75, maxWidth: 560 }}>
          {t('accueil.introduction')}
        </Typography>
        {perimetre.roles.length > 0 && (
          <Stack direction="row" sx={{ gap: 0.75, flexWrap: 'wrap', mt: 2 }}>
            {perimetre.roles.map((role) => (
              <Chip
                key={role}
                size="small"
                label={t(`roles.${role}`)}
                sx={{
                  bgcolor: 'rgba(255,255,255,.14)',
                  color: '#FFFFFF',
                  border: '1px solid rgba(255,255,255,.18)',
                }}
              />
            ))}
          </Stack>
        )}
      </Box>
    </Box>
  );
}

function ChiffresOrganisation({ perimetre }: { perimetre: Perimetre }) {
  const { t } = useTranslation();
  const { client } = useSession();
  const synthese = useQuery({
    queryKey: ['organisation', perimetre.pays_actif?.code ?? 'consolide', 'synthese'],
    queryFn: () => client.organisation.synthese(),
  });
  const s = synthese.data;
  if (!s) return null;
  return (
    <Stack spacing={1.5}>
      <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h6" component="h2">
          {t('accueil.chiffresOrganisation')}
        </Typography>
        <Button
          component={LienRouteur}
          to="/organisation"
          endIcon={<ArrowForwardRounded />}
          size="small"
        >
          {t('accueil.voirOrganisation')}
        </Button>
      </Stack>
      <GrilleTuiles>
        <Tuile
          libelle={t('organisation.chiffres.postes')}
          valeur={s.postes}
          icone={<BadgeRounded />}
        />
        <Tuile
          libelle={t('organisation.chiffres.vacants')}
          valeur={s.postes_vacants}
          icone={<PersonOffRounded />}
          ton="warning"
        />
        <Tuile
          libelle={t('organisation.chiffres.sansSuperviseur')}
          valeur={s.postes_sans_superviseur}
          icone={<SupervisorAccountRounded />}
          ton="error"
        />
        <Tuile
          libelle={t('organisation.chiffres.secteurs')}
          valeur={s.secteurs}
          icone={<MapRounded />}
          ton="info"
          detail={t('organisation.chiffres.zones', { count: s.zones })}
        />
      </GrilleTuiles>
    </Stack>
  );
}

function MonPoste({ perimetre }: { perimetre: Perimetre }) {
  const { t, i18n } = useTranslation();
  const { client } = useSession();
  const moi = useQuery({
    queryKey: ['organisation', perimetre.pays_actif?.code ?? 'consolide', 'moi'],
    queryFn: () => client.organisation.moi(),
  });
  const o: MonOrganisation | undefined = moi.data;
  if (!o || (!o.postes.length && !o.postes_supervises && !o.reseaux.length)) return null;
  const formatDate = (iso: string) =>
    new Intl.DateTimeFormat(i18n.language, {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(new Date(`${iso}T12:00:00`));
  return (
    <Card>
      <EnTeteCarte
        titre={o.postes.length > 1 ? t('monPoste.titrePlusieurs') : t('monPoste.titre')}
        action={
          o.postes_supervises > 0 && (
            <Chip
              size="small"
              color="secondary"
              label={t('monPoste.postesSupervises', { count: o.postes_supervises })}
            />
          )
        }
      />
      <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {o.superviseur_manquant && (
          <Alert severity="warning" role="alert">
            {t('monPoste.superviseurManquant')}
          </Alert>
        )}
        {o.postes.map(({ occupation, type_poste, reseaux, secteurs, superviseur }) => (
          <Stack key={occupation.id} direction="row" spacing={1.5}>
            <PastilleIcone icone={<BadgeRounded />} ton="secondary" />
            <Box sx={{ minWidth: 0, flexGrow: 1 }}>
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                <Typography sx={{ fontWeight: 700 }} noWrap>
                  {occupation.poste.libelle}
                </Typography>
                {o.postes.length > 1 && occupation.principal && (
                  <Chip size="small" label={t('monPoste.principal')} />
                )}
              </Stack>
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                {t(`organisation.typesPoste.${type_poste}`)} ·{' '}
                {t('monPoste.depuis', { date: formatDate(occupation.debut) })}
              </Typography>
              <Divider sx={{ my: 1 }} />
              <Ligne
                libelle={t('monPoste.superviseur')}
                valeur={superviseur ? `${superviseur.prenom} ${superviseur.nom}` : '—'}
              />
              <Ligne
                libelle={t('monPoste.reseaux')}
                valeur={reseaux.map((r) => r.libelle).join(', ') || '—'}
              />
              <Ligne
                libelle={t('monPoste.secteurs')}
                valeur={secteurs.map((r) => r.libelle).join(', ') || '—'}
              />
            </Box>
          </Stack>
        ))}
        {o.reseaux.length > 0 && (
          <Box>
            <Typography variant="overline" sx={{ color: 'text.secondary' }}>
              {t('monPoste.perimetreReseaux')}
            </Typography>
            <Stack direction="row" sx={{ gap: 0.75, flexWrap: 'wrap', mt: 0.5 }}>
              {o.reseaux.map((p) => (
                <Chip key={p.id} size="small" variant="outlined" label={p.reseau.libelle} />
              ))}
            </Stack>
          </Box>
        )}
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
  const { t } = useTranslation();
  const lectureOrganisation = perimetre.actions.includes('organisation.lire');

  return (
    <Stack spacing={2.5}>
      <Bandeau utilisateur={utilisateur} perimetre={perimetre} />
      {perimetre.roles.length === 0 && (
        <Alert severity="warning" role="alert">
          {t('roles.aucun')}
        </Alert>
      )}
      {lectureOrganisation && <ChiffresOrganisation perimetre={perimetre} />}
      <Box
        sx={{
          display: 'grid',
          gap: 2,
          gridTemplateColumns: { xs: '1fr', md: '1.4fr 1fr' },
          alignItems: 'start',
        }}
      >
        <Stack spacing={2}>
          <MonPoste perimetre={perimetre} />
          <FeuilleDeRoute />
          <EtatService />
        </Stack>
        <MonCompte utilisateur={utilisateur} perimetre={perimetre} />
      </Box>
    </Stack>
  );
}
