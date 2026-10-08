import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { marque } from '@innov/design';
import { type Href, usePathname, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePalette } from './composants';
import { police } from './polices';

/** Onglets de l'application du délégué. */
export const ONGLETS = [
  { cle: 'tournee', icone: 'home', chemin: '/' },
  { cle: 'semaine', icone: 'calendar-month', chemin: '/semaine' },
  { cle: 'prospects', icone: 'people', chemin: '/prospects' },
  { cle: 'chiffres', icone: 'bar-chart', chemin: '/chiffres' },
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
        { backgroundColor: p.surface, borderTopColor: p.ligne, paddingBottom: marges.bottom },
      ]}
    >
      {ONGLETS.map((onglet) => {
        // Les fiches prospect et établissement appartiennent à l'onglet Prospects ; la journée
        // et le détail d'une visite, à l'onglet Semaine.
        const actif =
          chemin === onglet.chemin ||
          (onglet.cle === 'prospects' && /^\/(fiche|lieu)\//.test(chemin)) ||
          (onglet.cle === 'semaine' && /^\/(jour|visite)\//.test(chemin));
        const couleur = actif ? p.texte : p.texteDiscret;
        return (
          <Pressable
            key={onglet.cle}
            accessibilityRole="tab"
            accessibilityLabel={t(`mobile.onglets.${onglet.cle}`)}
            accessibilityState={{ selected: actif }}
            onPress={() => chemin !== onglet.chemin && routeur.replace(onglet.chemin as Href)}
            style={styles.onglet}
          >
            <View style={[styles.repere, actif && { backgroundColor: marque.orange }]} />
            <MaterialIcons name={onglet.icone} size={22} color={couleur} />
            <Text style={[styles.libelle, { color: couleur }]}>
              {t(`mobile.onglets.${onglet.cle}`)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  barre: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth },
  // Zone tactile de 56 px ; l'onglet actif porte un repère orange de 2 px en haut.
  onglet: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2, minHeight: 56 },
  repere: { position: 'absolute', top: 0, left: '25%', right: '25%', height: 2 },
  libelle: { fontFamily: police.texteMoyen, fontSize: 11.5 },
});
