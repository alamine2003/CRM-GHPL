import { useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ecran } from '../../src/Ecran';
import { useTitreDuJour, VueJour } from '../../src/Itineraire';

/** Journée du délégué : son itinéraire et ses kilomètres (PLN-006, PLN-010). */
export default function EcranJour() {
  const { t } = useTranslation();
  const { date } = useLocalSearchParams<{ date: string }>();
  const titre = useTitreDuJour(date);
  return (
    <Ecran titre={t('jour.titre')} surTitre={titre} retour>
      <VueJour jour={date} />
    </Ecran>
  );
}
