/**
 * RPT-006 CA1 : la prochaine action notée à la dernière visite du même délégué chez ce
 * prospect, rappelée avant et pendant la visite suivante (détail de la visite, rapport).
 */
import type { ActionPrecedente as Action, Preparation } from '@innov/api-client';
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

/**
 * DC-47 (engagement 5) : « Préparer ma visite », lisible en 10 secondes. Le dernier retour du
 * prescripteur sur chaque produit et les échantillons déjà remis, tirés de ses propres rapports.
 */
export function PreparerVisite({ preparation }: { preparation: Preparation | null | undefined }) {
  const { t, i18n } = useTranslation();
  if (!preparation) return null;
  const date = (iso: string) =>
    new Intl.DateTimeFormat(i18n.language, {
      day: 'numeric',
      month: 'short',
      timeZone: 'UTC',
    }).format(new Date(`${iso}T12:00:00Z`));
  return (
    <Carte>
      <View style={{ gap: 4 }}>
        <Texte variante="sousTitre">{t('preparer.titre')}</Texte>
        <Texte variante="discret">
          {t('preparer.visites', { count: preparation.visites, date: date(preparation.derniere) })}
        </Texte>
        {preparation.retours.length > 0 && (
          <>
            <Texte variante="libelle">{t('preparer.retours')}</Texte>
            {preparation.retours.map((r) => (
              <Texte key={r.libelle}>
                {`${r.libelle} — ${t(`rapport.retours.${r.retour}`)}`}
                <Texte variante="discret">{` · ${date(r.date)}`}</Texte>
              </Texte>
            ))}
          </>
        )}
        {preparation.echantillons.length > 0 && (
          <>
            <Texte variante="libelle">{t('preparer.echantillons')}</Texte>
            <Texte>
              {preparation.echantillons.map((e) => `${e.libelle} × ${e.quantite}`).join(' · ')}
            </Texte>
          </>
        )}
      </View>
    </Carte>
  );
}
