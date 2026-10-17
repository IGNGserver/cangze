import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import zhCN from './locales/zh-CN.json';

export type Locale = 'zh-CN' | 'en';

export function detectLocale(): Locale {
  try {
    const saved = localStorage.getItem('cangze.locale');
    if (saved === 'zh-CN' || saved === 'en') return saved;
  } catch {
    // storage unavailable
  }
  return navigator.language.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en';
}

void i18n.use(initReactI18next).init({
  resources: { 'zh-CN': { translation: zhCN }, en: { translation: en } },
  lng: detectLocale(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

export default i18n;
