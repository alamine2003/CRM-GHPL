import { useLocalSearchParams } from 'expo-router';
import { EcranCorrection } from '../../../src/Proposition';

/** Proposer une correction d'une fiche commune (PRP-014, maquette 1.4.7). */
export default function Correction() {
  const { objet, id } = useLocalSearchParams<{ objet: string; id: string }>();
  return (
    <EcranCorrection objet={objet === 'etablissement' ? 'etablissement' : 'prospect'} id={id} />
  );
}
