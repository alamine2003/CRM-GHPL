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

/** Pastille « Démonstration » : des données fictives ne se confondent pas avec la production (DEM-001). */
export function PastilleDemonstration() {
  const { t } = useTranslation();
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
  if (!demo) return null;
  return (
    <View
      accessibilityRole="text"
      accessibilityLabel={`${t('demonstration.bandeau')} : ${t('demonstration.texte')}`}
      style={styles.pastille}
    >
      <Text style={styles.texte}>{t('demonstration.bandeau')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pastille: {
    alignSelf: 'flex-start',
    backgroundColor: marque.orange,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
    marginBottom: 6,
  },
  texte: { color: marque.bleuMarine3, fontFamily: police.texteFort, fontSize: 12 },
});
