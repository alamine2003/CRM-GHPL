import { useLocalSearchParams } from 'expo-router';
import type { TypeEcart } from '../../src/Execution';
import { EcranEcart } from '../../src/Visite';

/** Un écart sur une visite (« Le prospect est absent », report, annulation, justification). */
export default function Ecart() {
  const { id, type } = useLocalSearchParams<{ id: string; type: TypeEcart }>();
  return <EcranEcart id={id} type={type} />;
}
