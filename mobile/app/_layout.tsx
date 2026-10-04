import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { FournisseurSession } from '../src/FournisseurSession';
import '../src/i18n';

export default function Disposition() {
  return (
    <FournisseurSession>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false }} />
    </FournisseurSession>
  );
}
