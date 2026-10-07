/**
 * RPT-006 CA1 : la prochaine action notée à la dernière visite du même délégué chez ce
 * prospect, rappelée avant et pendant la visite suivante (détail de la visite, rapport).
 */
import type { ActionPrecedente as Action } from '@innov/api-client';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Carte, Texte, usePalette } from './composants';

export function ActionPrecedente({ action }: { action: Action | null | undefined }) {
  const { t, i18n } = useTranslation();
  const p = usePalette();
  if (!action) return null;
  const date = (iso: string) =>
    new Intl.DateTimeFormat(i18n.language, {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      timeZone: 'UTC',
    }).format(new Date(`${iso}T12:00:00Z`));
  const details = [
    action.echeance ? t('rapport.echeanceLe', { date: date(action.echeance) }) : '',
    action.visite_proposee ? t('rapport.visiteProposeeLue') : '',
  ].filter(Boolean);
  return (
    <Carte style={{ borderLeftWidth: 3, borderLeftColor: p.info }}>
      <View style={{ gap: 2 }}>
        <Texte variante="libelle">
          {t('rapport.actionPrecedente', { date: date(action.date) })}
        </Texte>
        {action.type ? <Texte variante="fort">{action.type}</Texte> : null}
        {action.texte ? <Texte>{action.texte}</Texte> : null}
        {details.length > 0 && <Texte variante="discret">{details.join(' · ')}</Texte>}
      </View>
    </Carte>
  );
}
