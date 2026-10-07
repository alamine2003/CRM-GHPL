/** Textes des écarts de conformité (VIS-010), partagés par la carte et la file « À traiter ». */
import type { Semaine } from '@innov/api-client';
import type { useTranslation } from 'react-i18next';

type Ecart = Semaine['conformite'][number]['ecarts'][number];

export function texteEcart(e: Ecart, t: ReturnType<typeof useTranslation>['t']) {
  const qui = [e.heure, e.prospect].filter(Boolean).join(' · ');
  switch (e.code) {
    case 'hors_plage':
      return t('conformite.ecarts.hors_plage', {
        qui,
        heures: [e.debut, e.fin].filter(Boolean).join(' – '),
      });
    case 'distance':
      return t('conformite.ecarts.distance', { qui, distance: e.distance_m, seuil: e.seuil_m });
    case 'duree_courte':
    case 'duree_longue':
      return t(`conformite.ecarts.${e.code}`, { qui, minutes: e.minutes, seuil: e.seuil });
    case 'imprevue':
      return t('conformite.ecarts.imprevue', { qui, justification: e.justification });
    case 'a_justifier':
      return t('conformite.ecarts.a_justifier', { qui });
    case 'sans_gps':
      return [
        t('conformite.ecarts.sans_gps', { count: e.nombre, tolerees: e.tolerees }),
        // DC-55 : dont les positions trop imprécises pour juger de la distance.
        e.imprecises ? t('conformite.ecarts.dontImprecises', { count: e.imprecises }) : '',
      ]
        .filter(Boolean)
        .join(' ');
  }
}
