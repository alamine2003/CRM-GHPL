import { type Href, usePathname, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icone, Logo, type NomIcone, usePalette } from './composants';
import { police } from './polices';
import { surMarine } from './theme';

/** Onglets de l'application du délégué. */
export const ONGLETS: readonly { cle: string; icone: NomIcone; chemin: string }[] = [
  { cle: 'tournee', icone: 'home', chemin: '/' },
  { cle: 'semaine', icone: 'calendar', chemin: '/semaine' },
  { cle: 'prospects', icone: 'users', chemin: '/prospects' },
  { cle: 'chiffres', icone: 'bar-chart-2', chemin: '/chiffres' },
  { cle: 'profil', icone: 'user', chemin: '/profil' },
] as const;

/** L'onglet d'un écran : les fiches vont avec Prospects ; la journée et la visite, avec Semaine. */
function estActif(cle: string, cheminOnglet: string, chemin: string) {
  return (
    chemin === cheminOnglet ||
    (cle === 'prospects' && /^\/(fiche|lieu)\//.test(chemin)) ||
    (cle === 'semaine' && /^\/(jour|visite|ecart|versions)\//.test(chemin)) ||
    (cle === 'profil' && chemin === '/notifications')
  );
}

function useNavigation() {
  const chemin = usePathname();
  const routeur = useRouter();
  return {
    chemin,
    aller: (cible: string) => chemin !== cible && routeur.replace(cible as Href),
  };
}

/** Téléphone : cinq onglets en bas, repère orange de 3 px au-dessus de l'onglet actif (.tabs). */
export function BarreOnglets() {
  const { t } = useTranslation();
  const p = usePalette();
  const marges = useSafeAreaInsets();
  const { chemin, aller } = useNavigation();
  return (
    <View
      accessibilityRole="tablist"
      style={[
        styles.barre,
        {
          backgroundColor: p.surface,
          borderTopColor: p.ligne,
          paddingBottom: Math.max(18, marges.bottom),
        },
      ]}
    >
      {ONGLETS.map((onglet) => {
        const actif = estActif(onglet.cle, onglet.chemin, chemin);
        const couleur = actif ? p.texte : p.texteDiscret;
        return (
          <Pressable
            key={onglet.cle}
            accessibilityRole="tab"
            accessibilityLabel={t(`mobile.onglets.${onglet.cle}`)}
            accessibilityState={{ selected: actif }}
            onPress={() => aller(onglet.chemin)}
            style={styles.onglet}
          >
            {actif && <View style={[styles.repere, { backgroundColor: p.orange }]} />}
            <Icone nom={onglet.icone} couleur={couleur} />
            <Text style={[styles.libelle, { color: couleur }]}>
              {t(`mobile.onglets.${onglet.cle}`)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Tablette : barre latérale marine de 92 px, la marque en tête, le profil en bas (.rail). */
export function Rail() {
  const { t } = useTranslation();
  const p = usePalette();
  const marges = useSafeAreaInsets();
  const { chemin, aller } = useNavigation();
  const lien = (onglet: (typeof ONGLETS)[number]) => {
    const actif = estActif(onglet.cle, onglet.chemin, chemin);
    return (
      <Pressable
        key={onglet.cle}
        accessibilityRole="tab"
        accessibilityLabel={t(`mobile.onglets.${onglet.cle}`)}
        accessibilityState={{ selected: actif }}
        onPress={() => aller(onglet.chemin)}
        style={[styles.entree, actif && { backgroundColor: surMarine.actif }]}
      >
        {actif && <View style={[styles.repereRail, { backgroundColor: p.orange }]} />}
        <Icone nom={onglet.icone} couleur={actif ? '#FFFFFF' : surMarine.discret} />
        <Text style={[styles.libelle, { color: actif ? '#FFFFFF' : surMarine.discret }]}>
          {t(`mobile.onglets.${onglet.cle}`)}
        </Text>
      </Pressable>
    );
  };
  return (
    <View
      accessibilityRole="tablist"
      style={[
        styles.rail,
        {
          backgroundColor: p.rail,
          paddingTop: 20 + marges.top,
          paddingBottom: 20 + marges.bottom,
          paddingLeft: marges.left,
          width: 92 + marges.left,
        },
      ]}
    >
      <View style={styles.marque}>
        <Logo taille={40} surMarine />
      </View>
      {ONGLETS.filter((o) => o.cle !== 'profil').map(lien)}
      <View style={{ flex: 1 }} />
      {ONGLETS.filter((o) => o.cle === 'profil').map(lien)}
    </View>
  );
}

const styles = StyleSheet.create({
  barre: { flexDirection: 'row', borderTopWidth: 1 },
  onglet: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2, minHeight: 56 },
  repere: { position: 'absolute', top: -1, left: '24%', right: '24%', height: 3 },
  libelle: { fontFamily: police.texteMoyen, fontSize: 11.5, lineHeight: 14 },
  rail: { alignItems: 'center', gap: 6 },
  marque: { marginBottom: 18 },
  entree: {
    width: 76,
    minHeight: 60,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  repereRail: { position: 'absolute', left: -8, top: 14, bottom: 14, width: 3 },
});
