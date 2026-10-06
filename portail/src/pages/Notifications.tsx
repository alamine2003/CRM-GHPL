import type { Notification } from '@innov/api-client';
import { Box, Button, Card, Skeleton, Stack, Typography } from '@mui/material';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { EnTetePage } from '../composants/Elements';
import { ErreurChargement } from '../composants/Erreurs';
import { destination, ICONES, texteNotification } from '../composants/textesNotifications';
import { useSession } from '../contexteSession';

/**
 * Centre de notifications (NOT-001) : lues et non lues, les plus récentes d'abord ; chacune
 * ouvre l'écran de l'action attendue (CA1) et passe alors en « lue ».
 */
export default function Notifications({ fuseau }: { fuseau?: string }) {
  const { t, i18n } = useTranslation();
  const { client } = useSession();
  const requetes = useQueryClient();
  const naviguer = useNavigate();
  const centre = useQuery({
    queryKey: ['notifications', 'centre'],
    queryFn: client.notifications.centre,
  });
  const rafraichir = () => void requetes.invalidateQueries({ queryKey: ['notifications'] });
  const quand = (iso: string) =>
    new Intl.DateTimeFormat(i18n.language, {
      weekday: 'short',
      day: 'numeric',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: fuseau,
    }).format(new Date(iso));
  const ouvrir = (n: Notification) => {
    if (!n.lue_le) void client.notifications.lue(n.id).finally(rafraichir);
    void naviguer(destination(n));
  };

  return (
    <Stack spacing={2.5}>
      <EnTetePage
        titre={t('notifications.centre')}
        sousTitre={t('notifications.centreSousTitre')}
        actions={
          (centre.data?.non_lues ?? 0) > 0 && (
            <Button
              size="small"
              variant="outlined"
              onClick={() => void client.notifications.toutesLues().finally(rafraichir)}
            >
              {t('notifications.toutVu')}
            </Button>
          )
        }
      />
      {centre.isError ? (
        <ErreurChargement erreur={centre.error} reessayer={() => void centre.refetch()} />
      ) : !centre.data ? (
        <Skeleton variant="rounded" height={240} />
      ) : centre.data.notifications.length === 0 ? (
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          {t('notifications.aucune')}
        </Typography>
      ) : (
        <Card>
          <Stack component="ul" sx={{ listStyle: 'none', p: 0, m: 0 }}>
            {centre.data.notifications.map((n, i) => (
              <Box
                component="li"
                key={n.id}
                sx={{ borderTop: i > 0 ? 1 : 0, borderColor: 'divider' }}
              >
                <Button
                  fullWidth
                  onClick={() => ouvrir(n)}
                  sx={{
                    justifyContent: 'flex-start',
                    alignItems: 'flex-start',
                    textAlign: 'left',
                    px: 2,
                    py: 1.5,
                    gap: 1.5,
                    bgcolor: n.lue_le ? undefined : 'action.hover',
                  }}
                >
                  <Box sx={{ mt: 0.25, display: 'flex' }}>{ICONES[n.type]}</Box>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography
                      variant="body2"
                      sx={{ color: 'text.primary', fontWeight: n.lue_le ? 400 : 600 }}
                    >
                      {texteNotification(n, t, i18n.language, fuseau)}
                    </Typography>
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                      {quand(n.cree_le)}
                      {n.lue_le ? '' : ` · ${t('notifications.nonLue')}`}
                    </Typography>
                  </Box>
                </Button>
              </Box>
            ))}
          </Stack>
        </Card>
      )}
    </Stack>
  );
}
