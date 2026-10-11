import CloudOffRounded from '@mui/icons-material/CloudOffRounded';
import { Alert, Collapse } from '@mui/material';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNotifier } from '../contexteNotifications';

/** Prévient l'utilisateur quand le réseau tombe, puis quand il revient. */
export default function BanniereHorsLigne() {
  const { t } = useTranslation();
  const notifier = useNotifier();
  const [horsLigne, setHorsLigne] = useState(typeof navigator !== 'undefined' && !navigator.onLine);
  useEffect(() => {
    const perdu = () => setHorsLigne(true);
    const retrouve = () => {
      setHorsLigne(false);
      notifier(t('erreurs.retourEnLigne'), 'info');
    };
    window.addEventListener('offline', perdu);
    window.addEventListener('online', retrouve);
    return () => {
      window.removeEventListener('offline', perdu);
      window.removeEventListener('online', retrouve);
    };
  }, [notifier, t]);
  return (
    <Collapse in={horsLigne}>
      <Alert severity="warning" icon={<CloudOffRounded />} sx={{ borderRadius: 0 }} role="status">
        {t('erreurs.horsLigne')}
      </Alert>
    </Collapse>
  );
}
