import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { LimiteErreur } from '../src/Erreurs';
import { FournisseurSession } from '../src/FournisseurSession';
import '../src/i18n';
import { POLICES } from '../src/polices';

export default function Disposition() {
  const [policesChargees, erreurPolices] = useFonts(POLICES);
  // Les polices sont embarquées : leur chargement est quasi immédiat. En cas d'échec,
  // l'application continue avec les polices du système plutôt que de bloquer.
  if (!policesChargees && !erreurPolices) return null;
  return (
    <LimiteErreur>
      <FournisseurSession>
        <StatusBar style="light" />
        <Stack screenOptions={{ headerShown: false }} />
      </FournisseurSession>
    </LimiteErreur>
  );
}
