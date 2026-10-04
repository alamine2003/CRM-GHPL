import { Alert, Button, Link, TextField, Typography } from '@mui/material';
import { type FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link as LienRouteur, useSearchParams } from 'react-router';
import { messageErreur, useSession } from '../contexteSession';
import EcranPublic from '../composants/EcranPublic';

export default function Reinitialisation() {
  const { t } = useTranslation();
  const { client } = useSession();
  const [parametres] = useSearchParams();
  const jeton = parametres.get('jeton');
  const [nouveau, setNouveau] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState(false);

  async function soumettre(evenement: FormEvent) {
    evenement.preventDefault();
    if (nouveau !== confirmation) {
      setErreur(t('reinitialisation.differents'));
      return;
    }
    setErreur(null);
    try {
      await client.reinitialiser(jeton!, nouveau);
      setSucces(true);
    } catch (e) {
      setErreur(messageErreur(e, t('erreurs.reseau')));
    }
  }

  return (
    <EcranPublic titre={t('reinitialisation.titre')}>
      {!jeton ? (
        <Alert severity="warning">{t('reinitialisation.lienManquant')}</Alert>
      ) : succes ? (
        <Alert severity="success">{t('reinitialisation.succes')}</Alert>
      ) : (
        <>
          <Typography sx={{ color: 'text.secondary' }}>
            {t('reinitialisation.explication')}
          </Typography>
          {erreur && (
            <Alert severity="error" role="alert">
              {erreur}
            </Alert>
          )}
          <form
            onSubmit={(e) => void soumettre(e)}
            style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
          >
            <TextField
              label={t('reinitialisation.nouveau')}
              type="password"
              value={nouveau}
              onChange={(e) => setNouveau(e.target.value)}
              autoComplete="new-password"
              required
              autoFocus
            />
            <TextField
              label={t('reinitialisation.confirmation')}
              type="password"
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              autoComplete="new-password"
              required
            />
            <Button type="submit" variant="contained">
              {t('reinitialisation.enregistrer')}
            </Button>
          </form>
        </>
      )}
      <Link component={LienRouteur} to="/connexion" sx={{ alignSelf: 'center' }}>
        {t('oubli.retour')}
      </Link>
    </EcranPublic>
  );
}
