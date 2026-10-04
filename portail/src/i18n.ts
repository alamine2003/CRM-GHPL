import { choisirLangue, ressources } from '@innov/i18n';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

const preferences = typeof navigator === 'undefined' ? [] : navigator.languages;

void i18n.use(initReactI18next).init({
  resources: ressources,
  lng: choisirLangue(preferences),
  fallbackLng: 'fr',
  interpolation: { escapeValue: false },
});

i18n.on('languageChanged', (langue) => {
  document.documentElement.lang = langue;
});

export default i18n;
