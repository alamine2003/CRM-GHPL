import { creerClient } from '@innov/api-client';
import i18n from './i18n';

/** Client de l'API du portail : jeton de rafraîchissement en cookie HttpOnly. */
export function creerClientPortail(surSessionPerdue?: () => void) {
  return creerClient({
    baseUrl: import.meta.env.VITE_API_URL ?? 'http://localhost:8000',
    client: 'portail',
    langue: () => i18n.language,
    surSessionPerdue,
  });
}
