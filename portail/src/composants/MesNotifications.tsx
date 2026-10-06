import { Box, Button, Card, Stack, Typography } from '@mui/material';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link as LienRouteur, useNavigate } from 'react-router';
import { useSession } from '../contexteSession';
import { EnTeteCarte } from './Elements';
import { destination, ICONES, texteNotification } from './textesNotifications';

/**
 * Notifications non lues sur l'accueil du portail (0.3.4) ; le centre complet (NOT-001) est
 * derrière la cloche de la barre du haut.
 */
export function MesNotifications() {
  const { t, i18n } = useTranslation();
  const { client } = useSession();
  const requetes = useQueryClient();
  const naviguer = useNavigate();
  const centre = useQuery({ queryKey: ['notifications'], queryFn: client.notifications.liste });
  const nonLues = (centre.data?.notifications ?? []).filter((n) => !n.lue_le);
  if (nonLues.length === 0) return null;

  const rafraichir = () => void requetes.invalidateQueries({ queryKey: ['notifications'] });
  return (
    <Card>
      <EnTeteCarte
        titre={t('notifications.titre', { count: nonLues.length })}
        action={
          <Button size="small" component={LienRouteur} to="/notifications">
            {t('notifications.voirTout')}
          </Button>
        }
      />
      <Stack component="ul" sx={{ listStyle: 'none', p: 0, m: 0 }}>
        {nonLues.map((n) => (
          <Box component="li" key={n.id} sx={{ borderTop: 1, borderColor: 'divider' }}>
            <Button
              fullWidth
              onClick={() => {
                void client.notifications.lue(n.id).finally(rafraichir);
                void naviguer(destination(n));
              }}
              sx={{ justifyContent: 'flex-start', textAlign: 'left', px: 2, py: 1.25, gap: 1.5 }}
            >
              {ICONES[n.type]}
              <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary' }}>
                {texteNotification(n, t, i18n.language)}
              </Typography>
            </Button>
          </Box>
        ))}
      </Stack>
    </Card>
  );
}
