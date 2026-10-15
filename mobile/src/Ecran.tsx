import { Redirect, useRouter } from 'expo-router';
import type { ReactNode, Ref } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BarreOnglets, Rail } from './BarreOnglets';
import { Icone, Logo, usePalette } from './composants';
import { FiletDemonstration, MentionDemonstration } from './Demonstration';
import { useTablette } from './disposition';
import { police } from './polices';
import { useSession } from './session';
import { LigneSynchro } from './Synchronisation';
import { RAYON } from './theme';

/**
 * Gabarit d'un écran connecté, selon la maquette 1.4.0.
 *
 * Téléphone : la marque « CRM » et le logo GH en tête, le titre et son contexte, une action à
 * droite (cloche, statut) ; le contenu défilant ; une barre d'actions collée en bas si l'écran en
 * a une ; les onglets.
 * Tablette : la barre latérale marine, un en-tête de 68 px, puis un ou deux volets (liste à
 * gauche sur 430 px, détail à droite).
 */
export function Ecran({
  titre,
  surTitre,
  action,
  retour,
  surRetour,
  fermer,
  defilement,
  onglets = true,
  pied,
  gauche,
  droite,
  largeurDroite = 440,
  largeurGauche = 430,
  enteteTablette,
  children,
}: {
  titre: string;
  /** Contexte discret sous le titre (date, pays, personne). */
  surTitre?: string;
  /** À droite du titre (cloche, statut). */
  action?: ReactNode;
  /** Écran de détail : flèche de retour avant le titre. */
  retour?: boolean;
  /** Retour vers un état de l'écran plutôt qu'à l'écran précédent (sous-écran). */
  surRetour?: () => void;
  /** Formulaire : croix de fermeture avant le titre, sans onglets. */
  fermer?: boolean;
  /** Pour remonter en haut de page après une action (soumission du planning). */
  defilement?: Ref<ScrollView>;
  /** Formulaires et écrans plein cadre : pas d'onglets (téléphone). */
  onglets?: boolean;
  /** Barre d'actions collée en bas (.stick). */
  pied?: ReactNode;
  /** Tablette : volet de gauche (liste) ; le contenu va dans le volet de droite. */
  gauche?: ReactNode;
  /** Tablette : volet blanc à droite, sur 440 px (programme de la Tournée avec alertes). */
  droite?: ReactNode;
  /** Largeur du volet de droite (340 pour « Avant de soumettre », 380 pour une synthèse). */
  largeurDroite?: number;
  /** Largeur du volet de gauche (400 pour la liste des versions). */
  largeurGauche?: number;
  /** Tablette : titre, contexte et actions propres à l'en-tête large. */
  enteteTablette?: { titre?: string; surTitre?: string; action?: ReactNode };
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const p = usePalette();
  const marges = useSafeAreaInsets();
  const tablette = useTablette();
  const { etat } = useSession();
  const routeur = useRouter();
  if (etat.statut === 'chargement') {
    return (
      <View style={[styles.centre, { backgroundColor: p.fond }]}>
        <ActivityIndicator accessibilityLabel={t('session.chargement')} color={p.lien} />
      </View>
    );
  }
  if (etat.statut === 'anonyme') return <Redirect href="/connexion" />;
  const revenir = () =>
    surRetour ? surRetour() : routeur.canGoBack() ? routeur.back() : routeur.replace('/');
  const boutonRetour = (retour || fermer) && (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={fermer ? t('commun.fermer') : t('commun.retour')}
      hitSlop={8}
      onPress={revenir}
      style={
        tablette
          ? [styles.retourTablette, { borderColor: p.ligne, backgroundColor: p.surface }]
          : styles.retour
      }
    >
      <Icone nom={fermer ? 'x' : 'arrow-left'} />
    </Pressable>
  );
  const piedColle = pied && (
    <View
      style={[
        styles.pied,
        {
          backgroundColor: p.surface,
          borderTopColor: p.ligne,
          paddingBottom: (onglets && !tablette ? 0 : marges.bottom) + 16,
        },
      ]}
    >
      {pied}
    </View>
  );

  if (tablette) {
    const titreLarge = enteteTablette?.titre ?? titre;
    const contexte = enteteTablette?.surTitre ?? surTitre;
    return (
      <View style={[styles.rangee, { backgroundColor: p.fond }]}>
        <Rail />
        <View style={{ flex: 1, minWidth: 0 }}>
          <View
            style={[
              styles.enteteTablette,
              {
                backgroundColor: p.surface,
                borderBottomColor: p.ligne,
                paddingTop: marges.top,
                height: 68 + marges.top,
                paddingRight: 28 + marges.right,
              },
            ]}
          >
            {boutonRetour}
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text
                accessibilityRole="header"
                numberOfLines={1}
                style={[styles.titre, { color: p.texte }]}
              >
                {titreLarge}
              </Text>
              {contexte ? (
                <Text numberOfLines={1} style={[styles.contexte, { color: p.texteSecondaire }]}>
                  {contexte}
                </Text>
              ) : null}
            </View>
            <MentionDemonstration />
            {enteteTablette?.action ?? action}
          </View>
          <LigneSynchro />
          <View style={styles.rangee}>
            {gauche ? (
              <ScrollView
                style={[
                  styles.voletGauche,
                  { width: largeurGauche, backgroundColor: p.surface, borderRightColor: p.ligne },
                ]}
              >
                {gauche}
              </ScrollView>
            ) : null}
            <View style={{ flex: 1, minWidth: 0 }}>
              <ScrollView ref={defilement} contentContainerStyle={styles.voletDroit}>
                {children}
              </ScrollView>
              {piedColle}
            </View>
            {droite ? (
              <ScrollView
                style={[
                  styles.voletDroite,
                  { width: largeurDroite, backgroundColor: p.surface, borderLeftColor: p.ligne },
                ]}
                contentContainerStyle={{ flexGrow: 1 }}
              >
                {droite}
              </ScrollView>
            ) : null}
          </View>
        </View>
        <FiletDemonstration />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: p.fond }}>
      <View
        style={[
          styles.entete,
          { paddingTop: marges.top + 10, backgroundColor: p.surface, borderBottomColor: p.ligne },
        ]}
      >
        <View style={styles.marque}>
          <Logo />
          <MentionDemonstration />
        </View>
        <View style={styles.barre}>
          {boutonRetour}
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text
              accessibilityRole="header"
              numberOfLines={1}
              style={[styles.titre, { color: p.texte }]}
            >
              {titre}
            </Text>
            {surTitre ? (
              <Text numberOfLines={1} style={[styles.sousTitre, { color: p.texteSecondaire }]}>
                {surTitre}
              </Text>
            ) : null}
          </View>
          {action}
        </View>
      </View>
      <LigneSynchro />
      <ScrollView ref={defilement} contentContainerStyle={styles.contenu}>
        {children}
      </ScrollView>
      {piedColle}
      {onglets && !fermer ? <BarreOnglets /> : null}
      <FiletDemonstration />
    </View>
  );
}

