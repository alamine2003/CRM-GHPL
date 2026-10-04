import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { marque } from '@innov/design';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePalette } from './composants';
import { police } from './polices';

/** Onglets de la maquette ; ceux d'une version future sont affichés inactifs. */
const ONGLETS = [
  { cle: 'tournee', icone: 'home', version: null },
  { cle: 'semaine', icone: 'calendar-month', version: '0.2' },
  { cle: 'prospects', icone: 'people', version: '0.1' },
  { cle: 'chiffres', icone: 'bar-chart', version: '0.7' },
] as const;

export function BarreOnglets() {
  const { t } = useTranslation();
  const p = usePalette();
  const marges = useSafeAreaInsets();
  return (
    <View
      accessibilityRole="tablist"
      style={[
        styles.barre,
        { backgroundColor: p.surface, borderTopColor: p.ligne, paddingBottom: marges.bottom + 8 },
      ]}
    >
      {ONGLETS.map(({ cle, icone, version }) => {
        const actif = version === null;
        const couleur = actif ? marque.orange : p.texteDiscret;
        return (
          <View
            key={cle}
            accessibilityRole="tab"
            accessibilityState={{ selected: actif, disabled: !actif }}
            accessibilityHint={actif ? undefined : t('navigation.disponibleEn', { version })}
            style={[styles.onglet, !actif && { opacity: 0.55 }]}
          >
            <MaterialIcons name={icone} size={22} color={couleur} />
            <Text style={[styles.libelle, { color: couleur }]}>{t(`mobile.onglets.${cle}`)}</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  barre: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 8,
  },
  onglet: { flex: 1, alignItems: 'center', gap: 2 },
  libelle: { fontFamily: police.texteMoyen, fontSize: 11 },
});
