import type { Notification } from '@innov/api-client';
import AssignmentTurnedInRounded from '@mui/icons-material/AssignmentTurnedInRounded';
import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded';
import EventBusyRounded from '@mui/icons-material/EventBusyRounded';
import FactCheckRounded from '@mui/icons-material/FactCheckRounded';
import LockOpenRounded from '@mui/icons-material/LockOpenRounded';
import NotificationImportantRounded from '@mui/icons-material/NotificationImportantRounded';
import RateReviewOutlined from '@mui/icons-material/RateReviewOutlined';
import ScheduleRounded from '@mui/icons-material/ScheduleRounded';
import SwapHorizRounded from '@mui/icons-material/SwapHorizRounded';
import TrendingDownRounded from '@mui/icons-material/TrendingDownRounded';
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
  correction_demandee: <RateReviewOutlined color="warning" fontSize="small" />,
  rapport_corrige: <FactCheckRounded color="primary" fontSize="small" />,
  rapport_rouvert: <LockOpenRounded color="warning" fontSize="small" />,
  rapport_en_retard: <ScheduleRounded color="warning" fontSize="small" />,
  rapports_soumis: <AssignmentTurnedInRounded color="primary" fontSize="small" />,
  rapports_valides: <CheckCircleRounded color="success" fontSize="small" />,
  rappel_rapport: <ScheduleRounded color="warning" fontSize="small" />,
  journee_escaladee: <NotificationImportantRounded color="error" fontSize="small" />,
  objectif_ventes_retard: <TrendingDownRounded color="warning" fontSize="small" />,
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
  // RPT-016, 31.A : le superviseur apprend qu'un rapport de son délégué a été rouvert.
  const cle = n.type === 'rapport_rouvert' && n.donnees.delegue ? 'rapport_rouvert_suivi' : n.type;
  return t(`notifications.${cle}`, {
    numero: n.donnees.numero_semaine,
    nom: n.donnees.nom,
    // 1.8.0 : objectif de ventes en retard, le mois écoulé en toutes lettres.
    reseau: n.donnees.reseau,
    mois: n.donnees.mois
      ? new Intl.DateTimeFormat(langue, { month: 'long', year: 'numeric' }).format(
          new Date(`${n.donnees.mois}-15T12:00:00`),
        )
      : '',
    taux:
      n.donnees.taux === undefined || n.donnees.taux === null
        ? ''
        : new Intl.NumberFormat(langue, { maximumFractionDigits: 1 }).format(n.donnees.taux),
    debut: jour(n.donnees.debut),
    fin: jour(n.donnees.fin),
    jour: jour(n.donnees.date),
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
  // 1.8.0 : l'objectif de ventes en retard s'ouvre dans l'onglet « Objectifs » des ventes.
  if (n.type === 'objectif_ventes_retard') return '/ventes?onglet=objectifs';
  // RPT-017, 34.A : un rapport en retard s'ouvre dans l'onglet « Retards », filtré sur le délégué.
  if (n.type === 'rapport_en_retard')
    return `/a-traiter?onglet=retards${n.donnees.delegue ? `&delegue=${n.donnees.delegue}` : ''}`;
  // RPT-015, 28.A : le rapport corrigé se relit dans sa journée.
  // 0.6.8 : les rapports à valider attendent dans « À traiter ».
  if (n.type === 'rapports_soumis') return '/a-traiter';
  if (
    (n.type === 'rapport_corrige' ||
      n.type === 'rapport_rouvert' ||
      n.type === 'journee_escaladee') &&
    n.donnees.delegue &&
    n.donnees.date
  )
    return `/a-traiter/${n.donnees.delegue}/${n.donnees.date}`;
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
