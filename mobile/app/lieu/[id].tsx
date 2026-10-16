import { useLocalSearchParams } from 'expo-router';
import { EcranLieu } from '../../src/Fiches';

/** Fiche d'un établissement : où aller, qui appeler, qui y exerce (maquette 1.4.5). */
export default function EcranFicheEtablissement() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <EcranLieu id={id} />;
}
