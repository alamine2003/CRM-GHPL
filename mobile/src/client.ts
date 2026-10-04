import { creerClient, type StockageRafraichissement } from '@innov/api-client';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import i18n from './i18n';

const CLE = 'innov.rafraichissement';

/**
 * Le jeton de rafraîchissement vit dans le Keychain (iOS) ou le Keystore (Android),
 * accessible seulement quand le téléphone est déverrouillé et jamais sauvegardé
 * hors de l'appareil (architecture §11.1, SEC-005).
 */
export const stockageSecurise: StockageRafraichissement = {
  lire: () => SecureStore.getItemAsync(CLE),
  async ecrire(jeton) {
    if (jeton === null) await SecureStore.deleteItemAsync(CLE);
    else
      await SecureStore.setItemAsync(CLE, jeton, {
        keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      });
  },
};

const apiUrl =
  (Constants.expoConfig?.extra?.apiUrl as string | undefined) ?? 'http://localhost:8000';

export function creerClientMobile(surSessionPerdue?: () => void) {
  return creerClient({
    baseUrl: apiUrl,
    client: 'mobile',
    langue: () => i18n.language,
    stockage: stockageSecurise,
    surSessionPerdue,
  });
}
