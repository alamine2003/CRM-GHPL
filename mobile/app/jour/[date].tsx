import { useLocalSearchParams } from 'expo-router';
import { VueJour } from '../../src/Itineraire';

/** Journée du délégué : son itinéraire et ses kilomètres (PLN-006, PLN-010), maquette 1.4.3. */
export default function EcranJour() {
  const { date } = useLocalSearchParams<{ date: string }>();
  return <VueJour jour={date} />;
}
