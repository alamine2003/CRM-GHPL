import { marque } from '@innov/design';
import { avancement } from '@innov/domaine';
import type { Langue } from '@innov/i18n';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import { Alerte, Carte, Texte, usePalette } from '../src/composants';
import { Ecran } from '../src/Ecran';
import { MesProduits } from '../src/MesProduits';
import { MonPoste } from '../src/MonPoste';
import { police } from '../src/polices';
import { useSession } from '../src/session';
import { VERSION_APP } from '../src/version';

/** Tournée du délégué connecté. Les visites arrivent au cycle 0.4 (prd.md §23). */
export default function Accueil() {
  const { t, i18n } = useTranslation();
  const p = usePalette();
  const { etat } = useSession();
  const langue = i18n.language as Langue;
  const connecte = etat.statut === 'connecte' ? etat : null;
  const a = avancement(VERSION_APP === 'inconnue' ? '0.0.1' : VERSION_APP);
  const date = new Intl.DateTimeFormat(langue, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: connecte?.utilisateur.pays_principal?.fuseau,
  }).format(new Date());
  const nomPays = connecte?.perimetre.pays_actif?.nom ?? t('session.siege');
  const roles = connecte?.perimetre.roles ?? [];

  return (
    <Ecran
      surTitre={`${date.charAt(0).toUpperCase() + date.slice(1)} · ${nomPays}`}
      titre={t('session.bonjour', { prenom: connecte?.utilisateur.prenom ?? '' })}
      enTete={
        <>
          {roles.length > 0 && (
            <View style={styles.pastilles}>
              {roles.map((role) => (
                <Text key={role} style={styles.pastille}>
                  {t(`roles.${role}`)}
                </Text>
              ))}
            </View>
          )}
          <View style={styles.progression}>
            <Text style={styles.progressionTexte}>
              {t('commun.versionCourte', { version: a.version })}
            </Text>
            <View style={styles.piste}>
              <View
                style={[styles.barre, { width: `${Math.max(4, (a.livrees / a.total) * 100)}%` }]}
              />
            </View>
            <Text style={styles.progressionTexte}>
              {a.stable ? t('feuilleRoute.stable') : t(`feuilleRoute.cycles.${a.codeCycle}`)}
            </Text>
          </View>
        </>
      }
    >
      {roles.length === 0 && <Alerte type="info">{t('roles.aucun')}</Alerte>}
      <MonPoste />
      <MesProduits />
      <Carte style={{ backgroundColor: p.orangeDoux, borderColor: marque.orange }}>
        <Texte variante="fort">{t('mobile.onglets.tournee')}</Texte>
        <Texte variante="discret" style={{ marginTop: 4 }}>
          {t('mobile.prochainement')}
        </Texte>
      </Carte>
    </Ecran>
  );
}

const styles = StyleSheet.create({
  progression: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14 },
  progressionTexte: { color: '#DCE3F5', fontFamily: police.texteMoyen, fontSize: 12 },
  piste: {
    flex: 1,
    height: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,.2)',
    overflow: 'hidden',
  },
  barre: { height: '100%', borderRadius: 999, backgroundColor: marque.orange },
  pastilles: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  pastille: {
    color: '#FFFFFF',
    fontFamily: police.texteMoyen,
    fontSize: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,.14)',
  },
});
