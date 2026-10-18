import { useLocalSearchParams } from 'expo-router';
import { jourIso } from '../../src/semaineLocale';
import { EcranVisite } from '../../src/Visite';

/** Une visite : le prospect, le lieu, la dernière visite et l'action du moment (1.4.1). */
export default function Visite() {
  const { id, jour } = useLocalSearchParams<{ id: string; jour: string }>();
  // Un lien sans jour (notification, adresse tapée) ouvre la visite sur la journée d'aujourd'hui.
  return <EcranVisite id={id} jour={jour ?? jourIso(new Date())} />;
}
