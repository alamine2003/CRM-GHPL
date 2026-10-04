import type { Moi } from '@innov/api-client';
import { Button, Card, CardContent, Chip, Container, Stack, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useSession } from '../contexteSession';

const VERSION_CLIENT = __INNOV_VERSION__;

function Ligne({ libelle, valeur }: { libelle: string; valeur: string }) {
  return (
    <Stack direction="row" spacing={2} sx={{ justifyContent: 'space-between' }}>
      <Typography sx={{ color: 'text.secondary' }}>{libelle}</Typography>
      <Typography sx={{ fontWeight: 600 }}>{valeur}</Typography>
    </Stack>
  );
}

export default function Accueil({ utilisateur }: { utilisateur: Moi }) {
  const { t, i18n } = useTranslation();
  const { client } = useSession();
  const informations = useQuery({
    queryKey: ['informations', i18n.language],
    queryFn: () => client.informations(),
    retry: false,
  });
  const perimetre = utilisateur.pays_principal?.nom ?? t('session.siege');

  return (
    <Container maxWidth="sm" sx={{ py: { xs: 3, sm: 6 } }}>
      <Typography variant="h4" component="h1" gutterBottom>
        {t('session.bonjour', { prenom: utilisateur.prenom })}
      </Typography>
      <Typography sx={{ color: 'text.secondary', mb: 3 }}>{t('accueil.introduction')}</Typography>
      <Card variant="outlined">
        <CardContent>
          <Stack spacing={1.5}>
            <Stack
              direction="row"
              sx={{ justifyContent: 'space-between', alignItems: 'center', gap: 1 }}
            >
              <Typography variant="h6" component="h2">
                {t('accueil.etatServeur')}
              </Typography>
              {informations.isPending ? (
                <Chip label={t('accueil.verification')} />
              ) : informations.isSuccess ? (
                <Chip color="success" label={t('accueil.serveurDisponible')} />
              ) : (
                <Chip color="error" label={t('accueil.serveurIndisponible')} />
              )}
            </Stack>
            <Ligne libelle={t('connexion.identifiant')} valeur={utilisateur.identifiant} />
            <Ligne libelle={t('accueil.perimetre')} valeur={perimetre} />
            <Ligne libelle={t('accueil.versionClient')} valeur={VERSION_CLIENT} />
            {informations.isSuccess && (
              <>
                <Ligne libelle={t('accueil.versionServeur')} valeur={informations.data.version} />
                <Ligne
                  libelle={t('accueil.environnement')}
                  valeur={informations.data.environnement}
                />
              </>
            )}
            {informations.isError && (
              <Button variant="outlined" onClick={() => void informations.refetch()}>
                {t('accueil.reessayer')}
              </Button>
            )}
          </Stack>
        </CardContent>
      </Card>
    </Container>
  );
}
