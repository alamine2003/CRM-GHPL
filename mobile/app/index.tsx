import { marque, zoneTactileMin } from '@innov/design';
import { LANGUES, type Langue } from '@innov/i18n';
import { Redirect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Bouton, Entete, usePalette } from '../src/composants';
import { useSession } from '../src/session';
import { VERSION_APP } from '../src/version';

/** Accueil du délégué connecté (version 0.0.3). */
export default function Accueil() {
  const { t, i18n } = useTranslation();
  const p = usePalette();
  const { etat, deconnexion } = useSession();
  const langue = i18n.language as Langue;

  if (etat.statut === 'chargement') {
    return (
      <View style={[styles.centre, { backgroundColor: p.fond }]}>
        <ActivityIndicator accessibilityLabel={t('session.chargement')} color={marque.bleuMarine} />
      </View>
    );
  }
  if (etat.statut === 'anonyme') return <Redirect href="/connexion" />;
  const { utilisateur } = etat;

  return (
    <SafeAreaView style={[styles.ecran, { backgroundColor: p.fond }]} edges={['bottom']}>
      <Entete sousTitre={utilisateur.pays_principal?.nom ?? t('session.siege')} />
      <View style={styles.contenu}>
        <Text accessibilityRole="header" style={[styles.titre, { color: p.texte }]}>
          {t('session.bonjour', { prenom: utilisateur.prenom })}
        </Text>
        <Text style={[styles.texte, { color: p.texteSecondaire }]}>
          {t('accueil.introduction')}
        </Text>

        <View style={[styles.carte, { backgroundColor: p.surface, borderColor: p.ligne }]}>
          <Text style={{ color: p.texteSecondaire }}>{t('accueil.versionClient')}</Text>
          <Text style={[styles.valeur, { color: p.texte }]}>{VERSION_APP}</Text>
        </View>

        <Text style={[styles.libelle, { color: p.texteSecondaire }]}>{t('commun.langue')}</Text>
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
                <Text style={{ color: actif ? '#FFFFFF' : p.texte, fontWeight: '600' }}>
                  {t(`commun.langues.${code}`)}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <View style={{ marginTop: 12 }}>
          <Bouton
            libelle={t('session.deconnexion')}
            secondaire
            onPress={() => void deconnexion()}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  ecran: { flex: 1 },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  contenu: { padding: 20, gap: 12 },
  titre: { fontSize: 26, fontWeight: '700' },
  texte: { fontSize: 15, lineHeight: 21 },
  carte: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  valeur: { fontWeight: '700' },
  libelle: { marginTop: 8, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5 },
  langues: { flexDirection: 'row', gap: 8 },
  langue: {
    minHeight: zoneTactileMin,
    paddingHorizontal: 16,
    borderRadius: 999,
    borderWidth: 1,
    justifyContent: 'center',
  },
});
