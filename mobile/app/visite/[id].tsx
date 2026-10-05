import { useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ecran } from '../../src/Ecran';
import { VueDetail } from '../../src/Itineraire';

/** Détail d'une visite planifiée (PLN-006). */
export default function EcranVisite() {
  const { t } = useTranslation();
  const { id, jour } = useLocalSearchParams<{ id: string; jour: string }>();
  return (
    <Ecran titre={t('detail.titre')} retour>
      <VueDetail id={id} jour={jour} />
    </Ecran>
  );
}
