import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { marque } from '@innov/design';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { Carte, Texte, usePalette } from './composants';
import { Ecran } from './Ecran';

/** Écran d'une rubrique livrée dans une version future (feuille de route, prd.md §23). */
export function AVenir({
  cle,
  icone,
  version,
}: {
  cle: 'semaine' | 'prospects' | 'chiffres';
  icone: keyof typeof MaterialIcons.glyphMap;
  version: string;
}) {
  const { t } = useTranslation();
  const p = usePalette();
  return (
    <Ecran titre={t(`mobile.onglets.${cle}`)}>
      <Carte style={styles.carte}>
        <View style={[styles.icone, { backgroundColor: p.orangeDoux }]}>
          <MaterialIcons name={icone} size={34} color={marque.orange} />
        </View>
        <Texte variante="sousTitre" style={{ textAlign: 'center' }}>
          {t('navigation.disponibleEn', { version })}
        </Texte>
        <Texte variante="discret" style={{ textAlign: 'center' }}>
          {t(`mobile.aVenir.${cle}`)}
        </Texte>
      </Carte>
    </Ecran>
  );
}

const styles = StyleSheet.create({
  carte: { alignItems: 'center', gap: 10, paddingVertical: 32 },
  icone: {
    width: 72,
    height: 72,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
