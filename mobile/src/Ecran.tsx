import { marque } from '@innov/design';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Redirect, useRouter } from 'expo-router';
import type { ReactNode, Ref } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BarreOnglets } from './BarreOnglets';
import { FiletDemonstration, MentionDemonstration } from './Demonstration';
import { usePalette } from './composants';
import { police } from './polices';
import { useSession } from './session';
import { LigneSynchro } from './Synchronisation';

/**
 * Gabarit d'un écran connecté (docs/design.md §4) : en-tête de 56 px (titre à gauche, action à
 * droite), sous lui la ligne de synchronisation (OFF-003 CA1), contenu défilant pleine largeur,
 * onglets en bas. Aucune bannière.
 */
export function Ecran({
  titre,
  surTitre,
  action,
  retour,
  defilement,
  children,
}: {
  titre: string;
  /** Écran de détail : flèche de retour à gauche du titre (fiches prospect et établissement). */
  retour?: boolean;
  /** Contexte discret sous le titre (date, pays, personne). */
  surTitre?: string;
  action?: ReactNode;
  /** Pour remonter en haut de page après une action (soumission du planning). */
  defilement?: Ref<ScrollView>;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const p = usePalette();
  const marges = useSafeAreaInsets();
  const { etat } = useSession();
  const routeur = useRouter();
  if (etat.statut === 'chargement') {
    return (
      <View style={[styles.centre, { backgroundColor: p.fond }]}>
        <ActivityIndicator accessibilityLabel={t('session.chargement')} color={marque.bleuMarine} />
      </View>
    );
  }
  if (etat.statut === 'anonyme') return <Redirect href="/connexion" />;
  return (
    <View style={{ flex: 1, backgroundColor: p.fond }}>
      <View
        style={[
          styles.entete,
          { paddingTop: marges.top, backgroundColor: p.surface, borderBottomColor: p.ligne },
        ]}
      >
        <View style={styles.barre}>
          {retour && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('commun.retour')}
              hitSlop={8}
              onPress={() => (routeur.canGoBack() ? routeur.back() : routeur.replace('/prospects'))}
              style={styles.retour}
            >
              <MaterialIcons name="arrow-back" size={24} color={p.texte} />
            </Pressable>
          )}
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text
              accessibilityRole="header"
              numberOfLines={1}
              style={[styles.titre, { color: p.texte }]}
            >
              {titre}
            </Text>
            {surTitre && (
              <Text numberOfLines={1} style={[styles.surTitre, { color: p.texteSecondaire }]}>
                {surTitre}
              </Text>
            )}
          </View>
          <MentionDemonstration />
          {action}
        </View>
      </View>
      <LigneSynchro />
      <ScrollView ref={defilement} contentContainerStyle={styles.contenu}>
        {children}
      </ScrollView>
      <BarreOnglets />
      <FiletDemonstration />
    </View>
  );
}

const styles = StyleSheet.create({
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  entete: { borderBottomWidth: StyleSheet.hairlineWidth },
  barre: {
    minHeight: 56,
    paddingHorizontal: 16,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  retour: { width: 40, height: 40, marginLeft: -8, alignItems: 'center', justifyContent: 'center' },
  titre: { fontFamily: police.titre, fontSize: 18, lineHeight: 24 },
  surTitre: { fontFamily: police.texte, fontSize: 13, lineHeight: 18 },
  contenu: { padding: 16, gap: 16, paddingBottom: 24 },
});
