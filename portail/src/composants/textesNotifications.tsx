import type { Notification } from '@innov/api-client';
import AssignmentTurnedInRounded from '@mui/icons-material/AssignmentTurnedInRounded';
import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded';
import EventBusyRounded from '@mui/icons-material/EventBusyRounded';
import LockOpenRounded from '@mui/icons-material/LockOpenRounded';
import NotificationImportantRounded from '@mui/icons-material/NotificationImportantRounded';
import RateReviewOutlined from '@mui/icons-material/RateReviewOutlined';
import ScheduleRounded from '@mui/icons-material/ScheduleRounded';
import SwapHorizRounded from '@mui/icons-material/SwapHorizRounded';
import type { ReactNode } from 'react';
import type { useTranslation } from 'react-i18next';

type Traduire = ReturnType<typeof useTranslation>['t'];

export const ICONES: Record<Notification['type'], ReactNode> = {
  planning_soumis: <AssignmentTurnedInRounded color="primary" fontSize="small" />,
  planning_approuve: <CheckCircleRounded color="success" fontSize="small" />,
  revision_demandee: <RateReviewOutlined color="warning" fontSize="small" />,
  remplacement_attribue: <SwapHorizRounded color="primary" fontSize="small" />,
  rappel_planning: <ScheduleRounded color="warning" fontSize="small" />,
  escalade: <NotificationImportantRounded color="error" fontSize="small" />,
  plannings_non_approuves: <EventBusyRounded color="warning" fontSize="small" />,
  reouverture_demandee: <LockOpenRounded color="warning" fontSize="small" />,
  redaction_rouverte: <LockOpenRounded color="primary" fontSize="small" />,
};

/** Texte d'une notification, composé dans la langue de l'utilisateur (prd.md §18). */
export function texteNotification(n: Notification, t: Traduire, langue: string, fuseau?: string) {
  const jour = (iso?: string) =>
    iso
      ? new Intl.DateTimeFormat(langue, { day: 'numeric', month: 'long' }).format(
          new Date(`${iso}T12:00:00`),
        )
      : '';
  const echeance = n.donnees.echeance
    ? new Intl.DateTimeFormat(langue, {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: fuseau,
      }).format(new Date(n.donnees.echeance))
    : '';
  return t(`notifications.${n.type}`, {
    numero: n.donnees.numero_semaine,
    nom: n.donnees.nom,
    debut: jour(n.donnees.debut),
    fin: jour(n.donnees.fin),
    heures: n.donnees.heures,
    count: n.donnees.nombre ?? 0,
    echeance,
    suite:
      n.donnees.motif === 'modification'
        ? t('notifications.versionModification', { version: n.donnees.version })
        : n.donnees.version && n.donnees.version > 1
          ? t('notifications.version', { version: n.donnees.version })
          : '',
  });
}

/**
 * Où mène une notification (NOT-001 CA1) : l'écran de l'action attendue — le planning à
 * décider, la file, ou la semaine du délégué.
 */
export function destination(n: Notification) {
  if ((n.type === 'planning_soumis' || n.type === 'escalade') && n.donnees.planning)
    return `/validation/${n.donnees.planning}`;
  if (
    n.type === 'remplacement_attribue' ||
    n.type === 'plannings_non_approuves' ||
    n.type === 'reouverture_demandee'
  )
    return '/validation';
  return n.donnees.semaine ? `/planning?semaine=${n.donnees.semaine}` : '/planning';
}
