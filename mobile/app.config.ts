import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ExpoConfig } from 'expo/config';

// Version unique du produit, lue dans le fichier VERSION à la racine (ADR-018).
const version = readFileSync(join(__dirname, '..', 'VERSION'), 'utf8').trim();

const config: ExpoConfig = {
  name: 'INNOV CRM',
  slug: 'innov-crm',
  scheme: 'innovcrm',
  version,
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'automatic',
  ios: { supportsTablet: true, bundleIdentifier: 'com.innovpharma.crm' },
  android: {
    package: 'com.innovpharma.crm',
    adaptiveIcon: {
      backgroundColor: '#1B2A5B',
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
  },
  web: { favicon: './assets/favicon.png' },
  plugins: ['expo-router', 'expo-localization', 'expo-secure-store'],
  extra: {
    apiUrl: process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8000',
  },
};

export default config;
