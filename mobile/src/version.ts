import Constants from 'expo-constants';

/** Version de l'application, issue du fichier VERSION via app.config.ts. */
export const VERSION_APP = Constants.expoConfig?.version ?? 'inconnue';
