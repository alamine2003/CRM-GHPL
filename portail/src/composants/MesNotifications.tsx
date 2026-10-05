import type { Notification } from '@innov/api-client';
import AssignmentTurnedInRounded from '@mui/icons-material/AssignmentTurnedInRounded';
import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded';
import RateReviewOutlined from '@mui/icons-material/RateReviewOutlined';
import SwapHorizRounded from '@mui/icons-material/SwapHorizRounded';
import { Box, Button, Card, Stack, Typography } from '@mui/material';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { useSession } from '../contexteSession';
import { EnTeteCarte } from './Elements';

type Traduire = ReturnType<typeof useTranslation>['t'];

const ICONES: Record<Notification['type'], ReactNode> = {
  planning_soumis: <AssignmentTurnedInRounded color="primary" fontSize="small" />,
  planning_approuve: <CheckCircleRounded color="success" fontSize="small" />,
  revision_demandee: <RateReviewOutlined color="warning" fontSize="small" />,
  remplacement_attribue: <SwapHorizRounded color="primary" fontSize="small" />,
};

/** Texte d'une notification, composé dans la langue de l'utilisateur (prd.md §18). */
function texteNotification(n: Notification, t: Traduire, langue: string) {
  const jour = (iso?: string) =>
    iso
      ? new Intl.DateTimeFormat(langue, { day: 'numeric', month: 'long' }).format(
          new Date(`${iso}T12:00:00`),
        )
      : '';
  return t(`notifications.${n.type}`, {
    numero: n.donnees.numero_semaine,
    nom: n.donnees.nom,
    debut: jour(n.donnees.debut),
    fin: jour(n.donnees.fin),
    suite:
      n.donnees.version && n.donnees.version > 1
        ? t('notifications.version', { version: n.donnees.version })
        : '',
  });
}

/** Où mène une notification : la semaine du délégué, le planning à décider, ou la file. */
function destination(n: Notification) {
  if (n.type === 'planning_soumis' && n.donnees.planning)
    return `/validation/${n.donnees.planning}`;
  return n.type === 'remplacement_attribue' ? '/validation' : '/planning';
}

/**
 * Notifications non lues sur l'accueil du portail (0.3.4) : approbation et révision pour le
 * délégué, remplacement attribué pour le superviseur (ORG-013). Le centre complet arrive en
 * 0.3.8.
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
          nonLues.length > 1 ? (
            <Button
              size="small"
              onClick={() => void client.notifications.toutesLues().finally(rafraichir)}
            >
              {t('notifications.toutVu')}
            </Button>
          ) : undefined
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
