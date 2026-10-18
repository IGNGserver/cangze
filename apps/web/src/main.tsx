import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import 'dayjs/locale/zh-cn';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import i18n from './i18n/index.ts';
import { App } from './App.tsx';
import './styles.css';

dayjs.extend(relativeTime);

const syncLocale = (lng: string) => {
  document.documentElement.lang = lng;
  dayjs.locale(lng === 'zh-CN' ? 'zh-cn' : 'en');
};
syncLocale(i18n.language);
i18n.on('languageChanged', syncLocale);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
