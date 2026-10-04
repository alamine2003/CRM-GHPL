import { marque } from '@innov/design';
import { Redirect } from 'expo-router';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BarreOnglets } from './BarreOnglets';
import { usePalette } from './composants';
import { police } from './polices';
import { useSession } from './session';

/** Gabarit d'un écran connecté : en-tête bleu marine, contenu défilant, onglets. */
export function Ecran({
  titre,
  surTitre,
  enTete,
  children,
}: {
  titre: string;
  surTitre?: string;
  enTete?: ReactNode;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const p = usePalette();
  const marges = useSafeAreaInsets();
  const { etat } = useSession();
  if (etat.statut === 'chargement') {
    return (
      <View style={[styles.centre, { backgroundColor: marque.bleuMarine }]}>
        <ActivityIndicator accessibilityLabel={t('session.chargement')} color="#FFFFFF" />
      </View>
    );
  }
  if (etat.statut === 'anonyme') return <Redirect href="/connexion" />;
  return (
    <View style={{ flex: 1, backgroundColor: p.fond }}>
      <View style={[styles.entete, { paddingTop: marges.top + 18 }]}>
        {surTitre && <Text style={styles.surTitre}>{surTitre}</Text>}
        <Text accessibilityRole="header" style={styles.titre}>
          {titre}
        </Text>
        {enTete}
      </View>
      <ScrollView contentContainerStyle={styles.contenu}>{children}</ScrollView>
      <BarreOnglets />
    </View>
  );
}

const styles = StyleSheet.create({
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  entete: {
    backgroundColor: marque.bleuMarine,
    paddingHorizontal: 20,
    paddingBottom: 18,
    borderBottomLeftRadius: 22,
    borderBottomRightRadius: 22,
  },
  surTitre: { color: '#B9C4E8', fontFamily: police.texte, fontSize: 13 },
  titre: { color: '#FFFFFF', fontFamily: police.titreFort, fontSize: 24, marginTop: 2 },
  contenu: { padding: 16, gap: 12, paddingBottom: 24 },
});
