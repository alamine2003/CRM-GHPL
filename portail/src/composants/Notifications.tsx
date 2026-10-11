import { Alert, Snackbar } from '@mui/material';
import { type ReactNode, useCallback, useState } from 'react';
import { ContexteNotifications, type GraviteNotification } from '../contexteNotifications';

interface Notification {
  cle: number;
  message: string;
  gravite: GraviteNotification;
}

export default function FournisseurNotifications({ children }: { children: ReactNode }) {
  const [courante, setCourante] = useState<Notification | null>(null);
  const notifier = useCallback((message: string, gravite: GraviteNotification = 'success') => {
    setCourante({ cle: Date.now(), message, gravite });
  }, []);
  return (
    <ContexteNotifications.Provider value={notifier}>
      {children}
      <Snackbar
        key={courante?.cle}
        open={courante !== null}
        autoHideDuration={4000}
        onClose={(_, raison) => raison !== 'clickaway' && setCourante(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        {courante ? (
          <Alert
            severity={courante.gravite}
            variant="filled"
            onClose={() => setCourante(null)}
            sx={{ boxShadow: 6, minWidth: 280 }}
          >
            {courante.message}
          </Alert>
        ) : undefined}
      </Snackbar>
    </ContexteNotifications.Provider>
  );
}
