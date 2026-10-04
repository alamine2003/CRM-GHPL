import { useTranslation } from 'react-i18next';
import { StyleSheet } from 'react-native';
import { Carte, Texte } from './composants';
import { Ecran } from './Ecran';

/** Écran d'une rubrique livrée dans une version future (feuille de route, prd.md §23). */
export function AVenir({ cle, version }: { cle: 'semaine' | 'chiffres'; version: string }) {
  const { t } = useTranslation();
  return (
    <Ecran titre={t(`mobile.onglets.${cle}`)}>
      <Carte style={styles.carte}>
        <Texte variante="sousTitre">{t('navigation.disponibleEn', { version })}</Texte>
        <Texte variante="discret">{t(`mobile.aVenir.${cle}`)}</Texte>
      </Carte>
    </Ecran>
  );
}

const styles = StyleSheet.create({
  carte: { gap: 6 },
});
