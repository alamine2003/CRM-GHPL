import { marque, paletteClaire, paletteSombre, zoneTactileMin } from '@innov/design';
import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  useColorScheme,
  View,
} from 'react-native';

export function usePalette() {
  return useColorScheme() === 'dark' ? paletteSombre : paletteClaire;
}

export function Entete({ sousTitre }: { sousTitre: string }) {
  return (
    <View style={styles.entete}>
      <Text style={styles.produit}>INNOV CRM</Text>
      <Text style={styles.sousTitre}>{sousTitre}</Text>
    </View>
  );
}

export function Champ({ libelle, ...props }: TextInputProps & { libelle: string }) {
  const p = usePalette();
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: p.texteSecondaire, fontWeight: '600' }}>{libelle}</Text>
      <TextInput
        accessibilityLabel={libelle}
        placeholderTextColor={p.texteDiscret}
        style={[styles.champ, { borderColor: p.ligne, color: p.texte, backgroundColor: p.surface }]}
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
      accessibilityState={{ busy: chargement, disabled: chargement }}
      disabled={chargement}
      onPress={onPress}
      style={[
        styles.bouton,
        secondaire
          ? { borderWidth: 1, borderColor: p.ligne }
          : { backgroundColor: marque.orange, opacity: chargement ? 0.7 : 1 },
      ]}
    >
      {chargement ? (
        <ActivityIndicator color="#FFFFFF" />
      ) : (
        <Text style={{ color: secondaire ? p.texte : '#FFFFFF', fontWeight: '700', fontSize: 16 }}>
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
  type: 'erreur' | 'info' | 'succes';
}) {
  const p = usePalette();
  const couleurs = {
    erreur: [p.erreurDoux, p.erreur],
    info: [p.infoDoux, p.info],
    succes: [p.succesDoux, p.succes],
  }[type];
  return (
    <View
      accessibilityRole={type === 'erreur' ? 'alert' : undefined}
      style={[styles.alerte, { backgroundColor: couleurs[0], borderColor: couleurs[1] }]}
    >
      <Text style={{ color: p.texte }}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  entete: {
    backgroundColor: marque.bleuMarine,
    paddingTop: 56,
    paddingBottom: 20,
    paddingHorizontal: 20,
  },
  produit: { color: '#FFFFFF', fontSize: 22, fontWeight: '800' },
  sousTitre: { color: '#B9C4E8', fontSize: 13, marginTop: 2 },
  champ: {
    minHeight: zoneTactileMin,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 16,
  },
  bouton: {
    minHeight: zoneTactileMin + 4,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  alerte: { borderWidth: 1, borderRadius: 10, padding: 12 },
});
