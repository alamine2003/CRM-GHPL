import { marque, paletteClaire, paletteSombre, zoneTactileMin } from '@innov/design';
import { LANGUES, type Langue } from '@innov/i18n';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, useColorScheme, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { VERSION_APP } from '../src/version';

/** Premier écran de l'application délégué (version 0.0.1). */
export default function Accueil() {
  const { t, i18n } = useTranslation();
  const p = useColorScheme() === 'dark' ? paletteSombre : paletteClaire;
  const langue = i18n.language as Langue;

  return (
    <SafeAreaView style={[styles.ecran, { backgroundColor: p.fond }]} edges={['bottom']}>
      <View style={styles.entete}>
        <Text style={styles.produit}>{t('commun.produit')}</Text>
        <Text style={styles.sousTitre}>{t('commun.sousTitre')}</Text>
      </View>
      <View style={styles.contenu}>
        <Text accessibilityRole="header" style={[styles.titre, { color: p.texte }]}>
          {t('accueil.titre')}
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
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  ecran: { flex: 1 },
  entete: {
    backgroundColor: marque.bleuMarine,
    paddingTop: 56,
    paddingBottom: 20,
    paddingHorizontal: 20,
  },
  produit: { color: '#FFFFFF', fontSize: 22, fontWeight: '800' },
  sousTitre: { color: '#B9C4E8', fontSize: 13, marginTop: 2 },
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
