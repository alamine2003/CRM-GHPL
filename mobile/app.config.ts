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
  plugins: [
    'expo-router',
    'expo-localization',
    'expo-secure-store',
    // Base locale chiffrée (architecture-essentials §5) : SQLCipher, clé dans le Keychain.
    ['expo-sqlite', { useSQLCipher: true }],
    [
      'expo-location',
      {
        locationWhenInUsePermission:
          "INNOV CRM enregistre la position d'un établissement quand vous le demandez.",
      },
    ],
    // RPT-007 : photo prise pendant la visite, ou choisie dans la galerie, jointe au rapport.
    [
      'expo-image-picker',
      {
        cameraPermission: 'INNOV CRM prend une photo à joindre au rapport de visite.',
        photosPermission: 'INNOV CRM joint une photo de la galerie au rapport de visite.',
        microphonePermission: false,
      },
    ],
    'expo-document-picker',
    [
      'expo-local-authentication',
      {
        faceIDPermission: 'INNOV CRM se déverrouille avec Face ID après 5 minutes en arrière-plan.',
      },
    ],
  ],
  extra: {
    apiUrl: process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8000',
    // Projet EAS des builds de test (0.2.8) : son identifiant vient de l'environnement, pas du
    // dépôt, pour que chaque compte Expo puisse construire l'application.
    ...(process.env.EAS_PROJECT_ID ? { eas: { projectId: process.env.EAS_PROJECT_ID } } : {}),
  },
  ...(process.env.EXPO_OWNER ? { owner: process.env.EXPO_OWNER } : {}),
};

export default config;
