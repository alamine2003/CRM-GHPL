import { useLocalSearchParams } from 'expo-router';
import { FormulaireRapport } from '../../src/Rapport';

/** Rapport d'une visite effectuée (RPT-001), selon la maquette 1.4.2. */
export default function EcranRapport() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <FormulaireRapport id={id} />;
}
