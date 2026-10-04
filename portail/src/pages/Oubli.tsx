import { Alert, Button, Link, TextField, Typography } from '@mui/material';
import { type FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link as LienRouteur } from 'react-router';
import { messageErreur, useSession } from '../contexteSession';
import Cadre from './Cadre';

export default function Oubli() {
  const { t } = useTranslation();
  const { client } = useSession();
  const [identifiant, setIdentifiant] = useState('');
  const [envoye, setEnvoye] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function soumettre(evenement: FormEvent) {
    evenement.preventDefault();
    setErreur(null);
    try {
      await client.demanderReinitialisation(identifiant);
      setEnvoye(true);
    } catch (e) {
      setErreur(messageErreur(e, t('erreurs.reseau')));
    }
  }

  return (
    <Cadre titre={t('oubli.titre')}>
      {envoye ? (
        <Alert severity="success">{t('oubli.envoye')}</Alert>
      ) : (
        <>
          <Typography sx={{ color: 'text.secondary' }}>{t('oubli.explication')}</Typography>
          {erreur && <Alert severity="error">{erreur}</Alert>}
          <form
            onSubmit={(e) => void soumettre(e)}
            style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
          >
            <TextField
              label={t('oubli.identifiant')}
              value={identifiant}
              onChange={(e) => setIdentifiant(e.target.value)}
              autoComplete="username"
              required
              autoFocus
            />
            <Button type="submit" variant="contained" color="secondary">
              {t('oubli.envoyer')}
            </Button>
          </form>
        </>
      )}
      <Link component={LienRouteur} to="/connexion" sx={{ alignSelf: 'center' }}>
        {t('oubli.retour')}
      </Link>
    </Cadre>
  );
}
