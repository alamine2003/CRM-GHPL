import { marque } from '@innov/design';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import { police } from './polices';
import { useSession } from './session';

// Une seule demande par lancement : l'environnement d'un serveur ne change pas en cours de route.
let environnement: Promise<string | null> | null = null;

/** Réinitialise le cache (tests). */
export function oublierEnvironnement() {
  environnement = null;
}

function useDemonstration() {
  const { client } = useSession();
  const [demo, setDemo] = useState(false);
  useEffect(() => {
    let actif = true;
    environnement ??= client
      .informations()
      .then((i) => i.environnement)
      .catch(() => null);
    void environnement.then((e) => actif && setDemo(e === 'demonstration'));
    return () => {
      actif = false;
    };
  }, [client]);
  return demo;
}

/** Filet orange de 3 px en haut de l'écran sur une instance de démonstration (DEM-001). */
export function FiletDemonstration() {
  if (!useDemonstration()) return null;
  return <View pointerEvents="none" style={styles.filet} />;
}

/** Le mot « Démonstration » dans l'en-tête : discret, permanent, sans bannière. */
export function MentionDemonstration() {
  const { t } = useTranslation();
  if (!useDemonstration()) return null;
  return (
    <Text
      accessibilityRole="text"
      accessibilityLabel={`${t('demonstration.bandeau')} : ${t('demonstration.texte')}`}
      style={styles.texte}
    >
      {t('demonstration.bandeau')}
    </Text>
  );
}

const styles = StyleSheet.create({
  filet: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: marque.orange,
  },
  texte: { color: marque.orange, fontFamily: police.texteFort, fontSize: 12 },
});
