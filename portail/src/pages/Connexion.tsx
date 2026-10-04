import Visibility from '@mui/icons-material/Visibility';
import VisibilityOff from '@mui/icons-material/VisibilityOff';
import { Alert, Button, IconButton, InputAdornment, Link, TextField } from '@mui/material';
import { type FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, Link as LienRouteur } from 'react-router';
import { messageErreur, useSession } from '../contexteSession';
import EcranPublic from '../composants/EcranPublic';

export default function Connexion() {
  const { t } = useTranslation();
  const { etat, connexion } = useSession();
  const [identifiant, setIdentifiant] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [visible, setVisible] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  if (etat.statut === 'connecte') return <Navigate to="/" replace />;

  async function soumettre(evenement: FormEvent) {
    evenement.preventDefault();
    setErreur(null);
    setEnvoi(true);
    try {
      await connexion(identifiant, motDePasse);
    } catch (e) {
      setErreur(messageErreur(e, t('erreurs.reseau')));
      setMotDePasse('');
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <EcranPublic titre={t('connexion.titre')}>
      {etat.statut === 'anonyme' && etat.sessionExpiree && !erreur && (
        <Alert severity="info">{t('session.expiree')}</Alert>
      )}
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
          label={t('connexion.identifiant')}
          helperText={t('connexion.aideIdentifiant')}
          value={identifiant}
          onChange={(e) => setIdentifiant(e.target.value)}
          autoComplete="username"
          autoCapitalize="none"
          required
          autoFocus
        />
        <TextField
          label={t('connexion.motDePasse')}
          type={visible ? 'text' : 'password'}
          value={motDePasse}
          onChange={(e) => setMotDePasse(e.target.value)}
          autoComplete="current-password"
          required
          slotProps={{
            input: {
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton
                    aria-label={visible ? t('connexion.masquer') : t('connexion.afficher')}
                    onClick={() => setVisible((v) => !v)}
                    edge="end"
                    size="small"
                  >
                    {visible ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
                  </IconButton>
                </InputAdornment>
              ),
            },
          }}
        />
        <Button type="submit" variant="contained" color="secondary" size="large" disabled={envoi}>
          {envoi ? t('connexion.enCours') : t('connexion.seConnecter')}
        </Button>
      </form>
      <Link component={LienRouteur} to="/mot-de-passe-oublie" sx={{ alignSelf: 'center' }}>
        {t('connexion.oublie')}
      </Link>
    </EcranPublic>
  );
}
