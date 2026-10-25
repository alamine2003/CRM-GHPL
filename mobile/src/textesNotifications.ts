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
  // « vendredi 9 octobre » ; une période dans un seul mois : « du 19 au 23 octobre ».
  const date = (iso: string, options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(langue, options).format(new Date(`${iso}T12:00:00`));
  const jour = (iso?: string) =>
    iso ? date(iso, { weekday: 'long', day: 'numeric', month: 'long' }) : '';
  const { debut, fin } = n.donnees;
  const memeMois = !!debut && !!fin && debut.slice(0, 7) === fin.slice(0, 7);
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
    // 1.8.0 : objectif de ventes en retard (reçu par le DM et l'administrateur pays).
    reseau: n.donnees.reseau,
    mois: n.donnees.mois ? date(`${n.donnees.mois}-15`, { month: 'long', year: 'numeric' }) : '',
    taux:
      n.donnees.taux === undefined || n.donnees.taux === null
        ? ''
        : new Intl.NumberFormat(langue, { maximumFractionDigits: 1 }).format(n.donnees.taux),
    debut: debut
      ? date(debut, memeMois ? { day: 'numeric' } : { day: 'numeric', month: 'long' })
      : '',
    fin: fin ? date(fin, { day: 'numeric', month: 'long' }) : '',
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
    case 'rappel_rapport':
      return { nom: 'schedule', couleur: p.attention };
    case 'escalade':
      return { nom: 'notification-important', couleur: p.erreur };
    case 'plannings_non_approuves':
      return { nom: 'event-busy', couleur: p.attention };
    case 'objectif_ventes_retard':
      return { nom: 'trending-down', couleur: p.attention };
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
 * Couleur de la pastille (maquette 1.4.9) : orange quand on vous demande de reprendre quelque
 * chose, vert pour une bonne nouvelle ou un rappel du jour, bleu pour une information, ambre
 * pour une échéance qui approche, rouge pour une escalade.
 */
export function couleurNotification(n: Notification, p: Palette): string {
  switch (n.type) {
    case 'revision_demandee':
    case 'correction_demandee':
    case 'rapport_rouvert':
      return p.orange;
    case 'remplacement_attribue':
    case 'planning_soumis':
    case 'redaction_rouverte':
    case 'rapports_soumis':
    case 'rapport_corrige':
      return p.info;
    case 'rappel_planning':
    case 'plannings_non_approuves':
    case 'reouverture_demandee':
    case 'rapport_en_retard':
    case 'objectif_ventes_retard':
      return p.attention;
    case 'escalade':
    case 'journee_escaladee':
      return p.erreur;
    default:
      return p.succes;
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
