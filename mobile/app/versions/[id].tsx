import { useLocalSearchParams } from 'expo-router';
import { VueVersions } from '../../src/Versions';

/** Historique des versions d'un planning (PLN-014), selon la maquette 1.4.3. */
export default function EcranVersions() {
  const { id, fuseau, semaine, nombre } = useLocalSearchParams<{
    id: string;
    fuseau?: string;
    semaine?: string;
    nombre?: string;
  }>();
  return (
    <VueVersions
      planning={id}
      fuseau={fuseau}
      semaine={semaine}
      nombre={nombre ? Number(nombre) : undefined}
    />
  );
}
