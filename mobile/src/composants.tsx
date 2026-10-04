import { marque, paletteClaire, paletteSombre, rayon, zoneTactileMin } from '@innov/design';
import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  type TextProps,
  useColorScheme,
  View,
  type ViewStyle,
} from 'react-native';
import { police } from './polices';

/** Monogramme de la marque, identique dans toutes les langues. */
const MONOGRAMME = 'IC';

export function usePalette() {
  return useColorScheme() === 'dark' ? paletteSombre : paletteClaire;
}

type Variante = 'titre' | 'sousTitre' | 'texte' | 'fort' | 'discret' | 'libelle';

/** Texte typographié selon docs/design.md (Plus Jakarta Sans pour les titres, DM Sans sinon). */
export function Texte({
  variante = 'texte',
  style,
  ...props
}: TextProps & { variante?: Variante }) {
  const p = usePalette();
  const styles: Record<Variante, object> = {
    titre: { fontFamily: police.titre, fontSize: 20, lineHeight: 28, color: p.texte },
    sousTitre: { fontFamily: police.titre, fontSize: 15, lineHeight: 22, color: p.texte },
    texte: { fontFamily: police.texte, fontSize: 15, lineHeight: 21, color: p.texte },
    fort: { fontFamily: police.texteFort, fontSize: 15, lineHeight: 21, color: p.texte },
    discret: { fontFamily: police.texte, fontSize: 13, lineHeight: 18, color: p.texteSecondaire },
    libelle: {
      fontFamily: police.texteMoyen,
      fontSize: 13,
      lineHeight: 18,
      color: p.texteSecondaire,
    },
  };
  return <Text {...props} style={[styles[variante], style]} />;
}

/** Marque « IC » : monogramme blanc sur orange plein. */
export function Logo({ taille = 32 }: { taille?: number }) {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width: taille,
        height: taille,
        borderRadius: rayon,
        backgroundColor: marque.orange,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ color: '#FFFFFF', fontFamily: police.titre, fontSize: taille * 0.42 }}>
        {MONOGRAMME}
      </Text>
    </View>
  );
}

export function Carte({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  const p = usePalette();
  return (
    <View style={[styles.carte, { backgroundColor: p.surface, borderColor: p.ligne }, style]}>
      {children}
    </View>
  );
}

export function Ligne({
  libelle,
  valeur,
  derniere,
}: {
  libelle: string;
  valeur: string;
  derniere?: boolean;
}) {
  const p = usePalette();
  return (
    <View
      style={[
        styles.ligne,
        !derniere && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: p.ligne },
      ]}
    >
      <Texte variante="discret">{libelle}</Texte>
      <Texte style={{ flexShrink: 1, textAlign: 'right', fontFamily: police.texteMoyen }}>
        {valeur}
      </Texte>
    </View>
  );
}

export function Champ({ libelle, ...props }: TextInputProps & { libelle: string }) {
  const p = usePalette();
  return (
    <View style={{ gap: 6 }}>
      <Texte variante="libelle">{libelle}</Texte>
      <TextInput
        accessibilityLabel={libelle}
        placeholderTextColor={p.texteDiscret}
        style={[
          styles.champ,
          { borderColor: p.ligne, color: p.texte, backgroundColor: p.surface2 },
        ]}
        {...props}
      />
    </View>
  );
}

export function Bouton({
  libelle,
  onPress,
  chargement,
  secondaire,
}: {
  libelle: string;
  onPress: () => void;
  chargement?: boolean;
  secondaire?: boolean;
}) {
  const p = usePalette();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={libelle}
      accessibilityState={{ busy: chargement, disabled: chargement }}
      disabled={chargement}
      onPress={onPress}
      style={({ pressed }) => [
        styles.bouton,
        secondaire
          ? { borderWidth: 1, borderColor: p.ligne, backgroundColor: p.surface }
          : { backgroundColor: marque.bleuMarine },
        (pressed || chargement) && { opacity: 0.8 },
      ]}
    >
      {chargement ? (
        <ActivityIndicator color={secondaire ? p.texte : '#FFFFFF'} />
      ) : (
        <Text
          style={{
            color: secondaire ? p.texte : '#FFFFFF',
            fontFamily: police.texteFort,
            fontSize: 15,
          }}
        >
          {libelle}
        </Text>
      )}
    </Pressable>
  );
}

export function Alerte({
  children,
  type,
}: {
  children: ReactNode;
  type: 'erreur' | 'info' | 'succes' | 'attention';
}) {
  const p = usePalette();
  const [fond, accent] = {
    erreur: [p.erreurDoux, p.erreur],
    info: [p.infoDoux, p.info],
    succes: [p.succesDoux, p.succes],
    attention: [p.attentionDoux, p.attention],
  }[type];
  return (
    <View
      accessibilityRole={type === 'erreur' || type === 'attention' ? 'alert' : undefined}
      style={[styles.alerte, { backgroundColor: fond, borderLeftColor: accent }]}
    >
      <Texte>{children}</Texte>
    </View>
  );
}

const styles = StyleSheet.create({
  carte: { borderWidth: StyleSheet.hairlineWidth, borderRadius: rayon, padding: 16 },
  ligne: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    minHeight: zoneTactileMin,
  },
  champ: {
    minHeight: zoneTactileMin + 4,
    borderWidth: 1,
    borderRadius: rayon,
    paddingHorizontal: 12,
    fontSize: 16,
    fontFamily: police.texte,
  },
  bouton: {
    minHeight: 48,
    borderRadius: rayon,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  alerte: { borderLeftWidth: 3, borderRadius: rayon, padding: 12 },
});

/** Potentiel A/B/C : la seule « couleur métier » des listes (A orange, B marine, C gris). */
export function MarquePotentiel({ valeur, libelle }: { valeur: string; libelle?: string }) {
  const p = usePalette();
  const couleur =
    valeur === 'A' ? marque.orange : valeur === 'B' ? marque.bleuMarine : p.texteSecondaire;
  return (
    <View
      accessibilityLabel={libelle}
      style={{
        width: 24,
        height: 24,
        borderRadius: 4,
        borderWidth: 1,
        borderColor: couleur,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ color: couleur, fontFamily: police.titre, fontSize: 13 }}>{valeur}</Text>
    </View>
  );
}

/** État en texte coloré (« À valider »…) à la place d'une pastille. */
export function Etiquette({
  children,
  ton = 'attention',
}: {
  children: ReactNode;
  ton?: 'attention' | 'neutre';
}) {
  const p = usePalette();
  return (
    <Text
      style={{
        fontFamily: police.texteFort,
        fontSize: 12,
        color: ton === 'attention' ? p.attention : p.texteSecondaire,
      }}
    >
      {children}
    </Text>
  );
}
