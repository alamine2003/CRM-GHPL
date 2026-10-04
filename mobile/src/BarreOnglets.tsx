import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { marque } from '@innov/design';
import { type Href, usePathname, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePalette } from './composants';
import { police } from './polices';

/** Onglets de la maquette ; ceux d'une version future mènent à un écran « bientôt ». */
export const ONGLETS = [
  { cle: 'tournee', icone: 'home', chemin: '/' },
  { cle: 'semaine', icone: 'calendar-month', chemin: '/semaine', version: '0.2.1' },
  { cle: 'prospects', icone: 'people', chemin: '/prospects' },
  { cle: 'chiffres', icone: 'bar-chart', chemin: '/chiffres', version: '0.7.1' },
  { cle: 'profil', icone: 'person', chemin: '/profil' },
] as const;

export function BarreOnglets() {
  const { t } = useTranslation();
  const p = usePalette();
  const marges = useSafeAreaInsets();
  const chemin = usePathname();
  const routeur = useRouter();
  return (
    <View
      accessibilityRole="tablist"
      style={[
        styles.barre,
        { backgroundColor: p.surface, borderTopColor: p.ligne, paddingBottom: marges.bottom + 8 },
      ]}
    >
      {ONGLETS.map((onglet) => {
        const actif = chemin === onglet.chemin;
        const couleur = actif ? marque.orange : p.texteDiscret;
        const futur = 'version' in onglet;
        return (
          <Pressable
            key={onglet.cle}
            accessibilityRole="tab"
            accessibilityLabel={t(`mobile.onglets.${onglet.cle}`)}
            accessibilityState={{ selected: actif }}
            onPress={() => !actif && routeur.replace(onglet.chemin as Href)}
            style={styles.onglet}
          >
            <View style={[styles.pastille, actif && { backgroundColor: p.orangeDoux }]}>
              <MaterialIcons name={onglet.icone} size={22} color={couleur} />
            </View>
            <Text style={[styles.libelle, { color: couleur }, futur && !actif && { opacity: 0.7 }]}>
              {t(`mobile.onglets.${onglet.cle}`)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  barre: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 6 },
  onglet: { flex: 1, alignItems: 'center', gap: 2, minHeight: 48 },
  pastille: { paddingHorizontal: 14, paddingVertical: 3, borderRadius: 999 },
  libelle: { fontFamily: police.texteMoyen, fontSize: 11 },
});
