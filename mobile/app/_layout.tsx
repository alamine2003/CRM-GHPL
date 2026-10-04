import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import '../src/i18n';

export default function Disposition() {
  return (
    <>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false }} />
    </>
  );
}
