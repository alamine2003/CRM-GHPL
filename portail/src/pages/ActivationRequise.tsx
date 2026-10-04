import { Alert, Button, Stack } from '@mui/material';
import { useTranslation } from 'react-i18next';
import AssistantDoubleAuth from '../composants/AssistantDoubleAuth';
import EcranPublic from '../composants/EcranPublic';
import { useSession } from '../contexteSession';

/** Rôle sensible sans double authentification : activation avant tout accès (SEC-003 CA1). */
export default function ActivationRequise() {
  const { t } = useTranslation();
  const { doubleAuthActivee, deconnexion } = useSession();
  return (
    <EcranPublic titre={t('doubleAuth.requiseTitre')}>
      <Alert severity="info">{t('doubleAuth.requiseTexte')}</Alert>
      <AssistantDoubleAuth surTermine={() => void doubleAuthActivee()} />
      <Stack sx={{ alignItems: 'center' }}>
        <Button color="inherit" onClick={() => void deconnexion()}>
          {t('session.deconnexion')}
        </Button>
      </Stack>
    </EcranPublic>
  );
}
