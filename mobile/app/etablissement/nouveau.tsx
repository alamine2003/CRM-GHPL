import { useLocalSearchParams } from 'expo-router';
import { EcranNouvelEtablissement } from '../../src/NouvelEtablissement';

/** Nouvel établissement saisi par le délégué (PRP-003, maquette 1.4.5). */
export default function NouvelEtablissement() {
  const { pour } = useLocalSearchParams<{ pour?: string }>();
  return <EcranNouvelEtablissement pour={pour === 'prospect' ? 'prospect' : undefined} />;
}
