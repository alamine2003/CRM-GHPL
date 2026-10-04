import { choisirLangue, ressources } from '@innov/i18n';
import { getLocales } from 'expo-localization';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

const preferences = getLocales().map((l) => l.languageTag);

void i18n.use(initReactI18next).init({
  resources: ressources,
  lng: choisirLangue(preferences),
  fallbackLng: 'fr',
  interpolation: { escapeValue: false },
});

export default i18n;
