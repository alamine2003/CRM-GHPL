import Constants from 'expo-constants';

/** Version de l'application, issue du fichier VERSION via app.config.ts. */
export const VERSION_APP = Constants.expoConfig?.version ?? 'inconnue';

/** Adresse du portail web, d'où se lit la politique de confidentialité (1.0.0). */
const portailUrl =
  (Constants.expoConfig?.extra?.portailUrl as string | undefined) ?? 'http://localhost:5173';

/** Politique de confidentialité, dans la langue de l'utilisateur (exigée par les magasins). */
export function adresseConfidentialite(langue: string): string {
  return `${portailUrl.replace(/\/$/, '')}/confidentialite?langue=${encodeURIComponent(langue)}`;
}
