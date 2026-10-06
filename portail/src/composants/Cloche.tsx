import NotificationsNoneRounded from '@mui/icons-material/NotificationsNoneRounded';
import { Badge, IconButton, Tooltip } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link as LienRouteur } from 'react-router';
import { useSession } from '../contexteSession';

/** NOT-001 : la cloche de la barre du haut, avec le nombre de notifications non lues. */
export function Cloche() {
  const { t } = useTranslation();
  const { client } = useSession();
  const centre = useQuery({
    queryKey: ['notifications'],
    queryFn: client.notifications.liste,
    refetchInterval: 60_000,
  });
  const nonLues = centre.data?.non_lues ?? 0;
  const libelle = t('notifications.cloche', { count: nonLues });
  return (
    // L'infobulle au survol seulement : après le clic, le focus reste sur la cloche et elle
    // couvrirait la page ouverte.
    <Tooltip title={libelle} disableFocusListener disableTouchListener>
      <IconButton component={LienRouteur} to="/notifications" aria-label={libelle}>
        <Badge badgeContent={nonLues} color="error" max={99}>
          <NotificationsNoneRounded />
        </Badge>
      </IconButton>
    </Tooltip>
  );
}
