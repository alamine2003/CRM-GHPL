/**
 * La fenêtre de la tablette (maquette 1.5.4 et 1.5.5) : un voile marine, une carte de 560 px,
 * son titre, son corps et ses boutons alignés à droite. Le téléphone, lui, a un écran à part.
 */
import type { ReactNode } from 'react';
import { Modal, StyleSheet, View, type ViewStyle } from 'react-native';
import { Texte, usePalette } from './composants';
import { RAYON } from './theme';

export function Fenetre({
  ouverte,
  surFin,
  children,
}: {
  ouverte: boolean;
  surFin: () => void;
  children: ReactNode;
}) {
  const p = usePalette();
  return (
    <Modal transparent visible={ouverte} animationType="fade" onRequestClose={surFin}>
      <View style={styles.voile}>
        {ouverte && (
          <View
            accessibilityViewIsModal
            style={[styles.fenetre, { backgroundColor: p.surface, borderColor: p.ligne }]}
          >
            {children}
          </View>
        )}
      </View>
    </Modal>
  );
}

/** Le titre de la fenêtre, et sa phrase d'aide s'il y en a une. */
export function EnteteFenetre({ titre, aide }: { titre: string; aide?: string }) {
  return (
    <View style={styles.entete}>
      <Texte variante="titre" accessibilityRole="header">
        {titre}
      </Texte>
      {aide ? (
        <Texte variante="libelle" style={{ marginTop: 4, fontSize: 14, lineHeight: 20 }}>
          {aide}
        </Texte>
      ) : null}
    </View>
  );
}

export function CorpsFenetre({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[styles.corps, style]}>{children}</View>;
}

export function PiedFenetre({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[styles.pied, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  voile: {
    flex: 1,
    backgroundColor: 'rgba(15,26,61,.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  fenetre: {
    width: 560,
    maxWidth: '100%',
    borderWidth: 1,
    borderRadius: RAYON,
    shadowColor: '#0F1A3D',
    shadowOpacity: 0.14,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  entete: { paddingTop: 22, paddingHorizontal: 24, paddingBottom: 8 },
  corps: { paddingTop: 8, paddingHorizontal: 24, paddingBottom: 4 },
  pied: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    paddingTop: 20,
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
});
