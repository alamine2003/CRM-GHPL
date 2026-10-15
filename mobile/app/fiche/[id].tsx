import { useLocalSearchParams } from 'expo-router';
import { EcranFiche } from '../../src/Fiches';

/** Fiche d'un prospect consultée par le délégué (maquette 1.4.4). */
export default function EcranFicheProspect() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <EcranFiche id={id} />;
}
