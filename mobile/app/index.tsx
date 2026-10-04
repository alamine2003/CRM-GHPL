import { marque, zoneTactileMin } from '@innov/design';
import { avancement } from '@innov/domaine';
import { LANGUES, type Langue } from '@innov/i18n';
import { Redirect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BarreOnglets } from '../src/BarreOnglets';
import { Alerte, Bouton, Carte, Ligne, Texte, usePalette } from '../src/composants';
import { police } from '../src/polices';
import { useSession } from '../src/session';
import { VERSION_APP } from '../src/version';

/** Accueil du délégué connecté. La tournée arrive au cycle 0.4 (prd.md §23). */
export default function Accueil() {
  const { t, i18n } = useTranslation();
  const p = usePalette();
  const marges = useSafeAreaInsets();
  const { etat, deconnexion } = useSession();
  const langue = i18n.language as Langue;

  if (etat.statut === 'chargement') {
    return (
      <View style={[styles.centre, { backgroundColor: marque.bleuMarine }]}>
        <ActivityIndicator accessibilityLabel={t('session.chargement')} color="#FFFFFF" />
      </View>
    );
  }
  if (etat.statut === 'anonyme') return <Redirect href="/connexion" />;
  const { utilisateur, perimetre } = etat;
  const roles = perimetre.roles.map((role) => t(`roles.${role}`)).join(', ');
  const a = avancement(VERSION_APP === 'inconnue' ? '0.0.1' : VERSION_APP);
  const date = new Intl.DateTimeFormat(langue, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: utilisateur.pays_principal?.fuseau,
  }).format(new Date());
  const nomPays = perimetre.pays_actif?.nom ?? t('session.siege');

  return (
    <View style={{ flex: 1, backgroundColor: p.fond }}>
      <View style={[styles.entete, { paddingTop: marges.top + 18 }]}>
        <Text style={styles.date}>
          {date.charAt(0).toUpperCase() + date.slice(1)} · {nomPays}
        </Text>
        <Text accessibilityRole="header" style={styles.bonjour}>
          {t('session.bonjour', { prenom: utilisateur.prenom })}
        </Text>
        <View style={styles.progression}>
          <Text style={styles.progressionTexte}>v{a.version}</Text>
          <View style={styles.piste}>
            <View
              style={[styles.barre, { width: `${Math.max(4, (a.livrees / a.total) * 100)}%` }]}
            />
          </View>
          <Text style={styles.progressionTexte}>
            {a.stable ? t('feuilleRoute.stable') : t(`feuilleRoute.cycles.${a.codeCycle}`)}
          </Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.contenu}>
        {perimetre.roles.length === 0 && <Alerte type="info">{t('roles.aucun')}</Alerte>}
        <Carte style={{ backgroundColor: p.orangeDoux, borderColor: marque.orange }}>
          <Texte variante="fort">{t('mobile.onglets.tournee')}</Texte>
          <Texte variante="discret" style={{ marginTop: 4 }}>
            {t('mobile.prochainement')}
          </Texte>
        </Carte>

        <Carte>
          <Texte variante="sousTitre" style={{ marginBottom: 4 }}>
            {t('profil.titre')}
          </Texte>
          <Ligne libelle={t('profil.identifiant')} valeur={utilisateur.identifiant} />
          <Ligne libelle={t('roles.titre')} valeur={roles || '—'} />
          <Ligne libelle={t('profil.perimetre')} valeur={nomPays} />
          <Ligne libelle={t('accueil.versionClient')} valeur={VERSION_APP} derniere />
        </Carte>

        <Carte>
          <Texte variante="libelle" style={{ marginBottom: 10 }}>
            {t('commun.langue')}
          </Texte>
          <View style={styles.langues}>
            {LANGUES.map((code) => {
              const actif = code === langue;
              return (
                <Pressable
                  key={code}
                  accessibilityRole="button"
                  accessibilityState={{ selected: actif }}
                  onPress={() => void i18n.changeLanguage(code)}
                  style={[
                    styles.langue,
                    { borderColor: actif ? marque.bleuMarine : p.ligne },
                    actif && { backgroundColor: marque.bleuMarine },
                  ]}
                >
                  <Text
                    style={{ color: actif ? '#FFFFFF' : p.texte, fontFamily: police.texteFort }}
                  >
                    {t(`commun.langues.${code}`)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Carte>

        <Bouton libelle={t('session.deconnexion')} secondaire onPress={() => void deconnexion()} />
      </ScrollView>
      <BarreOnglets />
    </View>
  );
}

const styles = StyleSheet.create({
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  entete: { backgroundColor: marque.bleuMarine, paddingHorizontal: 20, paddingBottom: 18 },
  date: { color: '#B9C4E8', fontFamily: police.texte, fontSize: 13 },
  bonjour: { color: '#FFFFFF', fontFamily: police.titreFort, fontSize: 24, marginTop: 2 },
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
  contenu: { padding: 16, gap: 12, paddingBottom: 24 },
  langues: { flexDirection: 'row', gap: 8 },
  langue: {
    minHeight: zoneTactileMin,
    paddingHorizontal: 18,
    borderRadius: 999,
    borderWidth: 1,
    justifyContent: 'center',
  },
});