const styles = StyleSheet.create({
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  rangee: { flex: 1, flexDirection: 'row' },
  entete: { borderBottomWidth: 1, paddingHorizontal: 16, paddingBottom: 12 },
  marque: { flexDirection: 'row', alignItems: 'center', gap: 12, height: 24, marginBottom: 12 },
  barre: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 46 },
  retour: { width: 40, height: 40, marginLeft: -8, alignItems: 'center', justifyContent: 'center' },
  retourTablette: {
    width: 44,
    height: 44,
    borderRadius: RAYON,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titre: { fontFamily: police.titre, fontSize: 20, lineHeight: 28, letterSpacing: -0.2 },
  sousTitre: { fontFamily: police.texte, fontSize: 13, lineHeight: 18 },
  contexte: { fontFamily: police.texteMoyen, fontSize: 12.5, lineHeight: 18 },
  contenu: { padding: 16, gap: 16, paddingBottom: 24 },
  pied: { borderTopWidth: 1, paddingTop: 12, paddingHorizontal: 16, flexDirection: 'row', gap: 12 },
  enteteTablette: {
    borderBottomWidth: 1,
    paddingLeft: 28,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  voletGauche: { width: 430, flexGrow: 0, borderRightWidth: 1 },
  voletDroite: { width: 440, flexGrow: 0, borderLeftWidth: 1 },
  voletDroit: { paddingVertical: 24, paddingHorizontal: 28, gap: 18 },
});
