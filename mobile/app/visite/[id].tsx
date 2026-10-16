import { useLocalSearchParams } from 'expo-router';
import { EcranVisite } from '../../src/Visite';

/** Une visite : le prospect, le lieu, la dernière visite et l'action du moment (1.4.1). */
export default function Visite() {
  const { id, jour } = useLocalSearchParams<{ id: string; jour: string }>();
  return <EcranVisite id={id} jour={jour} />;
}
