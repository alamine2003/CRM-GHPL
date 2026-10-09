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
  // 0.9.9 : une mise à jour à distance ne vise que les applications de la même version
  // (architecture §21) ; un changement de code natif repasse par les magasins.
  runtimeVersion: { policy: 'appVersion' },
  ...(process.env.EAS_PROJECT_ID
    ? { updates: { url: `https://u.expo.dev/${process.env.EAS_PROJECT_ID}` } }
    : {}),
  plugins: [
    'expo-router',
    'expo-localization',
    'expo-secure-store',
    // Base locale chiffrée (architecture-essentials §5) : SQLCipher, clé dans le Keychain.
    ['expo-sqlite', { useSQLCipher: true }],
    [
      'expo-location',
      {
        // 0.9.9 : le texte dit tout ce que fait la position (exigence des magasins).
        locationWhenInUsePermission:
          "INNOV CRM enregistre votre position au début et à la fin de chaque visite, et celle d'un établissement quand vous le demandez. Jamais en continu.",
      },
    ],
    // RPT-007 : document PDF joint au rapport (pas de photo, DC-48).
    'expo-document-picker',
    // 0.9.9 : mises à jour sans passer par les magasins (EAS Update, docs/mise-a-jour.md).
    'expo-updates',
    // NOT-002 : notifications push (adresse Expo, couleur de la marque sur Android).
    ['expo-notifications', { color: '#1B2A5B' }],
    [
      'expo-local-authentication',
      {
        faceIDPermission:
          'INNOV CRM se déverrouille avec Face ID après le délai fixé par votre pays en arrière-plan.',
      },
    ],
  ],
  extra: {
    apiUrl: process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8000',
    // 1.0.0 : la politique de confidentialité se lit sur le portail (exigence des magasins).
    portailUrl: process.env.EXPO_PUBLIC_PORTAIL_URL ?? 'http://localhost:5173',
    // Projet EAS des builds de test (0.2.8) : son identifiant vient de l'environnement, pas du
    // dépôt, pour que chaque compte Expo puisse construire l'application.
    ...(process.env.EAS_PROJECT_ID ? { eas: { projectId: process.env.EAS_PROJECT_ID } } : {}),
  },
  ...(process.env.EXPO_OWNER ? { owner: process.env.EXPO_OWNER } : {}),
};

export default config;
