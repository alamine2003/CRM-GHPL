/**
 * Textes et destinations des notifications au téléphone (prd.md §18, NOT-001), composés dans
 * la langue de l'utilisateur à partir du type et des données, sans donnée de santé.
 */
import type MaterialIcons from '@expo/vector-icons/MaterialIcons';
import type { Notification } from '@innov/api-client';
import type { ComponentProps } from 'react';
import type { useTranslation } from 'react-i18next';
import type { usePalette } from './composants';

type Traduire = ReturnType<typeof useTranslation>['t'];
type Palette = ReturnType<typeof usePalette>;

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

export function iconeNotification(
  n: Notification,
  p: Palette,
): { nom: ComponentProps<typeof MaterialIcons>['name']; couleur: string } {
  switch (n.type) {
    case 'revision_demandee':
    case 'correction_demandee':
      return { nom: 'rate-review', couleur: p.attention };
    case 'rapport_rouvert':
      return { nom: 'lock-open', couleur: p.attention };
    case 'remplacement_attribue':
      return { nom: 'swap-horiz', couleur: p.info };
    case 'rappel_planning':
      return { nom: 'schedule', couleur: p.attention };
    case 'escalade':
      return { nom: 'notification-important', couleur: p.erreur };
    case 'plannings_non_approuves':
      return { nom: 'event-busy', couleur: p.attention };
    case 'reouverture_demandee':
      return { nom: 'lock-open', couleur: p.attention };
    case 'redaction_rouverte':
      return { nom: 'lock-open', couleur: p.info };
    case 'planning_soumis':
      return { nom: 'assignment-turned-in', couleur: p.info };
    default:
      return { nom: 'check-circle', couleur: p.succes };
  }
}

/**
 * La semaine qu'ouvre une notification (NOT-001 CA1) ; un planning à décider, une escalade ou
 * une alerte de DM se traitent au portail : la notification se marque lue, sans écran.
 */
export function semaineDeNotification(n: Notification): string | undefined {
  const auPortail = [
    'planning_soumis',
    'escalade',
    'plannings_non_approuves',
    'reouverture_demandee',
  ];
  return n.donnees.semaine && !auPortail.includes(n.type) ? n.donnees.semaine : undefined;
}

/** RPT-014, RPT-016 : une correction demandée ou une réouverture ouvre le rapport à reprendre. */
export function visiteDeNotification(n: Notification): string | undefined {
  return n.type === 'correction_demandee' || n.type === 'rapport_rouvert'
    ? n.donnees.visite
    : undefined;
}
